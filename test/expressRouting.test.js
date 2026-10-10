const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('../server/node_modules/express');

test('Express 5 Wildcard & Splat Routing Verification', async (t) => {
  await t.test('Express 5 accepts {/*splat} syntax without path-to-regexp errors', () => {
    const app = express();

    // In Express 5 / path-to-regexp v8, wildcards use {/*splat} or {*path}
    assert.doesNotThrow(() => {
      app.get('{/*splat}', (req, res) => {
        res.status(200).send('SPA fallback');
      });
    });
  });

  await t.test('Express 5 app accurately dispatches route handlers', async () => {
    const app = express();
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', version: 5 });
    });

    const server = app.listen(0);
    const port = server.address().port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      assert.strictEqual(response.status, 200);
      const json = await response.json();
      assert.strictEqual(json.status, 'ok');
      assert.strictEqual(json.version, 5);
    } finally {
      server.close();
    }
  });
});
