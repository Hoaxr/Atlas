# Atlas Subtitle System Reference

## Overview
Atlas features a comprehensive subtitle management engine located in `server/services/subtitles/`.

## Architecture & Components
- **Providers**: OpenSubtitles.com REST API, Subdl, Bazarr compatibility.
- **Sync & Verification** (`subtitleSyncService.js`):
  - Automatically verifies subtitle timing against media audio tracks.
  - Extracts embedded text tracks (SRT/ASS/VTT) using `ffmpeg`.
  - Normalizes language codes using ISO 639-1 (`en`, `nl`, `de`, etc.).
- **Companion Subtitle Importer** (`mediaManagementService.js`):
  - Ingests sidecar subtitle files (`.srt`, `.sub`, `.ass`, `.vtt`) accompanying downloads.
  - Handles forced subtitles naming: `{MediaName}.{lang}.forced.srt`.
- **Parsing & Encoding**:
  - Handles UTF-8 and UTF-16 LE subtitle encodings.
  - Decompresses subtitle archives (`.zip`) safely to extract matching season or movie subtitles.
