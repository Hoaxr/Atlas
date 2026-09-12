import { useState, useEffect, useRef } from 'react';
import { Search, Plus, Music2, Check, Loader2, Disc, Mic2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import ModalShell from '../shared/ModalShell';

// Maps a search failure to a short, user-friendly message.
const searchErrorMessage = (err) => {
  const status = err.response?.status;
  if (status === 429 || status === 503) return 'MusicBrainz is busy right now. Please try again in a moment.';
  if (status >= 500) return "Couldn't reach MusicBrainz. Please try again.";
  return err.response?.data?.message || 'Search failed. Please try again.';
};

export default function AddArtistModal({ open, onClose, onAdded }) {
  const [searchType, setSearchType] = useState('artist'); // 'artist' | 'album'
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [adding, setAdding] = useState(false);

  const searchTimer = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setSelectedItem(null);
      return;
    }

    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Debounced search on query or searchType change
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    setSearching(true);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api.get('/library/music/search', {
          params: { q: query.trim(), type: searchType },
          signal: controller.signal,
        });
        if (res.data.status === 'success') {
          setResults(res.data.data || []);
        }
      } catch (err) {
        // Ignore requests superseded by a newer keystroke or cancelled on close
        if (controller.signal.aborted || err.code === 'ERR_CANCELED') return;
        console.error('MusicBrainz search error:', err);
        // Stable id collapses rapid repeated failures into a single toast
        toast.error(searchErrorMessage(err), { id: 'music-search-error' });
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 450);

    return () => {
      clearTimeout(searchTimer.current);
      controller.abort();
    };
  }, [query, searchType]);

  const handleAdd = async () => {
    if (!selectedItem) return;
    setAdding(true);
    try {
      if (searchType === 'artist') {
        const payload = { mbid: selectedItem.mbid };
        const res = await api.post('/library/music/artists', payload);
        if (res.data.status === 'success') {
          toast.success(`Added "${selectedItem.name}" to your music library!`, { id: 'music-library-add' });
          if (onAdded) onAdded(res.data.data);
          onClose();
        }
      } else {
        const payload = {
          mbid: selectedItem.mbid,
          artistMbid: selectedItem.artistMbid,
        };
        const res = await api.post('/library/music/albums', payload);
        if (res.data.status === 'success') {
          toast.success(`Added "${selectedItem.title}" to your music library!`, { id: 'music-library-add' });
          if (onAdded) onAdded(res.data.data);
          onClose();
        }
      }
    } catch (err) {
      console.error('Failed to add media:', err);
      const status = err.response?.status;
      const message = status >= 500
        ? "Couldn't add that right now — the server ran into an error. Please try again."
        : (err.response?.data?.message || 'Failed to add to library');
      toast.error(message, { id: 'music-add-error' });
    } finally {
      setAdding(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      size="2xl"
      title={searchType === 'artist' ? 'Add Music Artist' : 'Add Music Album'}
      icon={<Music2 className="w-5 h-5 text-cyan-400" />}
    >
      <div className="space-y-4">
        {/* Toggle Type Selector */}
        <div className="flex items-center gap-1 p-1 bg-slate-900/60 rounded-xl border border-white/5 w-fit">
          <button
            type="button"
            onClick={() => {
              setSearchType('artist');
              setSelectedItem(null);
            }}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              searchType === 'artist'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mic2 className="w-3.5 h-3.5" />
            Artists
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchType('album');
              setSelectedItem(null);
            }}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              searchType === 'album'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Disc className="w-3.5 h-3.5" />
            Albums
          </button>
        </div>

        {/* Search input bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedItem(null);
            }}
            placeholder={
              searchType === 'artist'
                ? 'Search artists on MusicBrainz (e.g. Tycho, Daft Punk)...'
                : 'Search albums on MusicBrainz (e.g. Tycho - Dive, or Random Access Memories)...'
            }
            className="w-full pl-10 pr-10 py-2.5 bg-slate-900/60 dark:bg-slate-900/80 border border-slate-700/60 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/80 transition-colors"
          />
          {searching && (
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none flex items-center">
              <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
            </div>
          )}
        </div>

        {/* Results list */}
        <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 -mr-1 custom-scrollbar">
          {results.map((item) => {
            const isSelected = selectedItem?.mbid === item.mbid;
            const inLib = item.inLibrary;

            return (
              <div
                key={item.mbid}
                onClick={() => {
                  if (!inLib) setSelectedItem(item);
                }}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                  inLib
                    ? 'opacity-60 bg-slate-800/30 border-slate-800 cursor-not-allowed'
                    : isSelected
                    ? 'bg-cyan-500/15 border-cyan-500/50 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                    : 'bg-slate-800/40 hover:bg-slate-800/70 border-white/5 hover:border-white/10'
                }`}
              >
                <div className="flex-1 min-w-0 pr-3">
                  {searchType === 'artist' ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-100 text-sm truncate">
                          {item.name}
                        </span>
                        {item.country && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300 font-mono">
                            {item.country}
                          </span>
                        )}
                        {item.type && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                            {item.type}
                          </span>
                        )}
                      </div>
                      {item.disambiguation && (
                        <p className="text-xs text-slate-400 truncate mt-0.5">
                          {item.disambiguation}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-100 text-sm truncate">
                          {item.title}
                        </span>
                        {item.year && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300 font-mono">
                            {item.year}
                          </span>
                        )}
                        {item.albumType && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/20">
                            {item.albumType}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        by <span className="text-slate-300 font-medium">{item.artistName || 'Unknown'}</span>
                      </p>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {inLib ? (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> In Library
                    </span>
                  ) : (
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'border-cyan-400 bg-cyan-500 text-slate-950'
                          : 'border-slate-600 bg-slate-800/60'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {!searching && query.trim() && results.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-sm">
              No {searchType === 'artist' ? 'artists' : 'albums'} found for "{query}".
            </div>
          )}
          {!query.trim() && (
            <div className="text-center py-8 text-slate-500 text-sm">
              Type {searchType === 'artist' ? 'an artist name' : 'an album title'} to search MusicBrainz.
            </div>
          )}
        </div>

        {/* Action buttons */}
        {selectedItem && (
          <div className="pt-3 border-t border-slate-700/50 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={adding}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center gap-1.5 shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all disabled:opacity-50"
            >
              {adding ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding...
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" /> Add {searchType === 'artist' ? selectedItem.name : selectedItem.title}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
