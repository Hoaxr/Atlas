const axios = require('axios');
const db = require('../config/database');
const FormData = require('form-data');

const getClient = () => {
  return db.prepare('SELECT * FROM download_clients LIMIT 1').get();
};

const login = async (client) => {
  try {
    const response = await axios.post(`${client.host}:${client.port}/api/v2/auth/login`, 
      `username=${encodeURIComponent(client.username)}&password=${encodeURIComponent(client.password)}`,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    
    const cookie = response.headers['set-cookie'] ? response.headers['set-cookie'][0] : null;
    return cookie;
  } catch (err) {
    console.error('qBittorrent login failed:', err.message);
    return null;
  }
};

const addTorrent = async (torrentUrl) => {
  const client = getClient();
  if (!client) throw new Error('No download client configured');

  const cookie = await login(client);
  if (!cookie) throw new Error('Failed to authenticate with qBittorrent');

  const formData = new FormData();
  formData.append('urls', torrentUrl);
  formData.append('savepath', '/downloads'); // Could be configurable

  try {
    await axios.post(`${client.host}:${client.port}/api/v2/torrents/add`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Cookie': cookie
      }
    });
    return true;
  } catch (err) {
    console.error('Failed to add torrent:', err.message);
    throw err;
  }
};

const getTorrents = async () => {
  const client = getClient();
  if (!client) return [];

  const cookie = await login(client);
  if (!cookie) return [];

  try {
    const response = await axios.get(`${client.host}:${client.port}/api/v2/torrents/info`, {
      headers: { 'Cookie': cookie }
    });
    return response.data;
  } catch (err) {
    console.error('Failed to get torrents:', err.message);
    return [];
  }
};

const getTransferInfo = async () => {
  const client = getClient();
  if (!client) return null;

  const cookie = await login(client);
  if (!cookie) return null;

  try {
    const response = await axios.get(`${client.host}:${client.port}/api/v2/transfer/info`, {
      headers: { 'Cookie': cookie }
    });
    return response.data;
  } catch (err) {
    console.error('Failed to get transfer info:', err.message);
    return null;
  }
};

const deleteTorrent = async (hash, deleteFiles = false) => {
  const client = getClient();
  if (!client) throw new Error('No download client configured');

  const cookie = await login(client);
  if (!cookie) throw new Error('Failed to authenticate');

  try {
    await axios.post(`${client.host}:${client.port}/api/v2/torrents/delete`, 
      `hashes=${hash}&deleteFiles=${deleteFiles}`, 
      {
        headers: { 
          'Cookie': cookie,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    return true;
  } catch (err) {
    console.error('Failed to delete torrent:', err.message);
    throw err;
  }
};

module.exports = {
  addTorrent,
  getTorrents,
  getTransferInfo,
  deleteTorrent
};
