import { useState, useEffect, useCallback } from 'react';
import api from './api';

/**
 * Fetches TMDB details and extracts the trailer key.
 * @param {'movie'|'show'} mediaType
 * @param {number|null} tmdbId
 * @returns {{ tmdbDetails, trailerKey, loading }}
 */
export function useTMDBDetails(mediaType, tmdbId) {
  const [tmdbDetails, setTmdbDetails] = useState(null);
  const [trailerKey, setTrailerKey] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(() => {
    if (!tmdbId) return Promise.resolve();
    setLoading(true);
    const endpoint = mediaType === 'show' ? `/tmdb/show/${tmdbId}` : `/tmdb/movie/${tmdbId}`;
    return api.get(`${endpoint}?_t=${Date.now()}`).then(res => {
      setTmdbDetails(res.data.data);
      if (res.data?.data?.videos?.results) {
        const trailer = res.data.data.videos.results.find(
          v => v.site === 'YouTube' && v.type === 'Trailer'
        );
        if (trailer) setTrailerKey(trailer.key);
      }
    }).catch(err => console.error(err)).finally(() => setLoading(false));
  }, [mediaType, tmdbId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const clear = useCallback(() => {
    setTmdbDetails(null);
    setTrailerKey(null);
  }, []);

  return { tmdbDetails, trailerKey, loading, refetch: fetch, clear };
}
