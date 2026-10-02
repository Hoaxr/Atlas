# Atlas Database Guidelines & Schemas

## SQLite Configuration
- Managed via `server/config/database.js`.
- WAL (Write-Ahead Logging) mode enabled.
- Synchronous = NORMAL for optimal throughput and durability.
- Safe transactions via `db.transaction((fn) => { ... })`.

## Core Tables
- `movies`: Movie records, library paths, TMDB metadata, status, release dates, search scheduling.
- `shows`: TV series records, network, origin country, folder path, rating.
- `episodes`: TV episodes linked by `show_id`, air dates, episode numbers, runtime, watch progress.
- `quality_profiles`: Min/max size limits, allowed resolutions, cutoff thresholds, upgrade allowance.
- `library_paths`: Root storage locations for Movies, TV, and Music.
- `download_clients`: qBittorrent, Deluge, Transmission connection details.
- `settings`: Key-value configuration pairs (masked on API serialization).

## Migration Protocol
- Migrations in `database.js` run sequentially on startup.
- Always use `PRAGMA table_info(table_name)` checks before altering existing columns.
- Wrap structural schema changes in `db.transaction()` to ensure atomicity.
