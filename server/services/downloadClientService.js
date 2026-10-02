const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const eventBus = require('./eventBus');
const { getSetting } = require('../utils/settings');
const adapters = {
  qbittorrent: require('./clients/qbittorrent'),
  deluge: require('./clients/deluge'),
  transmission: require('./clients/transmission'),
  rtorrent: require('./clients/rtorrent'),
  nzbget: require('./clients/nzbget'),
  sabnzbd: require('./clients/sabnzbd'),
};

const DANGEROUS_EXTS_REGEX = /\.(exe|bat|cmd|com|msi|scr|pif|vbs|vbe|ps1|ps2|jar|apk|reg|hta|cpl)($|\?|\&|\#|\s)/i;
const DANGEROUS_FILE_REGEX = /\.(exe|bat|cmd|com|msi|scr|pif|vbs|vbe|ps1|ps2|jar|apk|reg|hta|cpl)$/i;

const safeHashes = new Set();
const inspectingHashes = new Set();

const formatClient = (client) => {
  if (!client) return null;
  const formatted = { ...client };
  if (formatted.host && !/^https?:\/\//.test(formatted.host)) {
    formatted.host = `http://${formatted.host}`;
  }
  formatted.type = formatted.type || 'qbittorrent';
  return formatted;
};

const getClient = (clientId = null, type = null) => {
  let client;
  if (clientId) {
    client = db.prepare('SELECT * FROM download_clients WHERE id = ?').get(clientId);
  } else if (type) {
    client = db.prepare('SELECT * FROM download_clients WHERE type = ? LIMIT 1').get(type);
  }
  if (!client) {
    client = db.prepare('SELECT * FROM download_clients LIMIT 1').get();
  }
  return formatClient(client);
};

const getAllClients = () => {
  try {
    const clients = db.prepare('SELECT * FROM download_clients').all();
    return clients.map(formatClient);
  } catch {
    return [];
  }
};

const getAdapter = (client) => {
  const adapter = adapters[client.type];
  if (!adapter) throw new Error(`Unsupported download client type: ${client.type}`);
  return adapter;
};

// Torrent URLs must use http(s)/magnet schemes. Private/link-local hosts are
// only rejected when 'blockPrivateTorrentHosts' is enabled, so self-hosted
// indexers (e.g. Prowlarr on the LAN) keep working by default.
const validateTorrentUrl = (url) => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid torrent URL');
  }
  if (!['http:', 'https:', 'magnet:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported torrent URL scheme: ${parsed.protocol}`);
  }

  // Refuse any executable payload disguised in torrent URL or magnet display name
  const decoded = decodeURIComponent(url);
  if (DANGEROUS_EXTS_REGEX.test(decoded) || DANGEROUS_FILE_REGEX.test(parsed.pathname || '')) {
    throw new Error(`Refusing to download executable or malicious payload: ${url}`);
  }

  if (parsed.protocol === 'magnet:') return;
  if (getSetting('blockPrivateTorrentHosts') !== 'true') return;
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const isPrivate =
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname.startsWith('fe80:') ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
  if (isPrivate) {
    throw new Error('Refusing to fetch torrent from a private or link-local address');
  }
};

const addTorrent = async (torrentUrl, type = 'movie', clientId = null) => {
  validateTorrentUrl(torrentUrl);
  const client = getClient(clientId);
  if (!client) throw new Error('No download client configured');
  console.log(`[DownloadClient] Adding ${type} torrent via ${client.type} (id=${client.id}): ${String(torrentUrl).substring(0, 80)}...`);
  return getAdapter(client).addTorrent(client, torrentUrl, type);
};

