const fs = require('fs/promises');
const path = require('path');
const db = require('../../config/database');
const tmdbService = require('../tmdbService');
const { getMediaMetadata, parseAudioFromFileName } = require('../../utils/videoUtils');
const { isVideoFile } = require('../../utils/fileUtils');
const { scanSubtitleLangs, SUBTITLE_EXTS } = require('./fileScanner');

const updateLibraryMetadata = async (scanProgress, nextStage, mode = 'full') => {
  nextStage('Updating metadata...');
  let existingMovies = [];
  let existingShows = [];
  let existingEpisodes = [];
  let allMovies = [];
  let allShows = [];

  if (mode !== 'shows') {
    existingMovies = db.prepare("SELECT id, title, file_path, scene_name, file_size, resolution, codec, audio FROM movies WHERE status = 'downloaded' AND file_path IS NOT NULL").all();
    if (mode === 'refresh') {
      allMovies = db.prepare("SELECT id, title, tmdb_id FROM movies WHERE tmdb_id IS NOT NULL").all();
    } else {
      allMovies = db.prepare("SELECT id, title, tmdb_id FROM movies WHERE tmdb_id IS NOT NULL AND (rating IS NULL OR rating = 0 OR genres IS NULL)").all();
    }
  }

  if (mode !== 'movies') {
    existingShows = db.prepare("SELECT id, title, folder_path FROM shows WHERE status = 'downloaded' AND folder_path IS NOT NULL").all();
    existingEpisodes = db.prepare("SELECT id, show_id, file_path, scene_name, file_size, resolution, codec, audio FROM episodes WHERE status = 'downloaded' AND file_path IS NOT NULL").all();
    if (mode === 'refresh') {
      allShows = db.prepare("SELECT id, title, tmdb_id FROM shows WHERE tmdb_id IS NOT NULL").all();
    } else {
      allShows = db.prepare("SELECT id, title, tmdb_id FROM shows WHERE tmdb_id IS NOT NULL AND (rating IS NULL OR rating = 0 OR genres IS NULL)").all();
    }
  }

  const sizeTotal = existingMovies.length + existingShows.length + existingEpisodes.length;
  const ratingTotal = allMovies.length + allShows.length;
  const stage3Total = sizeTotal + ratingTotal;

  scanProgress.totalFiles = stage3Total;

  const movieUpdates = [];
  for (const m of existingMovies) {
    if (scanProgress.cancelled) throw new Error('Scan cancelled by user');
    scanProgress.currentFile = m.title;
    try {
      let fileSize = m.file_size;
      let resolution = m.resolution;
      let codec = m.codec;
      let audio = m.audio;
      let resName = null;
      let needsDisk = false;

      const t = m.scene_name ? m.scene_name.toLowerCase() : '';
      const fileLower = m.file_path ? m.file_path.toLowerCase() : '';
      const hasRes = t.includes('2160p') || t.includes('4k') || t.includes('1080p') || t.includes('720p') || t.includes('480p') || t.includes('sd');
      
      if (!resolution && hasRes) {
        if (fileLower.includes('2160p') || fileLower.includes('4k')) resolution = '2160p';
        else if (fileLower.includes('1080p')) resolution = '1080p';
        else if (fileLower.includes('720p')) resolution = '720p';
        else if (fileLower.includes('480p')) resolution = '480p';
      }
      
      if (!codec) {
        if (fileLower.includes('x265') || fileLower.includes('h265') || fileLower.includes('hevc')) codec = 'x265';
        else if (fileLower.includes('x264') || fileLower.includes('h264') || fileLower.includes('avc')) codec = 'x264';
      }

      if (!audio) audio = parseAudioFromFileName(m.scene_name || m.file_path);

      const needsRes = !resolution && !hasRes;

      if (!fileSize || fileSize === 0 || needsRes || !codec || !audio) {
        needsDisk = true;
      }

      if (needsDisk) {
        try {
          if (!fileSize || fileSize === 0) {
            const stat = await fs.stat(m.file_path);
            fileSize = stat.size;
          }
          if (needsRes || !codec || !audio) {
            const meta = await getMediaMetadata(m.file_path);
            if (needsRes) {
              resolution = meta.resolution;
              if (resolution) resName = 'Unknown ' + resolution;
            }
            if (!codec) codec = meta.codec;
            if (!audio) audio = meta.audio;
          }
        } catch { /* ignore */ }
      }
      
      if (needsDisk || resolution !== m.resolution || codec !== m.codec || audio !== m.audio) {
        movieUpdates.push({
          id: m.id,
          fileSize,
          resName,
          resolution,
          codec,
          audio
        });
      }
    } catch { /* skip */ }
    scanProgress.processedFiles++;
  }

  if (movieUpdates.length > 0) {
    db.transaction(() => {
      const stmt = db.prepare('UPDATE movies SET file_size = COALESCE(?, file_size), scene_name = COALESCE(?, scene_name), resolution = ?, codec = ?, audio = ? WHERE id = ?');
      for (const u of movieUpdates) {
        stmt.run(u.fileSize, u.resName, u.resolution, u.codec, u.audio, u.id);
      }
    })();
  }

  scanProgress.currentPhase = 'Updating episode resolutions...';
  const epUpdates = [];
  for (const ep of existingEpisodes) {
    if (scanProgress.cancelled) throw new Error('Scan cancelled by user');
    try {
      let fileSize = ep.file_size;
      let resolution = ep.resolution;
      let codec = ep.codec;
      let audio = ep.audio;
      let resName = null;
      let needsDisk = false;

      const t = ep.scene_name ? ep.scene_name.toLowerCase() : '';
      const fileLower = ep.file_path ? ep.file_path.toLowerCase() : '';
      const hasRes = t.includes('2160p') || t.includes('4k') || t.includes('1080p') || t.includes('720p') || t.includes('480p') || t.includes('sd');
      
      if (!resolution && hasRes) {
        if (fileLower.includes('2160p') || fileLower.includes('4k')) resolution = '2160p';
        else if (fileLower.includes('1080p')) resolution = '1080p';
        else if (fileLower.includes('720p')) resolution = '720p';
        else if (fileLower.includes('480p')) resolution = '480p';
      }
      
      if (!codec) {
        if (fileLower.includes('x265') || fileLower.includes('h265') || fileLower.includes('hevc')) codec = 'x265';
        else if (fileLower.includes('x264') || fileLower.includes('h264') || fileLower.includes('avc')) codec = 'x264';
      }

      if (!audio) audio = parseAudioFromFileName(ep.scene_name || ep.file_path);

      const needsRes = !resolution && !hasRes;

      if (!fileSize || fileSize === 0 || needsRes || !codec || !audio) {
        needsDisk = true;
      }

      if (needsDisk) {
        try {
          if (!fileSize || fileSize === 0) {
            const stat = await fs.stat(ep.file_path);
            fileSize = stat.size;
          }
          if (needsRes || !codec || !audio) {
            const meta = await getMediaMetadata(ep.file_path);
            if (needsRes) {
              resolution = meta.resolution;
              if (resolution) resName = 'Unknown ' + resolution;
            }
            if (!codec) codec = meta.codec;
            if (!audio) audio = meta.audio;
          }
        } catch { /* ignore */ }
      }

      if (needsDisk || resolution !== ep.resolution || codec !== ep.codec || audio !== ep.audio) {
        epUpdates.push({
          id: ep.id,
          fileSize,
          resName,
          resolution,
          codec,
          audio
        });
      }
    } catch { /* skip */ }
    scanProgress.processedFiles++;
  }

  if (epUpdates.length > 0) {
    db.transaction(() => {
      const stmt = db.prepare('UPDATE episodes SET file_size = COALESCE(?, file_size), scene_name = COALESCE(?, scene_name), resolution = ?, codec = ?, audio = ? WHERE id = ?');
      for (const u of epUpdates) {
        stmt.run(u.fileSize, u.resName, u.resolution, u.codec, u.audio, u.id);
      }
    })();
  }

  scanProgress.currentPhase = 'Calculating folder sizes...';
  if (existingShows.length > 0) {
    db.transaction(() => {
      const stmt = db.prepare("UPDATE shows SET folder_size = (SELECT SUM(file_size) FROM episodes WHERE show_id = shows.id AND status = 'downloaded') WHERE id = ?");
      for (const s of existingShows) {
        stmt.run(s.id);
      }
    })();
    scanProgress.processedFiles += existingShows.length;
  }

  scanProgress.currentPhase = 'Refreshing ratings...';
  for (const m of allMovies) {
    if (scanProgress.cancelled) throw new Error('Scan cancelled by user');
    scanProgress.currentFile = m.title;
    try {
      const data = await tmdbService.getMovieById(m.tmdb_id);
      if (data) {
        const updates = [];
        const values = [];
        if (data.vote_average !== undefined) {
          updates.push('rating = ?');
          values.push(data.vote_average);
        }
        if (data.genres && Array.isArray(data.genres)) {
          updates.push('genres = ?');
          values.push(data.genres.map(g => g.name).join(', '));
        }
        if (updates.length > 0) {
          values.push(m.id);
          db.prepare(`UPDATE movies SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        }
      }
      await new Promise(r => setTimeout(r, 50));
    } catch { /* skip */ }
    scanProgress.processedFiles++;
  }

  for (const s of allShows) {
    if (scanProgress.cancelled) throw new Error('Scan cancelled by user');
    scanProgress.currentFile = s.title;
    try {
      const data = await tmdbService.getShowById(s.tmdb_id);
      if (data) {
        const updates = [];
        const values = [];
        if (data.vote_average !== undefined) {
          updates.push('rating = ?');
          values.push(data.vote_average);
        }
        if (data.genres && Array.isArray(data.genres)) {
          updates.push('genres = ?');
          values.push(data.genres.map(g => g.name).join(', '));
        }
        if (updates.length > 0) {
          values.push(s.id);
          db.prepare(`UPDATE shows SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        }
      }
      await new Promise(r => setTimeout(r, 50));
    } catch { /* skip */ }
    scanProgress.processedFiles++;
  }
};

const scanLibrarySubtitles = async (scanProgress, nextStage, mode = 'full') => {
  nextStage('Scanning subtitles...');
  let subMoviesList = [];
  let subEpisodesList = [];

  if (mode !== 'shows') {
    subMoviesList = db.prepare("SELECT id, file_path FROM movies WHERE status = 'downloaded' AND file_path IS NOT NULL").all();
  }
  if (mode !== 'movies') {
    subEpisodesList = db.prepare("SELECT id, file_path, season_number, episode_number FROM episodes WHERE status = 'downloaded' AND file_path IS NOT NULL").all();
  }
  
  const subTotal = subMoviesList.length + subEpisodesList.length;
  scanProgress.totalFiles = subTotal;

  if (mode !== 'shows') {
    scanProgress.currentPhase = 'Scanning movie subtitles...';
    for (const m of subMoviesList) {
      scanProgress.currentFile = path.basename(m.file_path);
      try {
        const langs = await scanSubtitleLangs(m.file_path);
        db.prepare('UPDATE movies SET subtitles = ? WHERE id = ?').run(JSON.stringify(langs), m.id);
      } catch (e) {
        console.warn(`[Scanner] Failed to scan subtitles for ${m.file_path}:`, e.message);
      }
      scanProgress.processedFiles++;
    }
  }

  if (mode !== 'movies') {
    scanProgress.currentPhase = 'Scanning episode subtitles...';
    const epDirMap = {};
    for (const ep of subEpisodesList) {
      const dir = path.dirname(ep.file_path);
      if (!epDirMap[dir]) epDirMap[dir] = [];
      epDirMap[dir].push(ep);
    }

    for (const [dir, eps] of Object.entries(epDirMap)) {
      if (scanProgress.cancelled) throw new Error('Scan cancelled by user');
      let subFiles = [];
      try {
        subFiles = await fs.readdir(dir);
        subFiles = subFiles.filter(f => SUBTITLE_EXTS.includes(path.extname(f).toLowerCase()));
      } catch { /* skip */ }

      for (const ep of eps) {
        scanProgress.currentFile = path.basename(ep.file_path);
        const baseName = path.basename(ep.file_path, path.extname(ep.file_path));
        const s = ep.season_number;
        const e = ep.episode_number;
        const matchStr1 = `s${String(s).padStart(2, '0')}e${String(e).padStart(2, '0')}`;
        const matchStr2 = `${s}x${String(e).padStart(2, '0')}`;

        const matchingSubs = subFiles.filter(f => {
          if (f.startsWith(baseName)) return true;
          const fLower = f.toLowerCase();
          return fLower.includes(matchStr1) || fLower.includes(matchStr2);
        });

        const langs = [...new Set(
          matchingSubs.map(f => {
            const name = path.basename(f, path.extname(f));
            const m = name.match(/[._-]([a-z]{2,3})(?:\.[a-z0-9]+)?$/i);
            return m ? m[1].toLowerCase() : null;
          }).filter(Boolean)
        )];

        try {
          db.prepare('UPDATE episodes SET subtitles = ? WHERE id = ?').run(JSON.stringify(langs), ep.id);
        } catch (e) {
          console.warn(`[Scanner] Failed to update subtitles for ${ep.file_path}:`, e.message);
        }
        scanProgress.processedFiles++;
      }
    }
  }
};

module.exports = {
  updateLibraryMetadata,
  scanLibrarySubtitles
};
