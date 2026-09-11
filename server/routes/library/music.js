/**
 * server/routes/library/music.js
 * Full REST API for Music: artists, albums, tracks, quality profiles, stats.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../../config/database');
const musicLibraryService = require('../../services/musicLibraryService');
const musicMetadataService = require('../../services/musicMetadataService');
const indexerService = require('../../services/indexerService');
const imageService = require('../../services/imageService');
const { getSetting } = require('../../utils/settings');

// ── Helper: serve local image or 404 ────────────────────────────────────────
const serveImage = (res, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    return res.sendFile(path.resolve(filePath));
  }
  res.status(404).json({ status: 'error', message: 'Image not found' });
};

// ── Artist & Album Images ───────────────────────────────────────────────────
router.get('/artists/:mbid/image', async (req, res) => {
  const { mbid } = req.params;
  let filePath = imageService.artistImagePath(mbid);
  if (!fs.existsSync(filePath)) {
    try {
      const artist = db.prepare('SELECT name, image_path FROM music_artists WHERE mbid = ?').get(mbid);
      if (artist?.image_path && artist.image_path.startsWith('http')) {
        filePath = await imageService.ensureArtistImage(mbid, artist.image_path);
      } else {
        // No image known yet — resolve one from an external provider and persist it.
        const imageUrl = await musicMetadataService.getArtistImageUrl(mbid, artist?.name);
        if (imageUrl) {
          filePath = await imageService.ensureArtistImage(mbid, imageUrl);
          db.prepare('UPDATE music_artists SET image_path = ? WHERE mbid = ?').run(imageUrl, mbid);
        }
      }
    } catch { /* ignore */ }
  }
  serveImage(res, filePath);
});

router.get('/albums/:mbid/cover', async (req, res) => {
  const { mbid } = req.params;
  let filePath = imageService.albumCoverPath(mbid);
  if (!fs.existsSync(filePath)) {
    try {
      const album = db.prepare('SELECT cover_path, folder_path FROM music_albums WHERE mbid = ?').get(mbid);

      // 1. Prefer cover art that was imported into the album's library folder
      const localCover = imageService.findAlbumFolderCover(album?.folder_path);
      if (localCover) {
        filePath = localCover;
      } else {
        // 2. Fall back to a known URL on the album row, else Cover Art Archive
        let coverUrl = null;
        if (album?.cover_path && album.cover_path.startsWith('http')) {
          coverUrl = album.cover_path;
        } else {
          coverUrl = await musicMetadataService.getAlbumCoverUrl(mbid);
        }
        if (coverUrl) {
          filePath = await imageService.ensureAlbumCover(mbid, coverUrl);
        }
      }
    } catch { /* ignore */ }
  }
  serveImage(res, filePath);
});

// ── Stats ──────────────────────────────────────────────────────────────────────
router.get('/stats', (req, res, next) => {
  try {
    const stats = musicLibraryService.getMusicStats();
    res.json({ status: 'success', data: stats });
  } catch (err) { next(err); }
});

// ── Missing Albums ─────────────────────────────────────────────────────────────
router.get('/missing', (req, res, next) => {
  try {
    const missing = musicLibraryService.getMissingAlbums();
    res.json({ status: 'success', data: missing });
  } catch (err) { next(err); }
});

// ── Quality Profiles ──────────────────────────────────────────────────────────
router.get('/quality-profiles', (req, res, next) => {
  try {
    const profiles = db.prepare('SELECT * FROM music_quality_profiles ORDER BY id ASC').all();
    res.json({ status: 'success', data: profiles });
  } catch (err) { next(err); }
});