const enrichTorrents = (torrents) => {
  if (!torrents || torrents.length === 0) return [];
  
  let knownArtists = [];
  let knownAlbums = [];
  try {
    knownArtists = db.prepare('SELECT name FROM music_artists').all().map(a => a.name.toLowerCase()).filter(Boolean);
    knownAlbums = db.prepare('SELECT title FROM music_albums').all().map(a => a.title.toLowerCase()).filter(t => t && t.length > 4);
  } catch { /* proceed */ }

  return torrents.map(t => {
    let mediaType = t.mediaType || null;
    const cat = (t.category || '').toLowerCase();
    const tags = (Array.isArray(t.tags) ? t.tags.join(' ') : (t.tags || '')).toLowerCase();
    const savePath = (t.save_path || t.downloadDir || '').toLowerCase();

    if (cat === 'music' || cat === 'audio' || tags.includes('music') || savePath.includes('/music')) {
      mediaType = 'music';
    } else if (cat === 'tv' || tags.includes('tv') || savePath.includes('/tv')) {
      mediaType = 'tv';
    } else if (cat === 'movies' || cat === 'movie' || tags.includes('movie') || savePath.includes('/movie')) {
      mediaType = 'movie';
    } else {
      const lowerName = (t.name || '').toLowerCase();
      if (knownArtists.some(art => lowerName.includes(art)) || knownAlbums.some(alb => lowerName.includes(alb))) {
        mediaType = 'music';
      }
    }

    return { ...t, mediaType };
  });
};

const lastFetchWarn = new Map();
const WARN_COOLDOWN = 60 * 1000; // 60 seconds

const getTorrents = async (clientId = null, options = {}) => {
  let clients = [];
  if (clientId) {
    const c = getClient(clientId);
    if (c) clients.push(c);
  } else {
    clients = getAllClients();
  }
  if (clients.length === 0) return [];

  let failedCount = 0;
  let lastError = null;

  const results = await Promise.allSettled(
    clients.map(async (client) => {
      try {
        const torrents = await getAdapter(client).getTorrents(client);
        const defaultName = client.type === 'qbittorrent' ? 'qBittorrent' : client.type === 'deluge' ? 'Deluge' : client.type === 'transmission' ? 'Transmission' : client.type || 'Download Client';
        const clientName = client.name || defaultName;
        return (torrents || []).map(t => ({
          ...t,
          clientId: client.id,
          clientName: t.clientName || clientName
        }));
      } catch (err) {
        failedCount++;
        lastError = err;
        const key = `${client.id}:${client.type}`;
        const now = Date.now();
        const last = lastFetchWarn.get(key) || 0;
        if (now - last > WARN_COOLDOWN) {
          console.warn(`[DownloadClient] Failed to fetch torrents from client ${client.name || client.type} (id=${client.id}):`, err.message);
          lastFetchWarn.set(key, now);
        }
        return [];
      }
    })
  );

  if (options.throwOnAllFailed && clients.length > 0 && failedCount === clients.length) {
    throw new Error(`All download clients (${clients.length}) are unreachable: ${lastError?.message || 'unknown error'}`);
  }

  const allTorrents = [];
  for (const res of results) {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      allTorrents.push(...res.value);
    }
  }

  // Active watchdog: inspect active and queued torrents for executable/malicious payloads
  inspectTorrentsForMalware(allTorrents);

  return enrichTorrents(allTorrents);
};

const getTransferInfo = async (clientId = null) => {
  let clients = [];
  if (clientId) {
    const c = getClient(clientId);
    if (c) clients.push(c);
  } else {
    clients = getAllClients();
  }
  if (clients.length === 0) return null;

  const results = await Promise.allSettled(
    clients.map(async (client) => {
      try {
        return await getAdapter(client).getTransferInfo(client);
      } catch {
        return null;
      }
    })
  );

  const infos = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);

  if (infos.length === 0) return null;
  if (infos.length === 1) return infos[0];

  let totalDl = 0;
  let totalUp = 0;
  let totalDownloaded = 0;
  let totalUploaded = 0;

  for (const info of infos) {
    totalDl += (info.dl_info_speed || info.downloadSpeed || 0);
    totalUp += (info.up_info_speed || info.uploadSpeed || 0);
    totalDownloaded += (info.dl_info_data || info.downloaded || 0);
    totalUploaded += (info.up_info_data || info.uploaded || 0);
  }

  return {
    dl_info_speed: totalDl,
    up_info_speed: totalUp,
    dl_info_data: totalDownloaded,
    up_info_data: totalUploaded,
    connection_status: 'connected',
  };
};

