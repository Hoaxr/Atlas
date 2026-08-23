const axios = require('axios');
const db = require('../config/database');
const eventBus = require('./eventBus');

const getSimklClientId = () => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('simklClientId');
  return row ? row.value : null;
};

const getSimklAccessToken = () => {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get('simklAccessToken');
  return row ? row.value : null;
};

const simklApi = axios.create({
  baseURL: 'https://api.simkl.com',
  timeout: 30000
});

const simklRequest = async (config) => {
  const clientId = getSimklClientId();
  if (!clientId) {
    throw new Error('Simkl Client ID is not configured. Please set it in Settings.');
  }

  config.headers = config.headers || {};
  config.headers['Content-Type'] = 'application/json';
  config.headers['simkl-api-key'] = clientId;
  
  const accessToken = getSimklAccessToken();
  if (accessToken && !config.noAuth) {
    config.headers['Authorization'] = `Bearer ${accessToken}`;
  }
  
  return config;
};

simklApi.interceptors.request.use(simklRequest);

/**
 * Get device code (PIN) for user authorization
 * GET /oauth/pin?client_id={client_id}
 */
const getDeviceCode = async () => {
  const clientId = getSimklClientId();
  if (!clientId) {
    throw new Error('Simkl Client ID is not configured.');
  }
  const response = await axios.get(`https://api.simkl.com/oauth/pin?client_id=${encodeURIComponent(clientId)}`, { timeout: 30000 });
  // response.data: { user_code, verification_url, expires_in, interval }
  return response.data;
};

/**
 * Poll for token using user_code
 * GET /oauth/pin/{user_code}?client_id={client_id}
 */
const pollDeviceToken = async (userCode) => {
  const clientId = getSimklClientId();
  if (!clientId) {
    throw new Error('Simkl Client ID is not configured.');
  }
  const response = await axios.get(`https://api.simkl.com/oauth/pin/${encodeURIComponent(userCode)}?client_id=${encodeURIComponent(clientId)}`, { timeout: 30000 });
  // If authorized, returns: { result: "OK", access_token: "..." }
  return response.data;
};

/**
 * Sync watched movies and shows from Simkl
 * GET /sync/all-items/{type}/{status}
 */
const syncWatchedMovies = async () => {
  try {
    const response = await simklApi.get('/sync/all-items/movies?extended=full');
    const moviesList = response.data.movies || [];

    const count = db.transaction((list) => {
      let localCount = 0;
      const insertWatched = db.prepare('INSERT OR REPLACE INTO watched_tmdb (tmdb_id, type) VALUES (?, ?)');
      const insertHistory = db.prepare('INSERT OR IGNORE INTO watch_history (tmdb_id, type, season_number, episode_number, watched_at, runtime) VALUES (?, ?, ?, ?, ?, ?)');
      const getMovieByTmdb = db.prepare('SELECT id, runtime FROM movies WHERE tmdb_id = ?');

      for (const item of list) {
        const tmdbId = item.ids?.tmdb || item.movie?.ids?.tmdb;
        if (!tmdbId) continue;

        const watchedAt = item.last_watched_at || item.watched_at || new Date().toISOString();
        const movie = getMovieByTmdb.get(tmdbId);
        const runtime = item.runtime || (movie ? movie.runtime : null);

        if (item.status === 'completed' || item.watched_at || item.last_watched_at) {
          insertWatched.run(tmdbId, 'movie');
          insertHistory.run(tmdbId, 'movie', null, null, watchedAt, runtime);
        }

        if (movie && (item.status === 'completed' || item.watched_at || item.last_watched_at)) {
          db.prepare('UPDATE movies SET watched = 1, watched_at = COALESCE(watched_at, ?) WHERE id = ?').run(watchedAt, movie.id);
          localCount++;
        }
      }
      return localCount;
    })(moviesList);

    console.log(`[SimklSync] Synced ${count} watched movies (${moviesList.length} items returned from Simkl)`);
    return count;
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('[SimklSync] Cannot sync watched movies — OAuth token required.');
      eventBus.error('Simkl authentication expired or invalid. Please reconnect in Settings.', { module: 'SimklSync' });
      return 0;
    }
    console.error('[SimklSync] Failed to sync watched movies:', error.message);
    return 0;
  }
};

