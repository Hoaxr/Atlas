# ATLAS FEATURE STATUS MATRIX

**Date:** 2026-11-26

| Feature / Domain | Replaces | Implementation Status | Functional Verification |
| :--- | :--- | :---: | :--- |
| **Movie Search & Indexer Query** | Radarr | Fully Implemented | Verified (Prowlarr Torznab API, cutoff & quality profile filters) |
| **Movie Post-Processing & Hardlink** | Radarr | Fully Implemented | Verified via `test/media_lifecycle_e2e.test.js` |
| **TV Series & Episode Lifecycle** | Sonarr | Fully Implemented | Verified (daily monitoring, multi-episode ranges, season packs) |
| **Season Pack & Series Pack Import** | Sonarr | Fully Implemented | Verified in `mediaManagementService.js` |
| **Music Library & Audio Tagging** | Lidarr | Fully Implemented | Verified (MusicBrainz, Deezer, `musicImportService.js`) |
| **Automated Subtitle Search** | Bazarr | Fully Implemented | Verified (OpenSubtitles, Subdl, Subsource) |
| **Subtitle Sync & Drift Repair** | Bazarr | Fully Implemented | Verified (`test/subtitle_sync.test.js`) |
| **Subtitle Auto-Repair & Forced Reclassifier** | Bazarr / Custom | Fully Implemented | Verified (Atomic drift fix, low-cue duration mismatch forced reclassification) |
| **AI Subtitle Translation** | Bazarr / Custom | Fully Implemented | Verified (Claude, DeepSeek, Google Gemini) |
| **Active Session Monitoring** | Tautulli | Fully Implemented | Verified (Plex, Jellyfin, Emby session polling) |
| **Watch History & Autoplay Flap Dampening**| Tautulli | Fully Implemented | Verified (`test/tracker.test.js`) |
| **User Media Requests & Quotas** | Overseerr | Fully Implemented | Verified (`test/rbac.test.js`) |
| **Download Client Adapters** | Built-in | Fully Implemented | Verified (qBittorrent, Deluge, Transmission, rTorrent, NZBGet, SABnzbd) |
| **Interactive Trailer Playback** | Built-in | Fully Implemented | Verified (High-contrast poster play trigger, in-app TrailerModal & YouTube search) |
| **Library & Discover Card Consistency** | UI / UX | Fully Implemented | Verified (Unified footer metadata, rating badges, and action bars) |
| **Malware Binary Quarantine** | Security Guardrail | Fully Implemented | Verified (`test/security.test.js` blocks `.exe`, `.bat`, etc.) |
| **Two-Factor Authentication (TOTP)** | Security Engine | Fully Implemented | Verified (`test/totp_2fa.test.js`) |
