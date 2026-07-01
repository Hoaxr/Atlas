const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/database');
const userProvisioningService = require('../services/userProvisioningService');

const hashPassword = (password) => bcrypt.hash(password, 12);

// Middleware to ensure admin role for user management
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ status: 'error', message: 'Forbidden: Admins only' });
  }
  next();
};

// GET /api/users
router.get('/', requireAdmin, (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, email, role, origin, created_at FROM users').all();
    res.json({ status: 'success', data: users });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// POST /api/users/import
router.post('/import', requireAdmin, async (req, res) => {
  try {
    const result = await userProvisioningService.importUsers();
    res.json({ status: 'success', data: result });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// POST /api/users
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { username, password, email, role, autoCreateMedia } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ status: 'error', message: 'Username and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ status: 'error', message: 'Password must be at least 8 characters' });
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
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// DELETE /api/users/:id
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    
    const user = db.prepare('SELECT username, role FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    // Optional: Prevent deleting the last admin
    if (user.role === 'admin') {
      const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get().count;
      if (adminCount <= 1) {
        return res.status(400).json({ status: 'error', message: 'Cannot delete the only remaining admin' });
      }
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ status: 'success', message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// PUT /api/users/:id
router.put('/:id', requireAdmin, async (req, res) => {
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

    // Check for username collision
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, id);
    if (existing) {
      return res.status(400).json({ status: 'error', message: 'Username already taken' });
    }

    // Prevent changing role if it's the last admin
    if (user.role === 'admin' && role !== 'admin') {
      const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get().count;
      if (adminCount <= 1) {
        return res.status(400).json({ status: 'error', message: 'Cannot demote the only remaining admin' });
      }
    }

    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ status: 'error', message: 'Password must be at least 8 characters' });
      }
      const hashed = await hashPassword(password);
      db.prepare('UPDATE users SET username = ?, password = ?, email = ?, role = ? WHERE id = ?').run(
        username, hashed, email || null, role || 'user', id
      );
    } else {
      db.prepare('UPDATE users SET username = ?, email = ?, role = ? WHERE id = ?').run(
        username, email || null, role || 'user', id
      );
    }

    res.json({ status: 'success', message: 'User updated successfully' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