router.post('/quality-profiles', (req, res, next) => {
  try {
    const { name, preferred_format, accepted_formats, min_bitrate, cutoff_format, upgrade_allowed } = req.body;
    if (!name) return res.status(400).json({ status: 'error', message: 'name is required' });
    const result = db.prepare(`
      INSERT INTO music_quality_profiles (name, preferred_format, accepted_formats, min_bitrate, cutoff_format, upgrade_allowed)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, preferred_format || 'FLAC', JSON.stringify(accepted_formats || ['FLAC']),
      min_bitrate || 0, cutoff_format || 'FLAC', upgrade_allowed !== false ? 1 : 0);
    const profile = db.prepare('SELECT * FROM music_quality_profiles WHERE id = ?').get(result.lastInsertRowid);
    res.json({ status: 'success', data: profile });
  } catch (err) { next(err); }
});

router.put('/quality-profiles/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, preferred_format, accepted_formats, min_bitrate, cutoff_format, upgrade_allowed } = req.body;
    db.prepare(`
      UPDATE music_quality_profiles
      SET name = ?, preferred_format = ?, accepted_formats = ?, min_bitrate = ?, cutoff_format = ?, upgrade_allowed = ?
      WHERE id = ?
    `).run(name, preferred_format, JSON.stringify(accepted_formats || []), min_bitrate, cutoff_format, upgrade_allowed ? 1 : 0, id);
    const profile = db.prepare('SELECT * FROM music_quality_profiles WHERE id = ?').get(id);
    res.json({ status: 'success', data: profile });
  } catch (err) { next(err); }
});

router.delete('/quality-profiles/:id', (req, res, next) => {
  try {
    db.prepare('DELETE FROM music_quality_profiles WHERE id = ?').run(req.params.id);
    res.json({ status: 'success' });
  } catch (err) { next(err); }
});

// ── MusicBrainz Search (for adding new artists/albums) ───────────────────────
router.get('/search', async (req, res, next) => {
  try {
    const { q, type = 'artist' } = req.query;
    if (!q) return res.json({ status: 'success', data: [] });

    let results;
    if (type === 'artist') {
      results = await musicMetadataService.searchArtist(q);
    } else if (type === 'album') {
      let artist = '';
      let album = '';
      if (q.includes(' - ')) {
        const [a, ...albumParts] = q.split(' - ');
        artist = a.trim();
        album = albumParts.join(' - ').trim();
      } else {
        album = q.trim();
      }
      results = await musicMetadataService.searchAlbum(artist, album);
    } else {
      results = await musicMetadataService.searchArtist(q);
    }

    // Annotate with "already in library" flag
    const annotated = results.map(r => {
      const inLibrary = type === 'artist'
        ? !!db.prepare('SELECT 1 FROM music_artists WHERE mbid = ?').get(r.mbid)
        : !!db.prepare('SELECT 1 FROM music_albums WHERE mbid = ?').get(r.mbid);
      return { ...r, inLibrary };
    });

    res.json({ status: 'success', data: annotated });
  } catch (err) { next(err); }
});

// ── Artists ───────────────────────────────────────────────────────────────────
router.get('/artists', (req, res, next) => {
  try {
    const { sort = 'name_asc', monitored, status, limit = 0, offset = 0 } = req.query;
    const filters = {};
    if (monitored !== undefined) filters.monitored = monitored === 'true' || monitored === '1';
    if (status) filters.status = status;

    const artists = musicLibraryService.getArtists(parseInt(limit), parseInt(offset), sort, filters);
    res.json({ status: 'success', data: artists });
  } catch (err) { next(err); }
});

router.post('/artists', async (req, res, next) => {
  try {
    const { mbid, rootFolderPath, qualityProfileId } = req.body;
    if (!mbid) return res.status(400).json({ status: 'error', message: 'mbid is required' });
    const artist = await musicLibraryService.addArtist(mbid, rootFolderPath, qualityProfileId);

    // Kick off artist photo + cover art downloads (non-blocking)
    setImmediate(async () => {
      try {
        const imageUrl = await musicMetadataService.getArtistImageUrl(artist.mbid, artist.name);
        if (imageUrl) {
          await imageService.ensureArtistImage(artist.mbid, imageUrl);
          db.prepare('UPDATE music_artists SET image_path = ? WHERE id = ?').run(imageUrl, artist.id);
        }
      } catch { /* ignore */ }

      const albums = db.prepare('SELECT mbid FROM music_albums WHERE artist_id = ? LIMIT 10').all(artist.id);
      for (const album of albums) {
        try {
          const coverUrl = await musicMetadataService.getAlbumCoverUrl(album.mbid);
          if (coverUrl) await imageService.ensureAlbumCover(album.mbid, coverUrl);
        } catch { /* ignore */ }
      }
    });

    res.json({ status: 'success', data: artist });
  } catch (err) {
    if (err.message === 'Artist already in library') return res.status(409).json({ status: 'error', message: err.message });
    next(err);
  }
});

router.get('/artists/:id', (req, res, next) => {
  try {
    const artist = musicLibraryService.getArtistById(parseInt(req.params.id));
    if (!artist) return res.status(404).json({ status: 'error', message: 'Artist not found' });

    // Annotate albums with cover URL
    const albums = (artist.albums || []).map(a => ({
      ...a,
      cover_url: a.mbid ? `/api/library/music/albums/${a.mbid}/cover` : null,
      genres: (() => { try { return JSON.parse(a.genres); } catch { return []; } })(),
    }));

    res.json({ status: 'success', data: { ...artist, albums } });
  } catch (err) { next(err); }
});

router.put('/artists/:id', (req, res, next) => {
  try {
    musicLibraryService.updateArtist(parseInt(req.params.id), req.body);
    const artist = musicLibraryService.getArtistById(parseInt(req.params.id));
    res.json({ status: 'success', data: artist });
  } catch (err) { next(err); }
});

router.delete('/artists/:id', async (req, res, next) => {
  try {
    const deleteFiles = req.query.deleteFiles === 'true';
    await musicLibraryService.deleteArtist(parseInt(req.params.id), deleteFiles);
    res.json({ status: 'success' });
  } catch (err) { next(err); }
});

router.post('/artists/:id/refresh', async (req, res, next) => {
  try {
    const artist = db.prepare('SELECT * FROM music_artists WHERE id = ?').get(parseInt(req.params.id));
    if (!artist) return res.status(404).json({ status: 'error', message: 'Artist not found' });

    musicMetadataService.clearCache(artist.mbid);
    const fresh = await musicMetadataService.getArtistById(artist.mbid);

    db.prepare(`
      UPDATE music_artists SET overview = ?, genres = ?, rating = ?, last_refreshed_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(fresh.overview || '', JSON.stringify(fresh.genres || []), fresh.rating || 0, artist.id);

    // (Re)resolve the artist photo if we don't already have one cached
    if (!fs.existsSync(imageService.artistImagePath(artist.mbid))) {
      try {
        const imageUrl = await musicMetadataService.getArtistImageUrl(artist.mbid, artist.name);
        if (imageUrl) {
          await imageService.ensureArtistImage(artist.mbid, imageUrl);
          db.prepare('UPDATE music_artists SET image_path = ? WHERE id = ?').run(imageUrl, artist.id);
        }
      } catch { /* ignore */ }
    }

    await musicLibraryService.syncArtistAlbums(artist.id, fresh.releaseGroups || []);
    res.json({ status: 'success', message: `Refreshed ${artist.name}` });
  } catch (err) { next(err); }
});

router.post('/artists/:id/search', async (req, res, next) => {
  try {
    const artist = db.prepare('SELECT * FROM music_artists WHERE id = ?').get(parseInt(req.params.id));
    if (!artist) return res.status(404).json({ status: 'error', message: 'Artist not found' });

    const missingAlbums = db.prepare(`
      SELECT * FROM music_albums WHERE artist_id = ? AND monitored = 1 AND status = 'monitored'
    `).all(artist.id);

    let searched = 0;
    for (const album of missingAlbums) {
      const profile = db.prepare('SELECT * FROM music_quality_profiles WHERE id = ?').get(album.quality_profile_id);
      await indexerService.searchMusic(artist.name, album.title, profile, false);
      searched++;
    }

    res.json({ status: 'success', message: `Triggered search for ${searched} missing albums` });
  } catch (err) { next(err); }
});

// ── Albums ────────────────────────────────────────────────────────────────────
router.get('/albums', (req, res, next) => {
  try {
    const { sort = 'added_desc', monitored, status, albumType, search, artistId, limit = 0, offset = 0 } = req.query;
    const filters = {};
    if (monitored !== undefined) filters.monitored = monitored === 'true' || monitored === '1';
    if (status) filters.status = status;
    if (albumType) filters.albumType = albumType;
    if (search) filters.search = search;
    if (artistId) filters.artistId = parseInt(artistId);

    const albums = musicLibraryService.getAlbums(parseInt(limit), parseInt(offset), sort, filters);
    const annotated = albums.map(a => ({
      ...a,
      cover_url: a.mbid ? `/api/library/music/albums/${a.mbid}/cover` : null,
      genres: (() => { try { return JSON.parse(a.genres); } catch { return []; } })(),
    }));
    res.json({ status: 'success', data: annotated });
  } catch (err) { next(err); }
});

router.post('/albums', async (req, res, next) => {
  try {
    const { mbid, artistMbid, rootFolderPath, qualityProfileId } = req.body;
    if (!mbid) return res.status(400).json({ status: 'error', message: 'mbid is required' });

    let album = db.prepare('SELECT * FROM music_albums WHERE mbid = ?').get(mbid);
    if (album) {
      db.prepare("UPDATE music_albums SET monitored = 1 WHERE id = ?").run(album.id);
      return res.json({ status: 'success', data: musicLibraryService.getAlbumById(album.id) });
    }

    const albumData = await musicMetadataService.getAlbumById(mbid);
    if (!albumData) return res.status(404).json({ status: 'error', message: 'Album not found on MusicBrainz' });

    const aMbid = artistMbid || albumData.artistMbid;
    let artist = null;
    if (aMbid) {
      artist = db.prepare('SELECT * FROM music_artists WHERE mbid = ?').get(aMbid);
    }
    if (!artist && albumData.artistCredit) {
      artist = db.prepare('SELECT * FROM music_artists WHERE name = ? COLLATE NOCASE').get(albumData.artistCredit);
    }

    if (!artist && aMbid) {
      artist = await musicLibraryService.addArtist(aMbid, rootFolderPath, qualityProfileId);
    }

    album = db.prepare('SELECT * FROM music_albums WHERE mbid = ?').get(mbid);
    if (!album && artist) {
      const profileId = qualityProfileId || artist.quality_profile_id;
      const resInsert = db.prepare(`
        INSERT INTO music_albums (mbid, artist_id, title, release_date, year, album_type, status, monitored, quality_profile_id)
        VALUES (?, ?, ?, ?, ?, ?, 'monitored', 1, ?)
      `).run(mbid, artist.id, albumData.title, albumData.releaseDate, albumData.year, albumData.albumType, profileId);
      album = db.prepare('SELECT * FROM music_albums WHERE id = ?').get(resInsert.lastInsertRowid);
    } else if (album) {
      db.prepare("UPDATE music_albums SET monitored = 1 WHERE id = ?").run(album.id);
    }

    setImmediate(async () => {
      try {
        const coverUrl = await musicMetadataService.getAlbumCoverUrl(mbid);
        if (coverUrl) await imageService.ensureAlbumCover(mbid, coverUrl);
      } catch { /* ignore */ }
    });

    const fullAlbum = album ? musicLibraryService.getAlbumById(album.id) : null;
    res.json({ status: 'success', data: fullAlbum });
  } catch (err) { next(err); }
});

router.get('/albums/:id', (req, res, next) => {
  try {
    const album = musicLibraryService.getAlbumById(parseInt(req.params.id));
    if (!album) return res.status(404).json({ status: 'error', message: 'Album not found' });
    res.json({ status: 'success', data: {
      ...album,
      cover_url: album.mbid ? `/api/library/music/albums/${album.mbid}/cover` : null,
      genres: (() => { try { return JSON.parse(album.genres); } catch { return []; } })(),
    }});
  } catch (err) { next(err); }
});

router.put('/albums/:id', (req, res, next) => {
  try {
    musicLibraryService.updateAlbum(parseInt(req.params.id), req.body);
    const album = musicLibraryService.getAlbumById(parseInt(req.params.id));
    res.json({ status: 'success', data: album });
  } catch (err) { next(err); }
});

router.delete('/albums/:id', async (req, res, next) => {
  try {
    const deleteFiles = req.query.deleteFiles === 'true';
    await musicLibraryService.deleteAlbum(parseInt(req.params.id), deleteFiles);
    res.json({ status: 'success' });
  } catch (err) { next(err); }
});

// Manual search — returns list of results for ManualSearchModal
router.get('/albums/:id/search', async (req, res, next) => {
  try {
    const album = db.prepare(`
      SELECT al.*, a.name as artist_name FROM music_albums al
      JOIN music_artists a ON a.id = al.artist_id WHERE al.id = ?
    `).get(parseInt(req.params.id));
    if (!album) return res.status(404).json({ status: 'error', message: 'Album not found' });

    const profile = db.prepare('SELECT * FROM music_quality_profiles WHERE id = ?').get(album.quality_profile_id);
    const results = await indexerService.searchMusic(album.artist_name, album.title, profile, true);
    res.json({ status: 'success', data: results });
  } catch (err) { next(err); }
});

// Automated search — finds best release and sends to download client
router.post('/albums/:id/search', async (req, res, next) => {
  try {
    const album = db.prepare(`
      SELECT al.*, a.name as artist_name FROM music_albums al
      JOIN music_artists a ON a.id = al.artist_id WHERE al.id = ?
    `).get(parseInt(req.params.id));
    if (!album) return res.status(404).json({ status: 'error', message: 'Album not found' });

    const profile = db.prepare('SELECT * FROM music_quality_profiles WHERE id = ?').get(album.quality_profile_id);
    const results = await indexerService.searchMusic(album.artist_name, album.title, profile, false);
    if (!results || results.length === 0) {
      return res.status(404).json({ status: 'error', message: 'No releases found on indexers' });
    }

    const best = results[0];
    const downloadClientService = require('../../services/downloadClientService');
    await downloadClientService.addTorrent(best.link, 'music');
    db.prepare("UPDATE music_albums SET status = 'downloading' WHERE id = ?").run(album.id);

    res.json({ status: 'success', message: `Found and queued: ${best.title}`, data: best });
  } catch (err) { next(err); }
});

router.post('/albums/:id/grab', async (req, res, next) => {
  try {
    const { downloadUrl, magnetUrl, title, link, torrentUrl } = req.body;
    const torrentUri = link || torrentUrl || downloadUrl || magnetUrl;
    if (!torrentUri) return res.status(400).json({ status: 'error', message: 'Torrent link is required' });
    const downloadClientService = require('../../services/downloadClientService');
    await downloadClientService.addTorrent(torrentUri, 'music');
    const albumId = parseInt(req.params.id);
    db.prepare("UPDATE music_albums SET status = 'downloading' WHERE id = ?").run(albumId);
    res.json({ status: 'success', message: `Queued: ${title || 'Album release'}` });
  } catch (err) { next(err); }
});

// ── Tracks ────────────────────────────────────────────────────────────────────
router.get('/tracks', (req, res, next) => {
  try {
    const { albumId, artistId, limit = 100, offset = 0 } = req.query;
    let query = 'SELECT t.*, a.name as artist_name, al.title as album_title FROM music_tracks t JOIN music_artists a ON a.id = t.artist_id JOIN music_albums al ON al.id = t.album_id WHERE 1=1';
    const params = [];
    if (albumId) { query += ' AND t.album_id = ?'; params.push(parseInt(albumId)); }
    if (artistId) { query += ' AND t.artist_id = ?'; params.push(parseInt(artistId)); }
    query += ' ORDER BY al.year ASC, t.disc_number ASC, t.track_number ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    const tracks = db.prepare(query).all(...params);
    res.json({ status: 'success', data: tracks });
  } catch (err) { next(err); }
});

router.put('/tracks/:id', (req, res, next) => {
  try {
    musicLibraryService.updateTrack(parseInt(req.params.id), req.body);
    res.json({ status: 'success' });
  } catch (err) { next(err); }
});

// ── Audio Streaming ───────────────────────────────────────────────────────────
router.get('/tracks/:id/stream', (req, res, next) => {
  try {
    const track = db.prepare('SELECT file_path, format, title FROM music_tracks WHERE id = ?').get(req.params.id);
    if (!track || !track.file_path) {
      return res.status(404).json({ status: 'error', message: 'Track file not found' });
    }

    const resolvedPath = path.resolve(track.file_path);
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ status: 'error', message: 'Audio file missing on disk' });
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const mimeTypes = {
      '.flac': 'audio/flac',
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
      '.opus': 'audio/opus',
      '.wav': 'audio/wav',
      '.alac': 'audio/alac',
      '.aiff': 'audio/aiff'
    };
    const contentType = mimeTypes[ext] || 'audio/mpeg';

    const stat = fs.statSync(resolvedPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(resolvedPath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes'
      };
      res.writeHead(200, head);
      fs.createReadStream(resolvedPath).pipe(res);
    }
  } catch (err) { next(err); }
});

