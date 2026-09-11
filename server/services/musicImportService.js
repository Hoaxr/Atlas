/**
 * musicImportService.js
 * Handles the pipeline from completed music download → imported library file.
 *
 * Pipeline:
 *   1. Detect audio files in download directory
 *   2. Read embedded tags (via music-metadata if installed, else filename parsing)
 *   3. Match to music_artists / music_albums in DB
 *   4. Validate format vs quality profile
 *   5. Rename + copy/move into music library folder
 *   6. Update music_tracks in DB
 *   7. Mark album as downloaded when all monitored tracks imported
 *   8. Emit activity event
 */

const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const db = require('../config/database');
const eventBus = require('./eventBus');
const { isAudioFile } = require('../utils/fileUtils');
const { parseMusicFormat, parseMusicBitrate, parseMusicBitdepth } = require('../utils/mediaParsing');
const { getSetting } = require('../utils/settings');
const musicLibraryService = require('./musicLibraryService');
const imageService = require('./imageService');

// ── Find all audio files recursively ─────────────────────────────────────────

const IGNORED_MUSIC_DIRS = new Set([
  '$recycle.bin',
  '.recycle',
  '#recycle',
  '@recycle',
  '@recycle.bin',
  '@eadir',
  '.trash-1000',
  '.trash-0',
  '.trashes',
  '.thumbnails',
  '.cache',
  '.git',
]);

const isIgnoredMusicDir = (dirName) => {
  if (!dirName) return true;
  const lower = dirName.toLowerCase();
  if (IGNORED_MUSIC_DIRS.has(lower)) return true;
  if (dirName.startsWith('.')) return true;
  return false;
};

