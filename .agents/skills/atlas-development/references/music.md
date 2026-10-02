# Atlas Music System Reference

## Overview
Atlas manages music collections across artists, albums, and individual audio tracks.

## Pipeline
1. **Search**: Indexers queried for missing or upgrade-allowed music albums.
2. **Download & Quarantine**:
   - Download client queued.
   - Rejects non-audio releases (e.g. concert video releases, DVDs) via `isVideoMusicRelease`.
3. **Import (`musicImportService.js`)**:
   - Reads audio tags via `ffprobe` (title, artist, album, track number, year, sample rate, bit depth).
   - Matches against `music_artists` and `music_albums` tables.
   - Moves/hardlinks audio files into library: `{MusicRoot}/{Artist}/{Album}/{Track Number} - {Track Title}.{ext}`.
   - Recalculates artist status (`downloaded` if all monitored albums present, `monitored` otherwise).
4. **Metadata**: MusicBrainz / Deezer for discographies, cover artwork, and release dates.
