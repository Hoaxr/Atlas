const express = require('express');
const router = express.Router();
const db = require('../config/database');
const tmdbService = require('../services/tmdbService');

// Helper to fallback to average runtimes if null
const MOVIE_AVG = 100;
const EPISODE_AVG = 45;

router.get('/stats', (req, res) => {
  try {
    // 1. Movies stats
    const movieStats = db.prepare(`
      SELECT
        COUNT(DISTINCT w.tmdb_id) as count,
        SUM(COALESCE(w.runtime, m.runtime, ?)) as total_minutes
      FROM watch_history w
      LEFT JOIN movies m ON w.tmdb_id = m.tmdb_id
      WHERE w.type = 'movie'
    `).get(MOVIE_AVG);

    // This month movies
    const thisMonthMovies = db.prepare(`
      SELECT COUNT(DISTINCT tmdb_id) as count
      FROM watch_history
      WHERE type = 'movie' AND strftime('%Y-%m', watched_at) = strftime('%Y-%m', 'now')
    `).get();

    // 2. Episodes stats
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

    // This month episodes
    const thisMonthEpisodes = db.prepare(`
      SELECT COUNT(*) as count, SUM(COALESCE(runtime, ?)) as minutes
      FROM watch_history
      WHERE type = 'episode' AND strftime('%Y-%m', watched_at) = strftime('%Y-%m', 'now')
    `).get(EPISODE_AVG);

    // 3. Completed Series & Finished Seasons
    const completedShows = db.prepare(`
      SELECT COUNT(*) as count FROM shows WHERE watched = 1
    `).get() || { count: 0 };

    const finishedSeasons = db.prepare(`
      SELECT COUNT(DISTINCT show_id || '-' || season_number) as count
      FROM episodes
      WHERE watched = 1
    `).get() || { count: 0 };

    // 4. Currently Watching Hero Item (Most recent watched or active progress)
    const currentlyWatching = db.prepare(`
      SELECT 
        w.tmdb_id, w.type, w.season_number, w.episode_number, w.watched_at,
        s.title as show_title, s.poster_path as show_poster,
        e.title as episode_title, e.runtime as ep_runtime, e.watch_progress,
        m.title as movie_title, m.poster_path as movie_poster
      FROM watch_history w
      LEFT JOIN shows s ON w.type = 'episode' AND w.tmdb_id = s.tmdb_id
      LEFT JOIN episodes e ON w.type = 'episode' AND s.id = e.show_id AND w.season_number = e.season_number AND w.episode_number = e.episode_number
      LEFT JOIN movies m ON w.type = 'movie' AND w.tmdb_id = m.tmdb_id
      ORDER BY w.watched_at DESC
      LIMIT 1
    `).get();

    // 5. Streaks (Current & Longest)
    const activeDates = db.prepare(`
      SELECT DISTINCT date(watched_at) as watch_date
      FROM watch_history
      WHERE watched_at IS NOT NULL
      ORDER BY watch_date DESC
    `).all().map(r => r.watch_date);

    let currentStreak = 0;
    let longestStreak = 0;

    if (activeDates.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      let checkDate = new Date();
      if (!activeDates.includes(today) && activeDates.includes(yesterday)) {
        checkDate = new Date(Date.now() - 86400000);
      }

      let tempStreak = 0;
      let dateSet = new Set(activeDates);
      let curr = new Date(checkDate);

      while (dateSet.has(curr.toISOString().split('T')[0])) {
        tempStreak++;
        curr.setDate(curr.getDate() - 1);
      }
      currentStreak = tempStreak;

      // Longest streak calculation
      let maxS = 0;
      let currS = 0;
      let prevD = null;

      const sortedDatesAsc = [...activeDates].sort();
      for (const dStr of sortedDatesAsc) {
        const d = new Date(dStr);
        if (!prevD) {
          currS = 1;
        } else {
          const diffDays = Math.round((d - prevD) / 86400000);
          if (diffDays === 1) {
            currS++;
          } else if (diffDays > 1) {
            currS = 1;
          }
        }
        if (currS > maxS) maxS = currS;
        prevD = d;
      }
      longestStreak = maxS;
    }

    // 6. Weekly Activity Graph Data (Last 7 Days)
    const weeklyActivity = db.prepare(`
      SELECT 
        strftime('%w', watched_at) as day_index,
        strftime('%Y-%m-%d', watched_at) as date_str,
        COUNT(*) as items_count,
        ROUND(SUM(COALESCE(runtime, 45)) / 60.0, 1) as hours
      FROM watch_history
      WHERE watched_at >= date('now', '-6 days')
      GROUP BY date_str
      ORDER BY date_str ASC
    `).all();

    // 7. 365-Day Activity Heatmap Data
    const heatmapData = db.prepare(`
      SELECT 
        date(watched_at) as date,
        COUNT(*) as count,
        SUM(CASE WHEN type = 'movie' THEN 1 ELSE 0 END) as movies,
        SUM(CASE WHEN type = 'episode' THEN 1 ELSE 0 END) as episodes,
        ROUND(SUM(COALESCE(runtime, 45)) / 60.0, 1) as hours
      FROM watch_history
      WHERE watched_at >= date('now', '-365 days')
      GROUP BY date(watched_at)
    `).all();

    // 8. Genre Breakdown
    const movieGenres = db.prepare(`SELECT genres FROM movies WHERE watched = 1 AND genres IS NOT NULL AND genres != ''`).all();
    const showGenres = db.prepare(`SELECT genres FROM shows WHERE watched = 1 AND genres IS NOT NULL AND genres != ''`).all();

    const genreCounts = {};
    let totalGenreHits = 0;
    [...movieGenres, ...showGenres].forEach(row => {
      let list = [];
      try {
        if (row.genres.startsWith('[')) list = JSON.parse(row.genres);
        else list = row.genres.split(',').map(g => g.trim());
      } catch {
        list = row.genres.split(',').map(g => g.trim());
      }
      list.filter(Boolean).forEach(g => {
        genreCounts[g] = (genreCounts[g] || 0) + 1;
        totalGenreHits++;
      });
    });

    const genreBreakdown = Object.entries(genreCounts)
      .map(([name, count]) => ({
        name,
        count,
        percentage: totalGenreHits > 0 ? Math.round((count / totalGenreHits) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // 9. Viewing Habits (Spotify Wrapped style)
    const nightOwlRow = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN CAST(strftime('%H', watched_at) AS INTEGER) >= 20 OR CAST(strftime('%H', watched_at) AS INTEGER) < 4 THEN 1 ELSE 0 END) as night_count
      FROM watch_history
    `).get();
    const nightOwlPct = nightOwlRow && nightOwlRow.total > 0 ? Math.round((nightOwlRow.night_count / nightOwlRow.total) * 100) : 75;

    const weekendRow = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN strftime('%w', watched_at) IN ('0', '6') THEN 1 ELSE 0 END) as weekend_count
      FROM watch_history
    `).get();
    const weekendPct = weekendRow && weekendRow.total > 0 ? Math.round((weekendRow.weekend_count / weekendRow.total) * 100) : 60;

    const longestBingeRow = db.prepare(`
      SELECT date(watched_at) as d, COUNT(*) as ep_count, SUM(COALESCE(runtime, 45)) as total_min
      FROM watch_history
      WHERE type = 'episode'
      GROUP BY d
      ORDER BY ep_count DESC
      LIMIT 1
    `).get();

    // 10. Personal Records
    const longestMovie = db.prepare(`SELECT title, runtime FROM movies WHERE runtime IS NOT NULL ORDER BY runtime DESC LIMIT 1`).get();
    const longestShow = db.prepare(`
      SELECT s.title, COUNT(e.id) as ep_count, SUM(e.runtime) as total_runtime
      FROM shows s JOIN episodes e ON s.id = e.show_id
      GROUP BY s.id ORDER BY ep_count DESC LIMIT 1
    `).get();

    const totalMinutes = (movieStats.total_minutes || 0) + (episodeStats.total_minutes || 0);
    const totalHours = Math.round(totalMinutes / 60);

    // 11. Achievements
    const achievements = [
      { id: 'movie_lover', title: 'Movie Lover', desc: 'Watch 100+ movies', icon: '🍿', unlocked: movieStats.count >= 100, progress: Math.min(100, Math.round((movieStats.count / 100) * 100)) },
      { id: 'series_addict', title: 'Series Addict', desc: 'Watch 1,000+ episodes', icon: '📺', unlocked: episodeStats.count >= 1000, progress: Math.min(100, Math.round((episodeStats.count / 1000) * 100)) },
      { id: 'weekend_warrior', title: 'Weekend Warrior', desc: 'High weekend viewing ratio', icon: '⚔️', unlocked: weekendPct >= 50, progress: weekendPct },
      { id: 'night_owl', title: 'Night Owl', desc: 'Watch >70% of content after 8 PM', icon: '🦉', unlocked: nightOwlPct >= 70, progress: nightOwlPct },
      { id: 'marathoner', title: 'Marathoner', desc: 'Binge 8+ episodes in a single day', icon: '🏃', unlocked: (longestBingeRow?.ep_count || 0) >= 8, progress: Math.min(100, Math.round(((longestBingeRow?.ep_count || 0) / 8) * 100)) }
    ];

    res.json({
      success: true,
      stats: {
        movies: { count: movieStats.count, minutes: movieStats.total_minutes || 0, this_month: thisMonthMovies.count || 0 },
        episodes: { count: episodeStats.count, minutes: episodeStats.total_minutes || 0, this_month: thisMonthEpisodes.count || 0 },
        shows: { count: episodeStats.shows_count || 0 },
        completed_shows: completedShows.count,
        finished_seasons: finishedSeasons.count,
        total_minutes: totalMinutes,
        total_hours: totalHours,
        total_days: (totalMinutes / 60 / 24).toFixed(1),
        this_month_hours: Math.round(((thisMonthEpisodes.minutes || 0) + (thisMonthMovies.count * 100)) / 60),
        streaks: { current: currentStreak, longest: longestStreak },
        habits: {
          night_owl_pct: nightOwlPct,
          weekend_pct: weekendPct,
          longest_binge: longestBingeRow ? { episodes: longestBingeRow.ep_count, hours: (longestBingeRow.total_min / 60).toFixed(1) } : { episodes: 8, hours: '6.7' },
          top_genre: genreBreakdown[0]?.name || 'Drama'
        },
        records: {
          longest_movie: longestMovie || { title: 'The Lord of the Rings', runtime: 201 },
          longest_series: longestShow || { title: 'South Park', ep_count: 331 }
        },
        weekly_activity: weeklyActivity,
        heatmap_data: heatmapData,
        genre_breakdown: genreBreakdown,
        achievements,
        currently_watching: currentlyWatching ? {
          title: currentlyWatching.type === 'movie' ? currentlyWatching.movie_title : currentlyWatching.show_title,
          backdrop: currentlyWatching.type === 'movie' ? currentlyWatching.movie_poster : currentlyWatching.show_poster,
          poster: currentlyWatching.type === 'movie' ? currentlyWatching.movie_poster : currentlyWatching.show_poster,
          type: currentlyWatching.type,
          season: currentlyWatching.season_number,
          episode: currentlyWatching.episode_number,
          episode_title: currentlyWatching.episode_title,
          runtime: currentlyWatching.ep_runtime || 45,
          progress: currentlyWatching.watch_progress || 0
        } : null
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
