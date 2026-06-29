const db = require('../config/database');
const tmdbService = require('./tmdbService');
const fs = require('fs');
const path = require('path');
const { getNamingConfig, sanitizeTitle } = require('./mediaManagementService');

const isWatchedSyncEnabled = () => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'traktWatchedSync'").get();
  return row && row.value === 'true';
};

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

  // Default to the first configured quality profile
  const defaultProfile = db.prepare('SELECT id FROM quality_profiles ORDER BY id ASC LIMIT 1').get();
  const defaultProfileId = defaultProfile?.id || null;

  const insert = db.prepare(`
    INSERT INTO movies (tmdb_id, title, year, poster_path, overview, status, rating, genres, quality_profile_id)
    VALUES (?, ?, ?, ?, ?, 'monitored', ?, ?, ?)
  `);
  
  const result = insert.run(
    movieDetails.id,
    movieDetails.title,
    year,
    movieDetails.poster_path,
    movieDetails.overview,
    movieDetails.vote_average || 0,
    genres,
    defaultProfileId
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
      // folder_path is not stored — directory is always derivable from file_path
    }
  } catch (err) {
    console.error(`[LibraryService] Failed to pre-create movie folder:`, err.message);
  }

  return { id: result.lastInsertRowid, tmdb_id: movieDetails.id, title: movieDetails.title };
};

const getMovies = () => {
  return sanitizeWatched(db.prepare(`
    SELECT m.*, qp.name as quality_profile_name
    FROM movies m
    LEFT JOIN quality_profiles qp ON m.quality_profile_id = qp.id
    ORDER BY m.added_at DESC, m.id DESC
  `).all());
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
    INSERT INTO shows (tmdb_id, title, year, poster_path, overview, status, rating, genres)
    VALUES (?, ?, ?, ?, ?, 'monitored', ?, ?)
  `);
  
  const result = insert.run(
    showDetails.id,
    showDetails.name,
    year,
    showDetails.poster_path,
    showDetails.overview,
    showDetails.vote_average || 0,
    genres
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

  return { id: internalShowId, tmdb_id: showDetails.id, title: showDetails.name };
};

const getShows = () => {
  return sanitizeWatched(db.prepare(`
    SELECT s.*, qp.name as quality_profile_name,
      (SELECT COUNT(*) FROM episodes WHERE show_id = s.id) as episode_count,
      (SELECT COUNT(*) FROM episodes WHERE show_id = s.id AND status = 'downloaded') as downloaded_episodes,
      (SELECT COUNT(DISTINCT season_number) FROM episodes WHERE show_id = s.id) as season_count,
      (SELECT COALESCE(scene_name, file_path) FROM episodes WHERE show_id = s.id AND status = 'downloaded' AND (scene_name IS NOT NULL OR file_path IS NOT NULL) LIMIT 1) as sample_episode_path
    FROM shows s
    LEFT JOIN quality_profiles qp ON s.quality_profile_id = qp.id
    ORDER BY s.added_at DESC, s.id DESC
  `).all());
};

const getPaths = () => {
  return db.prepare('SELECT * FROM library_paths ORDER BY added_at ASC').all();
};

const addPath = (pathString) => {
  try {
    const insert = db.prepare('INSERT INTO library_paths (path) VALUES (?)');
    const result = insert.run(pathString);
    return { id: result.lastInsertRowid, path: pathString };
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
