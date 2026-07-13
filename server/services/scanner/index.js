const fs = require('fs/promises');
const path = require('path');
const db = require('../../config/database');
const { gatherFilesFromPaths } = require('./fileScanner');
const { processScannedFiles } = require('./metadataFetcher');
const { updateLibraryMetadata, scanLibrarySubtitles } = require('./databaseSync');


let scanProgress = {
  isScanning: false,
  cancelled: false,
  totalFiles: 0,
  processedFiles: 0,
  currentFile: '',
  currentPhase: '',
  currentStage: 0,
  totalStages: 5,
  addedCount: 0,
  addedMoviesCount: 0,
  addedShowsCount: 0,
  addedEpisodesCount: 0,
  addedMovies: [],
  addedShows: [],
  failedMovies: [],
  failedShows: [],
  skippedCount: 0,
  skippedFiles: [],
  unreachablePaths: [],
  emptyPaths: []
};

const getScanProgress = () => {
  return scanProgress;
};

const stopScan = () => {
  if (!scanProgress.isScanning) return false;
  scanProgress.cancelled = true;
  return true;
};




const doScan = async (mode = 'full') => {
  const allPaths = db.prepare('SELECT * FROM library_paths').all();
  // Only scan movies and tv paths — skip downloads
  const paths = allPaths.filter(p => p.type !== 'downloads');
  if (!paths || paths.length === 0) {
    scanProgress.isScanning = false;
    return;
  }

  const MODE_STAGES = {
    full:      5,
    new:       2,
    refresh:   1,
    rematch:   2,
    subtitles: 1,
  };
  scanProgress.totalStages = MODE_STAGES[mode] || 5;

  let stageNum = 0;
  const nextStage = (phase) => {
    stageNum++;
    scanProgress.currentStage = stageNum;
    scanProgress.currentPhase = phase;
    scanProgress.processedFiles = 0;
    scanProgress.totalFiles = 0;
  };

  try {
    const gatherFiles = ['full', 'new', 'rematch'].includes(mode);
    const processFiles = ['full', 'new', 'rematch'].includes(mode);
    const updateMetadata = ['full', 'refresh'].includes(mode);
    const syncTrakt = mode === 'full';
    const scanSubtitles = ['full', 'subtitles'].includes(mode);

    let allFiles = []; // Scoped outside the if-blocks so processFiles can access it

    // ════════════════════════════════════════════
    // Stage: Gather files
    // ════════════════════════════════════════════
    if (gatherFiles) {
    nextStage('Gathering files...');
    allFiles = await gatherFilesFromPaths(paths, scanProgress);

    if (scanProgress.cancelled) throw new Error('Scan cancelled by user');

    scanProgress.totalFiles = allFiles.length;

    // Build a quick lookup set of all file paths on disk (for orphan detection)
    const filesOnDisk = new Set(allFiles.map(f => f.path));

    // Clean up orphaned items — movies/shows whose files were manually deleted
    scanProgress.currentPhase = 'Checking for removed files...';
    const existingMovies = db.prepare("SELECT id, title, file_path FROM movies WHERE file_path IS NOT NULL").all();
    const existingShows = db.prepare("SELECT id, title, folder_path FROM shows WHERE folder_path IS NOT NULL").all();
    let removedCount = 0;

    for (const m of existingMovies) {
      if (scanProgress.cancelled) throw new Error('Scan cancelled by user');
      if (filesOnDisk.has(m.file_path)) continue;
      // Not in gathered files — check if it still exists on disk (maybe in an unscanned path)
      try { await fs.access(m.file_path); continue; } catch { /* file gone */ }
      // File is gone — check if the parent folder still exists
      const parentDir = path.dirname(m.file_path);
      try { await fs.access(parentDir); } catch {
        // Folder is also gone — remove the movie entirely
        db.prepare('DELETE FROM movies WHERE id = ?').run(m.id);
        console.log(`[Scanner] Removed movie (folder deleted): ${m.title} (${parentDir})`);
        removedCount++;
        continue;
      }
      // Folder exists but file is gone — set to monitored for re-download
      db.prepare("UPDATE movies SET status = 'monitored', file_path = NULL, file_size = 0, scene_name = NULL, resolution = NULL, codec = NULL WHERE id = ?").run(m.id);
      console.log(`[Scanner] Movie file missing, set to monitored: ${m.title}`);
      removedCount++;
    }

    for (const s of existingShows) {
      if (scanProgress.cancelled) throw new Error('Scan cancelled by user');
      // Check if any gathered file lives under this show's folder
      const stillExists = allFiles.some(f => f.path.startsWith(s.folder_path + path.sep));
      if (stillExists) continue;
      // Not in gathered files — check if folder still exists on disk
      try { await fs.access(s.folder_path); continue; } catch { /* gone */ }
      // Folder is gone — remove show and all episodes
      db.prepare('DELETE FROM episodes WHERE show_id = ?').run(s.id);
      db.prepare('DELETE FROM shows WHERE id = ?').run(s.id);
      console.log(`[Scanner] Removed show (folder deleted): ${s.title} (${s.folder_path})`);
      removedCount++;
    }

    if (removedCount > 0) {
      scanProgress.addedCount = (scanProgress.addedCount || 0) - removedCount;
    }
    } // end gatherFiles

    // ════════════════════════════════════════════
    // Stage: Process files (match to TMDB)
    // ════════════════════════════════════════════
    if (processFiles) {
      await processScannedFiles(allFiles, scanProgress, mode, nextStage);
    }

    if (scanProgress.cancelled) throw new Error('Scan cancelled by user');

    // ════════════════════════════════════════════
    // Stage: Update sizes & ratings (metadata refresh)
    // ════════════════════════════════════════════
    if (updateMetadata) {
      await updateLibraryMetadata(scanProgress, nextStage);
    }

    // ════════════════════════════════════════════
    // Stage: Sync Trakt
    // ════════════════════════════════════════════
    if (syncTrakt) {
    nextStage('Syncing Trakt watched status...');
    scanProgress.totalFiles = 1;
    scanProgress.currentFile = 'Trakt';
    try {
      const traktService = require('../traktService');
      await traktService.syncWatched();
    } catch { /* Trakt may not be configured */ }
    scanProgress.processedFiles = 1;
    } // end syncTrakt

    if (scanProgress.cancelled) throw new Error('Scan cancelled by user');

    // ════════════════════════════════════════════
    // Stage: Scan subtitles
    // ════════════════════════════════════════════
    if (scanSubtitles) {
      await scanLibrarySubtitles(scanProgress, nextStage);
    }
  } catch (error) {
    const isCancelled = error?.message === 'Scan cancelled by user';
    if (isCancelled) {
      console.log('[Scanner] Scan cancelled by user');
    } else {
      console.error('Scan error:', error);
    }
  } finally {
    await completeScan();
  }
};

