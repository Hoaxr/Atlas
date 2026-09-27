const test = require('node:test');
const assert = require('node:assert');
const db = require('../server/config/database');
const tmdbService = require('../server/services/tmdbService');
const cleanupWorker = require('../server/services/cleanupWorker');

test('Cleanup Candidates & Franchise Protection System', async (t) => {
  const origGetMovieById = tmdbService.getMovieById;
  tmdbService.getMovieById = async (id) => {
    if (id === 98001) return { vote_average: 8.2, belongs_to_collection: { id: 2344, name: 'The Matrix Collection' } };
    if (id === 98002) return { vote_average: 5.8, belongs_to_collection: null };
    if (id === 98003) return { vote_average: 6.3, belongs_to_collection: null };
    if (id === 98004) return { vote_average: 6.1, belongs_to_collection: null };
    return null;
  };

  t.after(() => {
    tmdbService.getMovieById = origGetMovieById;
    db.prepare('DELETE FROM movie_collections WHERE movie_id >= 98000').run();
    db.prepare('DELETE FROM movies WHERE id >= 98000').run();
  });

  // Clean any prior remnants
  db.prepare('DELETE FROM movie_collections WHERE movie_id >= 98000').run();
  db.prepare('DELETE FROM movies WHERE id >= 98000').run();

  await t.test('The Matrix Resurrections and The Matrix are detected as a franchise and excluded', async () => {
    db.prepare(`
      INSERT INTO movies (id, tmdb_id, title, year, status, rating, ignore_cleanup)
      VALUES (98001, 98001, 'The Matrix', 1999, 'downloaded', 8.2, 0)
    `).run();

    db.prepare(`
      INSERT INTO movies (id, tmdb_id, title, year, status, rating, ignore_cleanup)
      VALUES (98002, 98002, 'The Matrix Resurrections', 2021, 'downloaded', 5.8, 0)
    `).run();

    try {
      await cleanupWorker.calculateDeletable();
      const candidates = cleanupWorker.getCandidates();

      const matrixResurrections = candidates.all.find(m => m.id === 98002);
      assert.strictEqual(matrixResurrections, undefined, 'The Matrix Resurrections must NOT appear in Cleanup Candidates because it belongs to The Matrix franchise');
    } finally {
      db.prepare('DELETE FROM movies WHERE id IN (98001, 98002)').run();
    }
  });

  await t.test('Hackers and Takedown/Takeover franchise is detected and excluded', async () => {
    db.prepare(`
      INSERT INTO movies (id, tmdb_id, title, year, status, rating, ignore_cleanup)
      VALUES (98003, 98003, 'Hackers', 1995, 'downloaded', 6.3, 0)
    `).run();

    db.prepare(`
      INSERT INTO movies (id, tmdb_id, title, year, status, rating, ignore_cleanup)
      VALUES (98004, 98004, 'Takedown', 2000, 'downloaded', 6.1, 0)
    `).run();

    try {
      await cleanupWorker.calculateDeletable();
      const candidates = cleanupWorker.getCandidates();

      const hackers = candidates.all.find(m => m.id === 98003);
      const takedown = candidates.all.find(m => m.id === 98004);
      assert.strictEqual(hackers, undefined, 'Hackers must NOT appear in Cleanup Candidates');
      assert.strictEqual(takedown, undefined, 'Takedown must NOT appear in Cleanup Candidates');
    } finally {
      db.prepare('DELETE FROM movies WHERE id IN (98003, 98004)').run();
    }
  });

  await t.test('Movies in Atlas user collections are excluded from cleanup candidates', async () => {
    db.prepare(`
      INSERT INTO movies (id, tmdb_id, title, year, status, rating, ignore_cleanup)
      VALUES (98005, 98005, 'Standalone Low Rating Movie', 2018, 'downloaded', 4.2, 0)
    `).run();

    const collRes = db.prepare("INSERT INTO collections (name, color) VALUES ('Test Coll', '#06b6d4')").run();
    const collId = collRes.lastInsertRowid;
    db.prepare('INSERT INTO movie_collections (movie_id, collection_id) VALUES (98005, ?)').run(collId);

    try {
      await cleanupWorker.calculateDeletable();
      const candidates = cleanupWorker.getCandidates();

      const movieInColl = candidates.all.find(m => m.id === 98005);
      assert.strictEqual(movieInColl, undefined, 'Movie in Atlas collection must NOT appear in Cleanup Candidates');
    } finally {
      db.prepare('DELETE FROM movie_collections WHERE movie_id = 98005').run();
      db.prepare('DELETE FROM collections WHERE id = ?').run(collId);
      db.prepare('DELETE FROM movies WHERE id = 98005').run();
    }
  });

  await t.test('Movies marked with ignore_cleanup = 1 are excluded from cleanup candidates', async () => {
    db.prepare(`
      INSERT INTO movies (id, tmdb_id, title, year, status, rating, ignore_cleanup)
      VALUES (98006, 98006, 'Ignored Movie', 2020, 'downloaded', 4.0, 1)
    `).run();

    try {
      await cleanupWorker.calculateDeletable();
      const candidates = cleanupWorker.getCandidates();

      const ignored = candidates.all.find(m => m.id === 98006);
      assert.strictEqual(ignored, undefined, 'Movie with ignore_cleanup=1 must not appear in Cleanup Candidates');
    } finally {
      db.prepare('DELETE FROM movies WHERE id = 98006').run();
    }
  });

  await t.test('Real user database Matrix and Hackers/Takedown records are excluded from cleanup', async () => {
    await cleanupWorker.calculateDeletable();
    const candidates = cleanupWorker.getCandidates();

    const realMatrixResurrections = candidates.all.find(m => m.id === 927 || (m.title && m.title.includes('Matrix Resurrections')));
    const realHackers = candidates.all.find(m => m.id === 317 || m.title === 'Hackers');
    const realTakedown = candidates.all.find(m => m.id === 777 || m.title === 'Takedown');

    assert.strictEqual(realMatrixResurrections, undefined, 'Real Matrix Resurrections must not be in candidates');
    assert.strictEqual(realHackers, undefined, 'Real Hackers must not be in candidates');
    assert.strictEqual(realTakedown, undefined, 'Real Takedown must not be in candidates');
  });
});
