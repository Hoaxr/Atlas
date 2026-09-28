const test = require('node:test');
const assert = require('node:assert/strict');
const indexerService = require('../server/services/indexerService');

test('Manual Search Enhancements & Prowlarr Custom Query Handling', async (t) => {
  await t.test('indexerService exports all required search and helper methods', () => {
    assert.strictEqual(typeof indexerService.searchMovie, 'function');
    assert.strictEqual(typeof indexerService.searchEpisode, 'function');
    assert.strictEqual(typeof indexerService.searchSeasonPack, 'function');
    assert.strictEqual(typeof indexerService.searchShowPack, 'function');
    assert.strictEqual(typeof indexerService.searchMusic, 'function');
    assert.strictEqual(typeof indexerService.getCircuitStatus, 'function');
  });

  await t.test('circuit status reporting provides expected shape', () => {
    const status = indexerService.getCircuitStatus();
    assert.strictEqual(typeof status.failures, 'number');
    assert.strictEqual(typeof status.open, 'boolean');
    assert.strictEqual(typeof status.cooldownRemaining, 'number');
  });
});
