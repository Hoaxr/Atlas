const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Get all release profiles
router.get('/', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM release_profiles');
    const profiles = stmt.all().map(p => ({
      ...p,
      enabled: Boolean(p.enabled),
      must_contain: JSON.parse(p.must_contain || '[]'),
      must_not_contain: JSON.parse(p.must_not_contain || '[]')
    }));
    res.json(profiles);
  } catch (error) {
    console.error('Error fetching release profiles:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a release profile
router.post('/', (req, res) => {
  try {
    const { name, enabled, must_contain, must_not_contain, indexer_id, apply_to } = req.body;
    const stmt = db.prepare(`
      INSERT INTO release_profiles (name, enabled, must_contain, must_not_contain, indexer_id, apply_to)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      name || 'New Profile',
      enabled ? 1 : 0,
      JSON.stringify(must_contain || []),
      JSON.stringify(must_not_contain || []),
      indexer_id || null,
      apply_to || 'all'
    );
    res.json({ id: info.lastInsertRowid });
  } catch (error) {
    console.error('Error creating release profile:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update a release profile
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, enabled, must_contain, must_not_contain, indexer_id, apply_to } = req.body;
    const stmt = db.prepare(`
      UPDATE release_profiles 
      SET name = ?, enabled = ?, must_contain = ?, must_not_contain = ?, indexer_id = ?, apply_to = ?
      WHERE id = ?
    `);
    stmt.run(
      name,
      enabled ? 1 : 0,
      JSON.stringify(must_contain || []),
      JSON.stringify(must_not_contain || []),
      indexer_id || null,
      apply_to || 'all',
      id
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating release profile:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a release profile
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM release_profiles WHERE id = ?');
    stmt.run(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting release profile:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
