# SECURITY AUDIT REPORT — ATLAS MEDIA MANAGER

**Date:** 2026-10-23  
**Target:** Atlas (Public GitHub Repository)  
**Assessor:** Senior Application Security & DevSecOps Engineer  
**Scope:** Full codebase review (Client, Server, Docker, CI/CD, Dependencies, Git history)  
**Branch Audited:** `security-audit` (derived from `main`)  
**Status:** All identified vulnerabilities have been remediated and verified with automated regression tests.

---

## 1. Executive Summary & Overall Risk Assessment

A comprehensive security audit of the Atlas codebase was performed simulating an external adversary analyzing the publicly accessible GitHub repository.

### Summary of Posture:
- **Strong Areas:** 
  - Parameterized SQLite queries are used across the codebase (`better-sqlite3`), preventing SQL injection.
  - Command execution paths (`child_process.execFile`) strictly use argument arrays with path resolution and `--` argument boundaries, mitigating shell injection.
  - Path traversal is consistently mitigated in media and subtitle file reading routines via `path.basename()` and containment checks (`isPathContainedInLibrary`, `getSafeFilePath`).
  - SSRF protection in `imageService.js` includes robust private IP validation and DNS resolution checks for both IPv4 and IPv6.
  - Secret masking is in place for sensitive configuration keys when returned by the API to non-admin users.
  - Docker deployment drops privileges from root to a designated user (`su-exec` to PUID/PGID).

- **Identified Weaknesses & Remediation Status:**
  1. **Header-Based Authentication Rate Limit Bypass (`SEC-001` - HIGH):** **REMEDIATED & VERIFIED**. Removed `x-atlas-test` header bypass condition in `server/routes/auth.js`.
  2. **Information Disclosure & Broken Access Control on Library Endpoints (`SEC-002` - HIGH):** **REMEDIATED & VERIFIED**. Updated `libraryAdminWrapper` in `server/index.js` to strictly enforce `requireAdmin` across administrative endpoints (`/paths`, `/downloads`, `/system-health`, `/duplicates`, `/cleanup-candidates`, `/missing-subs`, and `/search` indexer endpoints).
  3. **WebSocket Information Leak to Non-Admin Users (`SEC-003` - MEDIUM):** **REMEDIATED & VERIFIED**. Updated WebSocket broadcast logic in `server/index.js` so `TORRENTS_UPDATE` and `WATCHERS_UPDATE` events are exclusively sent to authenticated sessions with `client._role === 'admin'`.
  4. **Third-Party Dependency Vulnerabilities (`SEC-004` - MEDIUM):** **REMEDIATED & VERIFIED**. Executed `npm audit fix` in both `server/` and `client/`. Resolved vulnerabilities in `follow-redirects` and `ip-address`. Both packages now audit cleanly at 0 vulnerabilities.
  5. **CORS Credential Reflection when Origin is Wildcard (`SEC-005` - MEDIUM):** **REMEDIATED & VERIFIED**. Updated CORS configuration in `server/index.js` to automatically set `credentials: false` whenever `CORS_ORIGIN=*` is used.
  6. **Ephemeral Unit Test Failure (`SEC-006` - LOW):** **REMEDIATED & VERIFIED**. Refactored `test/auth.test.js` to spin up an in-process ephemeral Express server (`app.listen(0)`), ensuring 100% deterministic test execution in CI/CD environments.

**Overall Risk Level:** **LOW** (Reduced from **MEDIUM-HIGH** after applying and verifying all remediations).

---

## 2. Project Architecture & Attack Surface

- **Runtime & Stack:** Node.js (v22), Express.js (v5), SQLite (`better-sqlite3`), React + Tailwind CSS (v4), Vite.
- **Entry Points:**
  - HTTP REST API (`/api/*`) on port 9898 (Docker) / 3000 (dev).
  - WebSocket Server (`/ws`) for push events.
  - External Webhook (`/api/webhooks/download-client`) with token authentication.
  - Static SPA client fallback (`/*`).
- **Authentication Model:** Stateless JWT signed with `JWT_SECRET`, with server-side version invalidation (`jwt_version` in DB user record).
- **Authorization Roles:** `admin` and `user`.

---

## 3. Audit Coverage & Scope Limitations

