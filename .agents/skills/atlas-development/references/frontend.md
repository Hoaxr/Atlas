# Atlas Frontend Architecture & API Reference

## Technology Stack
- **Framework**: React 18+ with Vite.
- **Routing**: React Router (`react-router-dom`).
- **Styling**: TailwindCSS & Vanilla CSS utility modules.
- **Icons**: Lucide React (`lucide-react`).
- **State & Realtime**: Context providers with Server-Sent Events (`/api/events`) connection.

## API Conventions
- Base path: `/api/`
- Authentication: Session-based or JWT token via headers (`Authorization: Bearer ...`).
- Secret Masking: Settings routes mask sensitive fields (API keys, passwords) with `********` for non-admin viewers.
- Response Structure: Standard JSON payloads `{ success: true, data: ... }` or array lists.

## Key Views (`client/src/pages/`)
- `Movies.jsx` / `MovieDetail.jsx`: Movie library, poster grid, manual search modal, quality upgrade triggers.
- `Series.jsx` / `ShowDetail.jsx`: TV series library, season expansion, episode list, monitored toggles.
- `Downloads.jsx`: Active queue from download clients, pause/resume/delete actions, download speed graphs.
- `Activity.jsx`: Recent events, history of imported releases, failed searches.
- `Settings.jsx`: Indexers (Prowlarr), Download Clients, Media Management naming tokens, quality profiles, library paths.
