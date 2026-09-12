<div align="center">
  <h1>Atlas 🎬 🎵</h1>
  <p><strong>An elegant, all-in-one media management dashboard — track, search, download, and stream your Movies, TV Shows, and Music.</strong></p>
  <p>
    <strong>Replaces Radarr • Sonarr • Lidarr • Bazarr • Tautulli • Overseerr/Jellyseerr</strong><br>
    <em>One container to manage your entire media stack.</em>
  </p>
  <p>
    <a href="https://hub.docker.com/r/bdekkernl/atlas"><img src="https://img.shields.io/docker/pulls/bdekkernl/atlas?style=flat-square&logo=docker&logoColor=white&label=Docker%20Pulls" alt="Docker Pulls" /></a>
    <a href="https://github.com/Hoaxr/Atlas/releases"><img src="https://img.shields.io/github/v/release/Hoaxr/Atlas?style=flat-square&color=emerald&label=Release" alt="Latest Release" /></a>
    <a href="https://github.com/Hoaxr/Atlas/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License" /></a>
    <a href="https://bdekker.nl"><img src="https://img.shields.io/badge/Website-BDekker.nl-cyan?style=flat-square" alt="Website" /></a>
  </p>
  <p>
    <img src="./assets/atlas.png?v=2" alt="Atlas Dashboard" width="800" />
  </p>
  <br>
</div>

## What is Atlas?

**Atlas** is a self-hosted media management dashboard that unites the capabilities of **Radarr**, **Sonarr**, **Lidarr**, **Bazarr**, **Tautulli**, and **Overseerr** into a single cohesive, high-performance web application. Track, discover, download, organize, and even stream your media — all from one unified interface.

---

## Features ✨

### 🎬 Movies & TV Shows (Radarr / Sonarr)
- **Unified Media Tracking** — Monitor existing and upcoming Movies, TV Shows, seasons, and episodes with real-time status indicators (*monitored, downloaded, downloading, missing, partial*).
- **Smart Discovery (TMDB)** — Discover trending releases, search upcoming movies and shows, and add them with one click.
- **Calendar View** — Keep track of theatrical dates, digital releases, and TV airings with an interactive calendar.
- **Detailed Media Views** — Full cast & crew, seasons, episodes, ratings, and embedded trailer playback.
- **Person Filmographies** — Explore actor and director credits with cross-linked TMDB filmographies.
- **Custom Renaming & Artwork** — Automated file renaming with customizable formatting templates and automatic poster/backdrop retrieval.
- **Cleanup Candidates** — Smart scoring algorithm identifies safe-to-delete movies based on franchise detection, TMDB rating, watch status, age, and file size.

### 🎵 Music & Audio Streaming (Lidarr + Web Player)
- **Artist & Album Tracking** — Powered by **MusicBrainz**, import complete artist discographies, album tracklists, bonus releases, and release years.
- **Built-in Streaming Web Player** — Continuous lossless audio streaming player that stays active across page navigation, complete with a playlist queue, seekbar, and audio visualizer.
- **High-Res & Lossless Support** — Auto-detects and displays FLAC, bitdepth (16-bit / 24-bit), sample rate, MP3, and format badges on albums and tracks.
- **Music Scanner & Multi-Disc Support** — Automatically scans your music directory, consolidates multi-disc albums, and aligns local files against canonical tracklists.
- **Manual & Automated Album Search** — Automated background fetching and interactive release pickers via Prowlarr.

### 🔤 Subtitle Management & Sync (Bazarr)
- **Multi-Provider Search** — Fetch subtitles automatically from **OpenSubtitles**, **SubDL**, and **SubSource**.
- **AI-Powered Translation** — Auto-translate subtitle tracks into your preferred languages using **Claude (Anthropic)**, **DeepSeek**, or **Google Translate**.
- **Automated Speech Sync** — Intelligent voice activity detection (VAD) audio extraction and alignment using FFmpeg to fix out-of-sync subtitles.
- **Language Badges** — Visual indicators showing existing embedded and external subtitle languages on every media item.

### 📥 Download Clients & Indexers
- **Supported Download Clients** — Seamless integration with **qBittorrent**, **Transmission**, **Deluge**, **rTorrent**, **SABnzbd**, and **NZBGet**.
- **Live Downloads Queue** — Real-time download speeds, progress bars, pause/resume, bulk actions, and ETA tracking.
- **Prowlarr Integration** — Native indexer support for automated background searches and manual interactive release grabs.
- **Quality & Release Profiles** — Enforce preferred resolutions (1080p, 4K HDR/DV), audio formats (FLAC, 320k), preferred release groups, and automatic quality upgrades.

