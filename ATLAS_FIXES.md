# ATLAS IMPLEMENTED FIXES

**Date:** 2026-11-19

---

### 1. FIX-E2E-01: Multi-Episode File Premature Deletion in Cross-Device Copy Fallback
- **File:** `server/services/mediaManagementService.js` (line 1223)
- **Problem:** When downloading a multi-episode release (such as `S01E01-E02`) across separate filesystem mounts (`EXDEV`), the atomic copy fallback unlinked `videoFile.path` upon completing the first episode. This caused the second episode import to fail with `No video file found for episode`.
- **Fix:** Guarded `fs.promises.unlink(videoFile.path)` to verify `torrent.hash` is present (multi-episode batches deliberately pass `hash: null` until the final episode in the range).
- **Result:** Multi-episode files import seamlessly across cross-device mounts; all episodes in the range are properly linked/copied and marked `downloaded`.

### 2. FIX-CORE-02: Export `runMediaManagement` from Service
- **File:** `server/services/mediaManagementService.js` (line 1521)
- **Problem:** `runMediaManagement` was internally scoped and not exported in `module.exports`, preventing programmatic execution by test harnesses, scheduled jobs, and custom webhooks.
- **Fix:** Exported `runMediaManagement` alongside `init`, `getNamingConfig`, and matching functions.
- **Result:** Media management post-processing can now be triggered programmatically and is covered by end-to-end integration tests.

### 3. FIX-SEC-01: Security Vulnerability Remediation
- **Files:** `server/package-lock.json`, `client/package-lock.json`
- **Problem:** Upstream CVEs in `follow-redirects` (GHSA-mrwp-f3q8-3g9p, High) and `qs` (GHSA-6pq8-jhm2-2vcw, Moderate).
- **Fix:** Upgraded `follow-redirects` to `1.16.3` and `qs` to `6.17.1`.
- **Result:** `npm audit` reports 0 vulnerabilities in both backend and frontend.

### 4. FIX-LINT-01: Unused Variable Cleanups
- **Files:** `server/services/watcherService.js`, `client/src/pages/MediaHealth.jsx`, `client/src/pages/Statistics.jsx`
- **Problem:** ESLint warnings due to unused `currentPlayKeys` and orphaned `handleMarkForced` functions left over after the 3-icon button toolbar refactor.
- **Fix:** Removed unused declarations.
- **Result:** `npm run lint` now completes with 0 errors and 0 warnings.
