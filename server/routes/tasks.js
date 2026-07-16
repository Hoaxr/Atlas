const express = require('express');
const router = express.Router();
const taskRegistry = require('../services/taskRegistry');

const db = require('../config/database');

router.get('/', (req, res) => {
  try {
    let tasks = taskRegistry.getAllTasks();
    
    // Hide auto-delete watched if not enabled
    const enabledRow = db.prepare("SELECT value FROM settings WHERE key = ?").get('autoDeleteWatchedEnabled');
    if (!enabledRow || enabledRow.value !== 'true') {
      tasks = tasks.filter(t => t.id !== 'auto_delete_watched');
    }
    
    res.json({ status: 'success', data: tasks });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.post('/:id/run', async (req, res) => {
  try {
    const taskId = req.params.id;
    // We run it asynchronously and immediately respond
    taskRegistry.executeTask(taskId).catch(err => console.error(err));
    res.json({ status: 'success', message: 'Task triggered' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
