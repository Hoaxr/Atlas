const db = require('../config/database');
const tmdbService = require('./tmdbService');
const fs = require('fs');
const path = require('path');
const { getNamingConfig, sanitizeTitle } = require('./mediaManagementService');
const { isWatchedSyncEnabled } = require('../utils/settings');

const sanitizeWatched = (items) => {
  if (isWatchedSyncEnabled()) return items;
  return items.map(item => ({ ...item, watched: 0 }));
};

const addMovie = async (tmdbId, rootFolderPath = null) => {
  // Check if it already exists
  const existing = db.prepare('SELECT id FROM movies WHERE tmdb_id = ?').get(tmdbId);
  if (existing) {
    throw new Error('Movie already in library');
  }

  // Fetch from TMDB to get the details
  const movieDetails = await tmdbService.getMovieById(tmdbId);
  if (!movieDetails) {
    throw new Error('Movie not found on TMDB');
  }

  const year = movieDetails.release_date ? parseInt(movieDetails.release_date.split('-')[0]) : null;
  const genres = movieDetails.genres ? movieDetails.genres.map(g => g.name).join(', ') : '';

  // Get the actual digital/physical release date
  // Falls back to theatrical + 90 days if TMDB has no digital/physical date yet
  let releaseDate = await tmdbService.getMovieReleaseDates(tmdbId);
  if (!releaseDate && movieDetails.release_date) {
    // No digital date yet — estimate 90 days after theatrical
    const theatrical = new Date(movieDetails.release_date);
    theatrical.setDate(theatrical.getDate() + 90);
    releaseDate = theatrical.toISOString().split('T')[0];
  }

  // Default to the first configured quality profile
  const defaultProfile = db.prepare('SELECT id FROM quality_profiles ORDER BY id ASC LIMIT 1').get();
  const defaultProfileId = defaultProfile?.id || null;

  const insert = db.prepare(`
    INSERT INTO movies (tmdb_id, title, year, poster_path, overview, status, rating, genres, quality_profile_id, release_date)
    VALUES (?, ?, ?, ?, ?, 'monitored', ?, ?, ?, ?)
  `);
  
  const result = insert.run(
    movieDetails.id,
    movieDetails.title,
    year,
    movieDetails.poster_path,
    movieDetails.overview,
    movieDetails.vote_average || 0,
    genres,
    defaultProfileId,
    releaseDate || null
  );

  // Pre-create the movie folder
  try {
    let libraryRoot = rootFolderPath;
    if (!libraryRoot) {
      const paths = db.prepare('SELECT path FROM library_paths').all();
      if (paths.length > 0) {
        libraryRoot = paths.find(p => p.path.toLowerCase().includes('movie'))?.path || paths[0].path;
      }
    }
    
    if (libraryRoot) {
      const isDedicatedPath = libraryRoot.toLowerCase().includes('movie');
      const config = getNamingConfig();
      
      let folderName = `${movieDetails.title} (${year})`;
      if (config.renameMovies) {
        let format = config.standardMovieFormat;
        format = format.replace('{Movie Title}', sanitizeTitle(movieDetails.title, config));
        format = format.replace('{Release Year}', year || '');
        folderName = format;
      } else {
        folderName = sanitizeTitle(folderName, config);
      }

      const destFolder = isDedicatedPath 
        ? path.join(libraryRoot, folderName) 
        : path.join(libraryRoot, 'Movies', folderName);
      
      if (!fs.existsSync(destFolder)) {
        fs.mkdirSync(destFolder, { recursive: true });
        console.log(`[LibraryService] Pre-created movie folder: ${destFolder}`);
      }
      // Store folder_path so it can be cleaned up on delete
      db.prepare('UPDATE movies SET folder_path = ? WHERE id = ?').run(destFolder, result.lastInsertRowid);
    }
  } catch (err) {
    console.error(`[LibraryService] Failed to pre-create movie folder:`, err.message);
  }

  // Auto-approve any pending request for this movie
  db.prepare("UPDATE requests SET status = 'approved' WHERE tmdb_id = ? AND type = 'movie' AND status = 'pending'").run(movieDetails.id);

  return { id: result.lastInsertRowid, tmdb_id: movieDetails.id, title: movieDetails.title };
};

