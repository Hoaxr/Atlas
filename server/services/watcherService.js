const axios = require('axios');
const db = require('../config/database');
const notificationService = require('./notificationService');
const eventBus = require('./eventBus');
const { getSetting } = require('../utils/settings');

// Look up a poster from our database by title — reliable fallback for all server types
const resolvePoster = (title, type) => {
  try {
    if (type === 'episode' || type === 'tv') {
      // Try to find the show by title (episode titles contain "ShowName - S01E01")
      const showName = title.split(' - S')[0] || title;
      const show = db.prepare('SELECT poster_path FROM shows WHERE title = ? COLLATE NOCASE').get(showName);
      if (show?.poster_path) return `https://image.tmdb.org/t/p/w300${show.poster_path}`;
    } else if (type === 'movie') {
      const movie = db.prepare('SELECT poster_path FROM movies WHERE title = ? COLLATE NOCASE').get(title);
      if (movie?.poster_path) return `https://image.tmdb.org/t/p/w300${movie.poster_path}`;
    }
  } catch { /* ignore */ }
  return null;
};

class WatcherService {
  constructor() {
    // Ensure player column exists (self-healing migration)
    try { db.exec("ALTER TABLE play_history ADD COLUMN player TEXT;"); } catch (e) {}
    
    this.activeSessions = new Set();
    this.pollInterval = null;
    this.startPolling();
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
        const subStream = streams.find(st => st.streamType === 3 && st.selected) || streams.find(st => st.streamType === 3);

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
          poster: resolvePoster(s.type === 'episode' ? s.grandparentTitle : s.title, s.type),
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
        const subStream = streams.find(st => st.Type === 'Subtitle');

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

        const jfTitle = item.Type === 'Episode' 
            ? `${item.SeriesName} - S${String(item.ParentIndexNumber).padStart(2, '0')}E${String(item.IndexNumber).padStart(2, '0')}` 
            : item.Name;

        return {
          id: `jellyfin_${s.Id}`,
          user: s.UserName || 'Unknown',
          title: jfTitle,
          type: type,
          player: s.Client || 'Jellyfin',
          product: s.Client || null,
          platform: s.DeviceName || null,
          playerDevice: null,
          progress: posTicks && totalTicks ? (posTicks / totalTicks) * 100 : 0,
          timeOffset: posTicks ? Math.floor(posTicks / 10000) : 0,
          timeTotal: totalTicks ? Math.floor(totalTicks / 10000) : 0,
          state: s.PlayState?.IsPaused ? 'paused' : 'playing',
          server: 'Jellyfin',
          poster: resolvePoster(jfTitle, type),
          // Stream details
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
      console.error('[WatcherService] Failed to fetch Jellyfin sessions:', e.message);
      return [];
    }
  }

  async getEmbySessions(url, apiKey) {
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
        const subStream = streams.find(st => st.Type === 'Subtitle');

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

        const embyTitle = item.Type === 'Episode' 
            ? `${item.SeriesName} - S${String(item.ParentIndexNumber).padStart(2, '0')}E${String(item.IndexNumber).padStart(2, '0')}` 
            : item.Name;

        return {
          id: `emby_${s.Id}`,
          user: s.UserName || 'Unknown',
          title: embyTitle,
          type: type,
          player: s.Client || 'Emby',
          product: s.Client || null,
          platform: s.DeviceName || null,
          playerDevice: null,
          progress: posTicks && totalTicks ? (posTicks / totalTicks) * 100 : 0,
          timeOffset: posTicks ? Math.floor(posTicks / 10000) : 0,
          timeTotal: totalTicks ? Math.floor(totalTicks / 10000) : 0,
          state: s.PlayState?.IsPaused ? 'paused' : 'playing',
          server: 'Emby',
          poster: resolvePoster(embyTitle, type),
          // Stream details
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
      console.error('[WatcherService] Failed to fetch Emby sessions:', e.message);
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
    const notifyOnPlayback = getSetting('notifyOnPlaybackStart') === 'true';

    for (const session of sessions) {
      if (!this.activeSessions.has(session.id)) {
        // New session detected
        if (notifyOnPlayback) {
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

      if (session.progress >= 50) {
        try {
          db.prepare('INSERT OR IGNORE INTO play_history (session_id, user, title, type, server, player) VALUES (?, ?, ?, ?, ?, ?)').run(
            session.id,
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

    // Update active sessions
    this.activeSessions = currentSessionIds;

    // Emit event with current count
    eventBus.emit('event', { type: 'WATCHERS_UPDATE', count: currentSessionIds.size });
  }
}

module.exports = new WatcherService();
