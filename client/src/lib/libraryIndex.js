import api from './api';
import { cachedMovies, cachedShows } from './libraryCache';

/**
 * Module-level index of the local library, used by the global search palette.
 *
 * Layout already prefetches the full movie/show lists into `libraryCache`, so
 * the first lookup is free. When that cache is cold (deep link, hard refresh on
 * a non-dashboard page) the index falls back to fetching it once.
 *
 * Call `invalidateLibraryIndex()` whenever the library changes (scan complete,
 * media added/removed) so the next search sees the new state.
 */

let indexCache = null;
let inflight = null;

const splitGenres = (raw) =>
  typeof raw === 'string' ? raw.split(',').map((g) => g.trim()).filter(Boolean) : [];

export const invalidateLibraryIndex = () => {
  indexCache = null;
  inflight = null;
};

const fromMovies = (movies) =>
  (movies || []).filter(Boolean).map((m) => ({
    kind: 'movie',
    route: `/movies/${m.id}`,
    id: m.id,
    tmdbId: m.tmdb_id,
    title: m.title || 'Untitled',
    year: m.year || null,
    posterPath: m.poster_path || null,
    genres: splitGenres(m.genres),
    meta: [m.resolution, m.quality_profile_name].filter(Boolean).join(' · '),
  }));

const fromShows = (shows) =>
  (shows || []).filter(Boolean).map((s) => ({
    kind: 'show',
    route: `/shows/${s.id}`,
    id: s.id,
    tmdbId: s.tmdb_id,
    title: s.title || 'Untitled',
    year: s.year || null,
    posterPath: s.poster_path || null,
    genres: splitGenres(s.genres),
    meta: [s.resolution, s.quality_profile_name].filter(Boolean).join(' · '),
  }));

const fetchLibrary = async () => {
  const [moviesRes, showsRes] = await Promise.allSettled([
    // badges=true skips the expensive subtitle scan on the server
    api.get('/library/movies?badges=true'),
    api.get('/library/shows'),
  ]);

  const movies =
    moviesRes.status === 'fulfilled' && moviesRes.value.data?.status === 'success'
      ? moviesRes.value.data.data
      : [];
  const shows =
    showsRes.status === 'fulfilled' && showsRes.value.data?.status === 'success'
      ? showsRes.value.data.data
      : [];

  return [...fromMovies(movies), ...fromShows(shows)];
};

/** Resolves to a flat array of searchable library entries. */
export const getLibraryIndex = () => {
  if (indexCache) return Promise.resolve(indexCache);
  if (inflight) return inflight;

  inflight = (async () => {
    // Live ESM bindings — reflects whatever Layout prefetched.
    const items =
      cachedMovies || cachedShows
        ? [...fromMovies(cachedMovies), ...fromShows(cachedShows)]
        : await fetchLibrary();

    indexCache = items;
    inflight = null;
    return items;
  })().catch(() => {
    inflight = null;
    return [];
  });

  return inflight;
};

/**
 * Ranked library search: exact title, then title-prefix, then word-prefix,
 * then any substring, then genre match. Ties break toward newer releases.
 */
export const searchLibraryIndex = (items, query, limit = 6) => {
  const q = query.trim().toLowerCase();
  if (!q || !items?.length) return [];

  const scored = [];
  for (const item of items) {
    const title = item.title.toLowerCase();
    let score = null;

    if (title === q) score = 0;
    else if (title.startsWith(q)) score = 1;
    else if (title.includes(` ${q}`)) score = 2;
    else if (title.includes(q)) score = 3;
    else if (item.genres.some((g) => g.toLowerCase() === q)) score = 4;

    if (score !== null) scored.push({ item, score });
  }

  scored.sort(
    (a, b) => a.score - b.score || (b.item.year || 0) - (a.item.year || 0) || a.item.title.localeCompare(b.item.title),
  );

  return scored.slice(0, limit).map((entry) => entry.item);
};

/**
 * Distinct genres in the library with counts, most populated first.
 * Powers the "jump to genre" results in the search palette.
 */
export const collectGenres = (items) => {
  const byKey = new Map();
  for (const item of items || []) {
    for (const genre of item.genres) {
      const key = `${item.kind}:${genre.toLowerCase()}`;
      const existing = byKey.get(key);
      if (existing) existing.count += 1;
      else byKey.set(key, { name: genre, kind: item.kind, count: 1 });
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};