// ── Album Tracks List for Playback ───────────────────────────────────────────
router.get('/albums/:id/tracks', (req, res, next) => {
  try {
    const tracks = db.prepare(`
      SELECT t.*, a.name as artist_name, al.title as album_title, al.mbid as album_mbid
      FROM music_tracks t
      JOIN music_artists a ON a.id = t.artist_id
      JOIN music_albums al ON al.id = t.album_id
      WHERE t.album_id = ?
      ORDER BY t.disc_number ASC, t.track_number ASC
    `).all(req.params.id);
    res.json({ status: 'success', data: tracks });
  } catch (err) { next(err); }
});

// ── Artist Downloaded Tracks for Playback ─────────────────────────────────────
router.get('/artists/:id/tracks', (req, res, next) => {
  try {
    const tracks = db.prepare(`
      SELECT t.*, a.name as artist_name, al.title as album_title, al.mbid as album_mbid
      FROM music_tracks t
      JOIN music_artists a ON a.id = t.artist_id
      JOIN music_albums al ON al.id = t.album_id
      WHERE a.id = ? AND (t.status = 'downloaded' OR t.file_path IS NOT NULL)
      ORDER BY al.year ASC, al.title COLLATE NOCASE ASC, t.disc_number ASC, t.track_number ASC
    `).all(req.params.id);
    res.json({ status: 'success', data: tracks });
  } catch (err) { next(err); }
});