const syncWatchedShows = async () => {
  try {
    const response = await simklApi.get('/sync/all-items/shows?extended=full');
    const showsList = response.data.shows || [];
    const showsNeedingDetail = [];

    const count = db.transaction((list) => {
      let localCount = 0;
      const insertWatched = db.prepare('INSERT OR REPLACE INTO watched_tmdb (tmdb_id, type) VALUES (?, ?)');
      const insertHistory = db.prepare('INSERT OR IGNORE INTO watch_history (tmdb_id, type, season_number, episode_number, watched_at, runtime) VALUES (?, ?, ?, ?, ?, ?)');
      const getShowByTmdb = db.prepare('SELECT id, runtime FROM shows WHERE tmdb_id = ?');
      const updateShowWatched = db.prepare('UPDATE shows SET watched = 1 WHERE id = ?');
      const getEpRuntime = db.prepare('SELECT runtime FROM episodes WHERE show_id = ? AND season_number = ? AND episode_number = ?');
      const updateEpWatched = db.prepare('UPDATE episodes SET watched = 1, watched_at = COALESCE(watched_at, ?) WHERE show_id = ? AND season_number = ? AND episode_number = ?');

      for (const item of list) {
        const tmdbId = item.ids?.tmdb || item.show?.ids?.tmdb;
        if (!tmdbId) continue;
        
        const showWatchedAt = item.last_watched_at || item.watched_at || new Date().toISOString();

        // Only mark show as completed in watched_tmdb table if Simkl status is explicitly completed
        if (item.status === 'completed') {
          insertWatched.run(tmdbId, 'show');
        }

        const show = getShowByTmdb.get(tmdbId);
        // Only mark the show as completely watched if Simkl explicitly marks status as completed AND no un-aired/un-watched episodes exist
        if (show && item.status === 'completed') {
          updateShowWatched.run(show.id);
        }
          
        if (Array.isArray(item.seasons) && item.seasons.length > 0) {
          for (const season of item.seasons) {
            const seasonNum = season.number;
            if (Array.isArray(season.episodes)) {
              for (const ep of season.episodes) {
                const epNum = ep.number;
                const epWatchedAt = ep.last_watched_at || ep.watched_at || showWatchedAt;
                let rt = ep.runtime || null;
                if (!rt && show) {
                  const localEp = getEpRuntime.get(show.id, seasonNum, epNum);
                  rt = localEp ? localEp.runtime : show.runtime;
                }
                insertHistory.run(tmdbId, 'episode', seasonNum, epNum, epWatchedAt, rt);
                
                if (show) {
                  updateEpWatched.run(epWatchedAt, show.id, seasonNum, epNum);
                }
              }
            }
          }
        }
        
        if (item.status === 'completed') {
          insertHistory.run(tmdbId, 'show', null, null, showWatchedAt, show ? show.runtime : null);
          if (show) {
            // Only mark episodes that have actually aired (or are on disk) as
            // watched — unaired placeholders from TMDB must stay unwatched.
            const airedOrOnDisk = "AND (file_path IS NOT NULL OR (air_date IS NOT NULL AND air_date <= date('now','localtime')))";
            const allEps = db.prepare(`SELECT season_number, episode_number, runtime FROM episodes WHERE show_id = ? ${airedOrOnDisk}`).all(show.id);
            for (const ep of allEps) {
              insertHistory.run(tmdbId, 'episode', ep.season_number, ep.episode_number, showWatchedAt, ep.runtime || show.runtime || null);
            }
            db.prepare(`UPDATE episodes SET watched = 1, watched_at = COALESCE(watched_at, ?) WHERE show_id = ? ${airedOrOnDisk}`).run(showWatchedAt, show.id);
          }
        }

        // Queue library shows without episode-level detail for the deep pass —
        // Simkl is the leading source of watched state, so we fetch per-show
        // progress (watched_episodes_count / last_watched) for those separately.
        if (show && !(item.seasons || []).some(se => (se.episodes || []).length)) {
          const simklId = item.show?.ids?.simkl || item.ids?.simkl;
          if (simklId) showsNeedingDetail.push({ simklId, tmdbId, showId: show.id });
        }
        
        if (show) localCount++;
      }
      return localCount;
    })(showsList);

    console.log(`[SimklSync] Synced ${count} watched shows and episode watched states (${showsList.length} shows returned from Simkl)`);

    // ── Deep pass: sequential backfill from per-show progress ──
    // Simkl's all-items response often lacks episode lists. For library shows
    // without one, fetch /sync/all-items/shows/{simklId} and mark episodes
    // watched sequentially up to `last_watched` (SxxEyy) using the local
    // episode ordering — Simkl is treated as the leading source of truth.
    let deepSynced = 0;
    for (const entry of showsNeedingDetail) {
      try {
        const r = await simklApi.get(`/sync/all-items/shows/${entry.simklId}`);
        const info = r.data?.shows?.[0];
        if (!info) continue;
        const watchedCount = Number(info.watched_episodes_count) || 0;
        const lastWatched = String(info.last_watched || '').toUpperCase();
        if (watchedCount <= 0 || !/S(\d{1,2})E(\d{1,4})/.test(lastWatched)) continue;

        const m = lastWatched.match(/S(\d{1,2})E(\d{1,4})/);
        const lastSeason = parseInt(m[1], 10);
        const lastEpisode = parseInt(m[2], 10);
        const watchedAt = info.last_watched_at || new Date().toISOString();

        const eps = db.prepare("SELECT id, season_number, episode_number, runtime, watched FROM episodes WHERE show_id = ? AND (file_path IS NOT NULL OR (air_date IS NOT NULL AND air_date <= date('now','localtime'))) ORDER BY season_number ASC, episode_number ASC").all(entry.showId);
        const cutoff = eps.findIndex(e => e.season_number === lastSeason && e.episode_number === lastEpisode);
        if (cutoff === -1) continue;

        const toMark = eps.slice(0, cutoff + 1).filter(e => !e.watched);
        if (toMark.length === 0) continue;

        const insertDeepHistory = db.prepare('INSERT OR IGNORE INTO watch_history (tmdb_id, type, season_number, episode_number, watched_at, runtime) VALUES (?, \'episode\', ?, ?, ?, ?)');
        db.transaction(() => {
          for (const ep of toMark) {
            db.prepare("UPDATE episodes SET watched = 1, watched_at = COALESCE(watched_at, ?), watch_progress = 0 WHERE id = ?").run(watchedAt, ep.id);
            insertDeepHistory.run(entry.tmdbId, ep.season_number, ep.episode_number, watchedAt, ep.runtime);
          }
        })();

        deepSynced++;
        console.log(`[SimklSync] Deep-synced "${info.show?.title || entry.tmdbId}": marked ${toMark.length} episodes up to ${lastWatched}`);
        await new Promise(res => setTimeout(res, 300)); // throttle API usage
      } catch (err) {
        console.error(`[SimklSync] Deep sync failed for simklId ${entry.simklId}:`, err.message);
      }
    }
    if (showsNeedingDetail.length > 0) {
      console.log(`[SimklSync] Deep pass: ${deepSynced}/${showsNeedingDetail.length} library shows backfilled from Simkl progress`);
    }
    return count;
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('[SimklSync] Cannot sync watched shows — OAuth token required.');
      eventBus.error('Simkl authentication expired or invalid. Please reconnect in Settings.', { module: 'SimklSync' });
      return 0;
    }
    console.error('[SimklSync] Failed to sync watched shows:', error.message);
    return 0;
  }
};