// ── Simple mutex — prevents concurrent scan starts ──
let _scanMutex = false;

// ── Helper: mark scan complete and release mutex ──
async function completeScan() {
  scanProgress.isScanning = false;
  scanProgress.cancelled = false;
  scanProgress.currentFile = 'Finished';
  scanProgress.currentStage = scanProgress.totalStages;
  const eventBus = require('../eventBus');
  if (scanProgress.currentPhase === 'Scan cancelled by user') {
    scanProgress.currentPhase = 'Cancelled';
    eventBus.info('Library scan cancelled');
  } else {
    scanProgress.currentPhase = 'Finished';
    const added = scanProgress.addedMoviesCount + scanProgress.addedShowsCount;
    const failed = (scanProgress.failedMovies?.length || 0) + (scanProgress.failedShows?.length || 0);
    if (added > 0 || failed > 0) {
      eventBus.success(`Scan complete: ${added} added${failed > 0 ? `, ${failed} failed` : ''}`);
    } else {
      eventBus.info('Scan complete: no new items found');
    }
  }
  // Invalidate stats cache
  try { require('../../routes/library/system').invalidateStatsCache(); } catch { /* ignore */ }
  // Clear accumulated arrays to free memory
  scanProgress.addedMovies = [];
  scanProgress.addedShows = [];
  scanProgress.failedMovies = [];
  scanProgress.failedShows = [];
  scanProgress.skippedFiles = [];
  scanProgress.unreachablePaths = [];
  scanProgress.emptyPaths = [];
  _scanMutex = false;
}

const scanLibrary = async (mode = 'full') => {
  if (_scanMutex) {
    return { status: 'error', message: 'Scan already in progress' };
  }
  _scanMutex = true;

  const eventBus = require('../eventBus');
  eventBus.info(`Library scan started (${mode})`);
  
  scanProgress = {
    isScanning: true,
    totalFiles: 0,
    processedFiles: 0,
    currentFile: 'Starting...',
    addedCount: 0,
    addedMoviesCount: 0,
    addedShowsCount: 0,
    addedEpisodesCount: 0,
    addedMovies: [],
    addedShows: [],
    failedMovies: [],
    failedShows: [],
    skippedCount: 0,
    skippedFiles: [],
    unreachablePaths: [],
    emptyPaths: []
  };
  
  // Start in background
  doScan(mode);
  
  return { status: 'success', message: 'Scan started' };
};

module.exports = {
  scanLibrary,
  getScanProgress,
  stopScan
};
