# Atlas Media Pipeline Reference

## Matching Algorithms

### Movies (`matchMovieToTorrent`)
1. **Scene Name**: Compares `movie.scene_name` against the torrent name.
2. **Year Tokens in Title**: Titles containing numbers resembling years (`1917`, `Blade Runner 2049`, `2001: A Space Odyssey`) extract `titleYearTokens` so they are never accidentally stripped.
3. **Release Year Tolerance**: If release year is present in both DB and torrent, `|movie.year - torrentYear| <= 1` is permitted (accounts for festival vs theatrical release year discrepancies).
4. **Tag Stripping**: `stripReleaseTags` removes resolution (`2160p`, `1080p`), codec (`x265`, `hevc`), and audio tags (`atmos`, `ddp5.1`) before comparing stems.

### TV Episodes (`matchEpisodeToTorrent`)
1. **Scene Name**: Direct match if available.
2. **Show Title Word Boundary**: Matches show title with or without release year (e.g. `Dark Matter (2024)` matching `Dark.Matter.S01E01`).
3. **Parser Extraction**: Uses `parseEpisodeFromFilename`:
   - Single episodes: `S01E02`, `01x02`, `S1E2`, `Season 1 Episode 2`
   - Multi-episodes: `S01E01-E04`, `S01E01.E02`, `01x01-04`

### Season Packs (`matchSeasonPackToTorrent`)
1. Rejects individual episode releases (`S\d+E\d+` or `\d+x\d+`).
2. Matches season patterns: `S01`, `Season 1`, `Complete Season 1`, `Seasons 1-4`, `Complete Series`.
3. Checks show title on word boundary.

## Import Workflow (`mediaManagementService.js`)
- Primary import mechanism is hardlinking (`fs.promises.link`).
- If cross-device error (`EXDEV`) occurs, it falls back to atomic copying:
  1. Write to `${destFile}.partial`.
  2. Rename partial to final file.
  3. If `removeCompletedDownloads` is enabled, deletes original file from download client folder.
- Synchronously triggers companion subtitle import (`.srt`, `.sub`, `.ass`, `.vtt`) and subtitle verification.
- Persists `destFolder` to `folder_path` for movies and shows.