/**
 * Instantly push single item watch status update to Simkl
 */
const pushToSimklOnWatched = async (tmdbId, type, watched, seasonNumber, episodeNumber) => {
  try {
    const enabled = db.prepare("SELECT value FROM settings WHERE key = 'simklWatchedSync'").get();
    if (!enabled || enabled.value !== 'true') return;
    if (!tmdbId) return;

    const endpoint = watched ? '/sync/history' : '/sync/history/remove';
    let payload = {};

    if (type === 'movie') {
      payload = { movies: [{ ids: { tmdb: tmdbId } }] };
    } else if (type === 'show' || type === 'episode') {
      if (seasonNumber !== undefined && episodeNumber !== undefined) {
        payload = {
          shows: [{
            ids: { tmdb: tmdbId },
            seasons: [{
              number: seasonNumber,
              episodes: [{ number: episodeNumber }]
            }]
          }]
        };
      } else {
        payload = { shows: [{ ids: { tmdb: tmdbId } }] };
      }
    }

    await simklApi.post(endpoint, payload);
    if (!watched) {
      if (type === 'movie' || (type === 'show' && seasonNumber === undefined)) {
        db.prepare('DELETE FROM watched_tmdb WHERE tmdb_id = ? AND type = ?').run(tmdbId, type);
      }
    }
    const detail = type === 'show' && seasonNumber !== undefined ? `S${seasonNumber}E${episodeNumber}` : type;
    console.log(`[SimklSync] ${watched ? 'Pushed watched' : 'Removed watched'} for ${detail} (TMDB ${tmdbId}) to Simkl`);
  } catch (error) {
    console.error(`[SimklSync] Failed to ${watched ? 'push watched' : 'remove watched'} to Simkl:`, error.message);
  }
};

