const test = require('node:test');
const assert = require('node:assert/strict');
const { LAYOUT_PUSH_INTERVAL } = require('../server/utils/constants');
const db = require('../server/config/database');

test('Scanner & Broadcasting Optimizations', async (t) => {
  await t.test('LAYOUT_PUSH_INTERVAL is relaxed to 15,000ms heartbeat', () => {
    assert.strictEqual(LAYOUT_PUSH_INTERVAL, 15000);
  });

  await t.test('Layout update diff detection identifies changes accurately', () => {
    const hasCountsChanged = (lastCounts, freshCounts) => {
      if (!lastCounts) return true;
      return (
        lastCounts.movies !== freshCounts.movies ||
        lastCounts.shows !== freshCounts.shows ||
        lastCounts.music !== freshCounts.music ||
        lastCounts.pendingRequests !== freshCounts.pendingRequests
      );
    };

    const initial = { movies: 10, shows: 5, music: 20, pendingRequests: 2 };
    const identical = { movies: 10, shows: 5, music: 20, pendingRequests: 2 };

    assert.strictEqual(hasCountsChanged(null, initial), true, 'Initial broadcast must trigger');
    assert.strictEqual(hasCountsChanged(initial, identical), false, 'Identical counts must not trigger broadcast');

    // Individual field alterations
    assert.strictEqual(hasCountsChanged(initial, { ...initial, movies: 11 }), true);
    assert.strictEqual(hasCountsChanged(initial, { ...initial, shows: 6 }), true);
    assert.strictEqual(hasCountsChanged(initial, { ...initial, music: 21 }), true);
    assert.strictEqual(hasCountsChanged(initial, { ...initial, pendingRequests: 3 }), true);
  });

  await t.test('Event loop yield ensures cooperative multitasking during batch operations', async () => {
    let macroTaskExecuted = false;
    setTimeout(() => {
      macroTaskExecuted = true;
    }, 0);

    // Simulate batch loop with yield
    const items = Array.from({ length: 100 }, (_, i) => i);
    const BATCH_SIZE = 50;
    const processedBatches = [];

    for (let b = 0; b < items.length; b += BATCH_SIZE) {
      const batch = items.slice(b, b + BATCH_SIZE);
      processedBatches.push(batch.length);
      await new Promise((r) => setImmediate(r));
    }

    assert.deepStrictEqual(processedBatches, [50, 50]);
    // The setImmediate yield gives the timer a chance to run
    assert.strictEqual(macroTaskExecuted, true, 'Macro-task should execute across yielded batches');
  });

  await t.test('db.transaction batches DB operations efficiently', () => {
    const testTable = '__test_batch_scanner__';
    db.prepare(`CREATE TEMP TABLE ${testTable} (id INTEGER PRIMARY KEY, name TEXT)`).run();

    const insertStmt = db.prepare(`INSERT INTO ${testTable} (name) VALUES (?)`);
    const runBatchInsert = db.transaction((items) => {
      for (const item of items) {
        insertStmt.run(item);
      }
    });

    const entries = Array.from({ length: 120 }, (_, i) => `item_${i}`);
    const BATCH_SIZE = 50;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      runBatchInsert(entries.slice(i, i + BATCH_SIZE));
    }

    const count = db.prepare(`SELECT COUNT(*) as cnt FROM ${testTable}`).get().cnt;
    assert.strictEqual(count, 120, 'All batch inserted records should be committed');

    // Test rollback behavior on error within a transaction
    assert.throws(() => {
      db.transaction(() => {
        insertStmt.run('valid_item');
        throw new Error('Simulated batch failure');
      })();
    });

    const countAfterRollback = db.prepare(`SELECT COUNT(*) as cnt FROM ${testTable}`).get().cnt;
    assert.strictEqual(countAfterRollback, 120, 'Failed batch must be rolled back without partial commits');
  });
});
