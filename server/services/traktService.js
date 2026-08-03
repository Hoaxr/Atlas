const db = require('../config/database');

const importTraktJson = async (jsonData) => {
  return new Promise((resolve, reject) => {
    try {
      let importedMovies = 0;
      let importedEpisodes = 0;

      // Handle the data array or object
      let items = [];
      if (Array.isArray(jsonData)) {
        items = jsonData;
      } else if (typeof jsonData === 'object' && jsonData !== null) {
        // sometimes exports group them by type
        if (jsonData.movies && Array.isArray(jsonData.movies)) items.push(...jsonData.movies);
        if (jsonData.shows && Array.isArray(jsonData.shows)) items.push(...jsonData.shows);
        if (jsonData.episodes && Array.isArray(jsonData.episodes)) items.push(...jsonData.episodes);
        if (items.length === 0) {
           // just iterate object values if it's a map
           Object.values(jsonData).forEach(val => {
             if (Array.isArray(val)) items.push(...val);
           });
        }
      }

      const insertHistory = db.prepare('INSERT OR IGNORE INTO watch_history (tmdb_id, type, season_number, episode_number, watched_at, runtime) VALUES (?, ?, ?, ?, ?, ?)');
      const getMovie = db.prepare('SELECT id, runtime FROM movies WHERE tmdb_id = ?');
      const updateMovie = db.prepare('UPDATE movies SET watched = 1, watched_at = COALESCE(watched_at, ?) WHERE tmdb_id = ?');
      const getShow = db.prepare('SELECT id, runtime FROM shows WHERE tmdb_id = ?');
      const getEpRuntime = db.prepare('SELECT runtime FROM episodes WHERE show_id = ? AND season_number = ? AND episode_number = ?');
      const updateEpisode = db.prepare('UPDATE episodes SET watched = 1, watched_at = COALESCE(watched_at, ?) WHERE show_id = ? AND season_number = ? AND episode_number = ?');

      db.transaction(() => {
        for (const item of items) {
          // Extract TMDB ID
          let tmdbId = item.tmdb_id || item.tmdbId || null;
          if (!tmdbId && item.movie && item.movie.ids) tmdbId = item.movie.ids.tmdb;
          if (!tmdbId && item.show && item.show.ids) tmdbId = item.show.ids.tmdb;

          if (!tmdbId) continue;

          // Determine type
          let type = item.type || '';
          if (!type && item.movie) type = 'movie';
          if (!type && item.episode) type = 'episode';
          if (!type && item.show) type = 'show';
          if (!type && (item.season_number !== undefined || item.season !== undefined || item.episode !== undefined)) type = 'episode';
          if (!type && item.title) type = 'movie'; // fallback

          const watchedAt = item.watched_at || item.watchedAt || item.last_watched_at || new Date().toISOString();

          if (type === 'movie' || type === 'movies') {
            const m = getMovie.get(tmdbId);
            const rt = item.runtime || item.movie?.runtime || (m ? m.runtime : null);
            insertHistory.run(tmdbId, 'movie', null, null, watchedAt, rt);
            updateMovie.run(watchedAt, tmdbId);
            importedMovies++;
          } else if (type === 'episode' || type === 'episodes' || type === 'show' || type === 'shows') {
             // For episodes, we need season and episode number
             if (item.seasons && Array.isArray(item.seasons)) {
               const show = getShow.get(tmdbId);
               for (const s of item.seasons) {
                 const seasonNum = s.number;
                 if (s.episodes && Array.isArray(s.episodes)) {
                   for (const ep of s.episodes) {
                     const episodeNum = ep.number;
                     const epWatchedAt = ep.last_watched_at || ep.watched_at || watchedAt;
                     let rt = ep.runtime || null;
                     if (!rt && show) {
                       const localEp = getEpRuntime.get(show.id, seasonNum, episodeNum);
                       rt = localEp ? localEp.runtime : show.runtime;
                     }
                     insertHistory.run(tmdbId, 'episode', seasonNum, episodeNum, epWatchedAt, rt);
                     if (show) {
                       updateEpisode.run(epWatchedAt, show.id, seasonNum, episodeNum);
                     }
                     importedEpisodes++;
                   }
                 }
               }
             } else {
               let season = item.season_number !== undefined ? item.season_number : (item.season !== undefined ? item.season : (item.episode?.season));
               let episode = item.episode_number !== undefined ? item.episode_number : (item.episode !== undefined && typeof item.episode === 'number' ? item.episode : (item.episode?.number));
  
               if (season !== undefined && episode !== undefined) {
                 const show = getShow.get(tmdbId);
                 let rt = item.runtime || item.episode?.runtime || null;
                 if (!rt && show) {
                   const localEp = getEpRuntime.get(show.id, season, episode);
                   rt = localEp ? localEp.runtime : show.runtime;
                 }
                 insertHistory.run(tmdbId, 'episode', season, episode, watchedAt, rt);
                 
                 if (show) {
                   updateEpisode.run(watchedAt, show.id, season, episode);
                 }
                 importedEpisodes++;
               } else if (type === 'show' || type === 'shows') {
                  // It's just a show watched status, but Trakt usually tracks episodes
                  // We could insert it as show, but Atlas watch_history primarily cares about episode and movie
                  insertHistory.run(tmdbId, 'show', null, null, watchedAt, null);
               }
             }
          }
        }
      })();

      resolve({ movies: importedMovies, episodes: importedEpisodes });
    } catch (error) {
      console.error('[TraktService] Import error:', error);
      reject(error);
    }
  });
};

module.exports = {
  importTraktJson
};