/**
 * Dry run of pushing local watched items from Atlas to Simkl
 */
const pushDryRun = async () => {
  const movies = db.prepare('SELECT title, year, tmdb_id FROM movies WHERE watched = 1 AND tmdb_id IS NOT NULL').all();
  const shows = db.prepare('SELECT title, year, tmdb_id FROM shows WHERE watched = 1 AND tmdb_id IS NOT NULL').all();

  console.log(`[SimklSync Dry Run] Found ${movies.length} watched movies and ${shows.length} watched shows in local DB ready for Simkl.`);
  return {
    moviesCount: movies.length,
    showsCount: shows.length,
    movies,
    shows
  };
};

/**
 * Push local watched items from Atlas to Simkl
 * POST /sync/history
 */
const pushWatchedToSimkl = async () => {
  try {
    const movies = db.prepare('SELECT tmdb_id FROM movies WHERE watched = 1 AND tmdb_id IS NOT NULL').all();
    const shows = db.prepare('SELECT tmdb_id FROM shows WHERE watched = 1 AND tmdb_id IS NOT NULL').all();
    const watchedEps = db.prepare(`
      SELECT s.tmdb_id, e.season_number, e.episode_number
      FROM episodes e
      JOIN shows s ON e.show_id = s.id
      WHERE e.watched = 1 AND s.tmdb_id IS NOT NULL AND s.watched = 0
    `).all();

    // Group episode watched items by show
    const showEpMap = {};
    for (const ep of watchedEps) {
      if (!showEpMap[ep.tmdb_id]) showEpMap[ep.tmdb_id] = {};
      if (!showEpMap[ep.tmdb_id][ep.season_number]) showEpMap[ep.tmdb_id][ep.season_number] = [];
      showEpMap[ep.tmdb_id][ep.season_number].push({ number: ep.episode_number });
    }

    const showPayloads = shows.map(s => ({ ids: { tmdb: s.tmdb_id } }));
    for (const [tmdbId, seasonsObj] of Object.entries(showEpMap)) {
      const seasons = Object.entries(seasonsObj).map(([seasonNum, eps]) => ({
        number: Number(seasonNum),
        episodes: eps
      }));
      showPayloads.push({ ids: { tmdb: Number(tmdbId) }, seasons });
    }

    const payload = {
      movies: movies.map(m => ({ ids: { tmdb: m.tmdb_id } })),
      shows: showPayloads
    };

    if (payload.movies.length === 0 && payload.shows.length === 0) {
      console.log('[SimklSync] No local watched items to push to Simkl.');
      return { moviesPushed: 0, showsPushed: 0 };
    }

    await simklApi.post('/sync/history', payload);
    console.log(`[SimklSync] Pushed ${payload.movies.length} movies and ${payload.shows.length} shows/episodes to Simkl`);
    return { moviesPushed: payload.movies.length, showsPushed: payload.shows.length };
  } catch (error) {
    console.error('[SimklSync] Failed to push watched items to Simkl:', error.message);
    throw error;
  }
};

