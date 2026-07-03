<div align="center">
  <h1>Atlas 🎬</h1>
  <p><strong>An elegant, all-in-one media management dashboard — track, search, and download your favorite Movies and TV Shows.</strong></p>
  <p>
    <strong>Replaces Radarr • Sonarr • Bazarr • Tautulli • Overseerr/Jellyseerr</strong><br>
    <em>One app to manage your entire media stack.</em>
  </p>
  <p>
    <img src="./assets/atlas.png?v=2" alt="Atlas Dashboard" width="800" />
  </p>
  <br>
</div>

## Features ✨

Atlas combines the functionality of multiple *arr apps into a single, cohesive experience. Here's everything it can do:

### Dashboard & Discovery
- **Modern Dashboard** — A beautifully designed, highly responsive UI built with React and Tailwind CSS, featuring a sleek dark mode with class-based theming.
- **Media Tracking** — Easily monitor upcoming and existing Movies and TV Shows with dynamic status indicators (monitored, downloaded, downloading, missing).
- **Smart Discovery** — Search for new content from TMDB and instantly add it to your library with a single click.
- **Calendar View** — Keep track of upcoming movie releases and TV show air dates with an intuitive interactive calendar.
- **Library Statistics** — View beautiful visual insights and detailed statistics about your entire media collection, with charts and graphs.
- **Cleanup Candidates** — Smart scoring system identifies movies safe to delete based on franchise detection, TMDB ratings, watch status, age, and file size. Includes one-click delete from library or with files.
- **Customizable Views** — Switch seamlessly between grid and list layouts with advanced sorting and filtering (by status, rating, release year, and more).
- **Responsive Layout** — Fully functional on desktop, tablet, and mobile screens. Every page is optimized for all device sizes.

### Media Details
- **Detailed Media Views** — Dive deep into Movie and TV Show details, including full cast & crew, seasons, episodes, release dates, ratings, and trailers.
- **Person Details** — Explore actor/director filmographies with cross-linked TMDB data.
- **Episode Details** — View individual episode summaries, ratings, and air dates.
- **Trailer Modal** — Watch trailers directly within the app without leaving the page.

### Library Management
- **Multi-Path Libraries** — Manage multiple library paths for movies and TV shows simultaneously.
- **Library Scanner** — Automatic and manual scanning of library folders to detect new media.
- **Duplicate Resolution** — Find and resolve duplicate media files with the Remap modal.
- **Folder Browser** — Browse and select library folders directly from the UI.
- **Custom Naming Conventions** — Automatically rename movies and TV show episodes based on custom formatting templates.
- **Automatic Artwork** — Automatically download posters, backdrops, and artwork from TMDB.
- **Backup & Restore** — Easily backup and restore your configuration and database to safeguard your setup.

### Download & Indexer Management
- **Download Client Integration** — Connect to your favorite download clients to view and manage live torrents directly from the **Downloads** page.
- **Supported Clients**: qBittorrent, Transmission, Deluge, rTorrent, SABnzbd, NZBGet.
- **Download Statistics** — Real-time view of active downloads, queue status, speeds, ratios, and ETA right in the dashboard.
- **Indexer Support** — Built-in integration with indexer managers (like Prowlarr) for automatic media searches.
- **Manual Search** — Search for specific releases manually and pick the quality you want.
- **Automatic Searching** — Background automation continuously searches for missing and wanted media.

### Quality & Release Management
- **Quality Profiles** — Define custom quality profiles with cutoff limits to ensure you download the exact resolutions you prefer (e.g., 1080p, 4K, etc.).
- **Release Profiles** — Configure preferred release groups, tags, and restrictions for fine-grained control.
- **Automatic Upgrades** — Automatically upgrade existing media when a higher-quality release becomes available.

### Subtitle Management
- **Subtitle Search** — Search and download subtitles from multiple providers (OpenSubtitles, SubDL, SubSource).
- **Subtitle Translation** — Auto-translate subtitles into your preferred languages using AI-powered translation.
- **Supported AI Translators**: Google Translate, DeepSeek, Claude (Anthropic).
- **Subtitle Language Badges** — Visual indicators showing available subtitle languages for each media item.

