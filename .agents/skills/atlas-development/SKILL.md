---
name: atlas-development
description: >-
  Essential guide, architecture overview, and runbook for developing, testing, and debugging
  the Atlas media management and automation platform. Use this skill whenever building features,
  debugging download/import pipelines, modifying database schemas, writing tests, or updating
  media matching algorithms in Atlas.
---

# Atlas Development Skill

This skill provides the architecture rules, media lifecycle conventions, database patterns, and testing guidelines for Atlas.

---

## 1. System Overview & Architecture

Atlas is a self-hosted media management and automation platform:

- **Backend**: Node.js (v20+) with Express, SQLite (via built-in `node:sqlite` or `better-sqlite3`), and server-sent events (`eventBus.js`).
- **Frontend**: React (Vite-powered SPA), vanilla/Tailwind CSS, Lucide icons.
- **External Integrations**:
  - **Indexers**: Prowlarr / Torznab / Jackett (`indexerService.js`).
  - **Download Clients**: qBittorrent, Deluge, Transmission, rTorrent, NZBGet, SABnzbd (`downloadClientService.js`).
  - **Metadata**: TMDB (Movies & TV), MusicBrainz / Deezer (Music).
  - **Subtitles**: OpenSubtitles, Subdl, Bazarr compatibility (`subtitles/`).
  - **Activity & Tracking**: Simkl, Watch history tracker (`watcherService.js`).

---

## 2. Key Directories & Modules

| Directory / File | Description |
| :--- | :--- |
| `server/index.js` | Server entrypoint, middleware, routes mounting, graceful shutdown |
| `server/config/database.js` | SQLite connection, table schemas, incremental migrations |
| `server/services/mediaManagementService.js` | Post-processing mover, hardlinking, title matching, torrent cleanup |
| `server/services/automationService.js` | Automated search cycle, backoff, metadata refresh, missing files check |
| `server/services/schedulerLogic.js` | Backoff multiplier, search priority scoring, expiration logic |
| `server/services/downloadClientService.js` | Multi-client orchestration, client adapters, malware quarantine |
| `server/services/musicImportService.js` | Music audio tag extraction, track matching, and directory organization |
| `server/services/cleanupWorker.js` | Safe disk cleanup candidates, franchise protection algorithms |
| `server/utils/fileUtils.js` | File extension checkers, safety checks (`isDangerousFile`), safe deletion |
| `test/` | Node test runner suite (`npm test`) covering security, media parsing, tracker, etc. |

---

## 3. Media Pipeline & Lifecycle

### Download & Search Cycle
1. `runSearchCycle` (`automationService.js`) searches for monitored movies/episodes needing download or upgrade.
2. Indexers are queried with release cutoff checks (`isCutoffMet`).
3. Snatched releases are queued to the download client, marking items as `status = 'downloading'`.

### Post-Processing & Import (`runMediaManagement`)
1. Polls download clients for torrents with `progress >= 100`.
2. Inspects torrents for malware/executable files (`isDangerousFile`).
3. Matches torrents:
   - **Movies**: `matchMovieToTorrent` (handles year tokens in title, release year tolerance).
   - **Episodes**: `matchEpisodeToTorrent` (handles multi-episode ranges, dot-delimited scene names, `01x02`).
   - **Season Packs**: `matchSeasonPackToTorrent` (multi-season ranges, complete series).
   - **Music**: `musicImportService.importMusicDownload` (audio files, tags).
4. Imports video/audio files via **hardlinking** (or atomic fallback copy if cross-device `EXDEV`).
5. Updates database record (`status = 'downloaded'`, `file_path`, `folder_path`).
6. Optionally removes completed torrent from client if `removeCompletedDownloads` is enabled.
7. Triggers immediate subtitle search and TMDB metadata sync.
8. Calls `resetDownloadsNotInClient()` to recalculate remaining downloading items.

---

## 4. Database Rules & Status Conventions

### Valid Statuses
- **Movies**: `'monitored'`, `'unmonitored'`, `'missing'`, `'downloading'`, `'downloaded'`
- **Shows**: `'monitored'`, `'unmonitored'`, `'downloading'`, `'downloaded'`
- **Episodes**: `'monitored'`, `'unmonitored'`, `'missing'`, `'downloading'`, `'downloaded'`
- **Music Albums & Artists**: `'monitored'`, `'unmonitored'`, `'downloading'`, `'downloaded'`

### Critical Invariants
1. **Show Monitored Inheritance**:
   - When a parent show has `monitored = 0`, its episodes must NEVER default to `'monitored'`.
   - When resetting items or inserting new episodes from TMDB metadata refresh, use:
     ```javascript
     const isShowMonitored = show.monitored === 1;
     const status = isShowMonitored ? 'monitored' : 'unmonitored';
     const monitored = isShowMonitored ? 1 : 0;
     ```
2. **Safe Atomic Transactions**:
   - Wrap batch operations in `db.transaction(() => { ... })()`.
3. **Persist `folder_path`**:
   - Whenever an item is imported, ensure `folder_path` is persisted in the database so size calculations and directory renames function properly.

---

## 5. Security & Malware Guardrails

Atlas operates with strict quarantine measures against fake releases:
- **Executable Blocking**: Extensions (`.exe`, `.bat`, `.cmd`, `.msi`, `.scr`, `.vbs`, `.ps1`, `.apk`, etc.) are blocked at URL entry (`addTorrent`) and quarantined during watchdog inspection (`inspectTorrentsForMalware`).
- **Quarantine Cleanup**:
  - Malicious torrent deleted immediately (`deleteTorrent(hash, true)`).
  - Malicious files removed from disk.
  - Reset database status to `'monitored'` or `'unmonitored'` depending on item and show monitoring flags.

---

## 6. Testing & Validation Runbook

Always validate changes with the test suite:

```bash
# Run all unit and integration tests
npm test

# Run a specific test suite
node --test test/security.test.js
node --test test/subtitles.test.js
node --test test/tracker.test.js
```

### Checks before committing:
- [ ] `npm test` runs with 0 failures.
- [ ] No unhandled Promise rejections.
- [ ] SQLite queries handle NULL values gracefully (e.g. `COALESCE`, `NULLIF`).

---

## 7. Specialized Reference Guides

For in-depth procedures and subsystem specifics, consult the following topic guides:

- [Media Pipeline & Post-Processing](./references/pipeline.md): Hardlink protocols, title matching algorithms, season pack extractions, and subtitle ingestion.
- [Database Guidelines & Schemas](./references/database.md): Table definitions, migration patterns, and safe transaction rules.
- [Frontend Architecture & UI](./references/frontend.md): React/Vite structure, SSE event streaming, routing, and secret masking.
- [Subtitle Engine](./references/subtitles.md): Subtitle providers, format normalization, and audio-based timing verification.
- [Music System](./references/music.md): Audio file tagging, MusicBrainz integrations, and album/artist status recalculations.
- [Scheduler & Background Tasks](./references/scheduler_and_tasks.md): Cron registry, task execution, priority scoring, and retry backoff.

