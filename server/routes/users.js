const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/database');
const userProvisioningService = require('../services/userProvisioningService');
const presenceTracker = require('../services/presenceTracker');
const requireAdmin = require('../middleware/requireAdmin');

const hashPassword = (password) => bcrypt.hash(password, 12);

// GET /api/users
router.get('/', requireAdmin, (req, res, next) => {
  try {
    const users = db.prepare('SELECT id, username, email, role, origin, created_at, last_login FROM users').all();
    const data = users.map(u => ({
      ...u,
      created_at: u.created_at ? new Date(u.created_at + 'Z').toISOString() : null,
      last_login: u.last_login ? new Date(u.last_login + 'Z').toISOString() : null,
      online: presenceTracker.isOnline(u.id)
    }));
    res.json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/import
router.post('/import', requireAdmin, async (req, res, next) => {
  try {
    const result = await userProvisioningService.importUsers();
    res.json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/users
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { username, password, email, role, autoCreateMedia } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ status: 'error', message: 'Username and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ status: 'error', message: 'Password must be at least 8 characters' });
    }

    if (role && !['admin', 'user'].includes(role)) {
      return res.status(400).json({ status: 'error', message: 'Role must be "admin" or "user"' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ status: 'error', message: 'Username already exists' });
    }

    const hashed = await hashPassword(password);
    const result = db.prepare('INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)').run(
      username, hashed, email || null, role || 'user'
    );

    let provisionResults = null;
    if (autoCreateMedia) {
      provisionResults = await userProvisioningService.provisionUser(username, password, email);
    }

    res.json({ 
      status: 'success', 
      message: 'User created successfully',
      data: { id: result.lastInsertRowid, username, email, role, provisionResults }
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id
router.delete('/:id', requireAdmin, (req, res, next) => {
  try {
    const { id } = req.params;
    
    const user = db.prepare('SELECT username, role FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    db.transaction(() => {
      if (user.role === 'admin') {
        const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get().count;
        if (adminCount <= 1) {
          throw new Error('Cannot delete the only remaining admin');
        }
      }
      // Also delete orphaned requests automatically by foreign key CASCADE, but just to be sure we do the user delete here
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
    })();

    res.json({ status: 'success', message: 'User deleted' });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/:id
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { username, password, email, role } = req.body;

    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    if (!username) {
      return res.status(400).json({ status: 'error', message: 'Username is required' });
    }

    if (role !== undefined && !['admin', 'user'].includes(role)) {
      return res.status(400).json({ status: 'error', message: 'Role must be "admin" or "user"' });
    }

    // Check for username collision
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, id);
    if (existing) {
      return res.status(400).json({ status: 'error', message: 'Username already taken' });
    }

    try {
      let hashed = null;
      if (password) {
        if (password.length < 8) {
          return res.status(400).json({ status: 'error', message: 'Password must be at least 8 characters' });
        }
        hashed = await bcrypt.hash(password, 12);
      }

      // Preserve the existing role when the request omits it (e.g. profile-only edits)
      const effectiveRole = role !== undefined ? role : user.role;

      db.transaction(() => {
        // Prevent changing role if it's the last admin
        if (user.role === 'admin' && effectiveRole !== 'admin') {
          const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get().count;
          if (adminCount <= 1) {
            throw new Error('Cannot demote the only remaining admin');
          }
        }

        if (password && hashed) {
          // If password is changed, invalidate tokens by incrementing jwt_version
          db.prepare('UPDATE users SET username = ?, password = ?, email = ?, role = ?, jwt_version = jwt_version + 1 WHERE id = ?').run(
            username, hashed, email || null, effectiveRole, id
          );
        } else {
          db.prepare('UPDATE users SET username = ?, email = ?, role = ? WHERE id = ?').run(
            username, email || null, effectiveRole, id
          );
        }
      })();
    } catch (txErr) {
      return res.status(400).json({ status: 'error', message: txErr.message });
    }

    res.json({ status: 'success', message: 'User updated successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