### Directories Inspected:
- `/server/index.js` (Express setup, WebSocket server, CORS, Helmet, security middleware)
- `/server/middleware/` (`authMiddleware.js`, `requireAdmin.js`, `errorHandler.js`)
- `/server/routes/` (`auth.js`, `api.js`, `settings.js`, `users.js`, `requests.js`, `clients.js`, `tasks.js`, `tmdb.js`, `tracker.js`, `watcher.js`, `webhooks.js`, `simkl.js`, `releaseProfiles.js`)
- `/server/routes/library/` (`movies.js`, `showsEpisodes.js`, `music.js`, `subtitles.js`, `system.js`, `helpers.js`)
- `/server/services/` (Download clients, Subtitles, Scanners, Image service, Indexers, Presence tracker, User provisioning, Watcher)
- `/server/config/database.js` (Database schema, tables, migrations, constraints)
- `/Dockerfile`, `/docker-compose.yml`, `/entrypoint.sh`
- `/.github/workflows/docker.yml`
- `/package.json`, `/server/package.json`, `/client/package.json`, lockfiles
- Git commit history for previously committed secrets

### Directories Excluded:
- `node_modules/` (Vendor dependencies; audited via `npm audit` and static manifest review).
- `client/dist/` (Generated frontend build artifacts).
- `.git/` (Internal git metadata except commit log analysis).

---

## 4. Ranked Findings & Remediation Details

---

### [SEC-001] Header-Based Rate Limiting Bypass in Authentication Route
- **Severity:** HIGH
- **Status:** **REMEDIATED & VERIFIED**
- **CWE:** CWE-307: Improper Restriction of Excessive Authentication Attempts
- **Affected File:** `server/routes/auth.js:18-25`
- **Vulnerability Description:**  
  The `loginLimiter` rate-limit middleware previously allowed bypass when `req.headers['x-atlas-test'] === 'true'`. An external attacker could append this header to bypass the 5-attempts-per-15-minutes login rate limit in production.
- **Remediation Applied:**  
  Removed `req.headers['x-atlas-test'] === 'true'` completely from `loginLimiter`.
- **Regression Verification:**  
  Verified via automated test in `test/audit_remediation.test.js`: in production environment, 6 consecutive requests sending `x-atlas-test: true` trigger HTTP 429 Too Many Requests.

---

### [SEC-002] Information Disclosure & Broken Access Control on Library Endpoints
- **Severity:** HIGH
- **Status:** **REMEDIATED & VERIFIED**
- **CWE:** CWE-285: Improper Authorization / CWE-200: Information Exposure
- **Affected File:** `server/index.js:522-547`
- **Vulnerability Description:**  
  `libraryAdminWrapper` previously allowed any `GET` request through with `if (req.method === 'GET') return next();`. This allowed standard authenticated `user` accounts to query sensitive administrative endpoints (`/paths`, `/downloads`, `/system-health`, `/duplicates`, `/cleanup-candidates`, and `/missing-subs`).
- **Remediation Applied:**  
  Updated `libraryAdminWrapper` to enforce `requireAdmin` on all sensitive administrative paths and indexer search triggers, while retaining standard library browsing for regular users and update checking via `GET /api/settings/version`.
- **Regression Verification:**  
  Automated tests in `test/audit_remediation.test.js` confirm non-admin tokens receive HTTP 403 Forbidden across all administrative endpoints, while admins receive HTTP 200.

---

### [SEC-003] WebSocket Real-Time Torrent & Activity Leak to Non-Admin Users
- **Severity:** MEDIUM
- **Status:** **REMEDIATED & VERIFIED**
- **CWE:** CWE-200: Information Exposure
- **Affected File:** `server/index.js:235-265, 305-325`
- **Vulnerability Description:**  
  The 5-second interval `broadcastTorrentsUpdate()` and `broadcastWatchersUpdate()` pushed full download activity, client speeds, volume disk usage, and user watching sessions to all connected WebSocket clients with `_userId`, without verifying that `_role === 'admin'`.
- **Remediation Applied:**  
  Updated WebSocket connection tracking and broadcast loops to strictly filter by `client._role === 'admin'`.
- **Regression Verification:**  
  Automated tests in `test/audit_remediation.test.js` verify that user-role connections are excluded from `TORRENTS_UPDATE` and `WATCHERS_UPDATE` broadcasts.

---

### [SEC-004] Vulnerable Production Dependencies
- **Severity:** MEDIUM
- **Status:** **REMEDIATED & VERIFIED**
- **CWE:** CWE-1395: Dependency on Vulnerable Third-Party Component
- **Affected Packages:** `follow-redirects` (<=1.16.0), `ip-address` (<=10.7.3)
- **Vulnerability Description:**  
  Advisories GHSA-q3jh-wrc6-jgq8 and GHSA-8r9p-f939-6h3c (high severity credential leak on redirects) and GHSA-rxp7-6hxx-x8q5 (regex DoS in IPv6 address parsing).
- **Remediation Applied:**  
  Executed `npm audit fix` in both `server/` and `client/`.
- **Regression Verification:**  
  Both `npm audit` in `server/` and `client/` return 0 vulnerabilities.

---