### Notifications & Automation
- **Real-Time Updates** — Live WebSocket connection provides instant dashboard updates without page refreshes.
- **Background Automation** — Services for library scanning, metadata updates, subtitle fetching, and media management all run automatically.
- **System Tasks** — Monitor and manually trigger background tasks from the **Tasks** page: library scans, metadata refresh, subtitle downloads, and more.
- **System Health** — Integrated monitoring that alerts you to missing API keys, disconnected indexers, or inactive download clients.
- **Notification Service** — In-app notifications for key events and system status changes.

### User & Authentication
- **User Authentication** — Secure JWT-based authentication with login and session management.
- **Role-Based Access** — Admin and user roles with configurable permissions.
- **User Portal** — Dedicated portal for users to track their requests and activity.
- **Request System** — Allow users to request movies and TV shows, with approval workflows.
- **Change Password** — In-app password management for all users.
- **Online Presence** — Real-time online/offline indicators for all users via WebSocket presence tracking.
- **Last Login Tracking** — See when each user last logged into their account.
- **User Import** — Automatically discover and import users from connected media servers (Plex, Jellyfin, Emby).

### External Integrations
- **TMDB (The Movie Database)** — Core data provider for metadata, posters, cast, crew, and more.
- **Trakt.tv** — Sync watched status and authenticate with Trakt to keep your media progress aligned across devices.
- **Plex / Jellyfin / Emby** — Media server integration for library updates and notifications.

### Watcher & Discovery
- **Watcher** — Monitor radar/sonarr-like watchlist functionality for automatic content fetching.
- **Watcher Image Proxy** — Securely serve download client images through the backend proxy.

## Tech Stack 🛠️

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite 5, Tailwind CSS 3, Lucide Icons, React Router 7, clsx |
| **Backend** | Node.js 22+, Express 4, WebSocket (ws) |
| **Database** | SQLite via built-in `node:sqlite` (Node 22) |
| **Authentication** | JWT (jsonwebtoken), bcrypt |
| **External APIs** | TMDB, Trakt.tv |
| **Styling** | Tailwind CSS, PostCSS, Autoprefixer |
| **Notifications** | react-hot-toast |
| **Linting** | ESLint 10 |
| **Testing** | Vitest |

## Project Structure 📁

```
Atlas/
├── client/                      # React frontend (Vite)
│   ├── src/
│   │   ├── components/          # Reusable UI components
│   │   │   ├── dashboard/       # Dashboard-specific components
│   │   │   ├── layout/          # Layout, navigation, logo
│   │   │   └── shared/          # Shared components (Spinner, Modal, etc.)
│   │   ├── lib/                 # Hooks, API client, context
│   │   ├── pages/               # Route pages
│   │   │   └── settings/        # Settings sub-pages
│   │   └── utils/               # Alert helpers
│   └── vite.config.js
├── server/                      # Express backend
│   ├── config/                  # Database setup
│   ├── data/                    # SQLite database (runtime)
│   ├── middleware/               # Auth, error handling
│   ├── routes/                  # API route handlers
│   ├── services/                # Business logic & background jobs
│   │   └── clients/             # Download client adapters
│   ├── utils/                   # Settings helpers, video utils
│   └── index.js                 # Entry point
├── assets/                      # Screenshots, branding
├── Dockerfile                   # Multi-stage Docker build
├── docker-compose.yml           # Docker Compose configuration
└── .dockerignore                # Docker build exclusions
```

## Getting Started 🚀

### Prerequisites

