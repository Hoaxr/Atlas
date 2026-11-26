# Atlas Subtitle System Reference

## Overview
Atlas features a comprehensive subtitle management engine located in `server/services/subtitles/`.

## Architecture & Components
- **Providers**: OpenSubtitles.com REST API, Subdl, Subsource, Bazarr compatibility.
- **Sync, Verification & Auto-Repair** (`subtitleSyncService.js`):
  - Automatically verifies subtitle timing against media audio tracks using Voice Activity Detection (VAD).
  - Detects framerate drift (e.g. 23.976 -> 25 fps), duration mismatches, and audio/speech offsets.
  - Safe atomic repair engine (`autoRepairSubtitles`): Applies linear time-stretching or offset shifts safely, preserving backups.
  - Forced subtitle reclassification (`reclassifyForcedSubtitles`): Reclassifies low-cue duration mismatch tracks (<= 15% duration ratio) to forced subtitles, eliminating false-positive sync alerts.
  - Extracts embedded text tracks (SRT/ASS/VTT) using `ffmpeg`.
  - Normalizes language codes using ISO 639-1 (`en`, `nl`, `de`, etc.).
- **Scheduled Auto-Repair Task** (`server/services/taskRegistry.js`):
  - Background task `subtitle_auto_repair` automatically runs health checks, reclassifies forced subtitles, and repairs confident drift/offset issues.
- **Companion Subtitle Importer** (`mediaManagementService.js`):
  - Ingests sidecar subtitle files (`.srt`, `.sub`, `.ass`, `.vtt`) accompanying downloads.
  - Handles forced subtitles naming: `{MediaName}.{lang}.forced.srt`.
- **Parsing & Encoding**:
  - Handles UTF-8 and UTF-16 LE subtitle encodings.
  - Decompresses subtitle archives (`.zip`) safely to extract matching season or movie subtitles.
- **AI Machine Translation** (`translationQueue.js`, `translationProviders.js`):
  - Translates subtitle cues using Anthropic Claude, DeepSeek, or Google Gemini.

