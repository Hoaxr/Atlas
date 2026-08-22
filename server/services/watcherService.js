const axios = require('axios');
const db = require('../config/database');
const notificationService = require('./notificationService');
const eventBus = require('./eventBus');
const { getSetting } = require('../utils/settings');
const tmdbService = require('./tmdbService');
const presenceTracker = require('./presenceTracker');

// ── Poster cache — avoids DB lookup per session per poll ──
const posterCache = new Map();
const POSTER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_POSTER_CACHE = 500;

// Look up a poster from our database by title — reliable fallback for all server types
const resolvePoster = (title, type) => {
  const key = `${type}:${title}`;
  const cached = posterCache.get(key);
  if (cached && Date.now() - cached.t < POSTER_CACHE_TTL) return { url: cached.url, tmdb_id: cached.tmdb_id, media_id: cached.media_id };

  let url = null;
  let tmdb_id = null;
  let media_id = null;
  try {
    if (type === 'episode' || type === 'tv') {
      const showName = title.split(' - S')[0] || title;
      const show = db.prepare('SELECT id, tmdb_id FROM shows WHERE title = ? COLLATE NOCASE').get(showName);
      if (show?.tmdb_id) {
        url = `/api/images/shows/${show.tmdb_id}/poster`;
        tmdb_id = show.tmdb_id;
        media_id = show.id;
      }
    } else if (type === 'movie') {
      const movie = db.prepare('SELECT id, tmdb_id FROM movies WHERE title = ? COLLATE NOCASE').get(title);
      if (movie?.tmdb_id) {
        url = `/api/images/movies/${movie.tmdb_id}/poster`;
        tmdb_id = movie.tmdb_id;
        media_id = movie.id;
      }
    }
  } catch { /* ignore */ }

  // LRU eviction
  if (posterCache.size >= MAX_POSTER_CACHE) {
    const oldest = posterCache.keys().next().value;
    posterCache.delete(oldest);
  }
  posterCache.set(key, { url, tmdb_id, media_id, t: Date.now() });
  return { url, tmdb_id, media_id };
};

const simklService = require('./simklService');

class WatcherService {
  constructor() {
    // Ensure player column exists (self-healing migration)
    try { db.exec("ALTER TABLE play_history ADD COLUMN player TEXT;"); } catch { /* ignore */ }
    
    this.activeSessions = new Set();
    this.autoWatchedSet = new Set(); // Track sessions already auto-marked to avoid duplicate calls
    this.recordedPlaySet = new Set(); // Track session+title already recorded in play_history
    this.recentPlaybackNotifications = new Map(); // Cooldown map: key = `${user}:${title}`, value = timestamp
    this.pollInterval = null;
    this.startPolling();
    setTimeout(() => this.backfillUnsyncedHistory(), 3000);
  }

