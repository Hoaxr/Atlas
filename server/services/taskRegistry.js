const cronParser = require('cron-parser');

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
    nextRun: getNextRun(cronExpression),
    lastMessage: ''
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
    tasks[id].status = status;
    tasks[id].lastMessage = message;
    if (status === 'idle') {
      tasks[id].lastRun = new Date();
      tasks[id].nextRun = getNextRun(tasks[id].cronExpression);
    }
  }
};

const executeTask = async (id) => {
  const task = tasks[id];
  if (!task || task.status === 'running') return;

  try {
    updateTaskStatus(id, 'running', 'Task started');
    await task.executeFn();
    updateTaskStatus(id, 'idle', 'Task completed successfully');
  } catch (err) {
    updateTaskStatus(id, 'error', `Failed: ${err.message}`);
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
