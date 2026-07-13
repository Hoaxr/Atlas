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
    return `/api/images/${type}/${tmdbId}/poster`;
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
