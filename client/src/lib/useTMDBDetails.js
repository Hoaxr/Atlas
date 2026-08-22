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
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!tmdbId) return;
    const controller = new AbortController();
    setLoading(true);
    setTmdbDetails(null);
    setTrailerKey(null);
    const endpoint = mediaType === 'show' ? `/tmdb/show/${tmdbId}` : `/tmdb/movie/${tmdbId}`;

    api.get(endpoint, { signal: controller.signal })
      .then(res => {
        if (controller.signal.aborted) return;
        setTmdbDetails(res.data.data);
        if (res.data?.data?.videos?.results) {
          const trailer = res.data.data.videos.results.find(
            v => v.site === 'YouTube' && v.type === 'Trailer'
          );
          if (trailer) setTrailerKey(trailer.key);
        }
      })
      .catch(err => {
        if (err.name !== 'CanceledError' && err.code !== 'ERR_CANCELED') {
          console.error(err);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [mediaType, tmdbId, nonce]);

  const refetch = useCallback(() => {
    setNonce(n => n + 1);
  }, []);

  return { tmdbDetails, trailerKey, loading, refetch };
}
