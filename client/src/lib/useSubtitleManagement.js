import { useState, useEffect } from 'react';
import api from './api';
import { customAlert } from '../utils/alerts';

/**
 * Shared subtitle language menu state + outside-click handler.
 * Used by MovieDetails and ShowDetails.
 */
export function useSubtitleLangMenu() {
  const [downloadingSubs, setDownloadingSubs] = useState({});
  const [openLangMenu, setOpenLangMenu] = useState(null);

  // Close lang menu on outside click
  useEffect(() => {
    if (!openLangMenu) return;
    const handler = (e) => {
      if (e.target.closest('[data-lang-badge]') || e.target.closest('[data-lang-menu]')) return;
      setOpenLangMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openLangMenu]);

  return { downloadingSubs, setDownloadingSubs, openLangMenu, setOpenLangMenu };
}

/**
 * Shared subtitle manual search modal state + handler.
 * @param {(code: string) => string} buildSearchUrl - Function that takes language code and returns API URL
 * @param {object} [initialState] - Optional extra fields for the modal state (e.g. episodeId)
 */
export function useSubSearchModal(buildSearchUrl, initialState = {}) {
  const [subSearchModal, setSubSearchModal] = useState({ open: false, code: '', label: '', ...initialState });
  const [subSearchResults, setSubSearchResults] = useState([]);
  const [subSearching, setSubSearching] = useState(false);
  const [subSearched, setSubSearched] = useState(false);

  const handleSubSearch = async () => {
    setSubSearching(true);
    setSubSearchResults([]);
    setSubSearched(false);
    try {
      const url = buildSearchUrl(subSearchModal.code);
      const res = await api.get(url);
      if (res.data.status === 'success') {
        setSubSearchResults(res.data.data);
      }
    } catch (err) {
      customAlert('Search failed', 'error');
    } finally {
      setSubSearching(false);
      setSubSearched(true);
    }
  };

  return {
    subSearchModal, setSubSearchModal,
    subSearchResults, setSubSearchResults,
    subSearching,
    subSearched,
    handleSubSearch,
  };
}