const findAllAudioFiles = async (dirPath) => {
  const results = [];
  try {
    const stat = await fsp.stat(dirPath);
    if (stat.isFile()) {
      if (isAudioFile(dirPath)) results.push(dirPath);
      return results;
    }
    const items = await fsp.readdir(dirPath);
    for (const item of items) {
      if (isIgnoredMusicDir(item)) continue;
      const full = path.join(dirPath, item);
      try {
        const s = await fsp.stat(full);
        if (s.isDirectory()) {
          results.push(...await findAllAudioFiles(full));
        } else if (s.isFile() && isAudioFile(item)) {
          results.push(full);
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return results;
};

const { promisify } = require('util');
const { execFile } = require('child_process');
const execFileAsync = promisify(execFile);

// ── Read tags from audio file ─────────────────────────────────────────────────

const readAudioTags = async (filePath) => {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      filePath
    ], { timeout: 10000 });

    const info = JSON.parse(stdout);
    const format = info.format || {};
    const audioStream = (info.streams || []).find(s => s.codec_type === 'audio') || {};
    const rawTags = format.tags || {};
    const tags = {};
    for (const [k, v] of Object.entries(rawTags)) {
      tags[k.toLowerCase()] = v;
    }

    const trackVal = tags.track || tags.tracknumber;
    const trackNum = trackVal ? parseInt(String(trackVal).split('/')[0], 10) : null;
    const discVal = tags.disc || tags.discnumber;
    let discNum = discVal ? parseInt(String(discVal).split('/')[0], 10) : null;
    const yearVal = tags.date || tags.year || tags.originaldate;
    const year = yearVal ? parseInt(String(yearVal).substring(0, 4), 10) : null;

    let albumName = tags.album || null;

    // Check if album name contains CD/Disc indicator (e.g. "All Eyez On Me (Disc 2)" or "The Wall (CD1)")
    if (albumName) {
      const discMatch = albumName.match(/\s*(?:[([{-]|\b)(?:cd|disc|disk)\s*(\d+)(?:[)\]}]|\b|$)/i);
      if (discMatch) {
        if (!discNum || isNaN(discNum) || discNum === 1) {
          discNum = parseInt(discMatch[1], 10);
        }
        albumName = albumName.replace(discMatch[0], '').replace(/\s{2,}/g, ' ').trim();
        albumName = albumName.replace(/\s*[-–—]\s*$/, '').trim();
      }
    }

    // Also check if containing directory is a CD/Disc directory (e.g. "CD1", "Disc 2", "Disk 1")
    if (filePath) {
      const parentDir = path.basename(path.dirname(filePath));
      const folderDiscMatch = parentDir.match(/^(?:cd|disc|disk)\s*(\d+)$/i);
      if (folderDiscMatch) {
        if (!discNum || isNaN(discNum) || discNum === 1) {
          discNum = parseInt(folderDiscMatch[1], 10);
        }
        if (!albumName || albumName.toLowerCase() === parentDir.toLowerCase()) {
          albumName = path.basename(path.dirname(path.dirname(filePath)));
        }
      }
    }

    if (albumName) {
      // Strip trailing year from album name if present like "All Eyez on Me (1996)"
      albumName = albumName.replace(/\s*\(\d{4}\)$/, '').trim();
    }

    const codec = (audioStream.codec_name || format.format_name || '').toLowerCase();
    const isLossless = codec.includes('flac') || codec.includes('alac') || codec.includes('wav');

    const sampleRate = audioStream.sample_rate ? parseInt(audioStream.sample_rate, 10) : null;
    const bitsPerSample = audioStream.bits_per_raw_sample
      ? parseInt(audioStream.bits_per_raw_sample, 10)
      : (audioStream.bits_per_sample ? parseInt(audioStream.bits_per_sample, 10) : null);

    return {
      title: tags.title || path.basename(filePath, path.extname(filePath)),
      artist: tags.artist || tags.album_artist || tags.albumartist || null,
      albumArtist: tags.album_artist || tags.albumartist || tags.artist || null,
      album: albumName,
      trackNumber: isNaN(trackNum) ? null : trackNum,
      discNumber: isNaN(discNum) || !discNum ? 1 : discNum,
      year: isNaN(year) ? null : year,
      genre: tags.genre || null,
      duration: format.duration ? Math.round(parseFloat(format.duration)) : null,
      bitrate: format.bit_rate ? Math.round(parseInt(format.bit_rate, 10) / 1000) : null,
      sampleRate: isNaN(sampleRate) ? null : sampleRate,
      bitsPerSample: isNaN(bitsPerSample) ? null : bitsPerSample,
      codec: audioStream.codec_name || format.format_name || null,
      lossless: isLossless,
      mbidRecording: tags.musicbrainz_trackid || tags.musicbrainz_recordingid || null,
      mbidRelease: tags.musicbrainz_albumid || tags.musicbrainz_releasegroupid || null,
      mbidArtist: tags.musicbrainz_artistid || tags.musicbrainz_albumartistid || null,
    };
  } catch (err) {
    // Fallback: parse from filename
    const basename = path.basename(filePath, path.extname(filePath));
    const trackMatch = basename.match(/^(\d+)[.\s-]+(.+)$/);
    const parentDir = path.basename(path.dirname(filePath));
    const folderDiscMatch = parentDir.match(/^(?:cd|disc|disk)\s*(\d+)$/i);
    const fallbackDisc = folderDiscMatch ? parseInt(folderDiscMatch[1], 10) : 1;
    let fallbackAlbum = folderDiscMatch ? path.basename(path.dirname(path.dirname(filePath))) : parentDir;
    fallbackAlbum = fallbackAlbum.replace(/\s*\(\d{4}\)$/, '').trim();
    return {
      title: trackMatch ? trackMatch[2].trim() : basename,
      trackNumber: trackMatch ? parseInt(trackMatch[1], 10) : null,
      discNumber: fallbackDisc,
      artist: null,
      albumArtist: null,
      album: fallbackAlbum,
      year: null,
      duration: null,
      bitrate: null,
      sampleRate: null,
      bitsPerSample: null,
      codec: null,
      lossless: false,
      mbidRecording: null,
      mbidRelease: null,
      mbidArtist: null,
    };
  }
};

// ── Match download to a DB album ──────────────────────────────────────────────

// Normalise text for fuzzy matching: lower-case, strip diacritics and all punctuation/
// typography (curly vs straight apostrophes/quotes, dashes, etc.) so MusicBrainz titles
// such as "Don’t Be Dumb" or "Dial ‘M’ for Monkey" match tag titles like "Don't Be Dumb".
const normalizeMatchText = (str) => (str || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[’‘`´]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const matchAlbumFromFolder = (folderName, tags, downloadName = '') => {
  // 1. Try by MusicBrainz release group ID from tags first
  if (tags?.mbidRelease) {
    const album = db.prepare('SELECT * FROM music_albums WHERE mbid = ?').get(tags.mbidRelease);
    if (album) return album;
  }

  // 2. Try by album + artist name from tags
  const albumTitle = tags?.album?.trim();
  const artistName = (tags?.albumArtist || tags?.artist)?.trim();
  if (albumTitle) {
    if (artistName) {
      const album = db.prepare(`
        SELECT al.* FROM music_albums al
        JOIN music_artists a ON a.id = al.artist_id
        WHERE al.title LIKE ? COLLATE NOCASE
          AND (a.name LIKE ? COLLATE NOCASE OR a.sort_name LIKE ? COLLATE NOCASE)
        LIMIT 1
      `).get(`%${albumTitle}%`, `%${artistName}%`, `%${artistName}%`);
      if (album) return album;
    }
    const album = db.prepare(`
      SELECT al.* FROM music_albums al
      WHERE al.title LIKE ? COLLATE NOCASE
      LIMIT 1
    `).get(`%${albumTitle}%`);
    if (album) return album;
  }

  // 2b. Normalised tag match — tolerates typographic quotes/dashes/extra punctuation.
  // The SQL LIKE above is punctuation-sensitive, so e.g. DB "Don’t Be Dumb" never matches
  // a tag album of "Don't Be Dumb". Compare normalised strings instead.
  if (albumTitle) {
    const normAlbum = normalizeMatchText(albumTitle);
    const normArtist = normalizeMatchText(artistName);
    const candidates = db.prepare(`
      SELECT al.*, a.name as artist_name, a.sort_name as artist_sort_name
      FROM music_albums al
      JOIN music_artists a ON a.id = al.artist_id
    `).all();
    const artistOk = (r) => !normArtist
      || normalizeMatchText(r.artist_name) === normArtist
      || normalizeMatchText(r.artist_sort_name) === normArtist;

    // Exact normalised title (plus artist when known)
    const exact = candidates.find((r) => normalizeMatchText(r.title) === normAlbum && artistOk(r));
    if (exact) return exact;

    // Containment, to absorb suffixes like (Deluxe), (Remastered), feat. credits, etc.
    const contained = candidates.find((r) => {
      if (!artistOk(r)) return false;
      const t = normalizeMatchText(r.title);
      return t.includes(normAlbum) || normAlbum.includes(t);
    });
    if (contained) return contained;
  }

  // 3. Match against downloading albums in DB
  const combined = normalizeMatchText(`${folderName || ''} ${downloadName || ''}`);
  const downloadingAlbums = db.prepare(`
    SELECT al.*, a.name as artist_name FROM music_albums al
    JOIN music_artists a ON a.id = al.artist_id
    WHERE al.status = 'downloading'
  `).all();
  for (const dal of downloadingAlbums) {
    if (combined.includes(normalizeMatchText(dal.title)) && combined.includes(normalizeMatchText(dal.artist_name))) {
      return dal;
    }
  }

  // 4. Match against all monitored albums
  const allAlbums = db.prepare(`
    SELECT al.*, a.name as artist_name FROM music_albums al
    JOIN music_artists a ON a.id = al.artist_id
    WHERE al.monitored = 1
  `).all();
  for (const al of allAlbums) {
    if (combined.includes(normalizeMatchText(al.title)) && combined.includes(normalizeMatchText(al.artist_name))) {
      return al;
    }
  }

  // 5. Fallback clean folder match
  const cleanFolder = (folderName || '')
    .replace(/\s*\(\d{4}\)\s*/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\s*(?:[([{-]|\b)(?:cd|disc|disk)\s*\d+(?:[)\]}]|\b|$)/gi, '')
    .replace(/FLAC|MP3|320|24bit|16bit/gi, '')
    .trim();

  if (cleanFolder) {
    const album = db.prepare(`
      SELECT * FROM music_albums WHERE title LIKE ? COLLATE NOCASE LIMIT 1
    `).get(`%${cleanFolder}%`);
    if (album) return album;
  }

  return null;
};

// ── Format track filename ─────────────────────────────────────────────────────

const formatTrackFilename = (tags, ext, config) => {
  const trackNum = tags.trackNumber
    ? String(tags.trackNumber).padStart(2, '0')
    : '00';
  const title = musicLibraryService.sanitizeName(tags.title || 'Unknown');
  const template = config.trackFile
    .replace('{TrackNumber:00}', trackNum)
    .replace('{TrackNumber}', trackNum)
    .replace('{Track Title}', title);
  return `${musicLibraryService.sanitizeName(template)}${ext}`;
};

// ── Main import function ──────────────────────────────────────────────────────

/**
 * Import a completed music download.
 * @param {string} downloadPath - Path to completed download (file or folder)
 * @param {string} downloadName - Torrent/download name
 * @returns {{ imported: number, skipped: number, errors: string[] }}
 */
const importMusicDownload = async (downloadPath, downloadName) => {
  const result = { imported: 0, skipped: 0, errors: [] };

  const audioFiles = await findAllAudioFiles(downloadPath);
  if (audioFiles.length === 0) {
    console.log(`[MusicImport] No audio files found in: ${downloadPath}`);
    return result;
  }

  console.log(`[MusicImport] Found ${audioFiles.length} audio files in: ${downloadName}`);

  // Read tags from first file to identify the release
  const firstTags = await readAudioTags(audioFiles[0]);

  // Find the matching album in DB
  const folderName = path.basename(downloadPath);
  const album = matchAlbumFromFolder(folderName, firstTags, downloadName);

  if (!album) {
    console.warn(`[MusicImport] Could not match download to a library album: ${downloadName}`);
    result.skipped += audioFiles.length;
    result.errors.push(`No matching album found for: ${downloadName}`);
    return result;
  }

  const artist = db.prepare('SELECT * FROM music_artists WHERE id = ?').get(album.artist_id);
  if (!artist) {
    result.errors.push('Artist not found in library');
    return result;
  }

  const config = musicLibraryService.getMusicNamingConfig();
  const deleteAfterImport = getSetting('musicDeleteAfterImport') === 'true';

  // Determine artist folder — use existing folder_path or first music library mount
  let artistFolder = artist.folder_path;
  if (!artistFolder || !fs.existsSync(path.dirname(artistFolder))) {
    const musicPaths = db.prepare("SELECT path FROM library_paths WHERE type = 'music'").all();
    const libraryRoot = musicPaths[0]?.path || null;
    if (!libraryRoot) {
      result.errors.push('No music library path configured. Go to Settings → Music to set one.');
      return result;
    }
    artistFolder = path.join(libraryRoot, musicLibraryService.formatArtistFolder(artist, config));
  }

  const albumFolder = path.join(artistFolder, musicLibraryService.formatAlbumFolder(album, config));

  try {
    fs.mkdirSync(albumFolder, { recursive: true });
  } catch (err) {
    result.errors.push(`Cannot create album folder: ${err.message}`);
    return result;
  }

  // Detect format from files
  const ext = path.extname(audioFiles[0]).toLowerCase();
  const format = parseMusicFormat(audioFiles[0]);

  // Destination paths of successfully imported tracks (used later to extract embedded cover art)
  const importedPaths = [];

  for (const srcPath of audioFiles) {
    try {
      const tags = await readAudioTags(srcPath);
      const fileExt = path.extname(srcPath).toLowerCase();
      const destFilename = formatTrackFilename(tags, fileExt, config);
      const destPath = path.join(albumFolder, destFilename);

      if (fs.existsSync(destPath)) {
        await fsp.unlink(destPath).catch(() => {});
      }

      // Hardlink or copy (or move if deleteAfterImport)
      if (deleteAfterImport) {
        await fsp.rename(srcPath, destPath).catch(async () => {
          await fsp.copyFile(srcPath, destPath);
          await fsp.unlink(srcPath).catch(() => {});
        });
      } else {
        try {
          await fsp.link(srcPath, destPath);
        } catch (linkErr) {
          await fsp.copyFile(srcPath, destPath);
        }
      }

      const stat = await fsp.stat(destPath);

      // Upsert track in DB
      const existingTrack = db.prepare(`
        SELECT id FROM music_tracks
        WHERE album_id = ? AND disc_number = ? AND track_number = ?
      `).get(album.id, tags.discNumber || 1, tags.trackNumber);

      if (existingTrack) {
        db.prepare(`
          UPDATE music_tracks SET
            file_path = ?, file_size = ?, format = ?, bitrate = ?,
            bitdepth = ?, samplerate = ?, duration = ?, status = 'downloaded'
          WHERE id = ?
        `).run(
          destPath,
          stat.size || 0,
          format || null,
          tags.bitrate ?? null,
          tags.bitsPerSample ?? null,
          tags.sampleRate ?? null,
          tags.duration ?? null,
          existingTrack.id
        );
      } else {
        db.prepare(`
          INSERT OR IGNORE INTO music_tracks
            (album_id, artist_id, title, track_number, disc_number, file_path, file_size,
             format, bitrate, bitdepth, samplerate, duration, status, monitored, mbid, isrc)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'downloaded', 1, ?, ?)
        `).run(
          album.id,
          artist.id,
          tags.title || path.basename(srcPath, fileExt),
          tags.trackNumber ?? null,
          tags.discNumber || 1,
          destPath,
          stat.size || 0,
          format || null,
          tags.bitrate ?? null,
          tags.bitsPerSample ?? null,
          tags.sampleRate ?? null,
          tags.duration ?? null,
          tags.mbidRecording ?? null,
          null
        );
      }

      importedPaths.push(destPath);
      result.imported++;
    } catch (err) {
      result.errors.push(`Failed to import ${path.basename(srcPath)}: ${err.message}`);
      result.skipped++;
    }
  }

  // Copy companion artwork and cue/log files
  try {
    const companionDir = (await fsp.stat(downloadPath)).isDirectory() ? downloadPath : path.dirname(downloadPath);
    const companionFiles = await fsp.readdir(companionDir);
    for (const comp of companionFiles) {
      const compExt = path.extname(comp).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.cue', '.log', '.nfo'].includes(compExt)) {
        const srcComp = path.join(companionDir, comp);
        const destComp = path.join(albumFolder, comp);
        if (!fs.existsSync(destComp)) {
          await fsp.link(srcComp, destComp).catch(async () => {
            await fsp.copyFile(srcComp, destComp).catch(() => {});
          });
        }
      }
    }
  } catch { /* ignore companion copy error */ }

  // Ensure the album folder has cover.jpg immediately after import, so the UI (and
  // external tools like Plex/Jellyfin) show art without waiting for a later library scan.
  // Prefer embedded art from an imported track, then a cached cover by MBID.
  if (result.imported > 0 && !imageService.findAlbumFolderCover(albumFolder)) {
    try {
      const folderCover = path.join(albumFolder, 'cover.jpg');
      let extracted = null;
      for (const trackPath of importedPaths) {
        extracted = await imageService.extractEmbeddedCover(trackPath, folderCover);
        if (extracted) break;
      }
      if (!extracted && album.mbid) {
        const cachedCover = imageService.albumCoverPath(album.mbid);
        if (fs.existsSync(cachedCover)) {
          imageService.saveCoverToAlbumFolder(albumFolder, cachedCover);
        }
      }
    } catch (err) {
      console.warn(`[MusicImport] Cover art setup failed for ${album.title}:`, err.message);
    }
  }

  // Update album quality info and status
  if (result.imported > 0) {
    const firstTagsFull = await readAudioTags(audioFiles[0]);
    db.prepare(`
      UPDATE music_albums SET
        status = 'downloaded',
        folder_path = ?,
        file_format = ?,
        file_bitdepth = ?,
        file_samplerate = ?,
        file_size = (SELECT COALESCE(SUM(file_size), 0) FROM music_tracks WHERE album_id = ?)
      WHERE id = ?
    `).run(
      albumFolder,
      format || null,
      firstTagsFull.bitsPerSample ?? null,
      firstTagsFull.sampleRate ?? null,
      album.id,
      album.id
    );

    // Update artist folder path
    db.prepare('UPDATE music_artists SET folder_path = ? WHERE id = ?').run(artistFolder, artist.id);

    eventBus.emit({
      type: 'MUSIC_IMPORT_COMPLETE',
      albumId: album.id,
      albumTitle: album.title,
      artistName: artist.name,
      imported: result.imported,
      format,
    });

    console.log(`[MusicImport] ✓ Imported ${result.imported} tracks → ${artist.name} / ${album.title} (${format})`);
  }

  return result;
};

module.exports = {
  importMusicDownload,
  findAllAudioFiles,
  readAudioTags,
  matchAlbumFromFolder,
};
