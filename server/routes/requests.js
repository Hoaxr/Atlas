const express = require('express');
const router = express.Router();
const db = require('../config/database');
const requireAdmin = require('../middleware/requireAdmin');
const notificationService = require('../services/notificationService');
const { getSetting } = require('../utils/settings');

// GET /api/requests/pending-count
router.get('/pending-count', (req, res, next) => {
  try {
    let count = 0;
    if (req.user && req.user.role === 'admin') {
      const result = db.prepare("SELECT COUNT(*) as count FROM requests WHERE status = 'pending'").get();
      count = result ? result.count : 0;
    } else {
      const result = db.prepare("SELECT COUNT(*) as count FROM requests WHERE user_id = ? AND status = 'pending'").get(req.user?.id);
      count = result ? result.count : 0;
    }
    res.json({ status: 'success', data: { count } });
  } catch (err) {
    next(err);
  }
});

// GET /api/requests
router.get('/', (req, res, next) => {
  try {
    let requests;
    if (req.user?.role === 'admin') {
      // Admins see all requests with the requesting username
      requests = db.prepare(`
        SELECT r.*,
          u.username as requested_by,
          COALESCE(r.poster_path, m.poster_path, s.poster_path) as poster_path
        FROM requests r
        LEFT JOIN users u ON r.user_id = u.id
        LEFT JOIN movies m ON r.tmdb_id = m.tmdb_id AND r.type = 'movie'
        LEFT JOIN shows s ON r.tmdb_id = s.tmdb_id AND r.type = 'tv'
        ORDER BY r.created_at DESC
      `).all();
    } else {
      // Non-admins only see their own requests (no other user's username exposed)
      requests = db.prepare(`
        SELECT r.id, r.user_id, r.tmdb_id, r.type, r.title, r.status, r.created_at, r.release_date,
          COALESCE(r.poster_path, m.poster_path, s.poster_path) as poster_path
        FROM requests r
        LEFT JOIN movies m ON r.tmdb_id = m.tmdb_id AND r.type = 'movie'
        LEFT JOIN shows s ON r.tmdb_id = s.tmdb_id AND r.type = 'tv'
        WHERE r.user_id = ?
        ORDER BY r.created_at DESC
      `).all(req.user.id);
    }
    res.json({ status: 'success', data: requests });
  } catch (err) {
    next(err);
  }
});

// POST /api/requests (Create request)
router.post('/', (req, res, next) => {
  try {
    const { tmdb_id, type, title, release_date, poster_path } = req.body;
    const user_id = req.user?.id;

    if (!user_id) {
      return res.status(401).json({ status: 'error', message: 'Must be logged in to request' });
    }

    // Validate required fields
    if (!tmdb_id || !type || !title) {
      return res.status(400).json({ status: 'error', message: 'tmdb_id, type, and title are required' });
    }
    if (!['movie', 'tv'].includes(type)) {
      return res.status(400).json({ status: 'error', message: 'type must be "movie" or "tv"' });
    }

    // Check if already requested globally
    const existing = db.prepare('SELECT id, user_id FROM requests WHERE tmdb_id = ? AND type = ?').get(tmdb_id, type);
    if (existing) {
      if (existing.user_id === user_id) {
        return res.status(400).json({ status: 'error', message: 'You have already requested this item' });
      }
      return res.status(400).json({ status: 'error', message: 'This item has already been requested by another user' });
    }

    // Check if it's already in the library
    const inLibrary = type === 'movie'
      ? db.prepare('SELECT id FROM movies WHERE tmdb_id = ?').get(tmdb_id)
      : db.prepare('SELECT id FROM shows WHERE tmdb_id = ?').get(tmdb_id);
    if (inLibrary) {
      return res.status(409).json({ status: 'error', message: 'This item is already in your library' });
    }

    let requestId;
    try {
      const result = db.prepare("INSERT INTO requests (user_id, tmdb_id, type, title, status, release_date, poster_path) VALUES (?, ?, ?, ?, 'pending', ?, ?)").run(
        user_id, tmdb_id, type, title, release_date || null, poster_path || null
      );
      requestId = result.lastInsertRowid;
    } catch (insertErr) {
      // Unique index race: another request for the same item slipped in first
      if (String(insertErr.code || '').startsWith('SQLITE_CONSTRAINT')) {
        return res.status(400).json({ status: 'error', message: 'This item has already been requested' });
      }
      throw insertErr;
    }

    // Send notification if enabled
    const notifyOnRequest = getSetting('notifyOnRequest') === 'true';
    if (notifyOnRequest) {
      const user = db.prepare('SELECT username FROM users WHERE id = ?').get(user_id);
      const username = user ? user.username : 'A user';
      notificationService.sendNotification(
        'New Request', 
        `${username} requested ${title}`, 
        { type, poster: poster_path }
      ).catch(err => console.error('[NotificationService] Request notification failed:', err.message));
    }

    res.json({ status: 'success', message: 'Request submitted successfully', data: { id: requestId } });
  } catch (err) {
    next(err);
  }
});

// PUT /api/requests/:id/approve (Admin only)
router.put('/:id/approve', requireAdmin, async (req, res, next) => {
  try {
    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
    if (!request) return res.status(404).json({ status: 'error', message: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ status: 'error', message: `Only pending requests can be approved (current status: ${request.status})` });
    }

    // If it's not in the library, we need to add it. But adding it requires quality profiles and path!
    // Often admins want to choose the path/profile when approving. 
    // We will just change status to "approved" here and let the frontend prompt the "Add Library Item" modal.
    // The frontend can call the standard library add route, and then call this endpoint.
    
    db.prepare("UPDATE requests SET status = 'approved' WHERE id = ?").run(req.params.id);
    res.json({ status: 'success', message: 'Request approved' });
  } catch (err) {
    next(err);
  }
});

// PUT /api/requests/:id/deny (Admin only)
router.put('/:id/deny', requireAdmin, (req, res, next) => {
  try {
    const request = db.prepare('SELECT status FROM requests WHERE id = ?').get(req.params.id);
    if (!request) return res.status(404).json({ status: 'error', message: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ status: 'error', message: `Only pending requests can be denied (current status: ${request.status})` });
    }
    db.prepare("UPDATE requests SET status = 'denied' WHERE id = ?").run(req.params.id);
    res.json({ status: 'success', message: 'Request denied' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/requests/:id
router.delete('/:id', (req, res, next) => {
  try {
    const request = db.prepare('SELECT user_id FROM requests WHERE id = ?').get(req.params.id);
    if (!request) return res.status(404).json({ status: 'error', message: 'Request not found' });

    if (req.user?.role !== 'admin' && request.user_id !== req.user?.id) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' });
    }

    db.prepare('DELETE FROM requests WHERE id = ?').run(req.params.id);
    res.json({ status: 'success', message: 'Request deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
