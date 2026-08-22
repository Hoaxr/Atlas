const axios = require('axios');

// rTorrent uses XML-RPC over SCGI. We proxy through the HTTP-to-SCGI
// endpoint that rTorrent provides (usually port 8000 or via nginx).
// Common setups: nginx proxy /RPC2 → SCGI, or direct SCGI.

const http = axios.create({ timeout: 10000 });

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

  const response = await http.post(
    `${client.host}:${client.port}/RPC2`,
    body,
    {
      headers: { 'Content-Type': 'text/xml' },
      ...auth
    }
  );
  return response.data;
};

const parseValue = (xml, tag) => {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return match ? match[1] : null;
};

// Parse a single XML-RPC <value> member: string or integer types (i4/i8)
const parseMemberValue = (valueXml) => {
  const stringMatch = valueXml.match(/<string>([\s\S]*?)<\/string>/);
  if (stringMatch) return stringMatch[1];
  const intMatch = valueXml.match(/<i[48]>([^<]*)<\/i[48]>/);
  if (intMatch) return parseInt(intMatch[1], 10) || 0;
  return null;
};

const addTorrent = async (client, torrentUrl) => {
  // load.start accepts both http(s) URLs and magnet URIs
  await scgiCall(client, 'load.start', ['', torrentUrl]);
  return true;
};

const TORRENT_FIELDS = [
  'd.hash=',
  'd.name=',
  'd.state=',
  'd.down.rate=',
  'd.up.rate=',
  'd.ratio=',
  'd.size_bytes=',
  'd.bytes_done=',
];

const getTorrents = async (client) => {
  const data = await scgiCall(client, 'd.multicall', ['main', ...TORRENT_FIELDS]);

  const items = [];
  const arrayMatch = data.match(/<array>([\s\S]*)<\/array>/);
  if (!arrayMatch) return [];

  // Each torrent is an inner <array><data> of values in TORRENT_FIELDS order
  const rowRegex = /<data>([\s\S]*?)<\/data>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(arrayMatch[1])) !== null) {
    const valueRegex = /<value>([\s\S]*?)<\/value>/g;
    const values = [];
    let valueMatch;
    while ((valueMatch = valueRegex.exec(rowMatch[1])) !== null) {
      values.push(parseMemberValue(valueMatch[1]));
    }
    if (values.length < TORRENT_FIELDS.length) continue;

    const [hash, name, state, downRate, upRate, ratio, sizeBytes, bytesDone] = values;
    const size = parseInt(sizeBytes, 10) || 0;
    const completed = parseInt(bytesDone, 10) || 0;
    const progress = size > 0 ? Math.min(100, (completed / size) * 100) : 0;
    const isActive = state === 1 || state === '1';
    const isComplete = completed >= size && size > 0;
    items.push({
      hash,
      name,
      progress: Math.round(progress * 100) / 100,
      state: isComplete ? (isActive ? 'seeding' : 'paused') : (isActive ? 'downloading' : 'paused'),
      dlspeed: parseInt(downRate, 10) || 0,
      upspeed: parseInt(upRate, 10) || 0,
      ratio: Math.round(((parseInt(ratio, 10) || 0) / 1000) * 100) / 100,
      size,
      completed,
    });
  }
  return items;
};

const getTransferInfo = async (client) => {
  try {
    const [downRate, upRate] = await Promise.all([
      scgiCall(client, 'throttle.global_down.rate'),
      scgiCall(client, 'throttle.global_up.rate'),
    ]);
    return {
      dl_info_speed: parseInt(parseValue(downRate, 'i8') || parseValue(downRate, 'i4') || parseValue(downRate, 'string') || '0'),
      up_info_speed: parseInt(parseValue(upRate, 'i8') || parseValue(upRate, 'i4') || parseValue(upRate, 'string') || '0'),
      free_space: null
    };
  } catch { return null; }
};

const pauseTorrent = async (client, hash) => {
  await scgiCall(client, 'd.stop', [hash]);
  return true;
};

const resumeTorrent = async (client, hash) => {
  await scgiCall(client, 'd.start', [hash]);
  return true;
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
    const version = parseValue(data, 'i8') || parseValue(data, 'i4') || parseValue(data, 'string') || 'unknown';
    return { status: 'connected', message: `rTorrent (API v${version})` };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
};

module.exports = { addTorrent, getTorrents, getTransferInfo, pauseTorrent, resumeTorrent, deleteTorrent, testConnection };
