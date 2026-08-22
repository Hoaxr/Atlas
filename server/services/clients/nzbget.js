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
      timeout: 10000
    }
  );
  if ([401, 403].includes(response.status)) throw new Error(`NZBGet authentication failed (${response.status})`);
  if (response.data?.error) throw new Error(response.data.error);
  return response.data?.result;
};

const addTorrent = async (client, torrentUrl) => {
  if (torrentUrl.startsWith('magnet:')) {
    throw new Error('Magnet links are not supported by this download client');
  }
  await rpc(client, 'appendurl', [torrentUrl]);
  return true;
};

const getTorrents = async (client) => {
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
      eta: null,
    }));
};

const getTransferInfo = async (client) => {
  try {
    const status = await rpc(client, 'status');
    return {
      dl_info_speed: status?.DownloadRate || 0,
      up_info_speed: 0,
      free_space: status?.FreeDiskSpace || null,
    };
  } catch (err) {
    console.error('[NZBGet] getTransferInfo failed:', err.message);
    return null;
  }
};

const pauseTorrent = async (client, hash) => {
  await rpc(client, 'editqueue', ['GroupPause', 0, '', [parseInt(hash, 10)]]);
  return true;
};

const resumeTorrent = async (client, hash) => {
  await rpc(client, 'editqueue', ['GroupResume', 0, '', [parseInt(hash, 10)]]);
  return true;
};

const deleteTorrent = async (client, hash, _deleteFiles = false) => {
  await rpc(client, 'editqueue', ['GroupDelete', 0, '', [parseInt(hash, 10)]]);
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

module.exports = { addTorrent, getTorrents, getTransferInfo, pauseTorrent, resumeTorrent, deleteTorrent, testConnection };
