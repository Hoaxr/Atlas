const cronParser = require('cron-parser');
const eventBus = require('./eventBus');

const tasks = {};

const registerTask = (id, name, description, cronExpression, executeFn) => {
  tasks[id] = {
    id,
    name,
    description,
    cronExpression,
    executeFn,
    status: 'idle', // idle, running, error
    lastRun: null,
    lastRunDuration: null, // in milliseconds
    nextRun: getNextRun(cronExpression),
    lastMessage: '',
    startedAt: null
  };
};

const getNextRun = (cronExpression) => {
  try {
    const parseFn = cronParser.parseExpression || (cronParser.CronExpressionParser && cronParser.CronExpressionParser.parse);
    const interval = parseFn(cronExpression);
    return interval.next().toDate();
  } catch (err) {
    console.error('Cron parsing error:', err.message);
    return null;
  }
};

const updateTaskStatus = (id, status, message = '') => {
  if (tasks[id]) {
    const now = new Date();
    tasks[id].status = status;
    tasks[id].lastMessage = message;
    if (status === 'running') {
      tasks[id].startedAt = now;
    }
    if (status === 'idle' || status === 'error') {
      if (tasks[id].startedAt) {
        tasks[id].lastRunDuration = now - tasks[id].startedAt;
        tasks[id].startedAt = null;
      }
      tasks[id].lastRun = now;
      tasks[id].nextRun = getNextRun(tasks[id].cronExpression);
  
    }
  }
};

const executeTask = async (id) => {
  const task = tasks[id];
  if (!task || task.status === 'running') return;

  try {
    updateTaskStatus(id, 'running', 'Task started');
    eventBus.info(`Task started: ${task.name}`);
    await task.executeFn();
    updateTaskStatus(id, 'idle', 'Task completed successfully');
    eventBus.success(`Task completed: ${task.name}`);
  } catch (err) {
    updateTaskStatus(id, 'error', `Failed: ${err.message}`);
    eventBus.error(`Task failed: ${task.name} — ${err.message}`);
    // Reset to idle after a while so it can run again
    setTimeout(() => updateTaskStatus(id, 'idle', 'Reset after error'), 10000);
  }
};

const getAllTasks = () => {
  return Object.values(tasks);
};

module.exports = {
  registerTask,
  updateTaskStatus,
  executeTask,
  getAllTasks
};
