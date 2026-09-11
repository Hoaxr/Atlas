/**
 * musicScannerService.js
 * Scans configured music library root folders for audio files,
 * extracts embedded metadata (tags), inserts/updates artists, albums,
 * and tracks, and marks files missing from disk as monitored.
 */

const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const db = require('../config/database');
const eventBus = require('./eventBus');
const { parseMusicFormat } = require('../utils/mediaParsing');
const { findAllAudioFiles, readAudioTags } = require('./musicImportService');
const musicLibraryService = require('./musicLibraryService');
const imageService = require('./imageService');

const isInsideRoot = (root, p) => {
  const rel = path.relative(path.resolve(root), path.resolve(p));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
};

const scanMusicLibrary = async (onProgress = null, checkCancelled = null) => {
  const musicPaths = db.prepare("SELECT * FROM library_paths WHERE type = 'music'").all();

  const results = {
    totalFiles: 0,
    processedFiles: 0,
    addedTracksCount: 0,
    addedAlbumsCount: 0,
    addedArtistsCount: 0,
    removedTracksCount: 0,
    unreachablePaths: [],
    emptyPaths: [],
    addedTracks: [],
    errors: [],
  };

  const touchedArtistIds = new Set();

  if (!musicPaths || musicPaths.length === 0) {
    return results;
  }

  // Make sure every tracked artist has its folder on disk, so dropped-in files are
  // picked up by this scan (and so artists added earlier get their folder created).
  try {
    const createdFolders = musicLibraryService.ensureAllArtistFolders();
    if (createdFolders > 0) console.log(`[MusicScanner] Ensured ${createdFolders} artist folder(s) (created/relinked).`);
  } catch (err) {
    console.warn('[MusicScanner] Failed to ensure artist folders:', err.message);
  }

  const accessibleRoots = [];
  const allAudioFiles = [];

  // 1. Check reachability and discover audio files in all music root folders
  for (const libPath of musicPaths) {
    if (checkCancelled && checkCancelled()) break;

    try {
      const exists = fs.existsSync(libPath.path);
      if (!exists) {
        results.unreachablePaths.push({ path: libPath.path, error: 'Path not accessible or drive disconnected' });
        continue;
      }
      accessibleRoots.push(libPath.path);

      if (onProgress) {
        onProgress({ currentPhase: `Discovering audio files in ${path.basename(libPath.path)}...`, processedFiles: 0, totalFiles: 0 });
      }

      const files = await findAllAudioFiles(libPath.path);
      if (files.length === 0) {
        results.emptyPaths.push({ path: libPath.path, error: 'No audio files found' });
      } else {
        allAudioFiles.push(...files);
      }
    } catch (err) {
      console.error(`[MusicScanner] Error gathering from ${libPath.path}:`, err.message);
      results.unreachablePaths.push({ path: libPath.path, error: err.message });
    }
  }

  results.totalFiles = allAudioFiles.length;

  // 2. Pre-fetch known tracks for fast diffing
  const existingTracks = new Map();
  const dbTracks = db.prepare('SELECT id, file_path, file_size FROM music_tracks WHERE file_path IS NOT NULL').all();
  for (const t of dbTracks) {
    existingTracks.set(t.file_path, t);
  }

  const defaultProfile = db.prepare('SELECT id FROM music_quality_profiles ORDER BY id ASC LIMIT 1').get();
  const defaultProfileId = defaultProfile?.id || null;

  // 3. Process each audio file
  let processed = 0;
  for (const filePath of allAudioFiles) {
    if (checkCancelled && checkCancelled()) {
      break;
    }

    processed++;
    results.processedFiles = processed;

    if (onProgress && (processed % 5 === 0 || processed === allAudioFiles.length)) {
      onProgress({
        currentPhase: `Processing audio metadata (${processed}/${allAudioFiles.length})`,
        currentFile: path.basename(filePath),
        processedFiles: processed,
        totalFiles: allAudioFiles.length,
      });
      await new Promise(r => setImmediate(r));
    }

    try {
      const stat = await fsp.stat(filePath).catch(() => null);
      if (!stat) continue;

      const existing = existingTracks.get(filePath);
      if (existing && existing.file_size === stat.size) {
        // Unchanged track — skip re-parsing
        continue;
      }

      // Read audio tags via ffprobe
      const tags = await readAudioTags(filePath);
      const artistName = (tags.albumArtist || tags.artist || 'Unknown Artist').trim();
      let albumTitle = (tags.album || path.basename(path.dirname(filePath)) || 'Unknown Album').trim();
      const discMatch = albumTitle.match(/\s*(?:[([{-]|\b)(?:cd|disc|disk)\s*(\d+)(?:[)\]}]|\b|$)/i);
      let discNumber = tags.discNumber || 1;
      if (discMatch) {
        if (!discNumber || discNumber === 1) {
          discNumber = parseInt(discMatch[1], 10);
        }
        albumTitle = albumTitle.replace(discMatch[0], '').replace(/\s{2,}/g, ' ').replace(/\s*[-–—]\s*$/, '').trim();
      }

      // Check if folder is a CD/Disc subfolder
      let albumFolder = path.dirname(filePath);
      const parentDir = path.basename(albumFolder);
      const folderDiscMatch = parentDir.match(/^(?:cd|disc|disk)\s*(\d+)$/i);
      if (folderDiscMatch) {
        if (!discMatch || discNumber === 1) {
          discNumber = parseInt(folderDiscMatch[1], 10);
        }
        albumFolder = path.dirname(albumFolder);
        if (albumTitle.toLowerCase() === parentDir.toLowerCase()) {
          albumTitle = path.basename(albumFolder).replace(/\s*\(\d{4}\)$/, '').trim();
        }
      }
      albumTitle = albumTitle.replace(/\s*\(\d{4}\)$/, '').trim();

      const trackTitle = (tags.title || path.basename(filePath, path.extname(filePath))).trim();
      const trackNumber = tags.trackNumber || 1;
      const format = tags.codec || parseMusicFormat(filePath) || path.extname(filePath).replace('.', '').toUpperCase();

      // Find or create artist
      let artist = null;
      if (tags.mbidArtist) {
        artist = db.prepare('SELECT id, name, folder_path FROM music_artists WHERE mbid = ?').get(tags.mbidArtist);
      }
      if (!artist && artistName) {
        artist = db.prepare(`
          SELECT id, name, folder_path FROM music_artists
          WHERE name LIKE ? COLLATE NOCASE OR sort_name LIKE ? COLLATE NOCASE
          LIMIT 1
        `).get(artistName, artistName);
      }
      if (!artist) {
        let artistFolder = path.dirname(path.dirname(filePath));
        if (/^(?:cd|disc|disk)\s*\d+$/i.test(path.basename(path.dirname(filePath)))) {
          artistFolder = path.dirname(artistFolder);
        }
        const insertArtist = db.prepare(`
          INSERT INTO music_artists (mbid, name, sort_name, genres, status, monitored, folder_path, quality_profile_id)
          VALUES (?, ?, ?, ?, 'monitored', 1, ?, ?)
        `).run(
          tags.mbidArtist || null,
          artistName,
          artistName,
          JSON.stringify(tags.genre ? [tags.genre] : []),
          artistFolder,
          defaultProfileId
        );
        artist = { id: insertArtist.lastInsertRowid, name: artistName, folder_path: artistFolder };
        results.addedArtistsCount++;
      }
      if (artist?.id) {
        touchedArtistIds.add(artist.id);
      }

      // Find or create album
      let album = null;
      if (tags.mbidRelease) {
        album = db.prepare('SELECT id, title, folder_path FROM music_albums WHERE mbid = ?').get(tags.mbidRelease);
      }
      if (!album && albumTitle) {
        album = db.prepare(`
          SELECT id, title, folder_path FROM music_albums
          WHERE artist_id = ? AND title LIKE ? COLLATE NOCASE
          LIMIT 1
        `).get(artist.id, albumTitle);

        // Fallback: match by clean alphanumeric title
        if (!album) {
          const cleanNorm = albumTitle.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          const artistAlbums = db.prepare('SELECT id, title, folder_path FROM music_albums WHERE artist_id = ?').all(artist.id);
          album = artistAlbums.find(a => a.title.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === cleanNorm) || null;
        }
      }
      if (!album) {
        const insertAlbum = db.prepare(`
          INSERT INTO music_albums (
            mbid, artist_id, title, year, album_type, status, monitored,
            folder_path, file_format, file_bitdepth, file_samplerate, quality_profile_id
          ) VALUES (?, ?, ?, ?, 'Album', 'downloaded', 1, ?, ?, ?, ?, ?)
        `).run(
          tags.mbidRelease || null,
          artist.id,
          albumTitle,
          tags.year || null,
          albumFolder,
          format,
          tags.bitsPerSample || null,
          tags.sampleRate || null,
          defaultProfileId
        );
        album = { id: insertAlbum.lastInsertRowid, title: albumTitle, folder_path: albumFolder };
        results.addedAlbumsCount++;
      }

      // Insert or update track record
      db.prepare(`
        INSERT INTO music_tracks (
          mbid, album_id, artist_id, title, track_number, disc_number,
          duration, file_path, file_size, format, bitrate, bitdepth, samplerate, status, monitored
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'downloaded', 1)
        ON CONFLICT(album_id, disc_number, track_number) DO UPDATE SET
          title = excluded.title,
          file_path = excluded.file_path,
          file_size = excluded.file_size,
          format = excluded.format,
          bitrate = excluded.bitrate,
          bitdepth = excluded.bitdepth,
          samplerate = excluded.samplerate,
          duration = excluded.duration,
          status = 'downloaded'
      `).run(
        tags.mbidRecording || null,
        album.id,
        artist.id,
        trackTitle,
        trackNumber,
        discNumber,
        tags.duration || null,
        filePath,
        stat.size,
        format,
        tags.bitrate || null,
        tags.bitsPerSample || null,
        tags.sampleRate || null
      );

      // Keep album updated
      db.prepare(`
        UPDATE music_albums SET
          status = 'downloaded',
          file_format = COALESCE(file_format, ?),
          track_count = (SELECT COUNT(*) FROM music_tracks WHERE album_id = ?),
          file_size = (SELECT COALESCE(SUM(file_size), 0) FROM music_tracks WHERE album_id = ?)
        WHERE id = ?
      `).run(format, album.id, album.id, album.id);

      // Ensure album folder on disk has cover.jpg
      if (albumFolder && !imageService.findAlbumFolderCover(albumFolder)) {
        try {
          const folderCover = path.join(albumFolder, 'cover.jpg');
          const extracted = await imageService.extractEmbeddedCover(filePath, folderCover);
          if (!extracted && album.mbid) {
            const cachedCover = imageService.albumCoverPath(album.mbid);
            if (fs.existsSync(cachedCover)) {
              imageService.saveCoverToAlbumFolder(albumFolder, cachedCover);
            }
          }
        } catch { /* ignore */ }
      }

      results.addedTracksCount++;
      if (results.addedTracks.length < 50) {
        results.addedTracks.push({
          title: trackTitle,
          artist: artist.name,
          album: album.title,
          path: filePath
        });
      }
    } catch (err) {
      console.error(`[MusicScanner] Failed processing file ${filePath}:`, err.message);
      results.errors.push(`Failed to scan ${path.basename(filePath)}: ${err.message}`);
    }
  }

  // 4. Verify removed / deleted files on accessible roots
  if (onProgress && !(checkCancelled && checkCancelled())) {
    onProgress({ currentPhase: 'Checking for deleted music files...', processedFiles: processed, totalFiles: allAudioFiles.length });
  }

  const existingDownloadTracks = db.prepare('SELECT id, album_id, file_path FROM music_tracks WHERE file_path IS NOT NULL').all();
  const affectedAlbumIds = new Set();

  for (const trk of existingDownloadTracks) {
    if (accessibleRoots.some(r => isInsideRoot(r, trk.file_path))) {
      if (!fs.existsSync(trk.file_path)) {
        db.prepare("UPDATE music_tracks SET file_path = NULL, file_size = 0, status = 'monitored' WHERE id = ?").run(trk.id);
        results.removedTracksCount++;
        affectedAlbumIds.add(trk.album_id);
      }
    }
  }

  for (const albumId of affectedAlbumIds) {
    const downloadedRemaining = db.prepare("SELECT COUNT(*) as count FROM music_tracks WHERE album_id = ? AND file_path IS NOT NULL").get(albumId)?.count || 0;
    if (downloadedRemaining === 0) {
      db.prepare("UPDATE music_albums SET status = 'monitored' WHERE id = ?").run(albumId);
    }
  }

  // 5. Consolidate any multi-disc split albums
  consolidateMultiDiscAlbums(db);

  // 6. Enrich touched artists with MusicBrainz metadata, release groups & missing albums
  if (touchedArtistIds.size > 0) {
    const artistList = Array.from(touchedArtistIds);
    let idx = 0;
    for (const artistId of artistList) {
      if (checkCancelled && checkCancelled()) break;
      idx++;

      const art = db.prepare('SELECT id, name, mbid, last_refreshed_at FROM music_artists WHERE id = ?').get(artistId);
      if (!art) continue;

      const hasMonitoredAlbums = db.prepare("SELECT COUNT(*) as count FROM music_albums WHERE artist_id = ? AND status = 'monitored'").get(artistId)?.count > 0;

      // If the artist already has an MBID and has their discography synced with monitored albums, skip re-syncing during file scan
      if (art.mbid && art.last_refreshed_at && hasMonitoredAlbums) {
        continue;
      }

      if (onProgress) {
        onProgress({
          currentPhase: `Syncing artist discography (${idx}/${artistList.length}): ${art.name}`,
          currentFile: art.name,
          processedFiles: idx,
          totalFiles: artistList.length,
        });
      }

      try {
        const preCount = db.prepare('SELECT COUNT(*) as count FROM music_albums WHERE artist_id = ?').get(artistId)?.count || 0;
        await musicLibraryService.refreshArtist(artistId);
        const postCount = db.prepare('SELECT COUNT(*) as count FROM music_albums WHERE artist_id = ?').get(artistId)?.count || 0;
        if (postCount > preCount) {
          results.addedAlbumsCount += (postCount - preCount);
        }
      } catch (err) {
        console.warn(`[MusicScanner] Could not refresh artist ${art.name}:`, err.message);
      }
    }
  }

  if (results.addedTracksCount > 0 || results.removedTracksCount > 0 || results.addedAlbumsCount > 0) {
    eventBus.emit({
      type: 'MUSIC_LIBRARY_SCANNED',
      addedTracks: results.addedTracksCount,
      addedAlbums: results.addedAlbumsCount,
      removedTracks: results.removedTracksCount,
    });
  }

  try {
    require('../routes/library/system').invalidateStatsCache();
  } catch { /* ignore */ }

  return results;
};

