# ATLAS IMPLEMENTED FIXES

**Date:** 2026-11-26

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

### 3. FIX-SUB-03: Subtitle Sync False-Positives & Forced Subtitle Auto-Classification
- **File:** `server/services/subtitles/subtitleSyncService.js`
- **Problem:** Subtitles flagged with duration mismatches were falsely reported as sync errors when they were actually low-cue forced commentary/foreign-dialogue tracks, cluttering sync issue counters.
- **Fix:** Added `reclassifyForcedSubtitles` to reclassify tracks with <= 15% cue duration ratio as forced tracks, and introduced `autoRepairSubtitles` for safe atomic drift correction and offset calibration.
- **Result:** Drastically reduces false-positive sync alerts, correctly labels forced subtitles, and automatically fixes safe audio sync drifts.

### 4. FIX-UI-04: Discover Page Card Footer & Trailer Playback Alignment
- **Files:** `client/src/pages/Discover.jsx`, `client/src/components/MediaDetailsModal.jsx`
- **Problem:** Discover poster cards had misaligned footer metrics compared to the Movies and TV Shows library cards, and modal posters lacked a prominent trailer play button.
- **Fix:** Unified the footer card layout to use identical typography, release year formatting, and rating badges; added a high-contrast circular trailer play button directly over the poster artwork in `MediaDetailsModal.jsx` triggering `TrailerModal`.
- **Result:** Consistent, responsive browsing experience across all media pages with immediate one-click trailer previews.

### 5. FIX-SEC-01: Security Vulnerability Remediation
- **Files:** `server/package-lock.json`, `client/package-lock.json`
- **Problem:** Upstream CVEs in `follow-redirects` (GHSA-mrwp-f3q8-3g9p, High) and `qs` (GHSA-6pq8-jhm2-2vcw, Moderate).
- **Fix:** Upgraded `follow-redirects` to `1.16.3` and `qs` to `6.17.1`.
- **Result:** `npm audit` reports 0 vulnerabilities in both backend and frontend.

### 6. FIX-CLEAN-05: Dead Component Pruning & Documentation Restructuring
- **Files:** `client/src/components/music/MusicPathsModal.jsx`, `client/src/components/shared/Skeleton.jsx`, `docs/`
- **Problem:** Obsolete prototype components lingered without imports, and root markdown audit documents cluttered the top-level repository.
- **Fix:** Pruned unreferenced components; consolidated audit documents into `docs/` and added `docs` to `.dockerignore`.
- **Result:** Cleaner codebase, zero ESLint warnings, faster builds, and pristine top-level repository layout.

### 7. FIX-UI-07: Uncached Discover & Recommendation Poster Fallback Resilience
- **Files:** `server/index.js`, `client/src/lib/posterUrl.js`, `client/src/pages/Discover.jsx`, `client/src/pages/dashboard/Dashboard.jsx`
- **Problem:** When browsing Discover and Recommendations, items not yet in the local library were unconditionally directed to `/api/images/...`. Because browser `<img>` tags do not transmit JWT headers, the server returned 404 for unowned items, causing all 80+ card `onError` handlers to fire simultaneously. If any CDN request choked or throttled, `target.style.display = 'none'` permanently hid the poster until a hard reload (`Ctrl + Shift + R`).
- **Fix:** 
  1. Updated `Discover.jsx` to load TMDB CDN directly for non-library items (`!isInLibrary`), bypassing unnecessary local 404 proxy cycles.
  2. Enhanced `posterUrl.js` and `server/index.js` to propagate and validate `?path=`, with automatic 302 redirects to TMDB CDN whenever local cache downloads are pending or fail.
  3. Added tiered CDN retries (`w500` -> `w342`) in `onError` before falling back to placeholders, preventing premature poster hiding.
- **Result:** Posters load instantly without 404 storms or broken image placeholders.
