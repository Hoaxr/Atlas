import { useState } from 'react';
import SubSearchModal from '../SubSearchModal';
import api from '../../lib/api';
import { customAlert } from '../../utils/alerts';

export default function SubtitleSearchModal({ modalState, onClose, onRefresh }) {
  const { open, code, label, episodeId, filePath, sceneName } = modalState || {};
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  if (!open || !episodeId) return null;

  const handleSearch = async () => {
    setSearching(true);
    setResults([]);
    setSearched(false);
    try {
      const res = await api.get(`/library/episodes/${episodeId}/search-subs`, {
        params: { lang: code },
      });
      if (res.data.status === 'success') {
        setResults(res.data.data);
      }
    } catch {
      customAlert('Search failed', 'error');
    } finally {
      setSearching(false);
      setSearched(true);
    }
  };

  const handleDownload = async (item) => {
    const res = await api.post(`/library/episodes/${episodeId}/download-subs`, {
      langCode: code,
      url: item.provider === 'SubDL' ? (item.url || null) : null,
      fileId: item.fileId || null,
      subId: item.subId || null,
      provider: item.provider,
    });
    customAlert(res.data.message);
  };

  return (
    <SubSearchModal
      open={open}
      onClose={onClose}
      label={label}
      filePath={filePath}
      sceneName={sceneName}
      results={results}
      searching={searching}
      searched={searched}
      onSearch={handleSearch}
      onDownload={handleDownload}
      onRefresh={onRefresh}
    />
  );
}