### [SEC-005] Insecure CORS Credential Reflection on Wildcard Origin
- **Severity:** MEDIUM
- **Status:** **REMEDIATED & VERIFIED**
- **CWE:** CWE-942: Permissive Cross-Domain Policy with Untrusted Domains
- **Affected File:** `server/index.js:68-85`
- **Vulnerability Description:**  
  If an administrator configured `CORS_ORIGIN=*`, combining wildcard origin reflection with `credentials: true` allows third-party malicious sites to conduct authenticated cross-origin API calls using browser-stored credentials.
- **Remediation Applied:**  
  Added guard logic: if `CORS_ORIGIN === '*' || isWildcard`, `credentials` is set to `false`.
- **Regression Verification:**  
  Automated unit test in `test/audit_remediation.test.js` verifies `credentials` is false when `CORS_ORIGIN=*`.

---

### [SEC-006] Ephemeral Unit Test Failure & Test Suite Reliability
- **Severity:** LOW
- **Status:** **REMEDIATED & VERIFIED**
- **CWE:** CWE-1077: Floating / Environment-Dependent Testing Weakness
- **Affected File:** `test/auth.test.js:95-130`
- **Vulnerability Description:**  
  `test/auth.test.js` attempted to connect to `http://localhost:3000` assuming an external instance was active, causing standalone CI test failures.
- **Remediation Applied:**  
  Refactored test to spin up an in-process ephemeral server (`app.listen(0)`).
- **Regression Verification:**  
  Verified with `node --test test/auth.test.js` passing 8/8 tests without external servers.

---

### [SEC-007] Container Hardening & Attack Surface Reduction
- **Severity:** INFORMATIONAL
- **Status:** ASSESSED & SAFE
- **CWE:** Architectural / Defense-in-Depth
- **Affected File:** `Dockerfile`, `docker-compose.yml`, `entrypoint.sh`
- **Observations:**  
  - Privileges: `entrypoint.sh` safely drops privileges to PUID:PGID via `su-exec`.
  - Health check: Configured and working in `Dockerfile` and `docker-compose.yml`.
  - Safe defaults confirmed.

---

## 5. Potentially Exposed Secrets Assessment

- **Git History Scan:** Inspected all commit diffs for `JWT_SECRET`, private keys, and API tokens. No active production secrets were committed to Git history. `.env.example` files contain only documentation placeholders.
- **Repository `.gitignore`:** Properly ignores `.env`, `.env.local`, `*.sqlite`, and `server/data/`.
- **Recommendation:** Ensure deployed instances generate a unique 256-bit cryptographically secure string for `JWT_SECRET`. Never use default values.

---

## 6. OWASP ASVS 5.0 Verification Matrix

| ASVS Category | Focus Area | Status | Notes |
|---|---|---|---|
| **V1 Architecture** | Threat modeling & component isolation | **PASSED** | Core boundaries between client, server, and background services are defined. |
| **V2 Authentication** | Rate limiting, brute-force protection | **PASSED** | `SEC-001` remediated and verified via automated test. |
| **V3 Session Management** | JWT verification & revocation | **PASSED** | `jwt_version` enforces immediate invalidation on password change or logout. |
| **V4 Access Control** | Role-based authorization & IDOR | **PASSED** | `SEC-002` remediated; administrative library and search routes strictly enforced. |
| **V5 Validation & Sanitization** | SQLi, command injection, path traversal | **PASSED** | Parameterized SQL queries, `execFile` argument arrays, and `path.basename` protections verified. |
| **V6 Cryptography** | Password hashing & randomness | **PASSED** | `bcrypt` with cost 12 for passwords, `crypto.randomBytes` / `randomUUID` for tokens. |
| **V7 Error Handling** | Stack traces & information disclosure | **PASSED** | Centralized error handler masks details in production. |
| **V8 Data Protection** | Secrets masking & persistence | **PASSED** | Configuration API masks API keys and credentials for non-admin accounts. |
| **V9 Communications** | CORS, WebSocket, TLS | **PASSED** | `SEC-005` (CORS wildcard safe handling) and `SEC-003` (WebSocket admin filtering) verified. |
| **V10 Malicious Code** | Executable blocking & quarantine | **PASSED** | Verified blocking of `.exe`, `.bat`, and dangerous categories in indexer/download services. |
| **V14 Build & Deployment** | Dependencies, Docker, CI/CD | **PASSED** | `SEC-004` (dependencies updated via `npm audit fix`) verified. |

---

## 7. Verification Summary

All 113 project tests and security regression tests are passing cleanly:

```bash
$ npm test
ℹ tests 113
ℹ suites 0
ℹ pass 113
ℹ fail 0
```

Frontend production build verification:
```bash
$ npm run build --prefix client
✓ built in 933ms
```

ESLint verification:
```bash
$ npm run lint
0 errors across server and client
```