// ── Search Missing Monitored Albums ──────────────────────────────────────────
router.post('/search-missing', async (req, res, next) => {
  try {
    const missingAlbums = db.prepare(`
      SELECT al.*, a.name as artist_name, a.quality_profile_id as artist_profile_id
      FROM music_albums al
      JOIN music_artists a ON a.id = al.artist_id
      WHERE al.monitored = 1 AND al.status != 'downloaded' AND a.monitored = 1
      ORDER BY al.year DESC
      LIMIT 30
    `).all();

    if (missingAlbums.length === 0) {
      return res.json({ status: 'success', message: 'No missing monitored albums found' });
    }

    setImmediate(async () => {
      const defaultProfile = db.prepare('SELECT * FROM music_quality_profiles WHERE is_default = 1').get()
        || db.prepare('SELECT * FROM music_quality_profiles LIMIT 1').get();

      for (const album of missingAlbums) {
        try {
          const profile = album.quality_profile_id
            ? db.prepare('SELECT * FROM music_quality_profiles WHERE id = ?').get(album.quality_profile_id)
            : defaultProfile;
          await indexerService.searchMusic(album.artist_name, album.title, profile, false);
          await new Promise(r => setTimeout(r, 1500));
        } catch (e) {
          console.error(`[SearchMissing] Failed search for ${album.artist_name} - ${album.title}:`, e.message);
        }
      }
    });

    res.json({
      status: 'success',
      message: `Queued automated release search for ${missingAlbums.length} missing albums`
    });
  } catch (err) { next(err); }
});

