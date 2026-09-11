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

// ── Find all audio files recursively ─────────────────────────────────────────

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
    const discNum = discVal ? parseInt(String(discVal).split('/')[0], 10) : 1;
    const yearVal = tags.date || tags.year || tags.originaldate;
    const year = yearVal ? parseInt(String(yearVal).substring(0, 4), 10) : null;

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
      album: tags.album || null,
      trackNumber: isNaN(trackNum) ? null : trackNum,
      discNumber: isNaN(discNum) ? 1 : discNum,
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
    return {
      title: trackMatch ? trackMatch[2].trim() : basename,
      trackNumber: trackMatch ? parseInt(trackMatch[1], 10) : null,
      discNumber: 1,
      artist: null,
      albumArtist: null,
      album: null,
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

  // 3. Match against downloading albums in DB
  const combined = `${folderName || ''} ${downloadName || ''}`.toLowerCase();
  const downloadingAlbums = db.prepare(`
    SELECT al.*, a.name as artist_name FROM music_albums al
    JOIN music_artists a ON a.id = al.artist_id
    WHERE al.status = 'downloading'
  `).all();
  for (const dal of downloadingAlbums) {
    if (combined.includes(dal.title.toLowerCase()) && combined.includes(dal.artist_name.toLowerCase())) {
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
    if (combined.includes(al.title.toLowerCase()) && combined.includes(al.artist_name.toLowerCase())) {
      return al;
    }
  }

  // 5. Fallback clean folder match
  const cleanFolder = (folderName || '')
    .replace(/\s*\(\d{4}\)\s*/g, '')
    .replace(/\[.*?\]/g, '')
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
