const axios = require('axios');

const http = axios.create({ timeout: 10000 });
let requestId = 1;

// Session-id cache keyed by client endpoint — refetched only on a 409 response
const sessionIds = new Map();
const sessionKey = (client) => `${client.host}:${client.port}`;

const getAuth = (client) => (client.username && client.password)
  ? { auth: { username: client.username, password: client.password } }
  : {};

const fetchSessionId = async (client) => {
  const response = await http.post(`${client.host}:${client.port}/transmission/rpc`,
    JSON.stringify({ method: 'session-get', arguments: {} }),
    {
      headers: { 'Content-Type': 'application/json' },
      ...getAuth(client),
      validateStatus: (status) => status === 409
    }
  );
  const sessionId = response.headers['x-transmission-session-id'];
  if (!sessionId) throw new Error('Could not get Transmission session ID');
  sessionIds.set(sessionKey(client), sessionId);
  return sessionId;
};

const rpcOnce = async (client, sessionId, method, args) => {
  const response = await http.post(`${client.host}:${client.port}/transmission/rpc`,
    JSON.stringify({ method, arguments: args, tag: requestId++ }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Transmission-Session-Id': sessionId
      },
      ...getAuth(client)
    }
  );
  return response.data;
};

const rpc = async (client, method, args = {}) => {
  let sessionId = sessionIds.get(sessionKey(client)) || await fetchSessionId(client);
  try {
    return await rpcOnce(client, sessionId, method, args);
  } catch (err) {
    // Session id expired mid-flight — refetch and retry once
    if (err.response?.status === 409) {
      sessionId = await fetchSessionId(client);
      return await rpcOnce(client, sessionId, method, args);
    }
    throw err;
  }
};

const addTorrent = async (client, torrentUrl) => {
  await rpc(client, 'torrent-add', { filename: torrentUrl });
  return true;
};

const getTorrents = async (client) => {
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
  } catch (err) {
    console.error('[Transmission] getTransferInfo failed:', err.message);
    return null;
  }
};

const pauseTorrent = async (client, hash) => {
  await rpc(client, 'torrent-stop', { ids: [hash] });
  return true;
};

const resumeTorrent = async (client, hash) => {
  await rpc(client, 'torrent-start', { ids: [hash] });
  return true;
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

module.exports = { addTorrent, getTorrents, getTransferInfo, pauseTorrent, resumeTorrent, deleteTorrent, testConnection };