/**
 * Consolidates split multi-disc albums (e.g. "Album (CD1)" and "Album (Disc 2)") into a single
 * canonical album ("Album") with tracks assigned to their respective disc numbers.
 */
const consolidateMultiDiscAlbums = (database = db) => {
  try {
    const allAlbums = database.prepare(`
      SELECT id, artist_id, title, folder_path, cover_path, status, file_format, file_bitdepth, file_samplerate
      FROM music_albums
    `).all();

    const splitAlbums = allAlbums.filter(a => /\s*(?:[([{-]|\b)(?:cd|disc|disk)\s*(\d+)(?:[)\]}]|\b|$)/i.test(a.title));

    for (const split of splitAlbums) {
      const match = split.title.match(/\s*(?:[([{-]|\b)(?:cd|disc|disk)\s*(\d+)(?:[)\]}]|\b|$)/i);
      const splitDisc = match ? parseInt(match[1], 10) : 1;
      const cleanTitle = split.title.replace(match[0], '').replace(/\s{2,}/g, ' ').replace(/\s*[-–—]\s*$/, '').trim();
      const cleanNorm = cleanTitle.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

      // Find the canonical/target album for the same artist
      const artistAlbums = database.prepare(`
        SELECT id, title, cover_path, folder_path, status
        FROM music_albums
        WHERE artist_id = ? AND id != ?
      `).all(split.artist_id, split.id);

      const target = artistAlbums.find(a => {
        const aNorm = a.title.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return aNorm === cleanNorm || a.title.toLowerCase() === cleanTitle.toLowerCase();
      });

      if (!target) {
        // No pre-existing canonical album found — turn this split album into the canonical album
        database.prepare(`
          UPDATE music_albums SET
            title = ?
          WHERE id = ?
        `).run(cleanTitle, split.id);

        database.prepare(`
          UPDATE music_tracks SET disc_number = ? WHERE album_id = ? AND (disc_number IS NULL OR disc_number = 1)
        `).run(splitDisc, split.id);
        continue;
      }

      console.log(`[MusicScanner] Consolidating split album "${split.title}" (id: ${split.id}, disc: ${splitDisc}) into "${target.title}" (id: ${target.id})`);

      // Fetch tracks from split album
      const splitTracks = database.prepare('SELECT * FROM music_tracks WHERE album_id = ?').all(split.id);
      for (const trk of splitTracks) {
        const targetDisc = (trk.disc_number && trk.disc_number > 1) ? trk.disc_number : splitDisc;

        // Check if placeholder track exists in target album
        const existing = database.prepare(`
          SELECT id, file_path FROM music_tracks
          WHERE album_id = ? AND disc_number = ? AND track_number = ?
        `).get(target.id, targetDisc, trk.track_number);

        if (existing) {
          if (!existing.file_path && trk.file_path) {
            database.prepare(`
              UPDATE music_tracks SET
                title = ?,
                file_path = ?,
                file_size = ?,
                format = ?,
                bitrate = ?,
                bitdepth = ?,
                samplerate = ?,
                duration = COALESCE(?, duration),
                status = 'downloaded'
              WHERE id = ?
            `).run(trk.title, trk.file_path, trk.file_size, trk.format, trk.bitrate, trk.bitdepth, trk.samplerate, trk.duration, existing.id);
          }
        } else {
          database.prepare(`
            INSERT INTO music_tracks (
              mbid, album_id, artist_id, title, track_number, disc_number,
              duration, file_path, file_size, format, bitrate, bitdepth, samplerate, status, monitored
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(album_id, disc_number, track_number) DO UPDATE SET
              file_path = excluded.file_path,
              file_size = excluded.file_size,
              status = excluded.status
          `).run(
            trk.mbid,
            target.id,
            target.artist_id || split.artist_id,
            trk.title,
            trk.track_number,
            targetDisc,
            trk.duration,
            trk.file_path,
            trk.file_size,
            trk.format,
            trk.bitrate,
            trk.bitdepth,
            trk.samplerate,
            trk.status || 'downloaded',
            1
          );
        }
      }

      // Copy cover if target doesn't have one
      if (!target.cover_path && split.cover_path) {
        database.prepare('UPDATE music_albums SET cover_path = ? WHERE id = ?').run(split.cover_path, target.id);
      }

      // Clean folder_path on target if needed
      let targetFolder = target.folder_path;
      if ((!targetFolder || targetFolder.includes('#recycle')) && split.folder_path && !split.folder_path.includes('#recycle')) {
        targetFolder = split.folder_path;
        if (/^(?:cd|disc|disk)\s*\d+$/i.test(path.basename(targetFolder))) {
          targetFolder = path.dirname(targetFolder);
        }
        database.prepare('UPDATE music_albums SET folder_path = ? WHERE id = ?').run(targetFolder, target.id);
      }

      // Delete the split album and its original track rows
      database.prepare('DELETE FROM music_tracks WHERE album_id = ?').run(split.id);
      database.prepare('DELETE FROM music_albums WHERE id = ?').run(split.id);

      // Update target album counts and status
      database.prepare(`
        UPDATE music_albums SET
          status = 'downloaded',
          file_format = COALESCE(file_format, ?),
          file_bitdepth = COALESCE(file_bitdepth, ?),
          file_samplerate = COALESCE(file_samplerate, ?),
          track_count = (SELECT COUNT(*) FROM music_tracks WHERE album_id = ?),
          file_size = (SELECT COALESCE(SUM(file_size), 0) FROM music_tracks WHERE album_id = ?)
        WHERE id = ?
      `).run(split.file_format || 'flac', split.file_bitdepth, split.file_samplerate, target.id, target.id, target.id);
    }
  } catch (err) {
    console.error('[MusicScanner] consolidateMultiDiscAlbums error:', err.message);
  }
};

module.exports = {
  scanMusicLibrary,
  consolidateMultiDiscAlbums,
};