- [Node.js](https://nodejs.org/) v22 or later (required for `node:sqlite`)
- A free [TMDB API Key](https://www.themoviedb.org/documentation/api)
- npm (ships with Node.js)

### Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Hoaxr/Atlas.git
   cd Atlas
   ```

2. **Install dependencies:**
   ```bash
   cd server && npm install
   cd ../client && npm install
   cd ..
   ```

3. **Configure environment variables:**
   ```bash
   cp server/.env.example server/.env
   ```
   Edit `server/.env` and at minimum set:
   ```env
   JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
   TMDB_API_KEY=<your TMDB API key>
   ```

4. **Start both server and client** (from the project root):
   ```bash
   npm run dev
   ```
   - Backend: `http://localhost:3000`
   - Frontend: `http://localhost:3001` (proxies `/api` and `/ws` to the backend)

   Or start them separately:
   ```bash
   # Terminal 1 — Backend
   cd server && npm start

   # Terminal 2 — Frontend
   cd client && npm run dev
   ```

### Docker Deployment 🐳

Atlas ships with a production-ready `Dockerfile` and `docker-compose.yml`.

1. **Create a `.env` file** for your secrets:
   ```bash
   cat > .env << EOF
   JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
   TMDB_API_KEY=your_tmdb_api_key_here
   EOF
   ```

2. **Edit `docker-compose.yml`** and update the volume paths to match your system:
   ```yaml
   volumes:
     - '/path/to/atlas/config:/app/server/data'   # Config & database
     - '/path/to/movies:/data/movies'              # Movie library
     - '/path/to/tvshows:/data/tvshows'            # TV show library
     - '/path/to/downloads:/data/downloads'        # Completed downloads
   ```

3. **Build and start:**
   ```bash
   docker compose up -d
   ```

4. Open `http://localhost:9898` and complete the initial setup.

> **Note:** After starting, go to **Settings → Library** in Atlas to add your library paths using the container-side paths (`/data/movies`, `/data/tvshows`). Configure your download client and path mappings in **Settings → Clients**.

### Initial Setup ⚙️

Upon first launch, the **System Status** page will show issues:
1. Click the issues banner or navigate to **Settings**.
2. Enter your **TMDB API Key** on the **API** tab.
3. (Optional) Configure your **Download Client** (Clients tab) and **Indexers** (Indexers tab).
4. Add your **Library Paths** on the **Library** tab.
5. Configure **Quality Profiles** and **Release Profiles** to suit your preferences.

## API Endpoints 📡

| Route | Description |
|---|---|
| `/api/auth` | Authentication (login, register, status) |
| `/api/settings` | Application settings (TMDB, clients, indexers, etc.) |
| `/api/library` | Library management (movies, shows, paths, scanning, deletable analysis) |
| `/api/tmdb` | TMDB data proxy (search, details, trending) |
| `/api/trakt` | Trakt.tv sync and authentication |
| `/api/tasks` | Background task management |
| `/api/clients` | Download client proxy (torrents, stats) |
| `/api/release-profiles` | Release profile management |
| `/api/users` | User administration |
| `/api/requests` | User request management |
| `/api/watcher` | Watcher functionality |
| `/ws` | WebSocket for real-time events |

## Supported Download Clients 📥

- [qBittorrent](https://www.qbittorrent.org/)
- [Transmission](https://transmissionbt.com/)
- [Deluge](https://deluge-torrent.org/)
- [rTorrent](https://rakshasa.github.io/rtorrent/)
- [SABnzbd](https://sabnzbd.org/)
- [NZBGet](https://nzbget.com/)

## Subtitle Providers & Translation 🔤

**Providers:** OpenSubtitles, SubDL, SubSource

**AI Translation:** Google Translate, DeepSeek, Claude (Anthropic)

## Environment Variables 🌐

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: `3000`, Docker: `9898`) |
| `NODE_ENV` | No | `development` or `production` |
| `CORS_ORIGIN` | No | Allowed CORS origin (default: `http://localhost:3001`) |
| `JWT_SECRET` | **Yes** | Secret key for JWT token signing |
| `TMDB_API_KEY` | **Yes** | TMDB API key for metadata |
| `TRAKT_CLIENT_ID` | No | Trakt.tv OAuth client ID |
| `TRAKT_CLIENT_SECRET` | No | Trakt.tv OAuth client secret |
| `GOOGLE_API_KEY` | No | Google Translate API key |
| `DEEPSEEK_API_KEY` | No | DeepSeek API key |
| `ANTHROPIC_API_KEY` | No | Claude/Anthropic API key |

## Scripts 📜

| Script | Description |
|---|---|
| `npm run dev` (root) | Start both server and client in dev mode |
| `npm start` (root) | Start both server and client in production mode |
| `npm run build` (client) | Build client for production |
| `npm run lint` | Lint all code |
| `npm run format` | Format code with Prettier |
| `cd server && npm test` | Run server tests with Vitest |

## Contributing 🤝

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/Hoaxr/Atlas/issues).

1. Fork the project
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License 📝

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

<p align="center">Made with ❤️ by <a href="https://github.com/Hoaxr">Hoaxr</a></p>