// ── Bulk Album Actions ───────────────────────────────────────────────────────
router.post('/albums/bulk', async (req, res, next) => {
  try {
    const { action, albumIds } = req.body;
    if (!Array.isArray(albumIds) || albumIds.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No albumIds provided' });
    }

    if (action === 'monitor') {
      const placeholders = albumIds.map(() => '?').join(',');
      db.prepare(`UPDATE music_albums SET monitored = 1 WHERE id IN (${placeholders})`).run(...albumIds);
      return res.json({ status: 'success', message: `Monitored ${albumIds.length} albums` });
    }

    if (action === 'unmonitor') {
      const placeholders = albumIds.map(() => '?').join(',');
      db.prepare(`UPDATE music_albums SET monitored = 0 WHERE id IN (${placeholders})`).run(...albumIds);
      return res.json({ status: 'success', message: `Unmonitored ${albumIds.length} albums` });
    }

    if (action === 'delete') {
      const { deleteFiles } = req.body;
      let count = 0;
      for (const id of albumIds) {
        await musicLibraryService.deleteAlbum(id, deleteFiles);
        count++;
      }
      return res.json({ status: 'success', message: `Deleted ${count} albums` });
    }

    if (action === 'search') {
      const placeholders = albumIds.map(() => '?').join(',');
      const selected = db.prepare(`
        SELECT al.*, a.name as artist_name
        FROM music_albums al
        JOIN music_artists a ON a.id = al.artist_id
        WHERE al.id IN (${placeholders})
      `).all(...albumIds);

      setImmediate(async () => {
        const defaultProfile = db.prepare('SELECT * FROM music_quality_profiles WHERE is_default = 1').get()
          || db.prepare('SELECT * FROM music_quality_profiles LIMIT 1').get();
        for (const album of selected) {
          try {
            await indexerService.searchMusic(album.artist_name, album.title, defaultProfile, false);
            await new Promise(r => setTimeout(r, 1500));
          } catch (e) {
            console.error(`[BulkSearch] Error searching ${album.artist_name} - ${album.title}:`, e.message);
          }
        }
      });
      return res.json({ status: 'success', message: `Triggered release search for ${selected.length} albums` });
    }

    res.status(400).json({ status: 'error', message: `Unknown action: ${action}` });
  } catch (err) { next(err); }
});

