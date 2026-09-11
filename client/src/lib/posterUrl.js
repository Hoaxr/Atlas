// Keep in sync with MUSIC_IMAGE_VERSION in server/routes/library/music.js.
// Bumping this changes the image URL so browsers drop any previously cached art/placeholder.
const MUSIC_IMAGE_VERSION = '2';

/**
 * posterUrl — returns the URL for a cached poster served by Atlas.
 *
 * Usage:
 *   posterUrl('movies', item.tmdb_id)   → /api/images/movies/12345/poster
 *   posterUrl('shows',  item.tmdb_id)   → /api/images/shows/67890/poster
 *
 * Falls back to a TMDB CDN URL for items that only carry a raw tmdb path
 * (e.g. search results from the Discover page that are not yet in the library).
 *
 * @param {'movies'|'shows'} type
 * @param {number|string|null} tmdbId    Internal TMDB id stored in the DB
 * @param {string|null}        [tmdbPath] Raw TMDB poster_path fallback (e.g. "/abc.jpg")
 * @param {string}             [size]     TMDB size for the fallback URL (default 'w500')
 */
export const posterUrl = (type, tmdbId, tmdbPath = null, size = 'w500') => {
  if (tmdbId) {
    const token = localStorage.getItem('atlas_token');
    return token
      ? `/api/images/${type}/${tmdbId}/poster?token=${encodeURIComponent(token)}`
      : `/api/images/${type}/${tmdbId}/poster`;
  }
  // Fallback for items not yet in the library (search results, discover)
  if (tmdbPath) {
    return `https://image.tmdb.org/t/p/${size}${tmdbPath}`;
  }
  return null;
};

/**
 * Convenience: build a TMDB CDN URL directly (for people/backdrops that are
 * never stored locally — cast profile pics, backdrop hero images, etc.)
 */
export const tmdbImgUrl = (tmdbPath, size = 'w500') =>
  tmdbPath ? `https://image.tmdb.org/t/p/${size}${tmdbPath}` : null;

/**
 * albumCoverUrl — URL for a music album's cover served by Atlas.
 * Accepts album object, numeric id, or MBID string.
 *
 * @param {object|number|string|null} albumOrIdOrMbid
 * @returns {string|null}
 */
export const albumCoverUrl = (albumOrIdOrMbid) => {
  if (!albumOrIdOrMbid) return null;
  const key = typeof albumOrIdOrMbid === 'object'
    ? (albumOrIdOrMbid.id || albumOrIdOrMbid.mbid)
    : albumOrIdOrMbid;
  if (!key) return null;
  const token = localStorage.getItem('atlas_token');
  const base = `/api/library/music/albums/${key}/cover`;
  return token
    ? `${base}?token=${encodeURIComponent(token)}&v=${MUSIC_IMAGE_VERSION}`
    : `${base}?v=${MUSIC_IMAGE_VERSION}`;
};

/**
 * artistImageUrl — URL for a music artist's image served by Atlas.
 * Accepts artist object, numeric id, or MBID string.
 *
 * @param {object|number|string|null} artistOrIdOrMbid
 * @returns {string|null}
 */
export const artistImageUrl = (artistOrIdOrMbid) => {
  if (!artistOrIdOrMbid) return null;
  const key = typeof artistOrIdOrMbid === 'object'
    ? (artistOrIdOrMbid.id || artistOrIdOrMbid.mbid)
    : artistOrIdOrMbid;
  if (!key) return null;
  const token = localStorage.getItem('atlas_token');
  const base = `/api/library/music/artists/${key}/image`;
  return token
    ? `${base}?token=${encodeURIComponent(token)}&v=${MUSIC_IMAGE_VERSION}`
    : `${base}?v=${MUSIC_IMAGE_VERSION}`;
};

/**
 * trackStreamUrl — streaming audio URL for a downloaded music track.
 * @param {number|string|null} trackId
 * @returns {string|null}
 */
export const trackStreamUrl = (trackId) => {
  if (!trackId) return null;
  const token = localStorage.getItem('atlas_token');
  const base = `/api/library/music/tracks/${trackId}/stream`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
};

