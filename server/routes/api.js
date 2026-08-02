const express = require('express');
const router = express.Router();
const db = require('../config/database');

const requireAdmin = require('../middleware/requireAdmin');

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
router.get('/logs', requireAdmin, (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;
    const levelFilter = req.query.level; // e.g. 'error', 'success', 'warn', 'info'
    const searchFilter = (req.query.search || '').toLowerCase();

    let query = 'SELECT * FROM logs';
    const params = [];
    const conditions = [];

    if (levelFilter && levelFilter !== 'all') {
      if (levelFilter === 'info') {
        conditions.push(`( (json_valid(message) AND json_extract(message, '$.level') = ?) OR NOT json_valid(message) )`);
        params.push(levelFilter);
      } else {
        conditions.push(`(json_valid(message) AND json_extract(message, '$.level') = ?)`);
        params.push(levelFilter);
      }
    }
    
    if (searchFilter) {
      conditions.push(`LOWER(message) LIKE ?`);
      params.push(`%${searchFilter}%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const logs = db.prepare(query).all(...params);

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

router.delete('/logs', requireAdmin, (req, res, next) => {
  try {
    db.prepare('DELETE FROM logs').run();
    res.json({ status: 'success', message: 'Activity logs cleared' });
  } catch (e) {
    next(e);
  }
});

router.get('/stats/providers', requireAdmin, (req, res, next) => {
  try {
    const stats = db.prepare(`
      SELECT 
        indexer_name,
        COUNT(*) as total_requests,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_requests,
        SUM(results_count) as total_results,
        AVG(response_time_ms) as avg_response_time_ms
      FROM indexer_stats
      GROUP BY indexer_name
      ORDER BY total_requests DESC
    `).all();

    res.json({ status: 'success', data: stats });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
