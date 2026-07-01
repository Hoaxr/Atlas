const axios = require('axios');
const FormData = require('form-data');

let requestId = 1;
const rpcCall = (client, method, params = []) => {
  return {
    method: 'post',
    url: `${client.host}:${client.port}/json`,
    data: { id: requestId++, method, params },
    headers: { 'Content-Type': 'application/json' }
  };
};

const login = async (client) => {
  try {
    const response = await axios({
      method: 'post',
      url: `${client.host}:${client.port}/json`,
      data: { id: requestId++, method: 'auth.login', params: [client.password] },
      headers: { 'Content-Type': 'application/json' }
    });
    if (response.data?.result) return response.headers['set-cookie']?.[0];
    return null;
  } catch (err) {
    console.error('Deluge login failed:', err.message);
    return null;
  }
};

const addTorrent = async (client, torrentUrl) => {
  const cookie = await login(client);
  if (!cookie) throw new Error('Failed to authenticate with Deluge');

  let torrentData = null;
  if (torrentUrl.startsWith('http')) {
    const res = await axios.get(torrentUrl, { responseType: 'arraybuffer', timeout: 15000 });
    torrentData = res.data.toString('base64');
  }

  await axios({
    ...rpcCall(client, 'core.add_torrent_url', [torrentUrl, {}]),
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie }
  });
  return true;
};

const getTorrents = async (client) => {
  const cookie = await login(client);
  if (!cookie) return [];
  try {
    const response = await axios({
      ...rpcCall(client, 'core.get_torrents_status', [['hash', 'name', 'state', 'progress', 'ratio', 'download_payload_rate', 'upload_payload_rate', 'total_size', 'total_done', 'eta', 'save_path']]),
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie }
    });
    const statusMap = response.data?.result || {};
    return Object.entries(statusMap).map(([hash, t]) => ({
      hash,
      name: t.name,
      progress: t.progress * 100,
      state: t.state === 'Downloading' ? 'downloading' : t.state === 'Seeding' ? 'seeding' : t.state === 'Paused' ? 'paused' : t.state,
      dlspeed: t.download_payload_rate,
      upspeed: t.upload_payload_rate,
      ratio: t.ratio,
      size: t.total_size,
      completed: t.total_done,
      eta: t.eta,
      save_path: t.save_path
    }));
  } catch { return []; }
};

const getTransferInfo = async (client) => {
  const cookie = await login(client);
  if (!cookie) return null;
  try {
    const [speed, session] = await Promise.all([
      axios({ ...rpcCall(client, 'core.get_session_status', [['payload_download_rate', 'payload_upload_rate']]), headers: { 'Cookie': cookie } }),
      axios({ ...rpcCall(client, 'core.get_free_space', ['.']), headers: { 'Cookie': cookie } })
    ]);
    return {
      dl_info_speed: speed.data?.result?.payload_download_rate || 0,
      up_info_speed: speed.data?.result?.payload_upload_rate || 0,
      free_space: session.data?.result || 0
    };
  } catch { return null; }
};

const deleteTorrent = async (client, hash, deleteFiles = false) => {
  const cookie = await login(client);
  if (!cookie) throw new Error('Failed to authenticate');
  await axios({
    ...rpcCall(client, 'core.remove_torrent', [hash, deleteFiles]),
    headers: { 'Cookie': cookie }
  });
  return true;
};

const testConnection = async (client) => {
  try {
    const cookie = await login(client);
    if (!cookie) return { status: 'error', message: 'Authentication failed' };
    const response = await axios({
      ...rpcCall(client, 'daemon.info', []),
      headers: { 'Cookie': cookie }, timeout: 5000
    });
    const version = response.data?.result?.version || 'unknown';
    return { status: 'connected', message: `Deluge ${version}` };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
};

module.exports = { addTorrent, getTorrents, getTransferInfo, deleteTorrent, testConnection };