// ── Library Scan ──────────────────────────────────────────────────────────────
router.post('/scan', async (req, res, next) => {
  try {
    const musicPaths = db.prepare("SELECT path FROM library_paths WHERE type = 'music'").all();
    if (musicPaths.length === 0) {
      return res.json({ status: 'success', message: 'No music library paths configured' });
    }
    // Queue a non-blocking scan
    setImmediate(async () => {
      const { isAudioFile } = require('../../utils/fileUtils');
      for (const { path: musicRoot } of musicPaths) {
        console.log(`[MusicScan] Scanning: ${musicRoot}`);
        // Scan logic: find files already imported but maybe moved
        const tracks = db.prepare('SELECT * FROM music_tracks WHERE file_path IS NOT NULL').all();
        for (const track of tracks) {
          if (track.file_path && !require('fs').existsSync(track.file_path)) {
            db.prepare("UPDATE music_tracks SET file_path = NULL, file_size = 0, status = 'monitored' WHERE id = ?").run(track.id);
            db.prepare("UPDATE music_albums SET status = 'monitored' WHERE id = ? AND (SELECT COUNT(*) FROM music_tracks WHERE album_id = ? AND file_path IS NOT NULL) = 0").run(track.album_id, track.album_id);
          }
        }
      }
    });
    res.json({ status: 'success', message: 'Music library scan started' });
  } catch (err) { next(err); }
});

