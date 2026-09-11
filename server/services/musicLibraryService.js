/**
 * musicLibraryService.js
 * Core CRUD operations for music entities: artists, albums, tracks.
 * Mirrors the patterns from libraryService.js for movies/shows.
 */

const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const musicMetadataService = require('./musicMetadataService');
const eventBus = require('./eventBus');
const { getSetting } = require('../utils/settings');

// ── Naming Config ────────────────────────────────────────────────────────────

const getMusicNamingConfig = () => ({
  artistFolder: getSetting('musicArtistFolderFormat') || '{Artist Name}',
  albumFolder: getSetting('musicAlbumFolderFormat') || '{Album Title} ({Year})',
  trackFile: getSetting('musicTrackFileFormat') || '{TrackNumber:00} - {Track Title}',
});

const sanitizeName = (name) => {
  if (!name) return '';
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '');
};

const formatArtistFolder = (artist, config) =>
  sanitizeName(config.artistFolder.replace('{Artist Name}', artist.name));

const formatAlbumFolder = (album, config) =>
  sanitizeName(
    config.albumFolder
      .replace('{Album Title}', album.title)
      .replace('{Year}', album.year || 'Unknown')
  );

// ── Artist CRUD ───────────────────────────────────────────────────────────────

const addArtist = async (mbid, rootFolderPath = null, qualityProfileId = null) => {
  const existing = db.prepare('SELECT id FROM music_artists WHERE mbid = ?').get(mbid);
  if (existing) throw new Error('Artist already in library');

  const artist = await musicMetadataService.getArtistById(mbid);
  if (!artist) throw new Error('Artist not found on MusicBrainz');

  const defaultProfile = db.prepare('SELECT id FROM music_quality_profiles ORDER BY id ASC LIMIT 1').get();
  const profileId = qualityProfileId || defaultProfile?.id || null;

  // Determine music library root
  let libraryRoot = rootFolderPath;
  if (!libraryRoot) {
    const paths = db.prepare("SELECT path FROM library_paths WHERE type = 'music'").all();
    if (paths.length > 0) libraryRoot = paths[0].path;
  }

  // Pre-create artist folder
  let folderPath = null;
  if (libraryRoot) {
    const config = getMusicNamingConfig();
    folderPath = path.join(libraryRoot, formatArtistFolder(artist, config));
    try {
      fs.mkdirSync(folderPath, { recursive: true });
    } catch { /* ignore if exists */ }
  }

  const result = db.prepare(`
    INSERT INTO music_artists (mbid, name, sort_name, overview, genres, status, monitored, folder_path, quality_profile_id, rating, disambiguation)
    VALUES (?, ?, ?, ?, ?, 'monitored', 1, ?, ?, ?, ?)
  `).run(
    artist.mbid,
    artist.name,
    artist.sortName || artist.name,
    artist.overview || '',
    JSON.stringify(artist.genres || []),
    folderPath,
    profileId,
    artist.rating || 0,
    artist.disambiguation || ''
  );

  const newArtist = db.prepare('SELECT * FROM music_artists WHERE id = ?').get(result.lastInsertRowid);

  // Sync albums from MusicBrainz (non-blocking)
  setImmediate(async () => {
    try {
      await syncArtistAlbums(newArtist.id, artist.releaseGroups || []);
    } catch (err) {
      console.error(`[Music] Failed to sync albums for artist ${artist.name}:`, err.message);
    }
  });

  eventBus.emit({ type: 'MUSIC_ARTIST_ADDED', artistId: newArtist.id, name: artist.name });
  return newArtist;
};

