const jwt = require('jsonwebtoken');
const eventBus = require('./eventBus');

const JWT_SECRET = process.env.JWT_SECRET;

// userId -> Set of WebSocket connections
const users = new Map();

function addConnection(userId, ws, username = null) {
  if (!users.has(userId)) {
    users.set(userId, new Set());
    // User just came online
    eventBus.emit('event', { type: 'userOnline', userId, username });
  }
  users.get(userId).add(ws);
}

function removeConnection(userId, ws) {
  const connections = users.get(userId);
  if (!connections) return;
  connections.delete(ws);
  if (connections.size === 0) {
    users.delete(userId);
    // User went offline
    eventBus.emit('event', { type: 'userOffline', userId });
  }
}

function isOnline(userId) {
  return users.has(userId) && users.get(userId).size > 0;
}

function getOnlineUserIds() {
  return [...users.keys()];
}

function handleAuthMessage(ws, data) {
  try {
    if (!data.token) return false;
    const decoded = jwt.verify(data.token, JWT_SECRET);
    if (!decoded || !decoded.id) return false;

    const db = require('../config/database');
    const dbUser = db.prepare('SELECT id, username, role, jwt_version FROM users WHERE id = ?').get(decoded.id);
    if (!dbUser || dbUser.jwt_version !== decoded.jwt_version) {
      return false;
    }

    ws._userId = dbUser.id;
    ws._username = dbUser.username;
    addConnection(dbUser.id, ws, dbUser.username);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  addConnection,
  removeConnection,
  isOnline,
  getOnlineUserIds,
  handleAuthMessage,
};
