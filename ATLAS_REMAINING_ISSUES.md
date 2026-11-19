# ATLAS REMAINING ISSUES & OPERATIONAL CONSIDERATIONS

**Date:** 2026-11-19

---

## 1. External Credentials Required for Full Live Operation
To enable real-world end-to-end network retrieval, the following external services require user API keys configured in the Atlas Settings UI (`/settings`):
- **TMDB API Key (`TMDB_API_KEY`)**: Required for live metadata, posters, cast, and season/episode synchronization.
- **Prowlarr URL & API Key**: Required for automated indexer querying and release scraping.
- **Download Client Host, Port & Auth**: (qBittorrent / SABnzbd / Deluge) required for automated download dispatching.
- **Subtitle Provider Keys**: (OpenSubtitles / Subdl / Subsource) optional for external subtitle downloading.
- **AI Translation Keys**: (Anthropic Claude / DeepSeek / Google Gemini) optional for automated machine subtitle translation.

## 2. Docker & Storage Mount Recommendations
- **Atomic Hardlinks**: Hardlinks between `/data/downloads` and `/data/movies` or `/data/tvshows` require that both paths reside on the **same Docker volume mount** or underlying filesystem.
- When crossing separate filesystem boundaries, Atlas automatically uses atomic copy fallback (`EXDEV`), but hardlinking is strongly recommended to preserve disk space and achieve instant imports.

## 3. Background Cron Schedules
All scheduled tasks run via `cronRegistry.js` and `taskRegistry.js`:
- Search cycles run hourly (`0 * * * *`).
- Media mover polls every 5 minutes (`*/5 * * * *`) or instantly upon webhook notification (`POST /api/webhooks/download-client`).
- Daily metadata and library health checks run at off-peak hours (01:00–05:00).
