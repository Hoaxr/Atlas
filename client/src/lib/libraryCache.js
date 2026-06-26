// Module-level cache — survives component unmount/remount across the SPA
// Shared between Layout (prefetch) and Dashboard (display)
let cachedMovies = null;
let cachedShows = null;

export { cachedMovies, cachedShows };

export const setCachedMovies = (data) => { cachedMovies = data; };
export const setCachedShows = (data) => { cachedShows = data; };
