const express = require('express');
const router = express.Router();
const taskRegistry = require('../services/taskRegistry');

router.get('/', (req, res) => {
  try {
    const tasks = taskRegistry.getAllTasks();
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
