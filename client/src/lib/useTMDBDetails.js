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

  const fetchDetails = useCallback(async () => {
    if (!tmdbId) return;
    setLoading(true);
    const endpoint = mediaType === 'show' ? `/tmdb/show/${tmdbId}` : `/tmdb/movie/${tmdbId}`;

    try {
      const res = await api.get(endpoint);
      setTmdbDetails(res.data.data);
      if (res.data?.data?.videos?.results) {
        const trailer = res.data.data.videos.results.find(
          v => v.site === 'YouTube' && v.type === 'Trailer'
        );
        if (trailer) setTrailerKey(trailer.key);
      }
    } catch (err) {
      if (err.name !== 'CanceledError' && err.code !== 'ERR_CANCELED') {
        console.error(err);
      }
    } finally {
      setLoading(false);
    }
  }, [mediaType, tmdbId]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const clear = useCallback(() => {
    setTmdbDetails(null);
    setTrailerKey(null);
  }, []);

  return { tmdbDetails, trailerKey, loading, clear, refetch: fetchDetails };
}