### 👥 Users, Requests & Multi-Server (Overseerr / Tautulli)
- **User Request Portal** — Dedicated user portal for friends/family to request movies, TV shows, and music with admin approval workflows.
- **User Import** — Auto-discover and import existing users from **Plex**, **Jellyfin**, and **Emby**.
- **Online Presence & Activity** — Real-time online/offline indicators and watch activity tracking via WebSockets.
- **JWT Role-Based Auth** — Granular permissions for admins vs. standard request users.

---

## Quick Start 🐳

Deploy Atlas with Docker Compose in under two minutes:

### 1. Create a `.env` file
```bash
cat > .env << 'EOF'
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
TMDB_API_KEY=your_tmdb_api_key_here
EOF
```

### 2. Create `docker-compose.yml`
```yaml
services:
  atlas:
    image: bdekkernl/atlas:latest
    container_name: Atlas
    restart: unless-stopped
    ports:
      - '9898:9898'
    environment:
      - TZ=Europe/Amsterdam
      - NODE_ENV=production
      - PORT=9898
      - JWT_SECRET=${JWT_SECRET}
      - TMDB_API_KEY=${TMDB_API_KEY}
    volumes:
      - '/path/to/atlas/config:/app/server/data'
      - '/path/to/movies:/data/movies'
      - '/path/to/tvshows:/data/tvshows'
      - '/path/to/music:/data/music'
      - '/path/to/downloads:/data/downloads'
```

### 3. Launch
```bash
docker compose up -d
```
Open **`http://localhost:9898`** in your browser and complete the initial setup!

> ⚠️ **Prerequisite**: Get a free [TMDB API Key](https://www.themoviedb.org/documentation/api) before starting.

---

## Volume Mounts 📁

| Container Path | Description | Required |
|---|---|:---:|
| `/app/server/data` | Database (`database.sqlite`), cache, and settings | **Yes** |
| `/data/movies` | Movie storage directory | Optional |
| `/data/tvshows` | TV show storage directory | Optional |
| `/data/music` | Music album & artist library | Optional |
| `/data/downloads` | Completed downloads directory from your torrent/usenet client | Optional |

---

## Environment Variables 🌐

| Variable | Required | Default | Description |
|---|:---:|:---:|---|
| `JWT_SECRET` | **Yes** | — | Secret key for JWT session signing (32+ chars) |
| `TMDB_API_KEY` | **Yes** | — | The Movie Database API key |
| `PORT` | No | `9898` | Web UI and server port |
| `TZ` | No | `UTC` | Timezone (e.g. `Europe/Amsterdam`, `America/New_York`) |
| `NODE_ENV` | No | `production` | Environment mode |
| `CORS_ORIGIN` | No | `http://localhost:9898` | Allowed CORS origin (useful behind reverse proxies) |
| `ANTHROPIC_API_KEY` | No | — | Claude API key for AI subtitle translations |
| `DEEPSEEK_API_KEY` | No | — | DeepSeek API key for AI subtitle translations |
| `GOOGLE_API_KEY` | No | — | Google Cloud Translate API key |

---

## First Run Guide 🚀

1. Open **`http://localhost:9898`**
2. Head to **Settings → API** and verify your **TMDB API Key**.
3. Under **Settings → Library**, configure your media library folders:
   - Movies: `/data/movies`
   - TV Shows: `/data/tvshows`
   - Music: `/data/music`
4. Connect your download client (**Settings → Clients**) and indexers (**Settings → Indexers**).
5. Set up **Quality Profiles** and start tracking your favorite movies, shows, and albums!

---

## Tech Stack 🛠️

- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons, React Router
- **Backend**: Node.js 22+, Express, WebSocket (`ws`), Native `node:sqlite`
- **Audio Engine**: HTML5 Web Audio API, FFmpeg metadata analysis
- **External APIs**: TMDB, MusicBrainz, Cover Art Archive, SubDL, SubSource, OpenSubtitles, Prowlarr

---

## Contributing & Support 💬

- 📖 **Documentation & Source**: [GitHub Repository](https://github.com/Hoaxr/Atlas)
- 🐛 **Issue Tracker**: [GitHub Issues](https://github.com/Hoaxr/Atlas/issues)
- 🐳 **Docker Hub**: [bdekkernl/atlas](https://hub.docker.com/r/bdekkernl/atlas)
- 🌐 **Project Home**: [BDekker.nl](https://bdekker.nl)

---

<p align="center">Made with ❤️ by <a href="https://github.com/Hoaxr">Hoaxr</a> • <a href="https://bdekker.nl">BDekker.nl</a></p>