const getMovies = (limit = 0, offset = 0, sort = 'added_desc') => {
  const sortMap = {
    'added_desc': 'm.added_at DESC, m.id DESC',
    'added_asc': 'm.added_at ASC, m.id ASC',
    'rating_desc': 'm.rating DESC, m.added_at DESC',
    'rating_asc': 'm.rating ASC, m.added_at DESC',
    'title_asc': 'm.title ASC, m.added_at DESC',
    'title_desc': 'm.title DESC, m.added_at DESC',
    'year_desc': 'm.year DESC, m.added_at DESC',
    'year_asc': 'm.year ASC, m.added_at DESC',
    'size_desc': 'm.file_size DESC, m.added_at DESC',
    'size_asc': 'm.file_size ASC, m.added_at DESC',
  };
  let sql = `
    SELECT m.*, qp.name as quality_profile_name
    FROM movies m
    LEFT JOIN quality_profiles qp ON m.quality_profile_id = qp.id
    ORDER BY ${sortMap[sort] || 'm.added_at DESC, m.id DESC'}
  `;
  if (limit > 0) sql += ` LIMIT ${limit} OFFSET ${offset}`;
  return sanitizeWatched(db.prepare(sql).all());
};

const addShow = async (tmdbId, rootFolderPath = null) => {
  const existing = db.prepare('SELECT id FROM shows WHERE tmdb_id = ?').get(tmdbId);
  if (existing) {
    throw new Error('Show already in library');
  }

  const showDetails = await tmdbService.getShowById(tmdbId);
  if (!showDetails) {
    throw new Error('Show not found on TMDB');
  }

  const year = showDetails.first_air_date ? parseInt(showDetails.first_air_date.split('-')[0]) : null;
  const genres = showDetails.genres ? showDetails.genres.map(g => g.name).join(', ') : '';

  const insert = db.prepare(`
    INSERT INTO shows (tmdb_id, title, year, poster_path, overview, status, rating, genres, tmdb_status)
    VALUES (?, ?, ?, ?, ?, 'monitored', ?, ?, ?)
  `);
  
  const result = insert.run(
    showDetails.id,
    showDetails.name,
    year,
    showDetails.poster_path,
    showDetails.overview,
    showDetails.vote_average || 0,
    genres,
    showDetails.status || ''
  );
  
  const internalShowId = result.lastInsertRowid;

  // Background fetch seasons and episodes
  (async () => {
    try {
      const seasons = await tmdbService.getShowSeasons(tmdbId);
      const insertEp = db.prepare(`
        INSERT INTO episodes (show_id, season_number, episode_number, title, overview, status, air_date)
        VALUES (?, ?, ?, ?, ?, 'monitored', ?)
        ON CONFLICT(show_id, season_number, episode_number) DO NOTHING
      `);
      
      for (const s of seasons) {
        if (s.season_number === 0) continue; // Skip specials for now to keep it clean
        const episodes = await tmdbService.getSeasonEpisodes(tmdbId, s.season_number);
        for (const ep of episodes) {
          insertEp.run(internalShowId, ep.season_number, ep.episode_number, ep.name, ep.overview, ep.air_date);
        }
      }
    } catch (err) {
      console.error('Failed to fetch and save episodes:', err.message);
    }
  })();

  // Pre-create the show folder
  try {
    let libraryRoot = rootFolderPath;
    if (!libraryRoot) {
      const paths = db.prepare('SELECT path FROM library_paths').all();
      if (paths.length > 0) {
        libraryRoot = paths.find(p => p.path.toLowerCase().includes('tv') || p.path.toLowerCase().includes('show'))?.path || paths[0].path;
      }
    }

    if (libraryRoot) {
      const isDedicatedPath = libraryRoot.toLowerCase().includes('tv') || libraryRoot.toLowerCase().includes('show');
      const config = getNamingConfig();
      
      const folderName = sanitizeTitle(showDetails.name, config);

      const destFolder = isDedicatedPath 
        ? path.join(libraryRoot, folderName) 
        : path.join(libraryRoot, 'TV Shows', folderName);
      
      if (!fs.existsSync(destFolder)) {
        fs.mkdirSync(destFolder, { recursive: true });
        console.log(`[LibraryService] Pre-created show folder: ${destFolder}`);
      }

      // We should also persist the path in the shows DB since ShowDetails expects it for stats/downloads
      db.prepare('UPDATE shows SET folder_path = ? WHERE id = ?').run(destFolder, internalShowId);
    }
  } catch (err) {
    console.error(`[LibraryService] Failed to pre-create show folder:`, err.message);
  }

  // Auto-approve any pending request for this show
  db.prepare("UPDATE requests SET status = 'approved' WHERE tmdb_id = ? AND type = 'tv' AND status = 'pending'").run(showDetails.id);

  return { id: internalShowId, tmdb_id: showDetails.id, title: showDetails.name };
};

