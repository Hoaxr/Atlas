const express = require('express');
const router = express.Router();
const db = require('../config/database');
const tmdbService = require('../services/tmdbService');
const watcherService = require('../services/watcherService');

// Helper to fallback to average runtimes if null
const MOVIE_AVG = 100;
const EPISODE_AVG = 45;

router.get('/stats', async (req, res) => {
  try {
    // 1. Movies stats — deduplicate per tmdb_id so re-watches don't inflate the runtime sum
    const movieStats = db.prepare(`
      SELECT
        COUNT(*) as count,
        SUM(COALESCE(runtime, ?)) as total_minutes
      FROM (
        SELECT
          w.tmdb_id,
          COALESCE(MAX(w.runtime), m.runtime) as runtime
        FROM watch_history w
        LEFT JOIN movies m ON w.tmdb_id = m.tmdb_id
        WHERE w.type = 'movie'
        GROUP BY w.tmdb_id
      )
    `).get(MOVIE_AVG);

    // This month movies
    const thisMonthMovies = db.prepare(`
      SELECT COUNT(DISTINCT tmdb_id) as count
      FROM watch_history
      WHERE type = 'movie' AND strftime('%Y-%m', watched_at) = strftime('%Y-%m', 'now')
    `).get();

    // 2. Episodes stats — deduplicate watch_history rows per unique episode to avoid
    //    double-counting when the same episode has multiple history entries (e.g. Simkl
    //    sync + manual mark).
    const episodeStats = db.prepare(`
      SELECT
        COUNT(*) as count,
        COUNT(DISTINCT tmdb_id) as shows_count,
        SUM(COALESCE(runtime, ?)) as total_minutes
      FROM (
        SELECT
          w.tmdb_id, w.season_number, w.episode_number,
          COALESCE(w.runtime, e.runtime, s.runtime) as runtime
        FROM (
          SELECT tmdb_id, season_number, episode_number,
                 MAX(runtime) as runtime
          FROM watch_history
          WHERE type = 'episode'
          GROUP BY tmdb_id, season_number, episode_number
        ) w
        LEFT JOIN shows s ON w.tmdb_id = s.tmdb_id
        LEFT JOIN episodes e ON s.id = e.show_id AND w.season_number = e.season_number AND w.episode_number = e.episode_number
      )
    `).get(EPISODE_AVG);

    // This month episodes
    const thisMonthEpisodes = db.prepare(`
      SELECT COUNT(*) as count, SUM(
        COALESCE(w.runtime, e.runtime, s.runtime, ?)
      ) as minutes
      FROM watch_history w
      LEFT JOIN shows s ON w.tmdb_id = s.tmdb_id
      LEFT JOIN episodes e ON s.id = e.show_id
        AND w.season_number = e.season_number AND w.episode_number = e.episode_number
      WHERE w.type = 'episode' AND strftime('%Y-%m', w.watched_at) = strftime('%Y-%m', 'now')
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

    // Live Active Watching Session for Tracked User
    let nowWatching = null;
    try {
      const activeSessions = await watcherService.getAllSessions();
      const userSession = activeSessions.find(s => watcherService.shouldTrackUser(s.user));
      if (userSession) {
        nowWatching = {
          id: userSession.id,
          title: userSession.title,
          type: userSession.type,
          user: userSession.user,
          player: userSession.player || userSession.product || 'Media Player',
          platform: userSession.platform,
          server: userSession.server,
          state: userSession.state || 'playing',
          progress: Math.round(userSession.progress || 0),
          timeOffset: userSession.timeOffset,
          timeTotal: userSession.timeTotal,
          poster: userSession.poster,
          tmdb_id: userSession.tmdb_id,
          media_id: userSession.media_id,
          quality: userSession.quality,
          eta: userSession.eta
        };
      }
    } catch (e) {
      console.error('[Tracker] Error fetching active watcher sessions:', e.message);
    }

    // 4. Currently Watching Hero Item (Most recent watched or active progress)
    const currentlyRow = db.prepare(`
      SELECT 
        w.tmdb_id, w.type, w.season_number, w.episode_number, w.watched_at, w.runtime as history_runtime,
        m.id as movie_id, m.title as movie_title, m.poster_path as movie_poster, m.runtime as movie_runtime,
        s.id as show_id, s.title as show_title, s.poster_path as show_poster,
        e.title as episode_title, e.runtime as ep_runtime, e.watch_progress
      FROM watch_history w
      LEFT JOIN shows s ON (w.type = 'episode' OR w.type = 'show') AND w.tmdb_id = s.tmdb_id
      LEFT JOIN episodes e ON w.type = 'episode' AND s.id = e.show_id AND w.season_number = e.season_number AND w.episode_number = e.episode_number
      LEFT JOIN movies m ON w.type = 'movie' AND w.tmdb_id = m.tmdb_id
      ORDER BY w.watched_at DESC
      LIMIT 1
    `).get();

    let currentlyWatching = null;
    if (currentlyRow) {
      let title = currentlyRow.type === 'movie' ? currentlyRow.movie_title : currentlyRow.show_title;
      let poster = currentlyRow.type === 'movie' ? currentlyRow.movie_poster : currentlyRow.show_poster;
      let tmdbRuntime = null;

      if ((!title || (currentlyRow.type === 'movie' && !currentlyRow.movie_runtime && !currentlyRow.history_runtime)) && currentlyRow.tmdb_id) {
        try {
          const details = currentlyRow.type === 'movie' 
            ? await tmdbService.getMovieById(currentlyRow.tmdb_id) 
            : await tmdbService.getShowById(currentlyRow.tmdb_id);
          if (!title) title = details?.name || details?.title;
          if (!poster) poster = details?.poster_path;
          tmdbRuntime = details?.runtime;
        } catch (e) {
          console.error('[Tracker] Failed resolving TMDB item for currently watching:', e);
        }
      }

      const itemRuntime = currentlyRow.type === 'movie'
        ? (currentlyRow.history_runtime || currentlyRow.movie_runtime || tmdbRuntime || MOVIE_AVG)
        : (currentlyRow.history_runtime || currentlyRow.ep_runtime || EPISODE_AVG);

      currentlyWatching = {
        tmdb_id: currentlyRow.tmdb_id,
        movie_id: currentlyRow.movie_id,
        show_id: currentlyRow.show_id,
        title: title || `${currentlyRow.type === 'movie' ? 'Movie' : 'Show'} ${currentlyRow.tmdb_id}`,
        backdrop: poster,
        poster: poster,
        type: currentlyRow.type,
        season: currentlyRow.season_number,
        episode: currentlyRow.episode_number,
        episode_title: currentlyRow.episode_title,
        runtime: itemRuntime,
        progress: currentlyRow.watch_progress || 0
      };
    }

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
      const dateSet = new Set(activeDates);
      const curr = new Date(checkDate);

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
        strftime('%w', w.watched_at) as day_index,
        strftime('%Y-%m-%d', w.watched_at) as date_str,
        COUNT(*) as items_count,
        ROUND(SUM(
          COALESCE(
            w.runtime,
            CASE w.type
              WHEN 'movie' THEN m.runtime
              WHEN 'episode' THEN e.runtime
            END,
            CASE w.type WHEN 'movie' THEN ? ELSE ? END
          )
        ) / 60.0, 1) as hours
      FROM watch_history w
      LEFT JOIN movies m ON w.type = 'movie' AND w.tmdb_id = m.tmdb_id
      LEFT JOIN shows s ON w.type = 'episode' AND w.tmdb_id = s.tmdb_id
      LEFT JOIN episodes e ON w.type = 'episode' AND s.id = e.show_id
        AND w.season_number = e.season_number AND w.episode_number = e.episode_number
      WHERE w.watched_at >= date('now', '-6 days')
      GROUP BY date_str
      ORDER BY date_str ASC
    `).all(MOVIE_AVG, EPISODE_AVG);

    // 8. Genre Breakdown
    const movieGenres = db.prepare(`SELECT genres FROM movies WHERE watched = 1 AND genres IS NOT NULL AND genres != ''`).all();
    const showGenres = db.prepare(`SELECT genres FROM shows WHERE watched = 1 AND genres IS NOT NULL AND genres != ''`).all();

    const genreCounts = {};
    let totalGenreHits = 0;
    [...movieGenres, ...showGenres].forEach(row => {
      let list;
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
      SELECT date(w.watched_at) as d, COUNT(*) as ep_count, SUM(
        COALESCE(w.runtime, e.runtime, ?)
      ) as total_min
      FROM watch_history w
      LEFT JOIN shows s ON w.tmdb_id = s.tmdb_id
      LEFT JOIN episodes e ON s.id = e.show_id
        AND w.season_number = e.season_number AND w.episode_number = e.episode_number
      WHERE w.type = 'episode'
      GROUP BY d
      ORDER BY ep_count DESC
      LIMIT 1
    `).get(EPISODE_AVG);

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
        genre_breakdown: genreBreakdown,
        achievements,
        currently_watching: currentlyWatching,
        now_watching: nowWatching
      }
    });
  } catch (error) {
    console.error('[Tracker] /stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.get('/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;

    const history = db.prepare(`
      SELECT 
        w.id as history_id, w.tmdb_id, w.type, w.season_number, w.episode_number, w.watched_at, w.runtime as history_runtime,
        m.id as movie_id, m.title as movie_title, m.poster_path as movie_poster, m.runtime as movie_runtime,
        s.id as show_id, s.title as show_title, s.poster_path as show_poster,
        e.title as episode_title, e.runtime as ep_runtime
      FROM watch_history w
      LEFT JOIN movies m ON (w.type = 'movie') AND w.tmdb_id = m.tmdb_id
      LEFT JOIN shows s ON (w.type = 'episode' OR w.type = 'show') AND w.tmdb_id = s.tmdb_id
      LEFT JOIN episodes e ON w.type = 'episode' AND s.id = e.show_id AND w.season_number = e.season_number AND w.episode_number = e.episode_number
      ORDER BY w.watched_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    // Resolve missing titles/posters asynchronously for external watch history items
    const tmdbService = require('../services/tmdbService');
    const enrichedHistory = await Promise.all(history.map(async (item) => {
      if ((item.type === 'movie' && !item.movie_title) || ((item.type === 'episode' || item.type === 'show') && !item.show_title)) {
        try {
          if (item.type === 'movie') {
            const tmdbData = await tmdbService.getMovieById(item.tmdb_id);
            if (tmdbData) {
              item.movie_title = tmdbData.title;
              item.movie_poster = tmdbData.poster_path;
            }
          } else {
            const tmdbData = await tmdbService.getShowById(item.tmdb_id);
            if (tmdbData) {
              item.show_title = tmdbData.name || tmdbData.title;
              item.show_poster = tmdbData.poster_path;
            }
          }
        } catch (e) {
          // ignore lookup errors
        }
      }
      return item;
    }));

    res.json({ success: true, history: enrichedHistory });
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
              e.air_date IS NOT NULL AND 
              datetime(CASE WHEN INSTR(e.air_date, 'T') > 0 THEN e.air_date ELSE e.air_date || 'T21:00:00-04:00' END) <= datetime('now') AND 
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
              e2.air_date IS NOT NULL AND 
              datetime(CASE WHEN INSTR(e2.air_date, 'T') > 0 THEN e2.air_date ELSE e2.air_date || 'T21:00:00-04:00' END) <= datetime('now') AND 
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
      const existingMovie = db.prepare('SELECT id FROM watch_history WHERE tmdb_id = ? AND type = ?').get(tmdbId, 'movie');
      if (existingMovie) {
        db.prepare('UPDATE watch_history SET watched_at = ?, runtime = ? WHERE id = ?').run(watchedAt, movie ? movie.runtime : null, existingMovie.id);
      } else {
        db.prepare('INSERT INTO watch_history (tmdb_id, type, watched_at, runtime) VALUES (?, ?, ?, ?)').run(tmdbId, 'movie', watchedAt, movie ? movie.runtime : null);
      }
      if (movie) {
        db.prepare('UPDATE movies SET watched = 1, watched_at = ? WHERE id = ?').run(watchedAt, movie.id);
      }
    } else if (type === 'episode') {
      const show = db.prepare('SELECT id FROM shows WHERE tmdb_id = ? OR id = ?').get(tmdbId, tmdbId);
      let epRuntime = null;
      let epId = null;
      const sNum = parseInt(season, 10);
      const eNum = parseInt(episode, 10);
      
      if (show) {
        const ep = db.prepare('SELECT id, runtime FROM episodes WHERE show_id = ? AND season_number = ? AND episode_number = ?').get(show.id, sNum, eNum);
        if (ep) {
          epRuntime = ep.runtime;
          epId = ep.id;
          db.prepare('UPDATE episodes SET watched = 1, watched_at = ? WHERE id = ?').run(watchedAt, epId);
        }
      }
      const existingEp = db.prepare('SELECT id FROM watch_history WHERE tmdb_id = ? AND type = ? AND season_number = ? AND episode_number = ?').get(tmdbId, 'episode', sNum, eNum);
      if (existingEp) {
        db.prepare('UPDATE watch_history SET watched_at = ?, runtime = ? WHERE id = ?').run(watchedAt, epRuntime, existingEp.id);
      } else {
        db.prepare('INSERT INTO watch_history (tmdb_id, type, season_number, episode_number, watched_at, runtime) VALUES (?, ?, ?, ?, ?, ?)').run(tmdbId, 'episode', sNum, eNum, watchedAt, epRuntime);
      }
    }

    // Force WAL checkpoint so the subsequent up-next query sees this write.
    // node:sqlite DatabaseSync with mmap may otherwise return stale data on
    // immediate re-reads of the same connection.
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');

    // Trigger sync to Simkl in background if enabled
    try {
      const simklService = require('../services/simklService');
      simklService.pushToSimklOnWatched(tmdbId, type, true, season, episode).catch(e => console.error('[SimklSync] background push error:', e.message));
    } catch (e) {
      // ignore
    }

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

router.get('/this-week', (req, res) => {
  try {
    const formatLocalDate = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const now = new Date();

    // Rolling 7-day window: today through today+6
    const fromDate = new Date(now);
    const toDate = new Date(now);
    toDate.setDate(now.getDate() + 6);

    const fromStr = formatLocalDate(fromDate);
    const toStr = formatLocalDate(toDate);

    // Movies releasing this week (not yet watched)
    const movies = db.prepare(`
      SELECT id, tmdb_id, title, poster_path, overview, release_date, runtime
      FROM movies
      WHERE release_date >= ? AND release_date <= ? AND watched = 0
      ORDER BY release_date ASC
    `).all(fromStr, toStr);

    // Episodes airing this week (not yet watched)
    const episodes = db.prepare(`
      SELECT 
        e.id as episode_id,
        e.show_id,
        e.season_number,
        e.episode_number,
        e.title as episode_title,
        e.runtime,
        e.air_date,
        s.tmdb_id,
        s.title as show_title,
        s.poster_path
      FROM episodes e
      JOIN shows s ON e.show_id = s.id
      WHERE e.air_date >= date(?, '-1 day') AND e.air_date <= ? AND e.watched = 0
      ORDER BY e.air_date ASC, s.title, e.season_number, e.episode_number
    `).all(fromStr, toStr);

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const getDayLabel = (dateStr, type = 'episode') => {
      if (!dateStr) return { dayName: 'Unknown', isToday: false, isTomorrow: false };
      
      let raw = dateStr;
      if (!raw.includes('T')) {
        if (type === 'episode') {
          // Assume 21:00 US Eastern broadcast air time for TV episodes
          raw = `${dateStr}T21:00:00-04:00`;
        } else {
          raw = `${dateStr}T00:00:00Z`;
        }
      }

      const d = new Date(raw);
      if (isNaN(d.getTime())) return { dayName: 'Unknown', isToday: false, isTomorrow: false };

      const today = new Date();
      const targetDateObj = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const todayDateObj = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      const diffDays = Math.round((targetDateObj.getTime() - todayDateObj.getTime()) / (1000 * 3600 * 24));

      return {
        dayName: dayNames[d.getDay()],
        isToday: diffDays === 0,
        isTomorrow: diffDays === 1
      };
    };

    res.json({
      success: true,
      weekRange: { from: fromStr, to: toStr },
      movies: movies.map(m => ({ ...m, ...getDayLabel(m.release_date, 'movie') })),
      episodes: episodes.map(ep => ({ ...ep, ...getDayLabel(ep.air_date, 'episode') }))
    });
  } catch (error) {
    console.error('[Tracker] /this-week error:', error);
    res.status(500).json({ error: 'Failed to fetch this week releases' });
  }
});

module.exports = router;
