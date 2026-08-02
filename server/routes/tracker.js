const express = require('express');
const router = express.Router();
const db = require('../config/database');
const tmdbService = require('../services/tmdbService');

// Helper to fallback to average runtimes if null
const MOVIE_AVG = 100;
const EPISODE_AVG = 45;

router.get('/stats', (req, res) => {
  try {
    // Movies stats (Unique movies)
    const movieStats = db.prepare(`
      SELECT
        COUNT(DISTINCT w.tmdb_id) as count,
        SUM(COALESCE(w.runtime, m.runtime, ?)) as total_minutes
      FROM watch_history w
      LEFT JOIN movies m ON w.tmdb_id = m.tmdb_id
      WHERE w.type = 'movie'
    `).get(MOVIE_AVG);

    // Episodes stats (Unique episodes & shows)
    const episodeStats = db.prepare(`
      SELECT
        COUNT(DISTINCT w.tmdb_id || '-' || w.season_number || '-' || w.episode_number) as count,
        COUNT(DISTINCT w.tmdb_id) as shows_count,
        SUM(COALESCE(w.runtime, e.runtime, ?)) as total_minutes
      FROM watch_history w
      LEFT JOIN shows s ON w.tmdb_id = s.tmdb_id
      LEFT JOIN episodes e ON s.id = e.show_id AND w.season_number = e.season_number AND w.episode_number = e.episode_number
      WHERE w.type = 'episode'
    `).get(EPISODE_AVG);

    const totalMinutes = (movieStats.total_minutes || 0) + (episodeStats.total_minutes || 0);

    res.json({
      success: true,
      stats: {
        movies: { count: movieStats.count, minutes: movieStats.total_minutes || 0 },
        episodes: { count: episodeStats.count, minutes: episodeStats.total_minutes || 0 },
        shows: { count: episodeStats.shows_count || 0 },
        total_minutes: totalMinutes,
        total_hours: Math.round(totalMinutes / 60),
        total_days: (totalMinutes / 60 / 24).toFixed(1)
      }
    });
  } catch (error) {
    console.error('[Tracker] /stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.get('/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;

    const history = db.prepare(`
      SELECT 
        w.id as history_id, w.tmdb_id, w.type, w.season_number, w.episode_number, w.watched_at,
        m.title as movie_title, m.poster_path as movie_poster,
        s.title as show_title, s.poster_path as show_poster,
        e.title as episode_title
      FROM watch_history w
      LEFT JOIN movies m ON w.type = 'movie' AND w.tmdb_id = m.tmdb_id
      LEFT JOIN shows s ON w.type = 'episode' AND w.tmdb_id = s.tmdb_id
      LEFT JOIN episodes e ON w.type = 'episode' AND s.id = e.show_id AND w.season_number = e.season_number AND w.episode_number = e.episode_number
      ORDER BY w.watched_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    // If local library doesn't have the item, we still return the TMDB ID so frontend can show a placeholder or fetch TMDB
    // To make the tracker fast, we will rely on frontend querying TMDB for missing posters/titles if they aren't in library.
    // Or we can query them here (but might be slow for 50 items). Since the user wants to see their history, we return what we have.

    res.json({ success: true, history });
  } catch (error) {
    console.error('[Tracker] /history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

router.get('/up-next', (req, res) => {
  try {
    // 1. Unwatched movies in library that have been started (watch_progress > 0)
    const movies = db.prepare(`
      SELECT id, tmdb_id, title, poster_path, overview, release_date, runtime, watch_progress
      FROM movies 
      WHERE watched = 0 AND status = 'downloaded' AND watch_progress > 0
      ORDER BY added_at DESC
      LIMIT 10
    `).all();

    // 2. Next unwatched episodes for all shows in library with downloaded episodes.
    //    Works for both started shows (picks up next after last watched) and
    //    unstarted shows (shows S1E1).
    const episodes = db.prepare(`
      WITH ShowFirstUnwatched AS (
        SELECT 
          e.id as episode_id, 
          e.show_id,
          e.season_number, 
          e.episode_number, 
          e.title as episode_title,
          e.runtime,
          e.watch_progress,
          s.tmdb_id, 
          s.title as show_title, 
          s.poster_path,
          s.tmdb_status,
          ROW_NUMBER() OVER (
            PARTITION BY e.show_id 
            ORDER BY e.season_number, e.episode_number
          ) as rn
        FROM episodes e
        JOIN shows s ON e.show_id = s.id
        WHERE e.watched = 0 
          AND (
            e.status = 'downloaded' 
            OR (
              e.air_date IS NOT NULL AND e.air_date <= date('now') AND 
              (e.status = 'monitored' OR e.show_id IN (SELECT show_id FROM episodes WHERE watched = 1))
            )
          )
      ),
      RemainingCount AS (
        SELECT 
          sf.episode_id,
          sf.show_id,
          sf.season_number,
          COUNT(*) as episodes_left,
          SUM(COALESCE(e2.runtime, ?)) as total_time_left
        FROM ShowFirstUnwatched sf
        JOIN episodes e2 ON e2.show_id = sf.show_id 
          AND (
            (e2.season_number = sf.season_number AND e2.episode_number >= sf.episode_number)
            OR (e2.season_number > sf.season_number)
          )
          AND e2.watched = 0 
          AND (
            e2.status = 'downloaded' 
            OR (
              e2.air_date IS NOT NULL AND e2.air_date <= date('now') AND 
              (e2.status = 'monitored' OR e2.show_id IN (SELECT show_id FROM episodes WHERE watched = 1))
            )
          )
        WHERE sf.rn = 1
        GROUP BY sf.episode_id, sf.show_id, sf.season_number
      ),
      SeasonMax AS (
        SELECT show_id, season_number, MAX(episode_number) as max_ep
        FROM episodes 
        GROUP BY show_id, season_number
      ),
      ShowMax AS (
        SELECT show_id, MAX(season_number) as max_season
        FROM episodes 
        GROUP BY show_id
      ),
      -- Determine if show has any watched episodes
      ShowHasStarted AS (
        SELECT DISTINCT show_id, 1 as started
        FROM episodes WHERE watched = 1
      ),
      TotalCount AS (
        SELECT show_id, COUNT(*) as total_episodes
        FROM episodes
        GROUP BY show_id
      )
      SELECT 
        sf.episode_id,
        sf.show_id,
        sf.season_number,
        sf.episode_number,
        sf.episode_title,
        sf.runtime,
        sf.watch_progress,
        sf.tmdb_id,
        sf.show_title,
        sf.poster_path,
        COALESCE(rc.episodes_left, 0) as episodes_left,
        COALESCE(rc.total_time_left, 0) as total_time_left,
        tc.total_episodes,
        CASE WHEN sm.max_ep = sf.episode_number THEN 1 ELSE 0 END as is_finale,
        CASE WHEN sf.season_number = 1 AND sf.episode_number = 1 
              AND shs.started IS NULL THEN 1 ELSE 0 END as is_premiere,
        CASE WHEN sm.max_ep = sf.episode_number 
              AND shm.max_season = sf.season_number 
              AND sf.tmdb_status IN ('Ended', 'Canceled') THEN 1 ELSE 0 END as is_series_finale
      FROM ShowFirstUnwatched sf
      LEFT JOIN RemainingCount rc ON sf.episode_id = rc.episode_id
      LEFT JOIN SeasonMax sm ON sf.show_id = sm.show_id AND sf.season_number = sm.season_number
      LEFT JOIN ShowMax shm ON sf.show_id = shm.show_id
      LEFT JOIN ShowHasStarted shs ON sf.show_id = shs.show_id
      LEFT JOIN TotalCount tc ON sf.show_id = tc.show_id
      WHERE sf.rn = 1
      ORDER BY sf.show_title
      LIMIT 20
    `).all(EPISODE_AVG);

    res.json({ success: true, movies, episodes });
  } catch (error) {
    console.error('[Tracker] /up-next error:', error);
    res.status(500).json({ error: 'Failed to fetch up-next' });
  }
});

// Delete a watch history entry
router.delete('/history/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM watch_history WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'History entry not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('[Tracker] DELETE /history/:id error:', error);
    res.status(500).json({ error: 'Failed to delete history entry' });
  }
});

// Mark an item as watched directly from the tracker (e.g., Up Next section)
router.post('/mark-watched', async (req, res) => {
  const { tmdbId, type, season, episode } = req.body;
  if (!tmdbId || !type) return res.status(400).json({ error: 'Missing parameters' });

  try {
    const watchedAt = new Date().toISOString();

    if (type === 'movie') {
      const movie = db.prepare('SELECT id, runtime FROM movies WHERE tmdb_id = ?').get(tmdbId);
      db.prepare('INSERT OR IGNORE INTO watch_history (tmdb_id, type, watched_at, runtime) VALUES (?, ?, ?, ?)').run(tmdbId, 'movie', watchedAt, movie ? movie.runtime : null);
      if (movie) {
        db.prepare('UPDATE movies SET watched = 1, watched_at = ? WHERE id = ?').run(watchedAt, movie.id);
      }
    } else if (type === 'episode') {
      const show = db.prepare('SELECT id FROM shows WHERE tmdb_id = ?').get(tmdbId);
      let epRuntime = null;
      let epId = null;
      
      if (show) {
        const ep = db.prepare('SELECT id, runtime FROM episodes WHERE show_id = ? AND season_number = ? AND episode_number = ?').get(show.id, season, episode);
        if (ep) {
          epRuntime = ep.runtime;
          epId = ep.id;
          db.prepare('UPDATE episodes SET watched = 1, watched_at = ? WHERE id = ?').run(watchedAt, epId);
        }
      }
      db.prepare('INSERT OR IGNORE INTO watch_history (tmdb_id, type, season_number, episode_number, watched_at, runtime) VALUES (?, ?, ?, ?, ?, ?)').run(tmdbId, 'episode', season, episode, watchedAt, epRuntime);
    }

    // Trigger sync to Simkl if enabled
    const simklService = require('../services/simklService');
    simklService.pushToSimklOnWatched(tmdbId, type, true, season, episode);

    res.json({ success: true });
  } catch (error) {
    console.error('[Tracker] /mark-watched error:', error);
    res.status(500).json({ error: 'Failed to mark watched' });
  }
});

// Mark an item as unwatched — removes from history and resets watched flag
router.post('/mark-unwatched', async (req, res) => {
  const { tmdbId, type, season, episode } = req.body;
  if (!tmdbId || !type) return res.status(400).json({ error: 'Missing parameters' });

  try {
    if (type === 'movie') {
      db.prepare('DELETE FROM watch_history WHERE tmdb_id = ? AND type = ?').run(tmdbId, 'movie');
      db.prepare('UPDATE movies SET watched = 0, watched_at = NULL WHERE tmdb_id = ?').run(tmdbId);
    } else if (type === 'episode') {
      db.prepare('DELETE FROM watch_history WHERE tmdb_id = ? AND type = ? AND season_number = ? AND episode_number = ?').run(tmdbId, 'episode', season, episode);
      const show = db.prepare('SELECT id FROM shows WHERE tmdb_id = ?').get(tmdbId);
      if (show) {
        db.prepare('UPDATE episodes SET watched = 0, watched_at = NULL WHERE show_id = ? AND season_number = ? AND episode_number = ?').run(show.id, season, episode);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Tracker] /mark-unwatched error:', error);
    res.status(500).json({ error: 'Failed to mark unwatched' });
  }
});

module.exports = router;