  async backfillUnsyncedHistory() {
    try {
      const recentPlays = db.prepare("SELECT * FROM play_history ORDER BY id DESC LIMIT 50").all();
      const cleanTitle = (raw) => (raw || '').replace(/\s*\(\d{4}\)\s*$/, '').trim();

      for (const play of recentPlays) {
        if (!play.title) continue;
        const watchedAt = play.created_at ? (play.created_at.includes('T') ? play.created_at : play.created_at.replace(' ', 'T') + 'Z') : new Date().toISOString();

        if (play.type === 'movie') {
          const cleaned = cleanTitle(play.title);
          const movie = db.prepare('SELECT id, tmdb_id, runtime FROM movies WHERE title = ? COLLATE NOCASE OR title = ? COLLATE NOCASE').get(play.title, cleaned);

          let tmdbId = movie?.tmdb_id;
          const runtime = movie?.runtime || null;

          if (!tmdbId) {
            try {
              const tmdbResults = await tmdbService.searchMovies(cleaned);
              if (tmdbResults && tmdbResults.length > 0) {
                tmdbId = tmdbResults[0].id;
              }
            } catch { /* ignore */ }
          }

          if (tmdbId) {
            try {
              const existing = db.prepare('SELECT id FROM watch_history WHERE tmdb_id = ? AND type = ?').get(tmdbId, 'movie');
              if (!existing) {
                db.prepare('INSERT INTO watch_history (tmdb_id, type, watched_at, runtime) VALUES (?, ?, ?, ?)').run(tmdbId, 'movie', watchedAt, runtime);
                console.log(`[WatcherService] Backfilled watch_history for movie "${play.title}" (TMDB: ${tmdbId})`);
              }
            } catch { /* ignore */ }
          }
        } else if (play.type === 'episode') {
          const match = play.title.match(/^(.*) - S(\d+)E(\d+)$/i);
          if (match) {
            const [, rawShowTitle, seasonStr, epStr] = match;
            const seasonNum = parseInt(seasonStr, 10);
            const epNum = parseInt(epStr, 10);
            const cleanedShowTitle = cleanTitle(rawShowTitle);

            const show = db.prepare('SELECT id, tmdb_id FROM shows WHERE title = ? COLLATE NOCASE OR title = ? COLLATE NOCASE').get(rawShowTitle, cleanedShowTitle);
            let tmdbId = show?.tmdb_id;

            if (!tmdbId) {
              try {
                const tmdbResults = await tmdbService.searchShows(cleanedShowTitle);
                if (tmdbResults && tmdbResults.length > 0) {
                  tmdbId = tmdbResults[0].id;
                }
              } catch { /* ignore */ }
            }

            if (tmdbId) {
              try {
                const existing = db.prepare('SELECT id FROM watch_history WHERE tmdb_id = ? AND type = ? AND season_number = ? AND episode_number = ?').get(tmdbId, 'episode', seasonNum, epNum);
                if (!existing) {
                  db.prepare('INSERT INTO watch_history (tmdb_id, type, season_number, episode_number, watched_at, runtime) VALUES (?, ?, ?, ?, ?, ?)').run(tmdbId, 'episode', seasonNum, epNum, watchedAt, null);
                  console.log(`[WatcherService] Backfilled watch_history for episode "${play.title}" (TMDB: ${tmdbId})`);
                }
              } catch { /* ignore */ }
            }
          }
        }
      }
    } catch (err) {
      console.error('[WatcherService] Failed backfillUnsyncedHistory:', err.message);
    }
  }

  shouldTrackUser(sessionUser) {
    if (!sessionUser) return false;

    const setting = getSetting('autoWatchUser');
    if (setting && setting.trim() !== '') {
      if (setting.trim() === '*') return true;
      const allowedUsers = setting.split(',').map(u => u.trim().toLowerCase()).filter(Boolean);
      return allowedUsers.includes(sessionUser.trim().toLowerCase());
    }

    // Default when autoWatchUser setting is empty:
    // Match authUsername, any admin, or ANY registered user (incl. ones imported
    // from Plex/Jellyfin/Emby) so household playback is tracked automatically.
    const authUsername = getSetting('authUsername');
    if (authUsername && authUsername.trim() !== '') {
      if (authUsername.trim().toLowerCase() === sessionUser.trim().toLowerCase()) {
        return true;
      }
    }

    try {
      const knownUser = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(sessionUser.trim());
      if (knownUser) return true;
    } catch { /* ignore */ }

    // If no users exist in DB yet, default to true
    try {
      const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get()?.count || 0;
      if (userCount === 0) return true;
    } catch { /* ignore */ }

    return false;
  }

