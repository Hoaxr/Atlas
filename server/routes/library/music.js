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

// Bump this whenever the music image pipeline/placeholder behaviour changes, so clients
// stop reusing previously cached art or placeholder images at the same URL.
const MUSIC_IMAGE_VERSION = '2';

// ── Helper: serve local image or SVG fallback ────────────────────────────────
const FALLBACK_DISC_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="background:#0f172a"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/></svg>',
  'utf-8'
);

const serveImage = (res, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    // Real art: allow a short cache window; ETag/Last-Modified still enable revalidation.
    return res.sendFile(path.resolve(filePath), { maxAge: '1h' });
  }
  // The placeholder must never be cached. If it is, a temporarily-missing cover stays
  // "broken" in the browser for the whole max-age window even after real art appears.
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  return res.send(FALLBACK_DISC_SVG);
};

// ── Helper: fall back to an album cover when an artist has no photo ──────────
const resolveArtistImageFromAlbum = async (artist, cacheKey) => {
  const dest = imageService.artistImagePath(cacheKey);
  const albums = db.prepare(`
    SELECT id, mbid, folder_path, cover_path
    FROM music_albums
    WHERE artist_id = ?
    ORDER BY (status = 'downloaded') DESC, year DESC
    LIMIT 12
  `).all(artist.id);

  for (const album of albums) {
    try {
      // 1. Album cover already cached under the album's MBID
      if (album.mbid) {
        const cached = imageService.albumCoverPath(album.mbid);
        if (fs.existsSync(cached)) {
          const copied = imageService.copyImageToCache(cached, dest);
          if (copied) return copied;
        }
      }

      // 2. Cover art file sitting in the album's library folder
      const folderCover = imageService.findAlbumFolderCover(album.folder_path);
      if (folderCover) {
        const copied = imageService.copyImageToCache(folderCover, dest);
        if (copied) return copied;
      }

      // 3. Download the album's known cover URL, if it points at one
      if (album.cover_path && album.cover_path.startsWith('http')) {
        const downloaded = await imageService.ensureAlbumCover(album.mbid || `album_${album.id}`, album.cover_path);
        if (downloaded && fs.existsSync(downloaded)) {
          const copied = imageService.copyImageToCache(downloaded, dest);
          if (copied) return copied;
        }
      }

      // 4. Extract embedded art from one of the album's tracks
      const track = db.prepare('SELECT file_path FROM music_tracks WHERE album_id = ? AND file_path IS NOT NULL LIMIT 1').get(album.id);
      if (track?.file_path) {
        const extracted = await imageService.extractEmbeddedCover(track.file_path, dest);
        if (extracted) return extracted;
      }
    } catch { /* try the next album */ }
  }

  return null;
};

// ── Music auto-search helpers ─────────────────────────────────────────────────

// Search indexers for an album and send the best release to the download client.
// Mirrors the album-level "Auto Search": picks the top result (lossless first,
// then most seeders) and marks the album as downloading. Returns it, or null.
const grabBestReleaseForAlbum = async (album, profile) => {
  const results = await indexerService.searchMusic(album.artist_name, album.title, profile, false);
  const best = results && results[0];
  if (!best || !best.link) return null;

  const downloadClientService = require('../../services/downloadClientService');
  await downloadClientService.addTorrent(best.link, 'music');
  db.prepare("UPDATE music_albums SET status = 'downloading' WHERE id = ?").run(album.id);
  return best;
};

