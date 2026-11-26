# ATLAS TEST RESULTS & VERIFICATION

**Date:** 2026-11-26  
**Test Runner:** Node.js native test runner (`node --test`)  
**Command:** `NODE_ENV=test node --test --test-concurrency=1 test/*.test.js`

---

## Summary

- **Total Test Suites:** 20
- **Total Tests:** 139
- **Passed:** 139
- **Failed:** 0
- **Skipped:** 0
- **Duration:** 19.76s

---

## Detailed Suite Breakdown

| Suite | Tests | Result | Duration |
| :--- | :---: | :---: | :--- |
| `airDate.test.js` | 4 | PASS | ~50ms |
| `audit_remediation.test.js` | 7 | PASS | ~2267ms |
| `auth.test.js` | 8 | PASS | ~1647ms |
| `cleanup.test.js` | 5 | PASS | ~7668ms |
| `expressRouting.test.js` | 2 | PASS | ~66ms |
| `languages.test.js` | 5 | PASS | ~4ms |
| `manualSearch.test.js` | 4 | PASS | ~15ms |
| `media_lifecycle_e2e.test.js` | 4 | PASS | ~1438ms |
| `rbac.test.js` | 7 | PASS | ~105ms |
| `scanner.test.js` | 6 | PASS | ~32ms |
| `security.test.js` | 13 | PASS | ~212ms |
| `serviceTest.test.js` | 6 | PASS | ~14ms |
| `settings.test.js` | 7 | PASS | ~18ms |
| `subtitles.test.js` | 7 | PASS | ~222ms |
| `subtitle_sync.test.js` | 19 | PASS | ~110ms |
| `telegramBot.test.js` | 5 | PASS | ~10ms |
| `totp_2fa.test.js` | 4 | PASS | ~1130ms |
| `tracker.test.js` | 16 | PASS | ~399ms |

---

## Code Quality & Static Analysis Verification

- **Lint (`npm run lint`):**
  - Server: 0 errors, 0 warnings
  - Client: 0 errors, 0 warnings
- **Production Build (`npm run build --prefix client`):**
  - Built cleanly with Vite across code-split production bundles.
- **Security Audit (`npm audit`):**
  - Server: 0 vulnerabilities
  - Client: 0 vulnerabilities
