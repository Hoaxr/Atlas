const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../data/database.sqlite'));
db.exec(
  'CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)'
);

module.exports = db;
