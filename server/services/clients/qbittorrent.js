const axios = require('axios');
const FormData = require('form-data');

const http = axios.create({ timeout: 10000 });

// Cookie cache keyed by client endpoint — re-authenticated only on 401/403
const sessions = new Map();
const sessionKey = (client) => `${client.host}:${client.port}`;

const login = async (client) => {
  try {
    const response = await http.post(`${client.host}:${client.port}/api/v2/auth/login`,
      `username=${encodeURIComponent(client.username)}&password=${encodeURIComponent(client.password)}`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return response.headers['set-cookie'] ? response.headers['set-cookie'][0] : null;
  } catch (err) {
    console.error('qBittorrent login failed:', err.message);
    return null;
  }
};

const authenticate = async (client) => {
  let cookie = sessions.get(sessionKey(client));
  if (!cookie) {
    cookie = await login(client);
    if (!cookie) throw new Error('Failed to authenticate with qBittorrent');
    sessions.set(sessionKey(client), cookie);
  }
  return cookie;
};

const authedRequest = async (client, requestFn) => {
  const cookie = await authenticate(client);
  try {
    return await requestFn(cookie);
  } catch (err) {
    if ([401, 403].includes(err.response?.status)) {
      sessions.delete(sessionKey(client));
      const freshCookie = await login(client);
      if (!freshCookie) throw new Error('Failed to re-authenticate with qBittorrent', { cause: err });
      sessions.set(sessionKey(client), freshCookie);
      return await requestFn(freshCookie);
    }
    throw err;
  }
};

const addTorrent = async (client, torrentUrl) => {
  await authedRequest(client, async (cookie) => {
    const formData = new FormData();
    let finalUrl = torrentUrl;

    if (/^https?:/.test(torrentUrl)) {
      try {
        const torrentRes = await http.get(torrentUrl, {
          responseType: 'arraybuffer',
          timeout: 15000,
          maxRedirects: 5,
          validateStatus: (status) => status >= 200 && status < 400
        });
        if (torrentRes.status >= 300 && torrentRes.status < 400 && torrentRes.headers.location) {
          finalUrl = torrentRes.headers.location;
        } else if (torrentRes.data && torrentRes.data.length > 0) {
          formData.append('torrents', Buffer.from(torrentRes.data), 'download.torrent');
          finalUrl = null;
        }
      } catch (fetchErr) {
        console.warn(`[qBittorrent] Direct .torrent fetch failed (${fetchErr.message}) — falling back to passing URL directly to client`);
        finalUrl = torrentUrl;
      }
    }
    if (finalUrl) formData.append('urls', finalUrl);
    formData.append('savepath', '/downloads');

    await http.post(`${client.host}:${client.port}/api/v2/torrents/add`, formData, {
      headers: { ...formData.getHeaders(), 'Cookie': cookie }
    });
  });
  return true;
};

const getTorrents = async (client) => {
  const response = await authedRequest(client, (cookie) =>
    http.get(`${client.host}:${client.port}/api/v2/torrents/info`, {
      headers: { 'Cookie': cookie },
      params: { filter: 'all' }
    })
  );
  // Normalize progress from qBittorrent's native 0-1 scale to 0-100
  return response.data.map(t => ({ ...t, progress: Math.round(t.progress * 10000) / 100 }));
};

const getTransferInfo = async (client) => {
  const response = await authedRequest(client, (cookie) =>
    http.get(`${client.host}:${client.port}/api/v2/transfer/info`, {
      headers: { 'Cookie': cookie }
    })
  );
  return response.data;
};

const pauseTorrent = async (client, hash) => {
  await authedRequest(client, async (cookie) => {
    try {
      await http.post(`${client.host}:${client.port}/api/v2/torrents/pause`,
        `hashes=${hash}`,
        { headers: { 'Cookie': cookie, 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
    } catch (err) {
      if ([401, 403].includes(err.response?.status)) throw err;
      await http.post(`${client.host}:${client.port}/api/v2/torrents/stop`,
        `hashes=${hash}`,
        { headers: { 'Cookie': cookie, 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
    }
  });
  return true;
};

const resumeTorrent = async (client, hash) => {
  await authedRequest(client, async (cookie) => {
    try {
      await http.post(`${client.host}:${client.port}/api/v2/torrents/resume`,
        `hashes=${hash}`,
        { headers: { 'Cookie': cookie, 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
    } catch (err) {
      if ([401, 403].includes(err.response?.status)) throw err;
      await http.post(`${client.host}:${client.port}/api/v2/torrents/start`,
        `hashes=${hash}`,
        { headers: { 'Cookie': cookie, 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
    }
  });
  return true;
};

const deleteTorrent = async (client, hash, deleteFiles = false) => {
  await authedRequest(client, (cookie) =>
    http.post(`${client.host}:${client.port}/api/v2/torrents/delete`,
      `hashes=${hash}&deleteFiles=${deleteFiles}`,
      { headers: { 'Cookie': cookie, 'Content-Type': 'application/x-www-form-urlencoded' } }
    )
  );
  return true;
};

const testConnection = async (client) => {
  try {
    const cookie = await login(client);
    if (!cookie) return { status: 'error', message: 'Authentication failed' };
    sessions.set(sessionKey(client), cookie);
    const info = await http.get(`${client.host}:${client.port}/api/v2/app/version`, {
      headers: { 'Cookie': cookie }, timeout: 5000
    });
    return { status: 'connected', message: `qBittorrent v${info.data}` };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
};

module.exports = { login, addTorrent, getTorrents, getTransferInfo, pauseTorrent, resumeTorrent, deleteTorrent, testConnection };