const executeOnClientOrAll = async (clientId, fn) => {
  if (clientId) {
    const client = getClient(clientId);
    if (!client) throw new Error(`Download client with id ${clientId} not found`);
    return fn(client);
  }
  const clients = getAllClients();
  if (clients.length === 0) throw new Error('No download client configured');
  const results = await Promise.allSettled(clients.map(c => fn(c)));
  const anyFulfilled = results.some(r => r.status === 'fulfilled');
  if (!anyFulfilled && results.length > 0) {
    const firstErr = results.find(r => r.status === 'rejected')?.reason;
    throw firstErr || new Error('All download clients failed to execute operation');
  }
  return results;
};

const pauseTorrent = async (hash, clientId = null) => {
  return executeOnClientOrAll(clientId, client => getAdapter(client).pauseTorrent(client, hash));
};

const resumeTorrent = async (hash, clientId = null) => {
  return executeOnClientOrAll(clientId, client => getAdapter(client).resumeTorrent(client, hash));
};

const deleteTorrent = async (hash, deleteFiles = false, clientId = null) => {
  return executeOnClientOrAll(clientId, client => getAdapter(client).deleteTorrent(client, hash, deleteFiles));
};

const getTorrentFiles = async (hash, clientId = null) => {
  if (clientId) {
    const client = getClient(clientId);
    if (!client) return [];
    const adapter = getAdapter(client);
    if (typeof adapter.getTorrentFiles === 'function') {
      try {
        return (await adapter.getTorrentFiles(client, hash)) || [];
      } catch (err) {
        return [];
      }
    }
    return [];
  }
  const clients = getAllClients();
  for (const client of clients) {
    const adapter = getAdapter(client);
    if (typeof adapter.getTorrentFiles === 'function') {
      try {
        const files = await adapter.getTorrentFiles(client, hash);
        if (files && files.length > 0) return files;
      } catch {
        // try next
      }
    }
  }
  return [];
};

