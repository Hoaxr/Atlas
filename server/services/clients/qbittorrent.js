const axios = require('axios');
const FormData = require('form-data');

const login = async (client) => {
  try {
    const response = await axios.post(`${client.host}:${client.port}/api/v2/auth/login`, 
      `username=${encodeURIComponent(client.username)}&password=${encodeURIComponent(client.password)}`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return response.headers['set-cookie'] ? response.headers['set-cookie'][0] : null;
  } catch (err) {
    console.error('qBittorrent login failed:', err.message);
    return null;
  }
};

const addTorrent = async (client, torrentUrl) => {
  const cookie = await login(client);
  if (!cookie) throw new Error('Failed to authenticate with qBittorrent');

  const formData = new FormData();
  let finalUrl = torrentUrl;

  if (torrentUrl.startsWith('http')) {
    const torrentRes = await axios.get(torrentUrl, { 
      responseType: 'arraybuffer', timeout: 15000, maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400
    });
    if (torrentRes.status >= 300 && torrentRes.status < 400 && torrentRes.headers.location) {
      finalUrl = torrentRes.headers.location;
    } else {
      formData.append('torrents', Buffer.from(torrentRes.data), 'download.torrent');
      finalUrl = null;
    }
  }
  if (finalUrl) formData.append('urls', finalUrl);
  formData.append('savepath', '/downloads');

  await axios.post(`${client.host}:${client.port}/api/v2/torrents/add`, formData, {
    headers: { ...formData.getHeaders(), 'Cookie': cookie }
  });
  return true;
};

const getTorrents = async (client) => {
  const cookie = await login(client);
  if (!cookie) return [];
  const response = await axios.get(`${client.host}:${client.port}/api/v2/torrents/info`, {
    headers: { 'Cookie': cookie }
  });
  return response.data;
};

const getTransferInfo = async (client) => {
  const cookie = await login(client);
  if (!cookie) return null;
  const response = await axios.get(`${client.host}:${client.port}/api/v2/transfer/info`, {
    headers: { 'Cookie': cookie }
  });
  return response.data;
};

const deleteTorrent = async (client, hash, deleteFiles = false) => {
  const cookie = await login(client);
  if (!cookie) throw new Error('Failed to authenticate');
  await axios.post(`${client.host}:${client.port}/api/v2/torrents/delete`, 
    `hashes=${hash}&deleteFiles=${deleteFiles}`, 
    { headers: { 'Cookie': cookie, 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return true;
};

const testConnection = async (client) => {
  try {
    const cookie = await login(client);
    if (!cookie) return { status: 'error', message: 'Authentication failed' };
    const info = await axios.get(`${client.host}:${client.port}/api/v2/app/version`, {
      headers: { 'Cookie': cookie }, timeout: 5000
    });
    return { status: 'connected', message: `qBittorrent v${info.data}` };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
};

module.exports = { login, addTorrent, getTorrents, getTransferInfo, deleteTorrent, testConnection };
