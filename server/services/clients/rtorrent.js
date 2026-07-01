const axios = require('axios');
const querystring = require('querystring');

// rTorrent uses XML-RPC over SCGI. We proxy through the HTTP-to-SCGI
// endpoint that rTorrent provides (usually port 8000 or via nginx).
// Common setups: nginx proxy /RPC2 → SCGI, or direct SCGI.

const scgiCall = async (client, method, params = []) => {
  // Build XML-RPC body manually (avoid heavy deps for a few methods)
  const paramXml = params.map(p => {
    if (typeof p === 'string') return `<string>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</string>`;
    if (typeof p === 'number') return `<i4>${p}</i4>`;
    if (typeof p === 'boolean') return `<boolean>${p ? 1 : 0}</boolean>`;
    return '<string></string>';
  }).join('');

  const body = `<?xml version="1.0"?>
<methodCall>
  <methodName>${method}</methodName>
  <params>${paramXml}</params>
</methodCall>`;

  const auth = (client.username && client.password)
    ? { auth: { username: client.username, password: client.password } }
    : {};

  const response = await axios.post(
    `${client.host}:${client.port}/RPC2`,
    body,
    {
      headers: { 'Content-Type': 'text/xml' },
      timeout: 10000,
      ...auth,
      validateStatus: () => true
    }
  );
  return response.data;
};

const parseValue = (xml, tag) => {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return match ? match[1] : null;
};

const addTorrent = async (client, torrentUrl) => {
  if (torrentUrl.startsWith('http')) {
    // Use load_start_verbose which accepts a URL
    await scgiCall(client, 'load.start', ['', torrentUrl]);
  }
  return true;
};

const getTorrents = async (client) => {
  try {
    const views = ['main'];
    const data = await scgiCall(client, 'd.multicall', [
      views[0],
      'd.get_hash=',
      'd.get_name=',
      'd.get_complete=',
      'd.get_down_rate=',
      'd.get_up_rate=',
      'd.get_ratio=',
      'd.get_size_bytes=',
      'd.get_down_total=',
      'd.get_state=',
    ]);

    // Parse XML response
    const items = [];
    const arrayMatch = data.match(/<array>([\s\S]*)<\/array>/);
    if (!arrayMatch) return [];

    // Split by <data> tags to get individual torrent entries
    const structRegex = /<struct>([\s\S]*?)<\/struct>/g;
    let structMatch;
    while ((structMatch = structRegex.exec(arrayMatch[1])) !== null) {
      const struct = structMatch[1];
      const values = [...struct.matchAll(/<string>([^<]*)<\/string>/g)].map(m => m[1]);

      if (values.length >= 10) {
        const progress = parseInt(values[2]) / 1000;
        const isActive = values[9] === '1' || values[9] === '3';
        const isComplete = progress >= 1;
        items.push({
          hash: values[0],
          name: values[1],
          progress: Math.round(progress * 100),
          state: isComplete ? (isActive ? 'seeding' : 'paused') : (isActive ? 'downloading' : 'paused'),
          dlspeed: parseInt(values[3]) || 0,
          upspeed: parseInt(values[4]) || 0,
          ratio: parseInt(values[5]) || 0,
          size: parseInt(values[6]) || 0,
          completed: parseInt(values[7]) || 0,
        });
      }
    }
    return items;
  } catch { return []; }
};

const getTransferInfo = async (client) => {
  try {
    const [downRate, upRate] = await Promise.all([
      scgiCall(client, 'throttle.global_down.rate'),
      scgiCall(client, 'throttle.global_up.rate'),
    ]);
    return {
      dl_info_speed: parseInt(parseValue(downRate, 'i4') || parseValue(downRate, 'string') || '0'),
      up_info_speed: parseInt(parseValue(upRate, 'i4') || parseValue(upRate, 'string') || '0'),
      free_space: null
    };
  } catch { return null; }
};

const deleteTorrent = async (client, hash, deleteFiles = false) => {
  if (deleteFiles) {
    await scgiCall(client, 'd.delete_tied', [hash]);
  }
  await scgiCall(client, 'd.erase', [hash]);
  return true;
};

const testConnection = async (client) => {
  try {
    const data = await scgiCall(client, 'system.api_version');
    const version = parseValue(data, 'i4') || parseValue(data, 'string') || 'unknown';
    return { status: 'connected', message: `rTorrent (API v${version})` };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
};

module.exports = { addTorrent, getTorrents, getTransferInfo, deleteTorrent, testConnection };
