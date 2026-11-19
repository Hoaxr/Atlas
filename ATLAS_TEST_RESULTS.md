# ATLAS TEST RESULTS & VERIFICATION

**Date:** 2026-11-19  
**Test Runner:** Node.js native test runner (`node --test`)  
**Command:** `NODE_ENV=test node --test --test-concurrency=1 test/*.test.js`

---

## Summary

- **Total Test Suites:** 20
- **Total Tests:** 133
- **Passed:** 133
- **Failed:** 0
- **Skipped:** 0
- **Duration:** 19.56s

---

## Detailed Suite Breakdown

| Suite | Tests | Result | Duration |
| :--- | :---: | :---: | :--- |
| `airDate.test.js` | 4 | PASS | 93.2ms |
| `audit_remediation.test.js` | 7 | PASS | 2532.1ms |
| `auth.test.js` | 8 | PASS | 1632.1ms |
| `cleanup.test.js` | 5 | PASS | 7537.5ms |
| `expressRouting.test.js` | 2 | PASS | 67.3ms |
| `languages.test.js` | 5 | PASS | 3.8ms |
| `manualSearch.test.js` | 4 | PASS | 15.3ms |
| `media_lifecycle_e2e.test.js` | 4 | PASS | 1438.0ms |
| `rbac.test.js` | 7 | PASS | 104.9ms |
| `scanner.test.js` | 6 | PASS | 32.1ms |
| `security.test.js` | 13 | PASS | 212.4ms |
| `serviceTest.test.js` | 6 | PASS | 14.2ms |
| `settings.test.js` | 7 | PASS | 18.2ms |
| `subtitles.test.js` | 7 | PASS | 186.8ms |
| `subtitle_sync.test.js` | 13 | PASS | 58.4ms |
| `telegramBot.test.js` | 5 | PASS | 18.1ms |
| `totp_2fa.test.js` | 4 | PASS | 1078.1ms |
| `tracker.test.js` | 16 | PASS | 417.6ms |

---

## Code Quality & Static Analysis Verification

- **Lint (`npm run lint`):**
  - Server: 0 errors, 0 warnings
  - Client: 0 errors, 0 warnings
- **Production Build (`npm run build --prefix client`):**
  - Built cleanly in 998ms across 54 code-split production bundles.
- **Security Audit (`npm audit`):**
  - Server: 0 vulnerabilities
  - Client: 0 vulnerabilities
