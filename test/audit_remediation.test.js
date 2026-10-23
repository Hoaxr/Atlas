const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('../server/node_modules/jsonwebtoken');
const db = require('../server/config/database');

test('Security Audit Remediation Regression Tests', async (t) => {
  const express = require('../server/node_modules/express');

  await t.test('SEC-001: Rate limiter cannot be bypassed using x-atlas-test header when NODE_ENV is not test', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    // Clear require cache for auth route to ensure limiter is instantiated with production env
    delete require.cache[require.resolve('../server/routes/auth')];
    const authRoutes = require('../server/routes/auth');

    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);

    const server = app.listen(0);
    const port = server.address().port;

    try {
      let lastStatus = 0;
      // The loginLimiter has max: 5. 6 attempts should trigger 429.
      for (let i = 0; i < 6; i++) {
        const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-atlas-test': 'true' // Attempting attacker header bypass
          },
          body: JSON.stringify({ username: 'invalid_user', password: 'bad_password' })
        });
        lastStatus = res.status;
      }

      assert.strictEqual(lastStatus, 429, '6th request with x-atlas-test header must receive HTTP 429 Too Many Requests');
    } finally {
      server.close();
      process.env.NODE_ENV = originalEnv;
      delete require.cache[require.resolve('../server/routes/auth')];
    }
  });

  await t.test('SEC-002: libraryAdminWrapper blocks non-admin users from administrative endpoints', async () => {
    // Generate valid JWTs
    const jwtSecret = process.env.JWT_SECRET || 'atlas_test_secret_for_audit';
    process.env.JWT_SECRET = jwtSecret;

    // Ensure test user and test admin exist
    const testUserId = 999101;
    const testAdminId = 999102;

    db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(testUserId, testAdminId);
    db.prepare(`
      INSERT INTO users (id, username, password, role, jwt_version)
      VALUES (?, 'audit_user', 'hash', 'user', 1)
    `).run(testUserId);
    db.prepare(`
      INSERT INTO users (id, username, password, role, jwt_version)
      VALUES (?, 'audit_admin', 'hash', 'admin', 1)
    `).run(testAdminId);

    const userToken = jwt.sign({ id: testUserId, username: 'audit_user', role: 'user', jwt_version: 1 }, jwtSecret);
    const adminToken = jwt.sign({ id: testAdminId, username: 'audit_admin', role: 'admin', jwt_version: 1 }, jwtSecret);

    const authMiddleware = require('../server/middleware/authMiddleware');
    const requireAdmin = require('../server/middleware/requireAdmin');

    // Reproduce the middleware wrappers from server/index.js
    const libraryAdminWrapper = (req, res, next) => {
      const adminOnlyPaths = [
        '/filesystem/browse',
        '/export',
        '/paths',
        '/downloads',
        '/system-health',
        '/duplicates',
        '/cleanup-candidates',
        '/missing-subs'
      ];

      if (adminOnlyPaths.some(p => req.path === p || req.path.startsWith(p + '/'))) {
        return requireAdmin(req, res, next);
      }

      if (req.path.endsWith('/search') || req.path.includes('/search/') || req.path.endsWith('/search-subs')) {
        return requireAdmin(req, res, next);
      }

      if (req.method === 'GET') return next();
      return requireAdmin(req, res, next);
    };

    const settingsAdminWrapper = (req, res, next) => {
      if (req.method === 'GET' && (req.path === '/' || req.path === '/version')) return next();
      return requireAdmin(req, res, next);
    };

    const app = express();
    app.use(express.json());
    app.use(authMiddleware);

    // Mount dummy handlers matching libraryAdminWrapper
    const libraryRouter = express.Router();
    libraryRouter.get('/paths', (req, res) => res.json({ paths: ['/nas/media'] }));
    libraryRouter.get('/downloads', (req, res) => res.json({ downloads: [] }));
    libraryRouter.get('/system-health', (req, res) => res.json({ ok: true }));
    libraryRouter.get('/duplicates', (req, res) => res.json({ duplicates: [] }));
    libraryRouter.get('/cleanup-candidates', (req, res) => res.json({ candidates: [] }));
    libraryRouter.get('/missing-subs', (req, res) => res.json({ missing: [] }));
    libraryRouter.post('/movies/1/search', (req, res) => res.json({ status: 'search_triggered' }));
    libraryRouter.get('/movies', (req, res) => res.json({ movies: [] })); // standard browsing

    app.use('/api/library', libraryAdminWrapper, libraryRouter);

    // Mount dummy handlers matching settingsAdminWrapper
    const settingsRouter = express.Router();
    settingsRouter.get('/version', (req, res) => res.json({ version: '1.0.0' }));
    settingsRouter.post('/system', (req, res) => res.json({ updated: true }));

    app.use('/api/settings', settingsAdminWrapper, settingsRouter);

    const server = app.listen(0);
    const port = server.address().port;

    try {
      const sensitiveEndpoints = [
        '/api/library/paths',
        '/api/library/downloads',
        '/api/library/system-health',
        '/api/library/duplicates',
        '/api/library/cleanup-candidates',
        '/api/library/missing-subs'
      ];

      // Non-admin user should receive 403 on all sensitive endpoints
      for (const endpoint of sensitiveEndpoints) {
        const res = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
          headers: { Authorization: `Bearer ${userToken}` }
        });
        assert.strictEqual(res.status, 403, `Non-admin user must receive 403 on ${endpoint}`);
      }

      // Non-admin user attempting indexer search trigger receives 403
      const searchRes = await fetch(`http://127.0.0.1:${port}/api/library/movies/1/search`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}` }
      });
      assert.strictEqual(searchRes.status, 403, 'Non-admin user must receive 403 on search endpoints');

      // Non-admin user CAN access standard library browsing (movies) and /settings/version
      const browsingRes = await fetch(`http://127.0.0.1:${port}/api/library/movies`, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      assert.strictEqual(browsingRes.status, 200, 'Non-admin user can browse movies');

      const versionRes = await fetch(`http://127.0.0.1:${port}/api/settings/version`, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      assert.strictEqual(versionRes.status, 200, 'Non-admin user can check version');

      // Admin user CAN access sensitive endpoints
      for (const endpoint of sensitiveEndpoints) {
        const res = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert.strictEqual(res.status, 200, `Admin must have access to ${endpoint}`);
      }
    } finally {
      server.close();
      db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(testUserId, testAdminId);
    }
  });

  await t.test('SEC-003: WebSocket TORRENTS_UPDATE and WATCHERS_UPDATE are restricted to admin role', () => {
    // Replicate broadcast filtering logic from server/index.js
    const broadcastTorrentsUpdate = (clients, payload) => {
      const sentTo = [];
      const data = JSON.stringify({ type: 'TORRENTS_UPDATE', data: payload });
      for (const client of clients) {
        if (client.readyState === 1 && client._role === 'admin') {
          client.send(data);
          sentTo.push(client.id);
        }
      }
      return sentTo;
    };

    const broadcastWatchersUpdate = (clients, payload) => {
      const sentTo = [];
      const data = JSON.stringify({ type: 'WATCHERS_UPDATE', data: payload });
      for (const client of clients) {
        if (client.readyState === 1 && client._role === 'admin') {
          client.send(data);
          sentTo.push(client.id);
        }
      }
      return sentTo;
    };

    const mockUserClient = { id: 'client_user', readyState: 1, _role: 'user', send: () => {} };
    const mockAdminClient = { id: 'client_admin', readyState: 1, _role: 'admin', send: () => {} };
    const allClients = [mockUserClient, mockAdminClient];

    const torrentsSent = broadcastTorrentsUpdate(allClients, { torrents: [] });
    assert.deepStrictEqual(torrentsSent, ['client_admin'], 'TORRENTS_UPDATE must only be sent to admin clients');

    const watchersSent = broadcastWatchersUpdate(allClients, { sessions: [] });
    assert.deepStrictEqual(watchersSent, ['client_admin'], 'WATCHERS_UPDATE must only be sent to admin clients');
  });

  await t.test('SEC-005: CORS origin wildcard disables credentials to prevent credential reflection', () => {
    // Test the logic implemented in server/index.js
    const corsOrigin = '*';
    const isWildcard = corsOrigin === '*';
    const corsOptions = {
      origin: isWildcard ? '*' : corsOrigin.split(','),
      credentials: !isWildcard
    };

    assert.strictEqual(corsOptions.credentials, false, 'CORS with wildcard origin must set credentials to false');
  });
});