const getShows = (limit = 0, offset = 0, sort = 'added_desc') => {
  const sortMap = {
    'added_desc': 's.added_at DESC, s.id DESC',
    'added_asc': 's.added_at ASC, s.id ASC',
    'rating_desc': 's.rating DESC, s.added_at DESC',
    'rating_asc': 's.rating ASC, s.added_at DESC',
    'title_asc': 's.title ASC, s.added_at DESC',
    'title_desc': 's.title DESC, s.added_at DESC',
    'year_desc': 's.year DESC, s.added_at DESC',
    'year_asc': 's.year ASC, s.added_at DESC',
    'season_count_desc': '(SELECT COUNT(DISTINCT season_number) FROM episodes WHERE show_id = s.id) DESC, s.added_at DESC',
    'season_count_asc': '(SELECT COUNT(DISTINCT season_number) FROM episodes WHERE show_id = s.id) ASC, s.added_at DESC',
    'missing_episodes_desc': '(SELECT COUNT(*) FROM episodes e WHERE e.show_id = s.id AND e.monitored = 1 AND (e.file_path IS NULL OR e.file_path = \'\') AND e.status != \'downloaded\' AND ((e.air_date IS NOT NULL AND e.air_date <= date(\'now\')) OR (e.air_date IS NULL AND EXISTS (SELECT 1 FROM episodes e2 WHERE e2.show_id = e.show_id AND e2.season_number = e.season_number AND e2.status = \'downloaded\')))) DESC, s.added_at DESC',
    'missing_episodes_asc': '(SELECT COUNT(*) FROM episodes e WHERE e.show_id = s.id AND e.monitored = 1 AND (e.file_path IS NULL OR e.file_path = \'\') AND e.status != \'downloaded\' AND ((e.air_date IS NOT NULL AND e.air_date <= date(\'now\')) OR (e.air_date IS NULL AND EXISTS (SELECT 1 FROM episodes e2 WHERE e2.show_id = e.show_id AND e2.season_number = e.season_number AND e2.status = \'downloaded\')))) ASC, s.added_at DESC',
  };
  let sql = `
    SELECT s.*, qp.name as quality_profile_name,
      (SELECT COUNT(*) FROM episodes WHERE show_id = s.id) as episode_count,
      (SELECT COUNT(*) FROM episodes WHERE show_id = s.id AND status = 'downloaded') as downloaded_episodes,
      (SELECT COUNT(*) FROM episodes e WHERE e.show_id = s.id AND e.monitored = 1 AND (e.file_path IS NULL OR e.file_path = '') AND e.status != 'downloaded' AND (
        (e.air_date IS NOT NULL AND e.air_date <= date('now')) OR
        (e.air_date IS NULL AND EXISTS (
          SELECT 1 FROM episodes e2 WHERE e2.show_id = e.show_id AND e2.season_number = e.season_number AND e2.status = 'downloaded'
        ))
      )) as missing_episodes,
      (SELECT COUNT(DISTINCT season_number) FROM episodes WHERE show_id = s.id) as season_count,
      (SELECT COALESCE(scene_name, file_path) FROM episodes WHERE show_id = s.id AND status = 'downloaded' AND (scene_name IS NOT NULL OR file_path IS NOT NULL) LIMIT 1) as sample_episode_path
    FROM shows s
    LEFT JOIN quality_profiles qp ON s.quality_profile_id = qp.id
    ORDER BY ${sortMap[sort] || 's.added_at DESC, s.id DESC'}
  `;
  if (limit > 0) sql += ` LIMIT ${limit} OFFSET ${offset}`;
  return sanitizeWatched(db.prepare(sql).all());
};

const getPaths = () => {
  return db.prepare('SELECT * FROM library_paths ORDER BY added_at ASC').all();
};

const addPath = (pathString, type = 'movies') => {
  try {
    const insert = db.prepare('INSERT INTO library_paths (path, type) VALUES (?, ?)');
    const result = insert.run(pathString, type);
    return { id: result.lastInsertRowid, path: pathString, type };
  } catch (e) {
    if (e.message.includes('UNIQUE constraint failed')) {
      throw new Error('Path already exists in library', { cause: e });
    }
    throw e;
  }
};

const removePath = (id) => {
  db.prepare('DELETE FROM library_paths WHERE id = ?').run(id);
};

module.exports = {
  addMovie,
  getMovies,
  addShow,
  getShows,
  getPaths,
  addPath,
  removePath
};