const cleanAlbumTitle = (title) => {
  return (title || '')
    .toLowerCase()
    .replace(/\s*\(.*?(edition|version|remaster|deluxe|bonus|expanded).*?\)/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\s*(?:[([{-]|\b)(?:cd|disc|disk)\s*\d+(?:[)\]}]|\b|$)/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
};

const syncArtistAlbums = async (artistId, releaseGroups) => {
  const artist = db.prepare('SELECT * FROM music_artists WHERE id = ?').get(artistId);
  if (!artist || !Array.isArray(releaseGroups)) return;

  const existingAlbums = db.prepare('SELECT id, mbid, title, status FROM music_albums WHERE artist_id = ?').all(artistId);

  for (const rg of releaseGroups) {
    if (!rg.title) continue;

    // 1. Check if already matched by MBID
    let match = existingAlbums.find(a => a.mbid && a.mbid === rg.mbid);

    // 2. If not matched by MBID, match by title
    if (!match) {
      const isRgRemix = rg.title.toLowerCase().includes('remix');
      const rgClean = cleanAlbumTitle(rg.title);
      const rgParts = rg.title.includes('/') ? rg.title.split('/').map(cleanAlbumTitle) : [rgClean];
      match = existingAlbums.find(a => {
        if (!a.title) return false;
        const isARemix = a.title.toLowerCase().includes('remix');
        if (isRgRemix !== isARemix) return false;
        const aClean = cleanAlbumTitle(a.title);
        return aClean === rgClean || rgParts.includes(aClean);
      });
    }

    if (match) {
      // Update existing album with MBID, release date, and album type if missing
      db.prepare(`
        UPDATE music_albums SET
          mbid = COALESCE(mbid, ?),
          release_date = COALESCE(release_date, ?),
          year = COALESCE(year, ?),
          album_type = COALESCE(NULLIF(album_type, 'Album'), ?)
        WHERE id = ?
      `).run(rg.mbid, rg.releaseDate, rg.year, rg.albumType || 'Album', match.id);

      match.mbid = match.mbid || rg.mbid;
    } else {
      // 3. Insert new missing release from artist's discography
      try {
        const profileId = artist.quality_profile_id || 1;
        const insertRes = db.prepare(`
          INSERT INTO music_albums (
            mbid, artist_id, title, release_date, year, album_type, status, monitored, quality_profile_id
          ) VALUES (?, ?, ?, ?, ?, ?, 'monitored', 1, ?)
        `).run(
          rg.mbid,
          artistId,
          rg.title,
          rg.releaseDate,
          rg.year,
          rg.albumType || 'Album',
          profileId
        );

        existingAlbums.push({
          id: insertRes.lastInsertRowid,
          mbid: rg.mbid,
          title: rg.title,
          status: 'monitored'
        });
      } catch {
        // Unique constraint or duplicate
      }
    }
  }
};

const getArtists = (limit = 0, offset = 0, sort = 'name_asc', filters = {}) => {
  const orderMap = {
    name_asc: 'a.name COLLATE NOCASE ASC',
    name_desc: 'a.name COLLATE NOCASE DESC',
    added_desc: 'a.added_at DESC',
    added_asc: 'a.added_at ASC',
    rating_desc: 'a.rating DESC',
  };
  const orderBy = orderMap[sort] || orderMap.name_asc;

  const conditions = [];
  const params = [];

  if (filters.monitored !== undefined) {
    conditions.push('a.monitored = ?');
    params.push(filters.monitored ? 1 : 0);
  }
  if (filters.status) {
    conditions.push('a.status = ?');
    params.push(filters.status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let query = `
    SELECT a.*,
      COUNT(DISTINCT al.id) as album_count,
      COUNT(DISTINCT dt.album_id) as downloaded_albums,
      COUNT(DISTINCT t.id) as track_count,
      COALESCE(SUM(t.file_size), 0) as total_size
    FROM music_artists a
    LEFT JOIN music_albums al ON al.artist_id = a.id
    LEFT JOIN music_tracks t ON t.artist_id = a.id
    LEFT JOIN (
      SELECT DISTINCT album_id FROM music_tracks WHERE file_path IS NOT NULL
    ) dt ON dt.album_id = al.id
    ${whereClause}
    GROUP BY a.id
    ORDER BY ${orderBy}
  `;

  if (limit > 0) {
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);
  }

  return db.prepare(query).all(...params);
};

const getArtistById = (id) => {
  const artist = db.prepare('SELECT * FROM music_artists WHERE id = ?').get(id);
  if (!artist) return null;

  const albums = db.prepare(`
    SELECT al.*,
      qp.preferred_format as quality_profile_format,
      COUNT(CASE WHEN t.file_path IS NOT NULL THEN 1 END) as downloaded_tracks,
      COALESCE(NULLIF(al.track_count, 0), COUNT(t.id)) as track_count,
      COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN COALESCE(t.disc_number, 1) END) as disc_count,
      COALESCE(SUM(t.file_size), 0) as total_size
    FROM music_albums al
    LEFT JOIN music_tracks t ON t.album_id = al.id
    LEFT JOIN music_quality_profiles qp ON qp.id = al.quality_profile_id
    WHERE al.artist_id = ?
    GROUP BY al.id
    ORDER BY al.year ASC, al.title COLLATE NOCASE ASC
  `).all(id);

  return { ...artist, albums };
};

const updateArtist = (id, updates) => {
  const allowed = ['monitored', 'status', 'quality_profile_id', 'overview'];
  const sets = [];
  const params = [];
  for (const [k, v] of Object.entries(updates)) {
    if (allowed.includes(k)) {
      sets.push(`${k} = ?`);
      params.push(v);
    }
  }
  if (sets.length === 0) return;
  params.push(id);
  db.prepare(`UPDATE music_artists SET ${sets.join(', ')} WHERE id = ?`).run(...params);
};

const deleteArtist = async (id, deleteFiles = false) => {
  const artist = db.prepare('SELECT * FROM music_artists WHERE id = ?').get(id);
  if (!artist) throw new Error('Artist not found');

  if (deleteFiles && artist.folder_path) {
    try {
      const { deleteFolderRecursive } = require('../utils/fileUtils');
      await deleteFolderRecursive(artist.folder_path);
    } catch (err) {
      console.error(`[Music] Failed to delete artist folder:`, err.message);
    }
  }

  // Cascade delete all albums and tracks for this artist
  const artistAlbums = db.prepare('SELECT id FROM music_albums WHERE artist_id = ?').all(id);
  for (const album of artistAlbums) {
    db.prepare('DELETE FROM music_tracks WHERE album_id = ?').run(album.id);
  }
  db.prepare('DELETE FROM music_albums WHERE artist_id = ?').run(id);
  db.prepare('DELETE FROM music_artists WHERE id = ?').run(id);
  eventBus.emit({ type: 'MUSIC_ARTIST_REMOVED', artistId: id, name: artist.name });
};


// ── Album CRUD ────────────────────────────────────────────────────────────────

const getAlbums = (limit = 0, offset = 0, sort = 'added_desc', filters = {}) => {
  const orderMap = {
    added_desc: 'al.added_at DESC',
    added_asc: 'al.added_at ASC',
    title_asc: 'al.title COLLATE NOCASE ASC',
    title_desc: 'al.title COLLATE NOCASE DESC',
    year_desc: 'al.year DESC',
    year_asc: 'al.year ASC',
    artist_asc: 'a.name COLLATE NOCASE ASC',
  };
  const orderBy = orderMap[sort] || orderMap.added_desc;

  const conditions = [];
  const params = [];

  if (filters.artistId) {
    conditions.push('al.artist_id = ?');
    params.push(filters.artistId);
  }
  if (filters.monitored !== undefined) {
    conditions.push('al.monitored = ?');
    params.push(filters.monitored ? 1 : 0);
  }
  if (filters.status) {
    conditions.push('al.status = ?');
    params.push(filters.status);
  }
  if (filters.albumType) {
    conditions.push('al.album_type = ?');
    params.push(filters.albumType);
  }
  if (filters.search) {
    conditions.push('(al.title LIKE ? OR a.name LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let query = `
    SELECT al.*,
      a.name as artist_name, a.mbid as artist_mbid,
      qp.preferred_format as quality_profile_format,
      COUNT(CASE WHEN t.file_path IS NOT NULL THEN 1 END) as downloaded_tracks,
      COUNT(t.id) as total_tracks,
      COALESCE(NULLIF(al.track_count, 0), COUNT(t.id)) as track_count,
      COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN COALESCE(t.disc_number, 1) END) as disc_count,
      COALESCE(SUM(t.file_size), 0) as total_size
    FROM music_albums al
    JOIN music_artists a ON a.id = al.artist_id
    LEFT JOIN music_tracks t ON t.album_id = al.id
    LEFT JOIN music_quality_profiles qp ON qp.id = al.quality_profile_id
    ${whereClause}
    GROUP BY al.id
    ORDER BY ${orderBy}
  `;

  if (limit > 0) {
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);
  }

  return db.prepare(query).all(...params);
};

const getAlbumById = (id) => {
  const album = db.prepare(`
    SELECT al.*, a.name as artist_name, a.mbid as artist_mbid, a.id as artist_id_fk
    FROM music_albums al
    JOIN music_artists a ON a.id = al.artist_id
    WHERE al.id = ?
  `).get(id);
  if (!album) return null;

  const tracks = db.prepare(`
    SELECT * FROM music_tracks WHERE album_id = ?
    ORDER BY disc_number ASC, track_number ASC
  `).all(id);

  const discCount = new Set(tracks.map(t => t.disc_number || 1)).size;
  const trackCount = tracks.length || album.track_count || 0;
  return { ...album, track_count: trackCount, disc_count: discCount, tracks };
};

const updateAlbum = (id, updates) => {
  const allowed = ['monitored', 'status', 'quality_profile_id', 'file_format', 'file_bitdepth', 'file_samplerate'];
  const sets = [];
  const params = [];
  for (const [k, v] of Object.entries(updates)) {
    if (allowed.includes(k)) {
      sets.push(`${k} = ?`);
      params.push(v);
    }
  }
  if (sets.length === 0) return;
  params.push(id);
  db.prepare(`UPDATE music_albums SET ${sets.join(', ')} WHERE id = ?`).run(...params);
};

const deleteAlbum = async (id, deleteFiles = false) => {
  const album = db.prepare('SELECT * FROM music_albums WHERE id = ?').get(id);
  if (!album) throw new Error('Album not found');

  if (deleteFiles && album.folder_path) {
    try {
      const { deleteFolderRecursive } = require('../utils/fileUtils');
      await deleteFolderRecursive(album.folder_path);
    } catch (err) {
      console.error(`[Music] Failed to delete album folder:`, err.message);
    }
  }

  db.prepare('DELETE FROM music_tracks WHERE album_id = ?').run(id);
  db.prepare('DELETE FROM music_albums WHERE id = ?').run(id);
};


// ── Track CRUD ────────────────────────────────────────────────────────────────

const getTracksByAlbum = (albumId) =>
  db.prepare('SELECT * FROM music_tracks WHERE album_id = ? ORDER BY disc_number ASC, track_number ASC').all(albumId);

const updateTrack = (id, updates) => {
  const allowed = ['monitored', 'status', 'file_path', 'file_size', 'format', 'bitrate', 'bitdepth', 'samplerate'];
  const sets = [];
  const params = [];
  for (const [k, v] of Object.entries(updates)) {
    if (allowed.includes(k)) {
      sets.push(`${k} = ?`);
      params.push(v);
    }
  }
  if (sets.length === 0) return;
  params.push(id);
  db.prepare(`UPDATE music_tracks SET ${sets.join(', ')} WHERE id = ?`).run(...params);
};

// ── Stats ────────────────────────────────────────────────────────────────────

const getMusicStats = () => {
  const artistCount = db.prepare('SELECT COUNT(*) as count FROM music_artists').get()?.count || 0;
  const albumCount = db.prepare('SELECT COUNT(*) as count FROM music_albums').get()?.count || 0;
  const trackCount = db.prepare('SELECT COUNT(*) as count FROM music_tracks').get()?.count || 0;
  const downloadedAlbums = db.prepare("SELECT COUNT(*) as count FROM music_albums WHERE status = 'downloaded'").get()?.count || 0;
  const missingAlbums = db.prepare("SELECT COUNT(*) as count FROM music_albums WHERE monitored = 1 AND status = 'monitored'").get()?.count || 0;
  const totalSize = db.prepare('SELECT COALESCE(SUM(file_size), 0) as total FROM music_tracks').get()?.total || 0;

  const qualityDist = db.prepare(`
    SELECT format, COUNT(*) as count FROM music_tracks
    WHERE format IS NOT NULL AND file_path IS NOT NULL
    GROUP BY format ORDER BY count DESC
  `).all();

  return {
    artists: artistCount,
    albums: albumCount,
    tracks: trackCount,
    downloadedAlbums,
    missingAlbums,
    totalSize,
    qualityDistribution: qualityDist,
  };
};

// ── Missing albums ────────────────────────────────────────────────────────────

const getMissingAlbums = () =>
  db.prepare(`
    SELECT al.*, a.name as artist_name
    FROM music_albums al
    JOIN music_artists a ON a.id = al.artist_id
    WHERE al.monitored = 1 AND al.status = 'monitored'
    ORDER BY a.name COLLATE NOCASE ASC, al.year ASC
  `).all();

module.exports = {
  getMusicNamingConfig,
  sanitizeName,
  formatArtistFolder,
  formatAlbumFolder,
  addArtist,
  syncArtistAlbums,
  getArtists,
  getArtistById,
  updateArtist,
  deleteArtist,
  getAlbums,
  getAlbumById,
  updateAlbum,
  deleteAlbum,
  getTracksByAlbum,
  updateTrack,
  getMusicStats,
  getMissingAlbums,
};