const syncWatched = async () => {
  const enabled = db.prepare("SELECT value FROM settings WHERE key = 'simklWatchedSync'").get();
  if (!enabled || enabled.value !== 'true') {
    console.log('[SimklSync] Simkl watched sync is disabled in Settings.');
    return;
  }
  console.log('[SimklSync] Starting watched status sync...');
  // Pull from Simkl to update local database
  const movieCount = await syncWatchedMovies();
  const showCount = await syncWatchedShows();
  console.log(`[SimklSync] Sync complete — ${movieCount} movies, ${showCount} shows marked as watched.`);
};

/**
 * Fetch stats for user from Simkl
 * GET /users/settings
 */
const getUserStats = async () => {
  try {
    const response = await simklApi.get('/users/settings');
    const user = response.data.user || {};
    const stats = response.data.stats || {};

    return {
      username: user.name || 'Simkl User',
      movies: {
        watched: stats.movies?.completed || 0,
        minutes: stats.movies?.minutes || 0
      },
      shows: {
        watched: stats.shows?.completed || 0
      },
      episodes: {
        watched: stats.episodes?.completed || 0,
        minutes: stats.episodes?.minutes || 0
      },
      totalMinutes: (stats.movies?.minutes || 0) + (stats.episodes?.minutes || 0)
    };
  } catch (error) {
    if (error.response?.status === 401) {
      return { error: 'Simkl authentication required. Connect Simkl in Settings.' };
    }
    console.error('[Simkl] Failed to fetch user stats:', error.message);
    return { error: 'Failed to fetch Simkl stats.' };
  }
};

const init = () => {
  // Simkl is the leading source of watched state — sync every 6 hours so
  // playback progress made elsewhere flows into the library automatically.
  try {
    const taskRegistry = require('./taskRegistry');
    const { registerJob } = require('../utils/cronRegistry');
    const cron = require('node-cron');

    taskRegistry.registerTask(
      'simkl_sync',
      'Simkl Watched Sync',
      'Imports watched movies and episode states from Simkl into the library.',
      '0 */6 * * *',
      syncWatched
    );
    const job = cron.schedule('0 */6 * * *', () => taskRegistry.executeTask('simkl_sync').catch(err => console.error('[SimklSync] Scheduled sync failed:', err.message)));
    registerJob(job);
    console.log('[SimklSync] Scheduler initialized (every 6 hours).');
  } catch (err) {
    console.error('[SimklSync] Failed to initialize scheduler:', err.message);
  }
};

module.exports = {
  init,
  getDeviceCode,
  pollDeviceToken,
  syncWatched,
  syncWatchedMovies,
  syncWatchedShows,
  pushWatchedToSimkl,
  pushDryRun,
  pushToSimklOnWatched,
  getUserStats
};
