const axios = require('axios');

// SABnzbd uses a simple HTTP API with an API key
// Endpoint format: http://host:port/sabnzbd/api?mode=...&apikey=...

const apiCall = async (client, params) => {
  const baseParams = { output: 'json' };
  if (client.password) baseParams.apikey = client.password; // SABnzbd uses password field as API key

  const response = await axios.get(`${client.host}:${client.port}/sabnzbd/api`, {
    params: { ...baseParams, ...params },
    timeout: 10000,
    validateStatus: () => true
  });
  return response.data;
};

const addTorrent = async (client, torrentUrl) => {
  // SABnzbd accepts URLs directly
  if (torrentUrl.startsWith('http')) {
    const params = { mode: 'addurl', name: torrentUrl, nzbname: '' };
    if (client.username) params.cat = client.username; // reuse username as category
    await apiCall(client, params);
  }
  return true;
};

const getTorrents = async (client) => {
  try {
    const data = await apiCall(client, { mode: 'queue', start: 0, limit: 100 });
    const queue = data?.queue?.slots || [];
    return queue.map((item, i) => ({
      hash: item.nzo_id || String(i),
      name: item.filename || 'Unknown',
      progress: parseFloat(item.percentage) || 0,
      state: item.status === 'Downloading' ? 'downloading' :
             item.status === 'Paused' ? 'paused' :
             item.status?.toLowerCase() || 'unknown',
      dlspeed: 0,
      upspeed: 0,
      ratio: 0,
      size: item.size ? parseInt(item.size) * 1024 * 1024 : 0,
      completed: item.mb ? parseFloat(item.mb) * 1024 * 1024 : 0,
      eta: item.eta || null,
    }));
  } catch { return []; }
};

const getTransferInfo = async (client) => {
  try {
    const data = await apiCall(client, { mode: 'queue' });
    const queue = data?.queue || {};
    return {
      dl_info_speed: queue.kbpersec ? parseFloat(queue.kbpersec) * 1024 : 0,
      up_info_speed: 0,
      free_space: queue.diskspace2 ? parseFloat(queue.diskspace2) * 1024 * 1024 * 1024 : null,
    };
  } catch { return null; }
};

const deleteTorrent = async (client, hash, deleteFiles = false) => {
  await apiCall(client, { mode: 'queue', name: 'delete', value: hash });
  return true;
};

const testConnection = async (client) => {
  try {
    const data = await apiCall(client, { mode: 'version' });
    const version = data?.version || 'unknown';
    return { status: 'connected', message: `SABnzbd ${version}` };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
};

module.exports = { addTorrent, getTorrents, getTransferInfo, deleteTorrent, testConnection };
