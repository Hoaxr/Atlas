const EventEmitter = require('events');

class AppEventBus extends EventEmitter {
  log(level, message, metadata = {}) {
    const db = require('../config/database');
    try {
      const payload = JSON.stringify({ level, message, ...metadata });
      db.prepare('INSERT INTO logs (message) VALUES (?)').run(payload);
    } catch { /* ignore */ }

    // Emit to WebSocket clients
    this.emit('log', { level, message, metadata, timestamp: new Date().toISOString() });

    // Also emit as a named event
    this.emit('event', { level, type: level, message, metadata, timestamp: new Date().toISOString() });
  }

  info(message, metadata) { this.log('info', message, metadata); }
  warn(message, metadata) { this.log('warn', message, metadata); }
  success(message, metadata) { this.log('success', message, metadata); }
  error(message, metadata) { this.log('error', message, metadata); }
}

const bus = new AppEventBus();
bus.setMaxListeners(50);
module.exports = bus;