// ── Music Requests ─────────────────────────────────────────────────────────────
router.get('/requests', (req, res, next) => {
  try {
    const userId = req.user?.id;
    const isAdmin = req.user?.role === 'admin';
    const requests = isAdmin
      ? db.prepare(`SELECT mr.*, u.username as requested_by FROM music_requests mr LEFT JOIN users u ON u.id = mr.user_id ORDER BY mr.created_at DESC`).all()
      : db.prepare('SELECT * FROM music_requests WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    res.json({ status: 'success', data: requests });
  } catch (err) { next(err); }
});

router.post('/requests', (req, res, next) => {
  try {
    const { mbid, type, title, artist_name, cover_path } = req.body;
    if (!type) return res.status(400).json({ status: 'error', message: 'type is required' });
    const result = db.prepare(`
      INSERT INTO music_requests (user_id, mbid, type, title, artist_name, cover_path)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user?.id, mbid, type, title, artist_name, cover_path);
    const request = db.prepare('SELECT * FROM music_requests WHERE id = ?').get(result.lastInsertRowid);
    res.json({ status: 'success', data: request });
  } catch (err) { next(err); }
});

router.put('/requests/:id', (req, res, next) => {
  try {
    const { status } = req.body;
    db.prepare('UPDATE music_requests SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ status: 'success' });
  } catch (err) { next(err); }
});

module.exports = router;
