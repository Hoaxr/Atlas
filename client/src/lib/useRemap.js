import { useState } from 'react';
import api from './api';
import { customAlert, customConfirm } from '../utils/alerts';

/**
 * Shared remap logic for MovieDetails and ShowDetails.
 * @param {'movie'|'show'} type
 * @param {number|string} entityId
 * @param {object} entity - The current entity (movie or show object)
 * @param {() => void} onSuccess - Callback after successful remap
 */
export default function useRemap(type, entityId, entity, onSuccess) {
  const [remapModalOpen, setRemapModalOpen] = useState(false);
  const [remapQuery, setRemapQuery] = useState('');
  const [remapSearching, setRemapSearching] = useState(false);
  const [remapResults, setRemapResults] = useState([]);
  const [remapHasSearched, setRemapHasSearched] = useState(false);
  const [remapping, setRemapping] = useState(false);

  const label = type === 'movie' ? 'Movie' : 'Show';
  const searchEndpoint = type === 'movie' ? '/tmdb/search/movie' : '/tmdb/search/show';
  const remapEndpoint = type === 'movie' ? `/library/movies/${entityId}/remap` : `/library/shows/${entityId}/remap`;

  const handleRemapSearch = async () => {
    if (!remapQuery.trim()) return;
    setRemapSearching(true);
    setRemapResults([]);
    setRemapHasSearched(false);
    try {
      const res = await api.get(searchEndpoint, {
        params: { query: remapQuery.trim() }
      });
      if (res.data.status === 'success') {
        setRemapResults(res.data.data);
      }
    } catch (err) {
      customAlert('Search failed', 'error');
    } finally {
      setRemapSearching(false);
      setRemapHasSearched(true);
    }
  };

  const handleRemapConfirm = async (newEntity) => {
    const newTitle = newEntity.title || newEntity.name;
    const releaseDate = newEntity.release_date || newEntity.first_air_date || '';

    if (!await customConfirm(
      `Remap "${entity?.title}" to "${newTitle}"?\n\nThis will update the poster, overview, rating and all metadata from the new TMDB entry.`
    )) return;

    setRemapping(true);
    try {
      const res = await api.put(remapEndpoint, {
        tmdbId: newEntity.id,
        title: newTitle,
        year: releaseDate ? releaseDate.split('-')[0] : null,
        poster_path: newEntity.poster_path,
        overview: newEntity.overview,
        vote_average: newEntity.vote_average || 0
      });
      if (res.data.status === 'success') {
        customAlert(`Remapped to "${newTitle}" successfully!`);
        setRemapModalOpen(false);
        onSuccess?.();
      }
    } catch (err) {
      const msg = err.response?.data?.message || `Failed to remap ${label.toLowerCase()}`;
      customAlert(msg, 'error');
    } finally {
      setRemapping(false);
    }
  };

  return {
    remapModalOpen, setRemapModalOpen,
    remapQuery, setRemapQuery,
    remapSearching,
    remapResults, setRemapResults,
    remapHasSearched, setRemapHasSearched,
    remapping,
    handleRemapSearch,
    handleRemapConfirm,
  };
}