const quarantineMaliciousTorrent = async (torrent, badFileName) => {
  console.warn(`[Security] QUARANTINE: Executable payload detected in torrent "${torrent.name}" (${badFileName}). Terminating download.`);

  // 1. Delete torrent from client including local data
  try {
    await deleteTorrent(torrent.hash, true, torrent.clientId);
    console.log(`[Security] Torrent ${torrent.name} removed from download client with deleteFiles=true.`);
  } catch (delErr) {
    console.error(`[Security] Error removing torrent from client:`, delErr.message);
  }

  // 2. Clean up any disk artifacts
  try {
    let contentPath = torrent.content_path || torrent.contentPath || (torrent.save_path ? path.join(torrent.save_path, torrent.name) : null);
    const pathMapping = db.prepare("SELECT value FROM settings WHERE key = 'downloadPathMapping'").get();
    if (pathMapping?.value && contentPath) {
      try {
        const [from, to] = JSON.parse(pathMapping.value);
        if (contentPath.startsWith(from)) contentPath = contentPath.replace(from, to);
      } catch { /* ignore */ }
    }
    if (contentPath && fs.existsSync(contentPath)) {
      await fs.promises.rm(contentPath, { recursive: true, force: true });
      console.log(`[Security] Removed malicious payload from disk: ${contentPath}`);
    }
    // Also check if an .exe matching torrent name exists in save_path
    if (torrent.save_path) {
      let saveDir = torrent.save_path;
      if (pathMapping?.value) {
        try {
          const [from, to] = JSON.parse(pathMapping.value);
          if (saveDir.startsWith(from)) saveDir = saveDir.replace(from, to);
        } catch { /* ignore */ }
      }
      const directExe = path.join(saveDir, `${torrent.name}.exe`);
      if (fs.existsSync(directExe)) {
        await fs.promises.rm(directExe, { force: true });
        console.log(`[Security] Removed direct .exe from disk: ${directExe}`);
      }
    }
  } catch (diskErr) {
    console.error(`[Security] Error cleaning disk artifacts:`, diskErr.message);
  }

  // 3. Reset any database items currently marked as downloading that correspond to this torrent
  try {
    const torrentName = (torrent.name || '').toLowerCase();
    
    // Check downloading episodes
    const downloadingEpisodes = db.prepare(`
      SELECT e.id, e.show_id, e.season_number, e.episode_number, e.monitored, s.title as show_title, s.monitored as show_monitored
      FROM episodes e
      JOIN shows s ON e.show_id = s.id
      WHERE e.status = 'downloading'
    `).all();

    for (const ep of downloadingEpisodes) {
      const showTitle = ep.show_title.toLowerCase();
      const s = `s${String(ep.season_number).padStart(2, '0')}`;
      const e = `e${String(ep.episode_number).padStart(2, '0')}`;
      if (torrentName.includes(showTitle) && (torrentName.includes(`${s}${e}`) || torrentName.includes(s))) {
        const resetStatus = (ep.monitored === 1 && ep.show_monitored === 1) ? 'monitored' : 'unmonitored';
        console.log(`[Security] Resetting episode ${ep.show_title} S${ep.season_number}E${ep.episode_number} to ${resetStatus} after blocking malicious release.`);
        db.prepare("UPDATE episodes SET status = ?, file_path = NULL, file_size = NULL, scene_name = NULL WHERE id = ?").run(resetStatus, ep.id);
      }
    }

    // Check downloading movies
    const downloadingMovies = db.prepare("SELECT id, title, monitored FROM movies WHERE status = 'downloading'").all();
    for (const m of downloadingMovies) {
      if (torrentName.includes(m.title.toLowerCase())) {
        const resetStatus = m.monitored === 1 ? 'monitored' : 'unmonitored';
        console.log(`[Security] Resetting movie ${m.title} to ${resetStatus} after blocking malicious release.`);
        db.prepare("UPDATE movies SET status = ?, file_path = NULL, file_size = 0, scene_name = NULL WHERE id = ?").run(resetStatus, m.id);
      }
    }

    // Check downloading music albums
    const downloadingAlbums = db.prepare(`
      SELECT a.id, a.title, a.monitored, art.name as artist_name, art.monitored as artist_monitored
      FROM music_albums a
      JOIN music_artists art ON a.artist_id = art.id
      WHERE a.status = 'downloading'
    `).all();
    for (const alb of downloadingAlbums) {
      if (torrentName.includes(alb.title.toLowerCase()) || torrentName.includes(alb.artist_name.toLowerCase())) {
        const resetStatus = (alb.monitored === 1 && alb.artist_monitored === 1) ? 'monitored' : 'unmonitored';
        console.log(`[Security] Resetting music album ${alb.artist_name} - ${alb.title} to ${resetStatus} after blocking malicious release.`);
        db.prepare("UPDATE music_albums SET status = ?, folder_path = NULL WHERE id = ?").run(resetStatus, alb.id);
      }
    }

    // Recalculate candidate shows
    const candidateShows = db.prepare("SELECT id, monitored FROM shows WHERE status IN ('downloading', 'monitored')").all();
    for (const show of candidateShows) {
      const activeEps = db.prepare("SELECT COUNT(*) as count FROM episodes WHERE show_id = ? AND status = 'downloading'").get(show.id).count;
      if (activeEps === 0) {
        const missingMonitored = db.prepare("SELECT COUNT(*) as count FROM episodes WHERE show_id = ? AND monitored = 1 AND (file_path IS NULL OR file_path = '')").get(show.id).count;
        const newStatus = missingMonitored > 0 ? (show.monitored === 1 ? 'monitored' : 'unmonitored') : 'downloaded';
        db.prepare("UPDATE shows SET status = ? WHERE id = ? AND status != ?").run(newStatus, show.id, newStatus);
      }
    }

    // Recalculate candidate artists
    const candidateArtists = db.prepare("SELECT id, monitored FROM music_artists WHERE status IN ('downloading', 'monitored')").all();
    for (const artist of candidateArtists) {
      const activeAlbums = db.prepare("SELECT COUNT(*) as count FROM music_albums WHERE artist_id = ? AND status = 'downloading'").get(artist.id).count;
      if (activeAlbums === 0) {
        const missingMonitored = db.prepare("SELECT COUNT(*) as count FROM music_albums WHERE artist_id = ? AND monitored = 1 AND (folder_path IS NULL OR folder_path = '')").get(artist.id).count;
        const newStatus = missingMonitored > 0 ? (artist.monitored === 1 ? 'monitored' : 'unmonitored') : 'downloaded';
        db.prepare("UPDATE music_artists SET status = ? WHERE id = ? AND status != ?").run(newStatus, artist.id, newStatus);
      }
    }
  } catch (dbErr) {
    console.error(`[Security] Error resetting database statuses:`, dbErr.message);
  }

  // 4. Notify via eventBus
  try {
    eventBus.error('Malicious Download Quarantined', {
      title: torrent.name,
      message: `Blocked and removed torrent containing executable payload: ${badFileName}`
    });
  } catch { /* ignore */ }
};

