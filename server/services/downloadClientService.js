const db = require('../config/database');
const { getSetting } = require('../utils/settings');
const adapters = {
  qbittorrent: require('./clients/qbittorrent'),
  deluge: require('./clients/deluge'),
  transmission: require('./clients/transmission'),
  rtorrent: require('./clients/rtorrent'),
  nzbget: require('./clients/nzbget'),
  sabnzbd: require('./clients/sabnzbd'),
};

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
  return Promise.allSettled(clients.map(c => fn(c)));
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
  addTorrent, getTorrents, getTransferInfo, pauseTorrent, resumeTorrent, deleteTorrent,
  pauseTorrents, resumeTorrents, deleteTorrents, testClientConnection
};
