const axios = require('axios');

// NZBGet uses JSON-RPC over HTTP with username:password as Base64 auth

const rpc = async (client, method, params = []) => {
  const auth = Buffer.from(`${client.username || ''}:${client.password || ''}`).toString('base64');
  const response = await axios.post(
    `${client.host}:${client.port}/jsonrpc`,
    { jsonrpc: '2.0', method, params, id: 1 },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      timeout: 10000,
      validateStatus: () => true
    }
  );
  if (response.data?.error) throw new Error(response.data.error);
  return response.data?.result;
};

const addTorrent = async (client, torrentUrl) => {
  // NZBGet can download from URL directly
  if (torrentUrl.startsWith('http')) {
    await rpc(client, 'appendurl', [torrentUrl]);
  }
  return true;
};

const getTorrents = async (client) => {
  try {
    const groups = await rpc(client, 'listgroups', [0, 100]);
    return (groups || []).map(g => ({
      hash: String(g.ID),
      name: g.NZBName || g.Name || 'Unknown',
      progress: Math.round(((g.FileSize - g.RemainingSize) / Math.max(g.FileSize, 1)) * 100),
      state: g.Status === 'DOWNLOADING' ? 'downloading' :
             g.Status === 'UNPACKING' ? 'downloading' :
             g.Status === 'PAUSED' ? 'paused' :
             g.Status === 'FINISHED' ? 'seeding' : g.Status?.toLowerCase() || 'unknown',
      dlspeed: 0,
      upspeed: 0,
      ratio: 0,
      size: g.FileSize || 0,
      completed: (g.FileSize || 0) - (g.RemainingSize || 0),
      eta: g.Health || 0,
    }));
  } catch { return []; }
};

const getTransferInfo = async (client) => {
  try {
    const status = await rpc(client, 'status');
    return {
      dl_info_speed: status?.DownloadRate || 0,
      up_info_speed: 0,
      free_space: status?.FreeDiskSpace || null,
    };
  } catch { return null; }
};

const deleteTorrent = async (client, hash, deleteFiles = false) => {
  await rpc(client, 'delete', [parseInt(hash), deleteFiles]);
  return true;
};

const testConnection = async (client) => {
  try {
    const version = await rpc(client, 'version');
    return { status: 'connected', message: `NZBGet ${version}` };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
};

module.exports = { addTorrent, getTorrents, getTransferInfo, deleteTorrent, testConnection };
