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
  let paths = allPaths.filter(p => p.type !== 'downloads');
  
  if (mode === 'movies') {
    paths = paths.filter(p => p.type === 'movies');
  } else if (mode === 'shows') {
    paths = paths.filter(p => p.type === 'tv');
  }

  if (!paths || paths.length === 0) {
    scanProgress.isScanning = false;
    scanProgress.currentFile = 'Finished';
    scanProgress.currentPhase = 'Finished';
    const eventBus = require('../eventBus');
    eventBus.info('Scan complete: no paths found for selected mode');
    try { require('../../routes/library/system').invalidateStatsCache(); } catch { /* ignore */ }
    return;
  }

  const MODE_STAGES = {
    full:      5,
    movies:    5,
    shows:     5,
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
    const gatherFiles = ['full', 'movies', 'shows', 'new', 'rematch'].includes(mode);
    const processFiles = ['full', 'movies', 'shows', 'new', 'rematch'].includes(mode);
    const updateMetadata = ['full', 'movies', 'shows', 'refresh'].includes(mode);
    const syncTrakt = ['full', 'movies', 'shows'].includes(mode);
    const scanSubtitles = ['full', 'movies', 'shows', 'subtitles'].includes(mode);

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
    let removedCount = 0;

    if (mode !== 'shows') {
      const existingMovies = db.prepare("SELECT id, title, file_path FROM movies WHERE file_path IS NOT NULL").all();
      const moviesToDelete = [];
      const moviesToUpdate = [];
      for (const m of existingMovies) {
        if (scanProgress.cancelled) throw new Error('Scan cancelled by user');
        if (filesOnDisk.has(m.file_path)) continue;
        try { await fs.access(m.file_path); continue; } catch { /* file gone */ }
        const parentDir = path.dirname(m.file_path);
        try { await fs.access(parentDir); } catch {
          moviesToDelete.push({ id: m.id, title: m.title, parentDir });
          removedCount++;
          continue;
        }
        moviesToUpdate.push({ id: m.id, title: m.title });
        removedCount++;
      }
      
      if (moviesToDelete.length > 0 || moviesToUpdate.length > 0) {
        db.transaction(() => {
          const delStmt = db.prepare('DELETE FROM movies WHERE id = ?');
          for (const m of moviesToDelete) {
            delStmt.run(m.id);
            console.log(`[Scanner] Removed movie (folder deleted): ${m.title} (${m.parentDir})`);
          }
          const upStmt = db.prepare("UPDATE movies SET status = 'monitored', file_path = NULL, file_size = 0, scene_name = NULL, resolution = NULL, codec = NULL WHERE id = ?");
          for (const m of moviesToUpdate) {
            upStmt.run(m.id);
            console.log(`[Scanner] Movie file missing, set to monitored: ${m.title}`);
          }
        })();
      }
    }

    if (mode !== 'movies') {
      const existingShows = db.prepare("SELECT id, title, folder_path FROM shows WHERE folder_path IS NOT NULL").all();
      const showsToDelete = [];
      for (const s of existingShows) {
        if (scanProgress.cancelled) throw new Error('Scan cancelled by user');
        const stillExists = allFiles.some(f => f.path.startsWith(s.folder_path + path.sep));
        if (stillExists) continue;
        try { await fs.access(s.folder_path); continue; } catch { /* gone */ }
        showsToDelete.push({ id: s.id, title: s.title, folder_path: s.folder_path });
        removedCount++;
      }
      
      if (showsToDelete.length > 0) {
        db.transaction(() => {
          const delEpStmt = db.prepare('DELETE FROM episodes WHERE show_id = ?');
          const delShowStmt = db.prepare('DELETE FROM shows WHERE id = ?');
          for (const s of showsToDelete) {
            delEpStmt.run(s.id);
            delShowStmt.run(s.id);
            console.log(`[Scanner] Removed show (folder deleted): ${s.title} (${s.folder_path})`);
          }
        })();
      }
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
      await updateLibraryMetadata(scanProgress, nextStage, mode);
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
      await scanLibrarySubtitles(scanProgress, nextStage, mode);
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
