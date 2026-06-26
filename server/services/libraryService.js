const db = require('../config/database');
const tmdbService = require('./tmdbService');

const isWatchedSyncEnabled = () => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'traktWatchedSync'").get();
  return row && row.value === 'true';
};

const sanitizeWatched = (items) => {
  if (isWatchedSyncEnabled()) return items;
  return items.map(item => ({ ...item, watched: 0 }));
};

const addMovie = async (tmdbId) => {
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

  const insert = db.prepare(`
    INSERT INTO movies (tmdb_id, title, year, poster_path, overview, status, rating, genres)
    VALUES (?, ?, ?, ?, ?, 'monitored', ?, ?)
  `);
  
  const result = insert.run(
    movieDetails.id,
    movieDetails.title,
    year,
    movieDetails.poster_path,
    movieDetails.overview,
    movieDetails.vote_average || 0,
    genres
  );

  return { id: result.lastInsertRowid, tmdb_id: movieDetails.id, title: movieDetails.title };
};

const getMovies = () => {
  return sanitizeWatched(db.prepare(`
    SELECT m.*, qp.name as quality_profile_name
    FROM movies m
    LEFT JOIN quality_profiles qp ON m.quality_profile_id = qp.id
    ORDER BY m.added_at DESC
  `).all());
};

const addShow = async (tmdbId) => {
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
        INSERT INTO episodes (show_id, season_number, episode_number, title, overview, status)
        VALUES (?, ?, ?, ?, ?, 'monitored')
        ON CONFLICT(show_id, season_number, episode_number) DO NOTHING
      `);
      
      for (const s of seasons) {
        if (s.season_number === 0) continue; // Skip specials for now to keep it clean
        const episodes = await tmdbService.getSeasonEpisodes(tmdbId, s.season_number);
        for (const ep of episodes) {
          insertEp.run(internalShowId, ep.season_number, ep.episode_number, ep.name, ep.overview);
        }
      }
    } catch (err) {
      console.error('Failed to fetch and save episodes:', err.message);
    }
  })();

  return { id: internalShowId, tmdb_id: showDetails.id, title: showDetails.name };
};

const getShows = () => {
  return sanitizeWatched(db.prepare(`
    SELECT s.*, qp.name as quality_profile_name,
      (SELECT COUNT(*) FROM episodes WHERE show_id = s.id) as episode_count,
      (SELECT COUNT(*) FROM episodes WHERE show_id = s.id AND status = 'downloaded') as downloaded_episodes
    FROM shows s
    LEFT JOIN quality_profiles qp ON s.quality_profile_id = qp.id
    ORDER BY s.added_at DESC
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
      throw new Error('Path already exists in library');
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
