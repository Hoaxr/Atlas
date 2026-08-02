const db = require('better-sqlite3')(':memory:');
db.exec('CREATE TABLE episodes (id INTEGER);');
try {
  db.exec('BEGIN TRANSACTION;');
  db.exec('ALTER TABLE episodes ADD COLUMN watched INTEGER DEFAULT 0;');
  db.exec('INSERT INTO episodes (id, watched) VALUES (1, 1);');
  db.exec('SELECT * FROM episodes e WHERE e.watched = 1;');
  db.exec('COMMIT;');
  console.log("Success");
} catch (e) {
  console.log("Error:", e.message);
}
