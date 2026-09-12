/**
 * musicMetadataService.js
 * MusicBrainz REST API wrapper.
 * Free API — no API key required.
 * Rate limit: 1 request/second (enforced below).
 * Docs: https://musicbrainz.org/doc/MusicBrainz_API
 */

const axios = require('axios');
const { getSetting } = require('../utils/settings');

const MB_BASE = 'https://musicbrainz.org/ws/2';
const CAA_BASE = 'https://coverartarchive.org';
const USER_AGENT = 'AtlasMediaManager/1.0.0 ( contact@atlas-media.org )';

// ── In-memory cache ──────────────────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const getCached = (key) => {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
};
const setCached = (key, data) => {
  if (cache.size >= 500) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(key, { data, ts: Date.now() });
};

// ── Rate limiter — MusicBrainz requires ≤1 req/s ────────────────────────────
let lastRequestAt = 0;
const MIN_GAP_MS = 1100;

const throttledGet = async (url, params = {}, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const now = Date.now();
    const gap = now - lastRequestAt;
    if (gap < MIN_GAP_MS) {
      await new Promise(r => setTimeout(r, MIN_GAP_MS - gap));
    }
    lastRequestAt = Date.now();

    try {
      const res = await axios.get(url, {
        params: { ...params, fmt: 'json' },
        headers: { 'User-Agent': USER_AGENT },
        timeout: 15000,
      });
      return res.data;
    } catch (err) {
      const status = err.response?.status;
      if ((status === 503 || status === 429) && attempt < maxRetries) {
        const backoffMs = attempt * 1500;
        console.warn(`[MusicMetadata] MusicBrainz ${status} on ${url}, retrying in ${backoffMs}ms (attempt ${attempt}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }
      throw err;
    }
  }
};

// ── Artist Search ─────────────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const searchArtist = async (query) => {
  if (!query || !query.trim()) return [];
  const trimmed = query.trim();

  // If the user pasted a direct MusicBrainz Artist MBID, fetch it directly
  if (UUID_REGEX.test(trimmed)) {
    try {
      const artist = await getArtistById(trimmed);
      return [{
        mbid: artist.mbid,
        name: artist.name,
        sortName: artist.sortName,
        disambiguation: artist.disambiguation || '',
        country: artist.country || '',
        type: artist.type || '',
        score: 100,
      }];
    } catch (e) {
      console.warn(`[MusicMetadata] Direct artist lookup failed for MBID ${trimmed}:`, e.message);
    }
  }

  const cacheKey = `search:artist:${trimmed}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const data = await throttledGet(`${MB_BASE}/artist`, { query: trimmed, limit: 10 });

  const results = (data.artists || []).map(a => ({
    mbid: a.id,
    name: a.name,
    sortName: a['sort-name'],
    disambiguation: a.disambiguation || '',
    country: a.country || '',
    type: a.type || '',
    score: a.score || 0,
  }));

  setCached(cacheKey, results);
  return results;
};

const getArtistById = async (mbid) => {
  const cacheKey = `artist:${mbid}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const data = await throttledGet(`${MB_BASE}/artist/${mbid}`, {
    inc: 'release-groups+genres+ratings+aliases',
  });

  const result = {
    mbid: data.id,
    name: data.name,
    sortName: data['sort-name'],
    disambiguation: data.disambiguation || '',
    overview: data.annotation || '',
    country: data.country || '',
    type: data.type || '',
    genres: (data.genres || []).map(g => g.name),
    rating: data.rating ? data.rating.value : 0,
    releaseGroups: (data['release-groups'] || []).map(rg => ({
      mbid: rg.id,
      title: rg.title,
      albumType: rg['primary-type'] || 'Album',
      secondaryTypes: rg['secondary-types'] || [],
      year: rg['first-release-date'] ? parseInt(rg['first-release-date'].split('-')[0], 10) : null,
      releaseDate: rg['first-release-date'] || null,
    })),
  };

  setCached(cacheKey, result);
  return result;
};

// ── Album / Release Group Search ──────────────────────────────────────────────

const searchAlbum = async (artistName, albumTitle) => {
  let query;
  if (albumTitle && artistName) {
    const cleanAlbum = albumTitle.replace(/["+]/g, ' ').trim();
    const cleanArtist = artistName.replace(/["+]/g, ' ').trim();
    query = `releasegroup:"${cleanAlbum}" AND artist:"${cleanArtist}" AND primarytype:Album`;
  } else if (albumTitle) {
    const cleanAlbum = albumTitle.replace(/["+]/g, ' ').trim();
    query = `releasegroup:"${cleanAlbum}" AND primarytype:Album`;
  } else if (artistName) {
    const cleanArtist = artistName.replace(/["+]/g, ' ').trim();
    query = `artist:"${cleanArtist}" AND primarytype:Album`;
  } else {
    return [];
  }

  const cacheKey = `search:album:${query}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const data = await throttledGet(`${MB_BASE}/release-group`, { query, limit: 12 });

  const results = (data['release-groups'] || [])
    .filter(rg => !rg['primary-type'] || rg['primary-type'].toLowerCase() === 'album')
    .map(rg => ({
      mbid: rg.id,
      title: rg.title,
      albumType: rg['primary-type'] || 'Album',
      year: rg['first-release-date'] ? parseInt(rg['first-release-date'].split('-')[0], 10) : null,
      releaseDate: rg['first-release-date'] || null,
      artistName: (rg['artist-credit'] || []).map(ac => ac.artist?.name || ac.name || '').join(', '),
      artistMbid: rg['artist-credit']?.[0]?.artist?.id || null,
      score: rg.score || 0,
    }));

  setCached(cacheKey, results);
  return results;
};

const getAlbumById = async (mbid) => {
  const cacheKey = `album:${mbid}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const rg = await throttledGet(`${MB_BASE}/release-group/${mbid}`, {
    inc: 'releases+genres+ratings+artist-credits',
  });

  const releases = rg.releases || [];
  const tracks = [];
  let trackCount = 0;
  let label = '';

  if (releases.length > 0) {
    try {
      const firstRelease = await throttledGet(`${MB_BASE}/release/${releases[0].id}`, {
        inc: 'recordings+labels',
      });
      trackCount = firstRelease.media
        ? firstRelease.media.reduce((sum, m) => sum + (m['track-count'] || 0), 0)
        : 0;

      let discNumber = 0;
      for (const medium of firstRelease.media || []) {
        discNumber++;
        for (const track of medium.tracks || []) {
          tracks.push({
            mbid: track.recording?.id || null,
            title: track.title || track.recording?.title || '',
            trackNumber: track.number ? parseInt(track.number, 10) : null,
            discNumber,
            duration: track.recording?.length ? Math.round(track.recording.length / 1000) : null,
            isrc: track.recording?.isrcs?.[0] || null,
          });
        }
      }

      label = (firstRelease['label-info'] || [])
        .map(li => li.label?.name || '')
        .filter(Boolean)
        .join(', ');
    } catch {
      // Track listing unavailable — not fatal
    }
  }

  const result = {
    mbid: rg.id,
    title: rg.title,
    albumType: rg['primary-type'] || 'Album',
    secondaryTypes: rg['secondary-types'] || [],
    releaseDate: rg['first-release-date'] || null,
    year: rg['first-release-date'] ? parseInt(rg['first-release-date'].split('-')[0], 10) : null,
    genres: (rg.genres || []).map(g => g.name),
    rating: rg.rating ? rg.rating.value : 0,
    label,
    trackCount: trackCount || tracks.length,
    tracks,
    artistCredit: (rg['artist-credit'] || []).map(ac => ac.artist?.name || ac.name || '').join(', '),
    artistMbid: rg['artist-credit']?.[0]?.artist?.id || null,
  };

  setCached(cacheKey, result);
  return result;
};

// ── Cover Art ────────────────────────────────────────────────────────────────

const getAlbumCoverUrl = async (mbid) => {
  const cacheKey = `cover:${mbid}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  try {
    const data = await throttledGet(`${CAA_BASE}/release-group/${mbid}`);
    const frontImage = (data.images || []).find(img => img.front) || data.images?.[0];
    const url = frontImage ? (frontImage.thumbnails?.['500'] || frontImage.image) : null;
    setCached(cacheKey, url);
    return url;
  } catch {
    setCached(cacheKey, null);
    return null;
  }
};

// ── Artist Images ─────────────────────────────────────────────────────────────
// MusicBrainz / Cover Art Archive don't host artist photos. Resolve them from
// external providers instead:
//   1. TheAudioDB — matched by MusicBrainz artist id (accurate). Uses the public
//      test key "2" unless a `theAudioDbApiKey` setting is configured.
//   2. Deezer — keyless name search fallback.
// Misses are negatively cached so we don't hammer the providers on every render.

const THEAUDIODB_BASE = 'https://www.theaudiodb.com';
const DEEZER_BASE = 'https://api.deezer.com';
const NO_IMAGE = '__no_image__';

const normalizeName = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const getArtistImageUrl = async (mbid, artistName) => {
  const cacheKey = `artistimg:${mbid || artistName || ''}`;
  const entry = cache.get(cacheKey);
  if (entry && Date.now() - entry.ts < CACHE_TTL) {
    return entry.data === NO_IMAGE ? null : entry.data;
  }

  let url = null;

  // 1. TheAudioDB by MusicBrainz artist id
  if (mbid) {
    try {
      const apiKey = getSetting('theAudioDbApiKey') || '2';
      const res = await axios.get(`${THEAUDIODB_BASE}/api/v1/json/${apiKey}/artist-mb.php`, {
        params: { i: mbid },
        timeout: 15000,
      });
      const a = res.data?.artists?.[0];
      url = a?.strArtistThumb || a?.strArtistFanart || null;
    } catch { /* provider unavailable — fall through */ }
  }

  // 2. Deezer name search (keyless). Require an exact normalized name match so
  //    we never show the wrong artist's photo.
  if (!url && artistName) {
    try {
      const res = await axios.get(`${DEEZER_BASE}/search/artist`, {
        params: { q: artistName, limit: 5 },
        timeout: 15000,
      });
      const target = normalizeName(artistName);
      const match = (res.data?.data || []).find(a => normalizeName(a.name) === target);
      url = match?.picture_xl || match?.picture_big || null;
    } catch { /* ignore */ }
  }

  setCached(cacheKey, url || NO_IMAGE);
  return url;
};

// ── Fallback External Album Cover Search (iTunes / Deezer) ───────────────────
const searchExternalAlbumCover = async (artistName, albumTitle) => {
  if (!artistName || !albumTitle) return null;
  const cleanTitle = albumTitle.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\[.*?\]/g, ' ').trim();
  const cacheKey = `extcover:${artistName}:${albumTitle}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached === NO_IMAGE ? null : cached;

  // 1. iTunes search (fast, high-quality 600x600, keyless)
  try {
    const res = await axios.get('https://itunes.apple.com/search', {
      params: {
        term: `${artistName} ${cleanTitle || albumTitle}`,
        entity: 'album',
        limit: 5,
      },
      timeout: 8000,
    });
    const normArtist = normalizeName(artistName);
    const results = res.data?.results || [];
    const match = results.find(r => {
      const a = normalizeName(r.artistName);
      return a.includes(normArtist) || normArtist.includes(a);
    }) || results[0];
    if (match?.artworkUrl100) {
      const highRes = match.artworkUrl100.replace('100x100bb', '600x600bb');
      setCached(cacheKey, highRes);
      return highRes;
    }
  } catch { /* fall through to Deezer */ }

  // 2. Deezer search fallback
  try {
    const res = await axios.get('https://api.deezer.com/search/album', {
      params: { q: `${artistName} ${cleanTitle || albumTitle}`, limit: 5 },
      timeout: 8000,
    });
    const results = res.data?.data || [];
    const normArtist = normalizeName(artistName);
    const match = results.find(r => normalizeName(r.artist?.name || '').includes(normArtist)) || results[0];
    if (match?.cover_xl || match?.cover_big) {
      const url = match.cover_xl || match.cover_big;
      setCached(cacheKey, url);
      return url;
    }
  } catch { /* ignore */ }

  setCached(cacheKey, NO_IMAGE);
  return null;
};

const clearCache = (mbid) => {
  if (mbid) {
    for (const key of cache.keys()) {
      if (key.includes(mbid)) cache.delete(key);
    }
  } else {
    cache.clear();
  }
};

/**
 * Expected track list for a release group (first release), throttled + cached.
 * Lets us know how many tracks an album *should* have so cards can show
 * "downloaded / total (including missing)" without hitting MusicBrainz per request.
 * @param {string} mbid Release-group MBID
 * @returns {Promise<Array<{mbid:string|null,title:string,track_number:number,disc_number:number,duration:number|null}>>}
 */
const getReleaseGroupTracks = async (mbid) => {
  if (!mbid) return [];
  const cacheKey = `rgtracks:${mbid}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const data = await throttledGet(`${MB_BASE}/release`, { 'release-group': mbid, inc: 'recordings' });
    const officialReleases = (data.releases || []).filter(r => (r.status || '').toLowerCase() === 'official');
    const pool = officialReleases.length > 0 ? officialReleases : (data.releases || []);

    // Pick canonical standard release:
    // Avoid releases marked with bonus tracks, deluxe, visual, remix, etc.
    // Prefer standard single-medium release over bloated multi-disc bonus bundles.
    const sorted = [...pool].sort((a, b) => {
      const aDisambig = ((a.disambiguation || '') + ' ' + (a.title || '')).toLowerCase();
      const bDisambig = ((b.disambiguation || '') + ' ' + (b.title || '')).toLowerCase();
      const isBonusA = /bonus|deluxe|expanded|remix|instrumental|visual|sample|demo/i.test(aDisambig);
      const isBonusB = /bonus|deluxe|expanded|remix|instrumental|visual|sample|demo/i.test(bDisambig);
      if (isBonusA !== isBonusB) return isBonusA ? 1 : -1;

      const aMediaCount = (a.media || []).length || 1;
      const bMediaCount = (b.media || []).length || 1;
      if (aMediaCount !== bMediaCount) return aMediaCount - bMediaCount;

      return (a.date || '').localeCompare(b.date || '');
    });

    const release = sorted[0];
    const tracks = [];
    if (release) {
      for (const media of (release.media || [])) {
        for (const t of (media.tracks || [])) {
          tracks.push({
            mbid: t.recording?.id || null,
            title: t.title || t.recording?.title || '',
            track_number: t.position,
            disc_number: media.position || 1,
            duration: t.length ? Math.round(t.length / 1000) : null,
          });
        }
      }
    }
    setCached(cacheKey, tracks);
    return tracks;
  } catch (err) {
    console.warn(`[MusicMetadata] Failed to fetch release-group tracks for ${mbid}:`, err.message);
    return [];
  }
};

module.exports = {
  searchArtist,
  getArtistById,
  searchAlbum,
  getAlbumById,
  getReleaseGroupTracks,
  getAlbumCoverUrl,
  getArtistImageUrl,
  searchExternalAlbumCover,
  clearCache,
};
