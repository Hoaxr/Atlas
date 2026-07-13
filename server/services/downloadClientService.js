const axios = require('axios');
const db = require('../config/database');
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

const addTorrent = async (torrentUrl, type = 'movie') => {
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
  addTorrent, getTorrents, getTransferInfo, deleteTorrent, testClientConnection
};