  startPolling() {
    // Poll every 10 seconds
    this.pollInterval = setInterval(() => {
      this.pollSessions();
    }, 10000);
    // Initial poll
    setTimeout(() => this.pollSessions(), 1000);
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  async getPlexSessions(url, token) {
    try {
      const response = await axios.get(`${url}/status/sessions`, {
        headers: { 'X-Plex-Token': token, 'Accept': 'application/json' },
        timeout: 5000
      });
      const sessions = response.data?.MediaContainer?.Metadata || [];
      return sessions.map(s => {
        // Extract stream details from Media > Part > Stream
        const media = s.Media?.[0] || {};
        const part = media.Part?.[0] || {};
        const streams = part.Stream || [];

        const videoStream = streams.find(st => st.streamType === 1) || {};
        const audioStream = streams.find(st => st.streamType === 2 && st.selected) || streams.find(st => st.streamType === 2) || {};
        const subStream = streams.find(st => st.streamType === 3 && st.selected);

        // Decision labels
        const decisionLabel = (d) => {
          if (!d || d === 'directplay') return 'Direct Play';
          if (d === 'copy') return 'Direct Stream';
          return 'Transcode';
        };

        // Format bandwidth from kbps to Mbps
        const bandwidthKbps = s.Session?.bandwidth;
        const bandwidthMbps = bandwidthKbps ? (bandwidthKbps / 1000).toFixed(1) : null;

        // Format bitrate
        const bitrateKbps = media.bitrate;
        const bitrateMbps = bitrateKbps ? (bitrateKbps / 1000).toFixed(1) : null;

        // Quality label
        const quality = media.videoResolution 
          ? `${media.videoResolution}p${bitrateMbps ? ` (${bitrateMbps} Mbps)` : ''}`
          : (bitrateMbps ? `${bitrateMbps} Mbps` : null);

        // Video label
        const videoLabel = videoStream.codec 
          ? `${videoStream.codec.toUpperCase()}${media.videoResolution ? ` ${media.videoResolution}p` : ''}`
          : null;

        // Audio label
        const audioLabel = audioStream.codec 
          ? `${audioStream.displayTitle || audioStream.codec.toUpperCase()}`
          : null;

        // Subtitle label
        const subtitleLabel = subStream 
          ? `${subStream.displayTitle || subStream.codec?.toUpperCase() || 'Unknown'}`
          : null;

        // ETA calculation
        const remaining = s.duration && s.viewOffset ? s.duration - s.viewOffset : 0;
        const etaTime = remaining > 0 ? new Date(Date.now() + remaining) : null;
        const etaStr = etaTime ? etaTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

        // Build poster URL: try DB lookup first (English titles), fall back to Plex thumb
        const dbInfo = resolvePoster(s.type === 'episode' ? s.grandparentTitle : s.title, s.type);
        const plexThumb = s.type === 'episode' 
          ? (s.grandparentThumb || s.thumb) 
          : s.thumb;
        const posterUrl = dbInfo.url 
          || (plexThumb ? `/api/watcher/image?server=plex&path=${encodeURIComponent(plexThumb)}` : null);

        return {
          id: `plex_${s.sessionKey}`,
          user: s.User?.title || 'Unknown',
          title: s.type === 'episode' ? `${s.grandparentTitle} - S${String(s.parentIndex).padStart(2, '0')}E${String(s.index).padStart(2, '0')}` : s.title,
          type: s.type === 'livetv' ? 'live' : s.type,
          player: s.Player?.product || 'Plex',
          product: s.Player?.product || null,
          platform: s.Player?.platform || null,
          playerDevice: s.Player?.device || null,
          progress: s.viewOffset && s.duration ? (s.viewOffset / s.duration) * 100 : 0,
          timeOffset: s.viewOffset || 0,
          timeTotal: s.duration || 0,
          state: s.Player?.state || 'playing',
          server: 'Plex',
          poster: posterUrl,
          tmdb_id: dbInfo.tmdb_id,
          media_id: dbInfo.media_id,
          // Stream details
          quality,
          videoDecision: decisionLabel(videoStream.decision),
          audioDecision: decisionLabel(audioStream.decision),
          subtitleDecision: subStream ? decisionLabel(subStream.decision) : null,
          videoLabel,
          audioLabel,
          subtitleLabel,
          container: media.container?.toUpperCase() || null,
          location: s.Session?.location?.toUpperCase() || null,
          bandwidth: bandwidthMbps,
          eta: etaStr
        };
      });
    } catch (e) {
      console.error('[WatcherService] Failed to fetch Plex sessions:', e.message);
      return [];
    }
  }

  async getJellyfinSessions(url, apiKey) {
    return this.getEmbyCompatibleSessions(url, apiKey, 'Jellyfin');
  }

  async getEmbySessions(url, apiKey) {
    return this.getEmbyCompatibleSessions(url, apiKey, 'Emby');
  }

  async getEmbyCompatibleSessions(url, apiKey, serverLabel) {
    try {
      const response = await axios.get(`${url}/Sessions`, {
        headers: { 'X-Emby-Token': apiKey },
        timeout: 5000
      });
      const sessions = response.data || [];
      return sessions.filter(s => s.NowPlayingItem).map(s => {
        let type = s.NowPlayingItem.Type.toLowerCase();
        if (type === 'tvchannel') type = 'live';

        const item = s.NowPlayingItem;
        const streams = item.MediaStreams || [];
        const videoStream = streams.find(st => st.Type === 'Video') || {};
        const audioStream = streams.find(st => st.Type === 'Audio') || {};
        const subIndex = s.PlayState?.SubtitleStreamIndex;
        const subStream = subIndex !== undefined && subIndex !== -1 ? streams.find(st => st.Index === subIndex) : null;

        const playMethod = s.PlayState?.PlayMethod || 'DirectPlay';
        const playMethodLabel = playMethod === 'Transcode' ? 'Transcode' : playMethod === 'DirectStream' ? 'Direct Stream' : 'Direct Play';

        // Quality
        const bitrate = item.MediaSources?.[0]?.Bitrate;
        const bitrateMbps = bitrate ? (bitrate / 1000000).toFixed(1) : null;
        const quality = videoStream.Height 
          ? `${videoStream.Height}p${bitrateMbps ? ` (${bitrateMbps} Mbps)` : ''}`
          : (bitrateMbps ? `${bitrateMbps} Mbps` : null);

        // Video label
        const videoLabel = videoStream.Codec 
          ? `${videoStream.Codec?.toUpperCase()}${videoStream.Height ? ` ${videoStream.Height}p` : ''}`
          : null;

        // Audio label
        const audioLabel = audioStream.Codec
          ? `${audioStream.DisplayTitle || audioStream.Codec?.toUpperCase()}`
          : null;

        // Subtitle label
        const subtitleLabel = subStream
          ? `${subStream.DisplayTitle || subStream.Codec?.toUpperCase() || 'Unknown'}`
          : null;

        // ETA
        const totalTicks = item.RunTimeTicks;
        const posTicks = s.PlayState?.PositionTicks;
        const remaining = totalTicks && posTicks ? Math.floor((totalTicks - posTicks) / 10000) : 0;
        const etaTime = remaining > 0 ? new Date(Date.now() + remaining) : null;
        const etaStr = etaTime ? etaTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

        const title = item.Type === 'Episode' 
            ? `${item.SeriesName} - S${String(item.ParentIndexNumber).padStart(2, '0')}E${String(item.IndexNumber).padStart(2, '0')}` 
            : item.Name;

        const dbInfo = resolvePoster(item.Type === 'Episode' ? item.SeriesName : item.Name, item.Type === 'Episode' ? 'episode' : 'movie');
        const posterUrl = dbInfo.url 
          || `/api/watcher/image?server=${serverLabel.toLowerCase()}&id=${item.Id}`;

        return {
          id: `${serverLabel.toLowerCase()}_${s.Id}`,
          user: s.UserName || 'Unknown',
          title,
          type,
          player: s.Client || serverLabel,
          product: s.Client || null,
          platform: s.DeviceName || null,
          playerDevice: s.DeviceId || null,
          progress: posTicks && totalTicks ? (posTicks / totalTicks) * 100 : 0,
          timeOffset: posTicks ? Math.floor(posTicks / 10000) : 0,
          timeTotal: totalTicks ? Math.floor(totalTicks / 10000) : 0,
          state: s.PlayState?.IsPaused ? 'paused' : 'playing',
          server: serverLabel,
          poster: posterUrl,
          tmdb_id: dbInfo.tmdb_id,
          media_id: dbInfo.media_id,
          quality,
          videoDecision: playMethodLabel,
          audioDecision: playMethodLabel,
          subtitleDecision: subStream ? playMethodLabel : null,
          videoLabel,
          audioLabel,
          subtitleLabel,
          container: item.Container?.toUpperCase() || null,
          location: null,
          bandwidth: null,
          eta: etaStr
        };
      });
    } catch (e) {
      console.error(`[WatcherService] Failed to fetch ${serverLabel} sessions:`, e.message);
      return [];
    }
  }

  async getAllSessions() {
    const plexUrl = getSetting('plexUrl');
    const plexToken = getSetting('plexToken');
    const jellyfinUrl = getSetting('jellyfinUrl');
    const jellyfinApiKey = getSetting('jellyfinApiKey');
    const embyUrl = getSetting('embyUrl');
    const embyApiKey = getSetting('embyApiKey');

    const promises = [];

    if (plexUrl && plexToken) {
      promises.push(this.getPlexSessions(plexUrl.replace(/\/$/, ''), plexToken));
    }
    if (jellyfinUrl && jellyfinApiKey) {
      promises.push(this.getJellyfinSessions(jellyfinUrl.replace(/\/$/, ''), jellyfinApiKey));
    }
    if (embyUrl && embyApiKey) {
      promises.push(this.getEmbySessions(embyUrl.replace(/\/$/, ''), embyApiKey));
    }

    const results = await Promise.all(promises);
    return results.flat();
  }

  async pollSessions() {
    const sessions = await this.getAllSessions();
    const currentSessionIds = new Set(sessions.map(s => s.id));
    const currentPlayKeys = new Set(sessions.map(s => `${s.id}:${s.title}`));
    const notifyOnPlayback = getSetting('notifyOnPlaybackStart') === 'true';

    const now = Date.now();
    const PLAYBACK_NOTIFY_COOLDOWN = 2 * 60 * 1000; // 2 minutes

    for (const session of sessions) {
      if (!this.activeSessions.has(session.id)) {
        // New session detected
        const playbackKey = `${session.user}:${session.title}`;
        const lastNotified = this.recentPlaybackNotifications.get(playbackKey);

        if (notifyOnPlayback && (!lastNotified || (now - lastNotified) > PLAYBACK_NOTIFY_COOLDOWN)) {
          this.recentPlaybackNotifications.set(playbackKey, now);

          // Cleanup stale keys
          if (this.recentPlaybackNotifications.size > 200) {
            for (const [k, time] of this.recentPlaybackNotifications.entries()) {
              if (now - time > PLAYBACK_NOTIFY_COOLDOWN) {
                this.recentPlaybackNotifications.delete(k);
              }
            }
          }

          const typeLabel = session.type === 'movie' ? 'Movie' : session.type === 'episode' ? 'Episode' : 'Live TV';
          const device = session.product || session.player || 'Unknown device';
          const duration = session.timeTotal > 0 
            ? `${Math.floor(session.timeTotal / 3600000)}h ${Math.floor((session.timeTotal % 3600000) / 60000)}m`
            : 'Unknown';

          await notificationService.sendNotification(
            'Playback Started',
            `**${session.user}** is watching on **${device}**`,
            {
              title: session.title,
              type: typeLabel,
              duration: duration,
              poster: session.poster,
              player: session.player,
              server: session.server
            }
          );
        }
      }

      if (session.progress >= 80) {
        const playKey = `${session.id}:${session.title}`;
        if (!this.recordedPlaySet.has(playKey)) {
          this.recordedPlaySet.add(playKey);
          try {
            const uniqueSessionId = `${session.id}_${Date.now()}`;
            db.prepare('INSERT INTO play_history (session_id, user, title, type, server, player) VALUES (?, ?, ?, ?, ?, ?)').run(
              uniqueSessionId,
              session.user,
              session.title,
              session.type,
              session.server,
              session.platform || session.player || null
            );
          } catch (err) {
            console.error('[WatcherService] Failed to record play history:', err.message);
          }
        }
      }

      // Update watch_progress and auto-mark watched at 80% progress (only for tracked user)
      if (this.shouldTrackUser(session.user)) {
        try {
          const cleanTitle = (raw) => (raw || '').replace(/\s*\(\d{4}\)\s*$/, '').trim();

          if (session.type === 'movie') {
            const cleaned = cleanTitle(session.title);
            const movie = db.prepare('SELECT id, tmdb_id, runtime FROM movies WHERE title = ? COLLATE NOCASE OR title = ? COLLATE NOCASE').get(session.title, cleaned);

            if (movie) {
              db.prepare('UPDATE movies SET watch_progress = ? WHERE id = ? AND watched = 0').run(Math.round(session.progress), movie.id);
            }

            if (session.progress >= 80 && !this.autoWatchedSet.has(`${session.id}:${session.title}`)) {
              this.autoWatchedSet.add(`${session.id}:${session.title}`);
              const watchedAt = new Date().toISOString();

              if (movie) {
                db.prepare('UPDATE movies SET watched = 1, watched_at = ?, watch_progress = 0 WHERE id = ?').run(watchedAt, movie.id);
              }

              // Resolve TMDB ID if movie record wasn't found
              let tmdbId = movie?.tmdb_id || session.tmdb_id;
              const runtime = movie?.runtime || null;

              if (!tmdbId) {
                try {
                  const tmdbResults = await tmdbService.searchMovies(cleaned);
                  if (tmdbResults && tmdbResults.length > 0) {
                    tmdbId = tmdbResults[0].id;
                  }
                } catch { /* ignore TMDB lookup error */ }
              }

              if (tmdbId) {
                try {
                  const existing = db.prepare('SELECT id FROM watch_history WHERE tmdb_id = ? AND type = ?').get(tmdbId, 'movie');
                  if (!existing) {
                    db.prepare('INSERT INTO watch_history (tmdb_id, type, watched_at, runtime) VALUES (?, ?, ?, ?)').run(tmdbId, 'movie', watchedAt, runtime);
                  } else {
                    db.prepare('UPDATE watch_history SET watched_at = ? WHERE id = ?').run(watchedAt, existing.id);
                  }
                } catch (err) {
                  console.error('[WatcherService] Failed to write watch_history for movie:', err.message);
                }
                simklService.pushToSimklOnWatched(tmdbId, 'movie', true).catch(() => {});
              }

              console.log(`[WatcherService] Auto-marked movie "${session.title}" (TMDB: ${tmdbId || 'N/A'}) as watched at ${Math.round(session.progress)}% for ${session.user}`);
            }
          } else if (session.type === 'episode') {
            const match = session.title.match(/^(.*) - S(\d+)E(\d+)$/i);
            if (match) {
              const [, rawShowTitle, seasonStr, epStr] = match;
              const seasonNum = parseInt(seasonStr, 10);
              const epNum = parseInt(epStr, 10);
              const cleanedShowTitle = cleanTitle(rawShowTitle);

              const show = db.prepare('SELECT id, tmdb_id FROM shows WHERE title = ? COLLATE NOCASE OR title = ? COLLATE NOCASE').get(rawShowTitle, cleanedShowTitle);
              let episode = null;

              if (show) {
                episode = db.prepare('SELECT id, runtime FROM episodes WHERE show_id = ? AND season_number = ? AND episode_number = ?').get(show.id, seasonNum, epNum);
                if (episode) {
                  db.prepare('UPDATE episodes SET watch_progress = ? WHERE id = ? AND watched = 0').run(Math.round(session.progress), episode.id);
                }
              }

              if (session.progress >= 80 && !this.autoWatchedSet.has(`${session.id}:${session.title}`)) {
                this.autoWatchedSet.add(`${session.id}:${session.title}`);
                const watchedAt = new Date().toISOString();

                if (episode) {
                  db.prepare('UPDATE episodes SET watched = 1, watched_at = ?, watch_progress = 0 WHERE id = ?').run(watchedAt, episode.id);
                }

                let tmdbId = show?.tmdb_id || session.tmdb_id;
                const epRuntime = episode?.runtime || null;

                if (!tmdbId) {
                  try {
                    const tmdbResults = await tmdbService.searchShows(cleanedShowTitle);
                    if (tmdbResults && tmdbResults.length > 0) {
                      tmdbId = tmdbResults[0].id;
                    }
                  } catch { /* ignore TMDB lookup error */ }
                }

                if (tmdbId) {
                  try {
                    const existing = db.prepare('SELECT id FROM watch_history WHERE tmdb_id = ? AND type = ? AND season_number = ? AND episode_number = ?').get(tmdbId, 'episode', seasonNum, epNum);
                    if (!existing) {
                      db.prepare('INSERT INTO watch_history (tmdb_id, type, season_number, episode_number, watched_at, runtime) VALUES (?, ?, ?, ?, ?, ?)').run(tmdbId, 'episode', seasonNum, epNum, watchedAt, epRuntime);
                    } else {
                      db.prepare('UPDATE watch_history SET watched_at = ? WHERE id = ?').run(watchedAt, existing.id);
                    }
                  } catch (err) {
                    console.error('[WatcherService] Failed to write watch_history for episode:', err.message);
                  }
                  simklService.pushToSimklOnWatched(tmdbId, 'show', true, seasonNum, epNum).catch(() => {});
                }

                console.log(`[WatcherService] Auto-marked episode "${session.title}" (TMDB: ${tmdbId || 'N/A'}) as watched at ${Math.round(session.progress)}% for ${session.user}`);
              }
            }
          }
        } catch (err) {
          console.error('[WatcherService] Failed to auto-mark or update progress:', err.message);
        }
      }
    }

    // Clean up stale session keys from autoWatchedSet and recordedPlaySet
    // Keys are composite: `${sessionId}:${title}` — strip the title suffix to get the base session id
    for (const key of this.autoWatchedSet) {
      const baseId = key.split(':').slice(0, 1).join(':'); // 'plex_1' part
      // Keep the key if ANY session with this base ID is still active
      if (!currentSessionIds.has(baseId)) {
        this.autoWatchedSet.delete(key);
      }
    }

    for (const playKey of this.recordedPlaySet) {
      if (!currentPlayKeys.has(playKey)) {
        this.recordedPlaySet.delete(playKey);
      }
    }

    // Update active sessions
    this.activeSessions = currentSessionIds;

    // Skip the 9 aggregate play_history queries when nobody is watching
    // and no WS clients are connected to receive the stats
    if (currentSessionIds.size === 0 && presenceTracker.getOnlineUserIds().length === 0) {
      return;
    }

    // Emit event with full sessions + stats (replaces per-client HTTP polling)
    const topMovies = db.prepare(`SELECT title, COUNT(*) as plays FROM play_history WHERE type = 'movie' GROUP BY title ORDER BY plays DESC LIMIT 10`).all();
    const topShows = db.prepare(`SELECT CASE WHEN INSTR(title, ' - S') > 0 THEN SUBSTR(title, 1, INSTR(title, ' - S') - 1) ELSE title END as title, COUNT(*) as plays FROM play_history WHERE type IN ('episode', 'live') GROUP BY 1 ORDER BY plays DESC LIMIT 10`).all();
    const topUsers = db.prepare(`SELECT user, COUNT(*) as plays FROM play_history GROUP BY user ORDER BY plays DESC LIMIT 10`).all();
    const popularMovies = db.prepare(`SELECT title, COUNT(DISTINCT user) as users FROM play_history WHERE type = 'movie' GROUP BY title ORDER BY users DESC LIMIT 10`).all();
    const popularShows = db.prepare(`SELECT CASE WHEN INSTR(title, ' - S') > 0 THEN SUBSTR(title, 1, INSTR(title, ' - S') - 1) ELSE title END as title, COUNT(DISTINCT user) as users FROM play_history WHERE type IN ('episode', 'live') GROUP BY 1 ORDER BY users DESC LIMIT 10`).all();
    const recent = db.prepare(`SELECT id, user, title, type, server, player, created_at FROM play_history ORDER BY id DESC LIMIT 10`).all().map(item => {
      let created = item.created_at;
      if (created && !created.includes('Z') && !created.includes('+')) {
        created = created.replace(' ', 'T') + 'Z';
      }
      return { ...item, created_at: created };
    });
    const topPlatforms = db.prepare(`SELECT player, COUNT(*) as plays FROM play_history WHERE player IS NOT NULL AND player != '' GROUP BY player ORDER BY plays DESC LIMIT 10`).all();
    const totalPlays = db.prepare(`SELECT COUNT(*) as count FROM play_history`).get()?.count || 0;
    const uniqueUsers = db.prepare(`SELECT COUNT(DISTINCT user) as count FROM play_history`).get()?.count || 0;
    const uniqueTitles = db.prepare(`SELECT COUNT(DISTINCT title) as count FROM play_history`).get()?.count || 0;

    eventBus.emit('event', {
      type: 'WATCHERS_UPDATE',
      count: currentSessionIds.size,
      sessions,
      stats: {
        topMovies,
        topShows,
        topUsers,
        popularMovies,
        popularShows,
        recent,
        topPlatforms,
        overview: { totalPlays, uniqueUsers, uniqueTitles }
      }
    });
  }
}

module.exports = new WatcherService();