const inspectTorrentsForMalware = (torrents) => {
  if (!Array.isArray(torrents) || torrents.length === 0) return;

  for (const t of torrents) {
    if (!t.hash) continue;
    if (safeHashes.has(t.hash) || inspectingHashes.has(t.hash)) continue;

    // Fast check: if torrent name itself has executable extension
    if (DANGEROUS_FILE_REGEX.test((t.name || '').trim())) {
      quarantineMaliciousTorrent(t, t.name).catch(() => {});
      continue;
    }

    // Inspect files once metadata is available (size > 0 and state is not metaDL)
    if ((t.size && t.size > 0) || (t.state && t.state !== 'metaDL' && t.state !== 'checking')) {
      inspectingHashes.add(t.hash);
      // Run async inspection non-blocking
      (async () => {
        try {
          const files = await getTorrentFiles(t.hash, t.clientId);
          if (!files || files.length === 0) {
            inspectingHashes.delete(t.hash);
            return;
          }

          const badFile = files.find(f => {
            const n = typeof f === 'string' ? f : (f.name || f.path || '');
            return DANGEROUS_FILE_REGEX.test(n.trim());
          });

          if (badFile) {
            const badName = typeof badFile === 'string' ? badFile : (badFile.name || badFile.path);
            await quarantineMaliciousTorrent(t, badName);
          } else {
            safeHashes.add(t.hash);
          }
        } catch {
          // If inspection fails, allow retry next cycle
        } finally {
          inspectingHashes.delete(t.hash);
        }
      })();
    }
  }

  // Keep safeHashes pruned
  if (safeHashes.size > 500) {
    const currentHashes = new Set(torrents.map(t => t.hash));
    for (const h of safeHashes) {
      if (!currentHashes.has(h)) safeHashes.delete(h);
    }
  }
};

const pauseTorrents = async (hashes, clientId = null) => {
  return Promise.allSettled(hashes.map(h => pauseTorrent(h, clientId)));
};

const resumeTorrents = async (hashes, clientId = null) => {
  return Promise.allSettled(hashes.map(h => resumeTorrent(h, clientId)));
};

const deleteTorrents = async (hashes, deleteFiles = false, clientId = null) => {
  return Promise.allSettled(hashes.map(h => deleteTorrent(h, deleteFiles, clientId)));
};

const testClientConnection = async (client) => {
  if (!client.host.startsWith('http')) client.host = `http://${client.host}`;
  client.type = client.type || 'qbittorrent';
  return getAdapter(client).testConnection(client);
};

module.exports = {
  getClient, getAllClients,
  addTorrent, getTorrents, getTransferInfo, getTorrentFiles, pauseTorrent, resumeTorrent, deleteTorrent,
  pauseTorrents, resumeTorrents, deleteTorrents, testClientConnection,
  quarantineMaliciousTorrent, inspectTorrentsForMalware
};
