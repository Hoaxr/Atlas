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

module.exports = router;
