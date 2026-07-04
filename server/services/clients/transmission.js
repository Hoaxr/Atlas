const axios = require('axios');

let requestId = 1;
const rpcCall = (method, args = {}) => ({
  method: 'post',
  data: { method, arguments: args, tag: requestId++ },
  headers: { 'Content-Type': 'application/json' }
});

const getSessionId = async (client) => {
  try {
    const response = await axios.post(`${client.host}:${client.port}/transmission/rpc`,
      JSON.stringify({ method: 'session-get', arguments: {} }),
      { headers: { 'Content-Type': 'application/json' }, timeout: 5000,
        validateStatus: (status) => status === 409 }
    );
    return response.headers['x-transmission-session-id'];
  } catch { return null; }
};

const getHeaders = (sessionId) => ({
  'Content-Type': 'application/json',
  'X-Transmission-Session-Id': sessionId
});

const rpc = async (client, method, args = {}) => {
  const sessionId = await getSessionId(client);
  if (!sessionId) throw new Error('Could not get Transmission session ID');

  const auth = (client.username && client.password)
    ? { auth: { username: client.username, password: client.password } }
    : {};

  const response = await axios.post(`${client.host}:${client.port}/transmission/rpc`,
    JSON.stringify({ method, arguments: args, tag: requestId++ }),
    { headers: { ...getHeaders(sessionId), ...auth }, timeout: 10000 }
  );
  return response.data;
};

const addTorrent = async (client, torrentUrl) => {
  const args = {};
  if (torrentUrl.startsWith('http')) {
    args.filename = torrentUrl;
  }
  await rpc(client, 'torrent-add', args);
  return true;
};

const getTorrents = async (client) => {
  try {
    const data = await rpc(client, 'torrent-get', {
      fields: ['hashString', 'name', 'status', 'percentDone', 'rateDownload', 'rateUpload', 'uploadRatio', 'totalSize', 'downloadedEver', 'eta', 'downloadDir', 'addedDate']
    });
    const statusMap = { 0: 'paused', 1: 'queued', 2: 'checking', 3: 'downloading', 4: 'seeding', 5: 'stalled' };
    return (data.arguments?.torrents || []).map(t => ({
      hash: t.hashString,
      name: t.name,
      progress: t.percentDone * 100,
      state: statusMap[t.status] || 'unknown',
      dlspeed: t.rateDownload,
      upspeed: t.rateUpload,
      ratio: t.uploadRatio,
      size: t.totalSize,
      completed: t.downloadedEver,
      eta: t.eta,
      added_date: t.addedDate
    }));
  } catch { return []; }
};

const getTransferInfo = async (client) => {
  try {
    const data = await rpc(client, 'session-stats');
    const stats = data.arguments;
    return {
      dl_info_speed: stats?.downloadSpeed || 0,
      up_info_speed: stats?.uploadSpeed || 0,
      free_space: null
    };
  } catch { return null; }
};

const deleteTorrent = async (client, hash, deleteFiles = false) => {
  await rpc(client, 'torrent-remove', {
    ids: [hash],
    'delete-local-data': deleteFiles
  });
  return true;
};

const testConnection = async (client) => {
  try {
    const data = await rpc(client, 'session-get');
    return { status: 'connected', message: `Transmission ${data.arguments?.version || 'unknown'}` };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
};

module.exports = { addTorrent, getTorrents, getTransferInfo, deleteTorrent, testConnection };
