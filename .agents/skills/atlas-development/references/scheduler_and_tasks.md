# Atlas Scheduler & Background Tasks Reference

## Overview
Atlas uses a centralized cron and task registry (`server/utils/cronRegistry.js` and `server/services/taskRegistry.js`) for scheduled jobs.

## Tasks & Schedules
- `search_cycle` (hourly): Missing/monitored media search and queueing.
- `media_mover` (every 5 mins): Imports completed downloads and updates statuses.
- `refresh_metadata` (daily 3 AM): Trickle-refreshes 50 oldest movies and 20 oldest shows.
- `missing_files_check` (hourly): Verifies file paths exist on disk, resets missing items.
- `cleanup_candidates` (every 12 hours): Evaluates deletable media with franchise protection.
- `simkl_watched_sync` (every 6 hours): Bi-directional watch state sync with Simkl.
- `poster_cache_warmer` (daily 2 AM): Pre-caches image posters locally.
- `music_search_cycle` (hourly): Searches for missing monitored music albums.
- `music_library_scan` (every 6 hours): Scans music root directories for untracked audio.

## Priority & Backoff Algorithms (`schedulerLogic.js`)
- **Score**:
  - Recent releases (<= 3 days): +100 priority boost.
  - Recent releases (<= 7 days): +50 priority boost.
  - Exponential penalty: `- (retry_count * 2)`.
- **Backoff**:
  - `nextSearch = now + (baseHours * Math.pow(backoffMultiplier, retry_count))`.
  - Expiration: Once `retry_count >= maxRetries`, items are flagged `EXPIRED` unless upgrade is needed.
