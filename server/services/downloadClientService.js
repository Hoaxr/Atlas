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

const getClient = () => {
  const client = db.prepare('SELECT * FROM download_clients LIMIT 1').get();
  if (!client) return null;
  // Only add protocol if host doesn't already specify one (supports both http:// and https://)
  if (!/^https?:\/\//.test(client.host)) client.host = `http://${client.host}`;
  client.type = client.type || 'qbittorrent';
  return client;
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

const addTorrent = async (torrentUrl, type = 'movie') => {
  validateTorrentUrl(torrentUrl);
  const client = getClient();
  if (!client) throw new Error('No download client configured');
  console.log(`[DownloadClient] Adding ${type} torrent via ${client.type}: ${String(torrentUrl).substring(0, 80)}...`);
  return getAdapter(client).addTorrent(client, torrentUrl);
};

const getTorrents = async () => {
  const client = getClient();
  if (!client) return [];
  return getAdapter(client).getTorrents(client);
};

const getTransferInfo = async () => {
  const client = getClient();
  if (!client) return null;
  return getAdapter(client).getTransferInfo(client);
};

const pauseTorrent = async (hash) => {
  const client = getClient();
  if (!client) throw new Error('No download client configured');
  return getAdapter(client).pauseTorrent(client, hash);
};

const resumeTorrent = async (hash) => {
  const client = getClient();
  if (!client) throw new Error('No download client configured');
  return getAdapter(client).resumeTorrent(client, hash);
};

const deleteTorrent = async (hash, deleteFiles = false) => {
  const client = getClient();
  if (!client) throw new Error('No download client configured');
  return getAdapter(client).deleteTorrent(client, hash, deleteFiles);
};

const testClientConnection = async (client) => {
  if (!client.host.startsWith('http')) client.host = `http://${client.host}`;
  client.type = client.type || 'qbittorrent';
  return getAdapter(client).testConnection(client);
};

module.exports = {
  addTorrent, getTorrents, getTransferInfo, pauseTorrent, resumeTorrent, deleteTorrent, testClientConnection
};