// Queue background auto-search + grab for a list of albums, rate-limited to be
// gentle on indexers. Each album must include artist_name and quality_profile_id.
const queueAlbumSearches = (albums) => {
  if (!Array.isArray(albums) || albums.length === 0) return;
  setImmediate(async () => {
    try {
      // music_quality_profiles has no is_default column — the default is the first profile by id
      // (matches musicLibraryService/musicScannerService).
      const defaultProfile = db.prepare('SELECT * FROM music_quality_profiles ORDER BY id ASC LIMIT 1').get();

      for (const album of albums) {
        try {
          const profile = album.quality_profile_id
            ? db.prepare('SELECT * FROM music_quality_profiles WHERE id = ?').get(album.quality_profile_id)
            : defaultProfile;
          const best = await grabBestReleaseForAlbum(album, profile);
          if (best) console.log(`[MusicSearch] Grabbed "${album.artist_name} - ${album.title}" (${best.title})`);
          else console.log(`[MusicSearch] No release found for "${album.artist_name} - ${album.title}"`);
        } catch (e) {
          console.error(`[MusicSearch] Failed for "${album.artist_name} - ${album.title}":`, e.message);
        }
        await new Promise(r => setTimeout(r, 1500));
      }
    } catch (e) {
      console.error('[MusicSearch] Search queue failed:', e.message);
    }
  });
};

// ── Expected track counts ────────────────────────────────────────────────────

const _expectedCountBackfill = new Set();

// Fill in music_albums.expected_track_count from MusicBrainz in the background so
// album cards can show downloaded/expected (including missing tracks). MusicBrainz
// calls are throttled to ≤1 req/s by musicMetadataService and de-duplicated here.
const backfillExpectedTrackCounts = (albums, limit = 30) => {
  const stale = (albums || [])
    .filter(a => a && a.mbid && !a.expected_track_count && !_expectedCountBackfill.has(a.id))
    .slice(0, limit);
  if (stale.length === 0) return;

  setImmediate(async () => {
    for (const a of stale) {
      if (_expectedCountBackfill.has(a.id)) continue;
      _expectedCountBackfill.add(a.id);
      try {
        const tracks = await musicMetadataService.getReleaseGroupTracks(a.mbid);
        if (tracks.length > 0) {
          db.prepare('UPDATE music_albums SET expected_track_count = ? WHERE id = ?').run(tracks.length, a.id);
        }
      } catch { /* ignore */ }
      finally { _expectedCountBackfill.delete(a.id); }
    }
  });
};

// ── Artist & Album Images ───────────────────────────────────────────────────
router.get(['/artists/:idOrMbid/image', '/artists/:idOrMbid/poster'], async (req, res) => {
  const { idOrMbid } = req.params;
  const isNumeric = /^\d+$/.test(idOrMbid);

  let artist = isNumeric
    ? db.prepare('SELECT * FROM music_artists WHERE id = ?').get(parseInt(idOrMbid, 10))
    : db.prepare('SELECT * FROM music_artists WHERE mbid = ?').get(idOrMbid);

  if (!artist && !isNumeric) {
    artist = db.prepare('SELECT * FROM music_artists WHERE id = ?').get(idOrMbid);
  }

  const cacheKey = artist?.mbid || (artist ? `artist_${artist.id}` : idOrMbid);
  let filePath = imageService.artistImagePath(cacheKey);

  if (!fs.existsSync(filePath) && artist) {
    try {
      // 1. If artist lacks MBID, attempt to resolve via MusicBrainz by exact name
      if (!artist.mbid && artist.name) {
        try {
          const mbResults = await musicMetadataService.searchArtist(artist.name);
          const exact = mbResults.find(r => r.name.toLowerCase() === artist.name.toLowerCase());
          if (exact?.mbid) {
            db.prepare('UPDATE music_artists SET mbid = ? WHERE id = ?').run(exact.mbid, artist.id);
            artist.mbid = exact.mbid;
          }
        } catch { /* proceed without MBID */ }
      }

      // 2. Fetch image from known URL or TheAudioDB / Deezer
      let imageUrl = null;
      if (artist.image_path && artist.image_path.startsWith('http')) {
        imageUrl = artist.image_path;
      } else {
        imageUrl = await musicMetadataService.getArtistImageUrl(artist.mbid, artist.name);
      }

      if (imageUrl) {
        filePath = await imageService.ensureArtistImage(cacheKey, imageUrl);
        db.prepare('UPDATE music_artists SET image_path = ? WHERE id = ?').run(imageUrl, artist.id);
      }
    } catch { /* ignore */ }
  }

  // No artist photo available — reuse one of the artist's album covers instead.
  if (artist && !fs.existsSync(filePath)) {
    try {
      filePath = (await resolveArtistImageFromAlbum(artist, cacheKey)) || filePath;
    } catch { /* ignore */ }
  }

  serveImage(res, filePath);
});

