const express = require('express');
const router = express.Router();
const db = require('../config/database');

router.get('/status', (req, res, next) => {
  try {
    const c = db.prepare('SELECT COUNT(*) as count FROM logs').get();
    res.json({
      status: 'success',
      message: '🚀 API online & beveiligd!',
      database: `SQLite (Logs: ${c ? c.count : 0})`,
      tech: ['Express', 'Helmet', 'Morgan', 'SQLite3'],
    });
  } catch (e) {
    next(e);
  }
});

// Activity log / audit trail
router.get('/logs', (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const logs = db.prepare(
      'SELECT * FROM logs ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);
    
    const parsed = logs.map(log => {
      try {
        const data = JSON.parse(log.message);
        return { id: log.id, ...data, created_at: log.created_at };
      } catch {
        return { id: log.id, level: 'info', message: log.message, created_at: log.created_at };
      }
    });

    res.json({ status: 'success', data: parsed });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
