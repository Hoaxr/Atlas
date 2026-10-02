const axios = require('axios');

const http = axios.create({ timeout: 10000 });
let requestId = 1;

// Cookie cache keyed by client endpoint — re-authenticated only on auth failure
const sessions = new Map();
const sessionKey = (client) => `${client.host}:${client.port}`;
const lastErrorLog = new Map();
const ERROR_LOG_COOLDOWN = 60 * 1000;

const rpcCall = (client, method, params = []) => {
  return {
    method: 'post',
    url: `${client.host}:${client.port}/json`,
    data: { id: requestId++, method, params },
    headers: { 'Content-Type': 'application/json' }
  };
};

const login = async (client) => {
  const key = sessionKey(client);
  try {
    const response = await http({
      ...rpcCall(client, 'auth.login', [client.password])
    });
    if (response.data?.result) {
      if (lastErrorLog.has(key)) {
        console.log(`[Deluge] Connection restored to ${client.host}:${client.port}`);
        lastErrorLog.delete(key);
      }
      return response.headers['set-cookie']?.[0];
    }
    return null;
  } catch (err) {
    const now = Date.now();
    const last = lastErrorLog.get(key) || 0;
    if (now - last > ERROR_LOG_COOLDOWN) {
      console.warn(`[Deluge] Login/connect failed (${client.host}:${client.port}): ${err.message}`);
      lastErrorLog.set(key, now);
    }
    return null;
  }
};

const authenticate = async (client) => {
  let cookie = sessions.get(sessionKey(client));
  if (!cookie) {
    cookie = await login(client);
    if (!cookie) throw new Error('Failed to authenticate with Deluge');
    sessions.set(sessionKey(client), cookie);
  }
  return cookie;
};

const rpc = async (client, method, params = []) => {
  const cookie = await authenticate(client);
  const attempt = (c) => http({ ...rpcCall(client, method, params), headers: { 'Content-Type': 'application/json', 'Cookie': c } });
  let response = await attempt(cookie);
  // Deluge returns HTTP 200 with an error payload when the session expired
  if (response.data?.error && /not authenticated|session/i.test(response.data.error.message || '')) {
    sessions.delete(sessionKey(client));
    const freshCookie = await login(client);
    if (!freshCookie) throw new Error('Failed to re-authenticate with Deluge');
    sessions.set(sessionKey(client), freshCookie);
    response = await attempt(freshCookie);
  }
  if (response.data?.error) throw new Error(response.data.error.message || JSON.stringify(response.data.error));
  return response.data?.result;
};

const addTorrent = async (client, torrentUrl) => {
  await rpc(client, 'core.add_torrent_url', [torrentUrl, {}]);
  return true;
};

const getTorrents = async (client) => {
  const result = await rpc(client, 'core.get_torrents_status', [['hash', 'name', 'state', 'progress', 'ratio', 'download_payload_rate', 'upload_payload_rate', 'total_size', 'total_done', 'eta', 'save_path']]);
  const statusMap = result || {};
  return Object.entries(statusMap).map(([hash, t]) => ({
    hash,
    name: t.name,
    progress: Math.max(0, Math.min(100, Math.round(t.progress))),
    state: t.state === 'Downloading' ? 'downloading' : t.state === 'Seeding' ? 'seeding' : t.state === 'Paused' ? 'paused' : t.state,
    dlspeed: t.download_payload_rate,
    upspeed: t.upload_payload_rate,
    ratio: t.ratio,
    size: t.total_size,
    completed: t.total_done,
    eta: t.eta,
    save_path: t.save_path
  }));
};

const getTransferInfo = async (client) => {
  try {
    const [speed, session] = await Promise.all([
      rpc(client, 'core.get_session_status', [['payload_download_rate', 'payload_upload_rate']]),
      rpc(client, 'core.get_free_space', ['.'])
    ]);
    return {
      dl_info_speed: speed?.payload_download_rate || 0,
      up_info_speed: speed?.payload_upload_rate || 0,
      free_space: session ?? 0
    };
  } catch { return null; }
};

const pauseTorrent = async (client, hash) => {
  await rpc(client, 'core.pause_torrent', [hash]);
  return true;
};

const resumeTorrent = async (client, hash) => {
  await rpc(client, 'core.resume_torrent', [hash]);
  return true;
};

const getTorrentFiles = async (client, hash) => {
  try {
    const status = await rpc(client, 'core.get_torrent_status', [hash, ['files']]);
    return (status?.files || []).map(f => ({
      name: f.path,
      size: f.size,
      progress: f.size ? (f.size - (f.dump || 0)) / f.size : 0
    }));
  } catch {
    return [];
  }
};

const deleteTorrent = async (client, hash, deleteFiles = false) => {
  await rpc(client, 'core.remove_torrent', [hash, deleteFiles]);
  return true;
};

const testConnection = async (client) => {
  try {
    const version = await rpc(client, 'daemon.info', []);
    return { status: 'connected', message: `Deluge ${typeof version === 'string' ? version : version?.version || 'unknown'}` };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
};

module.exports = { addTorrent, getTorrents, getTransferInfo, getTorrentFiles, pauseTorrent, resumeTorrent, deleteTorrent, testConnection };