router.get('/albums/:idOrMbid/cover', async (req, res) => {
  const { idOrMbid } = req.params;
  const isNumeric = /^\d+$/.test(idOrMbid);

  let album = isNumeric
    ? db.prepare('SELECT * FROM music_albums WHERE id = ?').get(parseInt(idOrMbid, 10))
    : db.prepare('SELECT * FROM music_albums WHERE mbid = ?').get(idOrMbid);

  if (!album && !isNumeric) {
    album = db.prepare('SELECT * FROM music_albums WHERE id = ?').get(idOrMbid);
  }

  const cacheKey = album?.mbid || (album ? `album_${album.id}` : idOrMbid);
  let filePath = imageService.albumCoverPath(cacheKey);

  if (!fs.existsSync(filePath) && album) {
    try {
      // 1. Prefer cover art file from the album's folder on disk
      const localCover = imageService.findAlbumFolderCover(album.folder_path);
      if (localCover) {
        filePath = localCover;
      } else {
        // 2. Extract embedded cover art from audio files if present
        const tracks = db.prepare('SELECT file_path FROM music_tracks WHERE album_id = ? AND file_path IS NOT NULL LIMIT 5').all(album.id);
        let extracted = null;
        for (const trk of tracks) {
          extracted = await imageService.extractEmbeddedCover(trk.file_path, filePath);
          if (extracted) {
            filePath = extracted;
            break;
          }
        }

        // 3. Fall back to known URL or Cover Art Archive by MBID
        if (!extracted) {
          let coverUrl = null;
          if (album.cover_path && album.cover_path.startsWith('http')) {
            coverUrl = album.cover_path;
          } else if (album.mbid) {
            coverUrl = await musicMetadataService.getAlbumCoverUrl(album.mbid);
          }

          // 4. Fall back to iTunes / Deezer search by Artist Name + Album Title
          if (!coverUrl) {
            const artist = db.prepare('SELECT name FROM music_artists WHERE id = ?').get(album.artist_id);
            if (artist?.name && album.title) {
              coverUrl = await musicMetadataService.searchExternalAlbumCover(artist.name, album.title);
            }
          }

          if (coverUrl) {
            filePath = await imageService.ensureAlbumCover(cacheKey, coverUrl);
            db.prepare('UPDATE music_albums SET cover_path = ? WHERE id = ?').run(coverUrl, album.id);
          }
        }
      }
    } catch { /* ignore */ }
  }

  // Save/copy cover.jpg directly into the album's library folder on disk so external tools
  // (Plex, Jellyfin, Navidrome, etc.) can use it and future scans read it locally without hitting APIs
  if (album?.folder_path && filePath && fs.existsSync(filePath)) {
    imageService.saveCoverToAlbumFolder(album.folder_path, filePath);
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
    // Create any missing artist folders in the background (also covers artists added
    // before their folder existed). Done off the request path — it's just mkdir calls.
    setImmediate(() => {
      try { musicLibraryService.ensureAllArtistFolders(); } catch { /* ignore */ }
    });

    const { sort = 'name_asc', monitored, status, limit = 0, offset = 0 } = req.query;
    const filters = {};
    if (monitored !== undefined) filters.monitored = monitored === 'true' || monitored === '1';
    if (status) filters.status = status;

    const artists = musicLibraryService.getArtists(parseInt(limit), parseInt(offset), sort, filters).map(a => ({
      ...a,
      image_url: `/api/library/music/artists/${a.id || a.mbid}/image?v=${MUSIC_IMAGE_VERSION}`,
    }));
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

      const albums = db.prepare('SELECT id, mbid FROM music_albums WHERE artist_id = ? LIMIT 10').all(artist.id);
      for (const album of albums) {
        try {
          const coverUrl = await musicMetadataService.getAlbumCoverUrl(album.mbid);
          if (coverUrl) await imageService.ensureAlbumCover(album.mbid || `album_${album.id}`, coverUrl);
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

    // Make sure the artist folder exists on disk
    const ensuredFolder = musicLibraryService.ensureArtistFolder(artist);
    if (ensuredFolder) artist.folder_path = ensuredFolder;

    // Annotate albums with cover URL
    const albums = (artist.albums || []).map(a => ({
      ...a,
      cover_url: `/api/library/music/albums/${a.id || a.mbid}/cover?v=${MUSIC_IMAGE_VERSION}`,
      genres: (() => { try { return JSON.parse(a.genres); } catch { return []; } })(),
    }));

    // Fill in expected track counts in the background so the album cards can show
    // downloaded / expected (including missing tracks).
    backfillExpectedTrackCounts(artist.albums);

    res.json({
      status: 'success',
      data: {
        ...artist,
        image_url: `/api/library/music/artists/${artist.id || artist.mbid}/image?v=${MUSIC_IMAGE_VERSION}`,
        albums,
      }
    });
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
    const artist = await musicLibraryService.refreshArtist(parseInt(req.params.id));
    if (!artist) return res.status(404).json({ status: 'error', message: 'Artist not found' });
    res.json({ status: 'success', message: `Refreshed ${artist.name}` });
  } catch (err) { next(err); }
});

router.post('/artists/:id/search', async (req, res, next) => {
  try {
    const artist = db.prepare('SELECT * FROM music_artists WHERE id = ?').get(parseInt(req.params.id));
    if (!artist) return res.status(404).json({ status: 'error', message: 'Artist not found' });

    const missingAlbums = db.prepare(`
      SELECT * FROM music_albums WHERE artist_id = ? AND monitored = 1 AND status != 'downloaded'
    `).all(artist.id).map(a => ({ ...a, artist_name: artist.name }));

    if (missingAlbums.length === 0) {
      return res.json({ status: 'success', message: 'No missing albums to search for this artist' });
    }

    queueAlbumSearches(missingAlbums);
    res.json({ status: 'success', message: `Queued automatic search for ${missingAlbums.length} missing album(s)` });
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
      cover_url: `/api/library/music/albums/${a.id || a.mbid}/cover?v=${MUSIC_IMAGE_VERSION}`,
      genres: (() => { try { return JSON.parse(a.genres); } catch { return []; } })(),
    }));

    // Backfill expected track counts for downloaded albums (bounded) so their cards
    // can show downloaded / expected including missing tracks.
    backfillExpectedTrackCounts(albums.filter(a => a.status === 'downloaded'), 40);

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
        INSERT INTO music_albums (mbid, artist_id, title, release_date, year, album_type, status, monitored, quality_profile_id, expected_track_count)
        VALUES (?, ?, ?, ?, ?, ?, 'monitored', 1, ?, ?)
      `).run(mbid, artist.id, albumData.title, albumData.releaseDate, albumData.year, albumData.albumType, profileId, albumData.trackCount || 0);
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
      cover_url: `/api/library/music/albums/${album.id || album.mbid}/cover?v=${MUSIC_IMAGE_VERSION}`,
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
router.get('/albums/:id/search', async (req, res, _next) => {
  try {
    const album = db.prepare(`
      SELECT al.*, a.name as artist_name FROM music_albums al
      JOIN music_artists a ON a.id = al.artist_id WHERE al.id = ?
    `).get(parseInt(req.params.id));
    if (!album) return res.status(404).json({ status: 'error', message: 'Album not found' });

    const profile = db.prepare('SELECT * FROM music_quality_profiles WHERE id = ?').get(album.quality_profile_id);
    const results = await indexerService.searchMusic(album.artist_name, album.title, profile, true);
    res.json({ status: 'success', data: results });
  } catch (err) {
    console.error(`[MusicSearch] Manual search failed for album ${req.params.id}:`, err.message);
    res.status(502).json({
      status: 'error',
      message: err.message || 'Indexer search failed. Please check your indexer configuration.'
    });
  }
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
    const best = await grabBestReleaseForAlbum(album, profile);
    if (!best) {
      return res.status(404).json({ status: 'error', message: 'No releases found on indexers' });
    }

    res.json({ status: 'success', message: `Found and queued: ${best.title}`, data: best });
  } catch (err) { next(err); }
});

router.post('/albums/:id/grab', async (req, res) => {
  try {
    const { downloadUrl, magnetUrl, title, link, torrentUrl } = req.body;
    const torrentUri = link || torrentUrl || downloadUrl || magnetUrl;
    if (!torrentUri) return res.status(400).json({ status: 'error', message: 'Torrent link is required' });
    const downloadClientService = require('../../services/downloadClientService');
    await downloadClientService.addTorrent(torrentUri, 'music');
    const albumId = parseInt(req.params.id);
    db.prepare("UPDATE music_albums SET status = 'downloading' WHERE id = ?").run(albumId);
    res.json({ status: 'success', message: `Queued: ${title || 'Album release'}` });
  } catch (err) {
    console.error(`[MusicGrab] Failed to grab release for album ${req.params.id}:`, err.message);
    res.status(400).json({ status: 'error', message: err.message || 'Failed to send torrent to download client' });
  }
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

// ── Album Full Tracklist (local + missing from MusicBrainz) ───────────────────
router.get('/albums/:id/tracklist', async (req, res, next) => {
  try {
    const album = db.prepare('SELECT * FROM music_albums WHERE id = ?').get(req.params.id);
    if (!album) return res.status(404).json({ status: 'error', message: 'Album not found' });

    // Local tracks we already have
    const localTracks = db.prepare(`
      SELECT * FROM music_tracks WHERE album_id = ?
      ORDER BY disc_number ASC, track_number ASC
    `).all(album.id);

    // If no MBID, just return local tracks
    if (!album.mbid) {
      return res.json({ status: 'success', data: localTracks.map(t => ({ ...t, missing: false })) });
    }

    // Expected tracklist from MusicBrainz — throttled (≤1 req/s) and cached, so rapid
    // parallel requests can't get rate-limited into an empty (local-only) result.
    const mbTracks = await musicMetadataService.getReleaseGroupTracks(album.mbid);

    if (mbTracks.length === 0) {
      // MusicBrainz unavailable – fall back to local only
      return res.json({ status: 'success', data: localTracks.map(t => ({ ...t, missing: false })) });
    }

    // Merge: match local tracks by track_number+disc, or by mbid
    const merged = mbTracks.map(mb => {
      const local = localTracks.find(l =>
        (mb.mbid && l.mbid === mb.mbid) ||
        (l.track_number === mb.track_number && (l.disc_number || 1) === mb.disc_number)
      );
      if (local) return { ...local, missing: false };
      return {
        id: null,
        mbid: mb.mbid,
        title: mb.title,
        track_number: mb.track_number,
        disc_number: mb.disc_number,
        duration: mb.duration,
        file_path: null,
        file_size: 0,
        format: null,
        bitrate: null,
        missing: true,
      };
    });

    // Remember the expected size so album cards can show downloaded/expected
    try {
      db.prepare('UPDATE music_albums SET expected_track_count = ? WHERE id = ?').run(merged.length, album.id);
    } catch { /* ignore */ }

    res.json({ status: 'success', data: merged });
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

    queueAlbumSearches(missingAlbums);

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

      queueAlbumSearches(selected);
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
    const { scanMusicLibrary } = require('../../services/musicScannerService');
    // Run scan in background and return immediate response or await completion
    const result = await scanMusicLibrary();
    res.json({
      status: 'success',
      message: `Music scan complete. ${result.addedTracksCount} tracks added, ${result.removedTracksCount} missing files reset.`,
      data: result
    });
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
