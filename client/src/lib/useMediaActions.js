import { useState, useCallback } from 'react';
import api from './api';
import { customAlert } from '../utils/alerts';

/**
 * Shared media action hooks for MovieDetails and ShowDetails.
 * @param {'movie'|'show'} type - 'movie' or 'show'
 * @param {number|string} id - The library entity ID
 * @param {object} options
 * @param {Function} options.fetchData - Refetch data callback
 * @param {Function} options.refetchTMDB - Refetch TMDB details callback
 * @param {object[]} options.profiles - Quality profiles array
 */
export function useMediaRefresh(type, id, { fetchData, refetchTMDB } = {}) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    const endpoint = type === 'movie' ? `/library/movies/${id}/refresh` : `/library/shows/${id}/refresh`;
    const label = type === 'movie' ? 'Movie' : 'Show';
    try {
      await api.post(endpoint);
    } catch (e) {
      console.error('Failed to rescan folder', e);
    }
    await fetchData?.(true);
    await refetchTMDB?.();
    setIsRefreshing(false);
    customAlert(`${label} refreshed!`);
  }, [type, id, fetchData, refetchTMDB]);

  return { isRefreshing, refreshAll };
}

/**
 * Shared quality profile change handler.
 * @param {'movie'|'show'} type
 * @param {object} entity - The current entity (movie or show)
 * @param {(entity: object) => void} setEntity - State setter
 * @param {object[]} profiles - Quality profiles array
 */
export function useQualityChange(type, entity, setEntity, profiles) {
  const [updatingQuality, setUpdatingQuality] = useState(false);

  const handleQualityChange = async (profileId) => {
    setUpdatingQuality(true);
    const endpoint = type === 'movie' ? `/library/movies/${entity?.id}/quality` : `/library/shows/${entity?.id}/quality`;
    try {
      const res = await api.put(endpoint, { profileId: profileId || null });
      if (res.data.status === 'success') {
        setEntity(prev => ({
          ...prev,
          quality_profile_id: profileId || null,
          quality_profile_name: profiles.find(p => p.id === profileId)?.name || null
        }));
      }
    } catch (err) {
      console.error('Failed to update quality profile', err);
    } finally {
      setUpdatingQuality(false);
    }
  };

  return { updatingQuality, handleQualityChange };
}
