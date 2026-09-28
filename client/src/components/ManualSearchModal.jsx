import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Download,
  Loader2,
  X,
  Magnet,
  HardDrive,
  Filter,
  ExternalLink,
  Check,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  Server,
  Film,
  Tv,
  Music,
  ArrowUp,
  ArrowDown,
  ChevronDown,
} from 'lucide-react';
import api from '../lib/api';
import { formatSize, formatRelativeTime, parseRelease } from '../lib/format';
import ModalShell from './shared/ModalShell';
import InlineError from './shared/InlineError';
import { customAlert } from '../utils/alerts';

function FilterDropdown({
  id,
  label,
  value,
  options,
  onChange,
  openDropdown,
  setOpenDropdown,
  align = 'left',
  isActive = false,
}) {
  const isOpen = openDropdown === id;
  const currentOption = options.find((o) => o.id === value);
  const displayLabel = label || currentOption?.label || value;

  return (
    <div className="relative inline-block" data-dropdown>
      <button
        type="button"
        onClick={() => setOpenDropdown(isOpen ? null : id)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
          isActive
            ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40 shadow-sm shadow-cyan-950/40'
            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700'
        }`}
      >
        <span className="truncate max-w-[130px]">{displayLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 shrink-0 ${
            isOpen ? 'rotate-180 text-cyan-400' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } top-full mt-1.5 z-50 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl shadow-black/80 py-1 min-w-[140px] max-h-60 overflow-y-auto custom-scrollbar`}
        >
          {options.map((opt) => {
            const isSelected = opt.id === value;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onChange(opt.id);
                  setOpenDropdown(null);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-cyan-500/15 text-cyan-300 font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white font-normal'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const getResolutionBadge = (res) => {
  switch (res) {
    case '4K':
      return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
    case '1080p':
      return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
    case '720p':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'SD':
      return 'bg-slate-700/50 text-slate-300 border-slate-600/40';
    default:
      if (res?.includes('FLAC')) return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
      if (res?.includes('320')) return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
      if (res?.includes('V0')) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      return 'bg-slate-800 text-slate-400 border-slate-700';
  }
};

export default function ManualSearchModal({ mediaId, mediaType, season, title, onClose, onGrabbed }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [grabbing, setGrabbing] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  // Search input state
  const [searchQuery, setSearchQuery] = useState(title || '');

  // Filter & sort states
  const [filterText, setFilterText] = useState('');
  const [selectedQuality, setSelectedQuality] = useState('all');
  const [selectedIndexer, setSelectedIndexer] = useState('all');
  const [selectedProtocol, setSelectedProtocol] = useState('all');
  const [hideZeroSeeders, setHideZeroSeeders] = useState(true);
  const [sortBy, setSortBy] = useState('seeders');
  const [sortOrder, setSortOrder] = useState('desc');
  const [openDropdown, setOpenDropdown] = useState(null); // 'sort' | 'quality' | 'indexer' | 'protocol' | null

  useEffect(() => {
    if (!openDropdown) return;
    const handleOutsideClick = (e) => {
      if (!e.target.closest('[data-dropdown]')) {
        setOpenDropdown(null);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpenDropdown(null);
    };
    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openDropdown]);

  const isMusic = mediaType === 'album' || mediaType === 'music';
  const qualityOptions = useMemo(() => {
    return isMusic
      ? [
          { id: 'all', label: 'All Formats' },
          { id: 'flac', label: 'FLAC' },
          { id: '320', label: '320k' },
          { id: 'v0', label: 'V0' },
        ]
      : [
          { id: 'all', label: 'All Qualities' },
          { id: 'remux', label: 'Remux' },
          { id: '4k', label: '4K' },
          { id: '1080p', label: '1080p' },
          { id: '720p', label: '720p' },
        ];
  }, [isMusic]);

  const sortOptions = useMemo(() => [
    { id: 'seeders', label: 'Seeders' },
    { id: 'size', label: 'Size' },
    { id: 'age', label: 'Age' },
    { id: 'quality', label: 'Quality' },
    { id: 'indexer', label: 'Indexer' },
  ], []);

  const endpoint = mediaType === 'episode'
    ? `/library/episodes/${mediaId}/search`
    : mediaType === 'season'
    ? `/library/shows/${mediaId}/seasons/${season}/search`
    : mediaType === 'show'
    ? `/library/shows/${mediaId}/search`
    : mediaType === 'album'
    ? `/library/music/albums/${mediaId}/search`
    : `/library/movies/${mediaId}/search`;

  const grabEndpoint = mediaType === 'episode'
    ? `/library/episodes/${mediaId}/grab`
    : mediaType === 'season'
    ? `/library/shows/${mediaId}/seasons/${season}/download`
    : mediaType === 'show'
    ? `/library/shows/${mediaId}/download`
    : mediaType === 'album'
    ? `/library/music/albums/${mediaId}/grab`
    : `/library/movies/${mediaId}/grab`;

  const executeSearch = useCallback((customQuery = null) => {
    setLoading(true);
    setError(null);
    const params = customQuery && customQuery.trim() !== (title || '').trim()
      ? { query: customQuery.trim() }
      : {};

    api.get(endpoint, { params })
      .then(res => {
        if (res.data.status === 'success') {
          setResults(res.data.data || []);
        } else {
          setError(res.data.message || 'Search returned no results.');
        }
      })
      .catch((err) => {
        if (!err.response) setError('Cannot reach the server. Is Atlas running?');
        else setError(err.response?.data?.message || 'Search failed. Make sure your indexers are configured.');
      })
      .finally(() => setLoading(false));
  }, [endpoint, title]);

  useEffect(() => {
    executeSearch();
  }, [executeSearch]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    executeSearch(searchQuery.trim());
  };

  const handleResetSearch = () => {
    setSearchQuery(title || '');
    executeSearch(null);
  };

  const handleGrab = async (result, idx) => {
    const grabKey = result.guid || result.link || idx;
    setGrabbing(grabKey);
    try {
      const payload = mediaType === 'show'
        ? { torrentUrl: result.link }
        : { link: result.link, title: result.title };
      await api.post(grabEndpoint, payload);
      customAlert(`Download started: ${result.title}`, 'success');
      onGrabbed?.();
      onClose();
    } catch (err) {
      customAlert(err.response?.data?.message || 'Grab failed', 'error');
      setGrabbing(null);
    }
  };

  const handleCopyLink = async (link, id) => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      customAlert('Failed to copy to clipboard', 'error');
    }
  };

  // Enriched results with parsed tags
  const enrichedResults = useMemo(() => {
    return results.map(r => {
      const parsed = parseRelease(r.title, mediaType);
      const isFreeleech = (r.indexerFlags || []).some(f => String(f).toLowerCase().includes('freeleech'));
      const isMagnet = (r.link || '').startsWith('magnet:');
      const isUsenet = r.protocol === 'usenet' || (r.link || '').toLowerCase().includes('.nzb');
      const isCam = Boolean(r.isCam || parsed.isCam);
      return {
        ...r,
        parsed,
        isFreeleech,
        isMagnet,
        isUsenet,
        isCam,
      };
    });
  }, [results, mediaType]);

  const uniqueIndexers = useMemo(() => {
    return Array.from(new Set(results.map(r => r.indexer).filter(Boolean))).sort();
  }, [results]);

  const hasUsenet = useMemo(() => {
    return enrichedResults.some(r => r.isUsenet);
  }, [enrichedResults]);

  const zeroSeedersCount = useMemo(() => {
    return enrichedResults.filter(r => !r.isUsenet && (r.seeders ?? 0) === 0).length;
  }, [enrichedResults]);

  // Filtered and sorted list
  const filteredAndSortedResults = useMemo(() => {
    let list = [...enrichedResults];

    // 1. Hide 0 seeders (applies only to torrents, Usenet is never hidden by seeder count)
    if (hideZeroSeeders) {
      list = list.filter(r => r.isUsenet || (r.seeders ?? 0) > 0);
    }

    // 2. Protocol filter
    if (selectedProtocol !== 'all') {
      if (selectedProtocol === 'usenet') list = list.filter(r => r.isUsenet);
      else list = list.filter(r => !r.isUsenet);
    }

    // 3. Indexer filter
    if (selectedIndexer !== 'all') {
      list = list.filter(r => r.indexer === selectedIndexer);
    }

    // 4. Quality filter
    if (selectedQuality !== 'all') {
      if (mediaType === 'album' || mediaType === 'music') {
        if (selectedQuality === 'flac') list = list.filter(r => r.parsed.resolution?.includes('FLAC'));
        else if (selectedQuality === '320') list = list.filter(r => r.parsed.resolution?.includes('320'));
        else if (selectedQuality === 'v0') list = list.filter(r => r.parsed.resolution?.includes('V0'));
      } else {
        if (selectedQuality === 'remux') list = list.filter(r => r.parsed.isRemux);
        else if (selectedQuality === '4k') list = list.filter(r => r.parsed.resolution === '4K');
        else if (selectedQuality === '1080p') list = list.filter(r => r.parsed.resolution === '1080p');
        else if (selectedQuality === '720p') list = list.filter(r => r.parsed.resolution === '720p');
        else if (selectedQuality === 'bluray') list = list.filter(r => r.parsed.source === 'BluRay');
        else if (selectedQuality === 'web') list = list.filter(r => r.parsed.source?.startsWith('WEB'));
      }
    }

    // 5. Instant text search filter
    if (filterText.trim()) {
      const q = filterText.toLowerCase().trim();
      list = list.filter(r => {
        return (
          r.title?.toLowerCase().includes(q) ||
          r.indexer?.toLowerCase().includes(q) ||
          r.parsed.group?.toLowerCase().includes(q) ||
          r.parsed.source?.toLowerCase().includes(q) ||
          r.parsed.codec?.toLowerCase().includes(q) ||
          r.parsed.audio?.toLowerCase().includes(q) ||
          r.parsed.hdr?.toLowerCase().includes(q)
        );
      });
    }

    // 6. Sorting
    list.sort((a, b) => {
      let diff = 0;
      if (sortBy === 'seeders') {
        diff = (b.seeders ?? 0) - (a.seeders ?? 0);
      } else if (sortBy === 'size') {
        diff = (b.size ?? 0) - (a.size ?? 0);
      } else if (sortBy === 'age') {
        const timeA = a.publishDate ? new Date(a.publishDate).getTime() : (a.age ? Date.now() - a.age * 86400000 : 0);
        const timeB = b.publishDate ? new Date(b.publishDate).getTime() : (b.age ? Date.now() - b.age * 86400000 : 0);
        diff = timeB - timeA;
      } else if (sortBy === 'quality') {
        const rank = (item) => {
          let score = 0;
          if (item.parsed.resolution === '4K') score += 40;
          else if (item.parsed.resolution === '1080p') score += 30;
          else if (item.parsed.resolution === '720p') score += 20;
          else if (item.parsed.resolution === 'SD') score += 10;
          if (item.parsed.isRemux) score += 5;
          if (item.parsed.hdr) score += 3;
          return score;
        };
        diff = rank(b) - rank(a);
      } else if (sortBy === 'indexer') {
        diff = (a.indexer || '').localeCompare(b.indexer || '');
      }

      if (diff === 0) {
        diff = (b.seeders ?? 0) - (a.seeders ?? 0);
      }

      return sortOrder === 'desc' ? diff : -diff;
    });

    return list;
  }, [enrichedResults, hideZeroSeeders, selectedProtocol, selectedIndexer, selectedQuality, filterText, sortBy, sortOrder, mediaType]);

  const mediaIcon = mediaType === 'movie' ? (
    <Film className="w-5 h-5 text-cyan-400" />
  ) : mediaType === 'album' ? (
    <Music className="w-5 h-5 text-emerald-400" />
  ) : (
    <Tv className="w-5 h-5 text-purple-400" />
  );

  return (
    <ModalShell open onClose={onClose} size="3xl" noHeader noPadding noFloatingClose>
      <div className="flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 shrink-0 bg-slate-900/90">
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 shrink-0">
              {mediaIcon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="manual-search-title" className="font-bold text-white text-base sm:text-lg">Manual Search</h2>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/50">
                  {mediaType}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 truncate" title={title}>{title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar Row */}
        <div className="px-4 py-3 bg-slate-900/70 border-b border-slate-800/80">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Refine search query (e.g. alternate title, scene release group)..."
                className="w-full pl-9 pr-8 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 transition-colors font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 transition-colors"
                  title="Clear input"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !searchQuery.trim()}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-cyan-600 hover:bg-cyan-500 active:scale-[0.98] text-white rounded-xl text-xs sm:text-sm font-medium transition-all shadow-sm shadow-cyan-950/50 disabled:opacity-50 shrink-0"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span className="hidden sm:inline">Search</span>
            </button>

            {searchQuery.trim() !== (title || '').trim() && (
              <button
                type="button"
                onClick={handleResetSearch}
                disabled={loading}
                className="flex items-center gap-1 px-2.5 sm:px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs sm:text-sm font-medium transition-colors shrink-0"
                title="Reset to original media title"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}
          </form>
        </div>

        {/* Filters & Sort Controls Bar */}
        {!loading && !error && results.length > 0 && (
          <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-950/60 border-b border-slate-800/60 space-y-2">
            {/* Top Row: Quick live filter & Sort controls */}
            <div className="flex items-center gap-2">
              {/* In-memory quick filter */}
              <div className="relative flex-1 min-w-0">
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Filter results..."
                  className="w-full pl-8 pr-6 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                />
                {filterText && (
                  <button
                    onClick={() => setFilterText('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    title="Clear filter text"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Sort controls (Custom in-DOM dropdown menu) */}
              <div
                className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5 shrink-0 relative"
                data-dropdown
              >
                <button
                  type="button"
                  onClick={() => setOpenDropdown(openDropdown === 'sort' ? null : 'sort')}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs text-slate-300 hover:text-white rounded hover:bg-slate-800/60 transition-colors cursor-pointer"
                  aria-label="Sort by"
                >
                  <span className="font-medium capitalize">
                    {sortOptions.find((o) => o.id === sortBy)?.label || sortBy}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 shrink-0 ${
                      openDropdown === 'sort' ? 'rotate-180 text-cyan-400' : ''
                    }`}
                  />
                </button>

                <div className="h-3.5 w-[1px] bg-slate-800 mx-0.5" />

                <button
                  type="button"
                  onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                  className="p-1 text-slate-400 hover:text-slate-200 transition-colors rounded hover:bg-slate-800 cursor-pointer"
                  title={sortOrder === 'desc' ? 'Descending (highest first)' : 'Ascending (lowest first)'}
                  aria-label="Toggle sort order"
                >
                  {sortOrder === 'desc' ? (
                    <ArrowDown className="w-3.5 h-3.5 text-cyan-400" />
                  ) : (
                    <ArrowUp className="w-3.5 h-3.5 text-cyan-400" />
                  )}
                </button>

                {openDropdown === 'sort' && (
                  <div className="absolute right-0 top-full mt-1.5 z-50 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl shadow-black/80 py-1 min-w-[130px] overflow-hidden">
                    {sortOptions.map((opt) => {
                      const isSelected = opt.id === sortBy;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setSortBy(opt.id);
                            setOpenDropdown(null);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-cyan-500/15 text-cyan-300 font-semibold'
                              : 'text-slate-300 hover:bg-slate-800/80 hover:text-white font-normal'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Row: Filters (Quality dropdown, 0-seeders toggle, Indexer dropdown, Protocol dropdown) */}
            <div className="flex flex-wrap items-center gap-1.5 py-0.5 text-xs text-slate-400">
              {/* Quality Dropdown */}
              <FilterDropdown
                id="quality"
                value={selectedQuality}
                label={
                  selectedQuality === 'all'
                    ? (isMusic ? 'All Formats' : 'All Qualities')
                    : `Quality: ${qualityOptions.find((o) => o.id === selectedQuality)?.label || selectedQuality}`
                }
                options={qualityOptions}
                onChange={setSelectedQuality}
                openDropdown={openDropdown}
                setOpenDropdown={setOpenDropdown}
                isActive={selectedQuality !== 'all'}
              />

              {/* 0-seeders toggle */}
              {zeroSeedersCount > 0 && (
                <button
                  type="button"
                  onClick={() => setHideZeroSeeders(!hideZeroSeeders)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border shrink-0 cursor-pointer ${
                    hideZeroSeeders
                      ? 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                      : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  }`}
                  title={hideZeroSeeders ? 'Click to show 0-seeder releases' : 'Click to hide 0-seeder releases'}
                >
                  {hideZeroSeeders ? `Hide 0 seeders (${zeroSeedersCount})` : `Show all (incl. ${zeroSeedersCount} dead)`}
                </button>
              )}

              {/* Indexer Filter Dropdown (if > 1 indexer) */}
              {uniqueIndexers.length > 1 && (
                <FilterDropdown
                  id="indexer"
                  value={selectedIndexer}
                  label={selectedIndexer === 'all' ? `All Indexers (${uniqueIndexers.length})` : `Indexer: ${selectedIndexer}`}
                  options={[
                    { id: 'all', label: `All Indexers (${uniqueIndexers.length})` },
                    ...uniqueIndexers.map((idx) => ({ id: idx, label: idx })),
                  ]}
                  onChange={setSelectedIndexer}
                  openDropdown={openDropdown}
                  setOpenDropdown={setOpenDropdown}
                  isActive={selectedIndexer !== 'all'}
                />
              )}

              {/* Protocol Filter Dropdown (if Usenet present) */}
              {hasUsenet && (
                <FilterDropdown
                  id="protocol"
                  value={selectedProtocol}
                  label={
                    selectedProtocol === 'all'
                      ? 'All Protocols'
                      : selectedProtocol === 'torrent'
                      ? 'Protocol: Torrent'
                      : 'Protocol: Usenet'
                  }
                  options={[
                    { id: 'all', label: 'All Protocols' },
                    { id: 'torrent', label: 'Torrent only' },
                    { id: 'usenet', label: 'Usenet only' },
                  ]}
                  onChange={setSelectedProtocol}
                  openDropdown={openDropdown}
                  setOpenDropdown={setOpenDropdown}
                  isActive={selectedProtocol !== 'all'}
                />
              )}

              {/* Reset active filters if any active */}
              {(selectedQuality !== 'all' || selectedIndexer !== 'all' || selectedProtocol !== 'all' || !hideZeroSeeders || filterText) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedQuality('all');
                    setSelectedIndexer('all');
                    setSelectedProtocol('all');
                    setHideZeroSeeders(true);
                    setFilterText('');
                  }}
                  className="text-xs text-slate-500 hover:text-cyan-400 transition-colors ml-auto underline cursor-pointer"
                >
                  Reset filters
                </button>
              )}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 custom-scrollbar">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
              <p className="text-sm font-medium">Searching configured indexers…</p>
            </div>
          )}

          {!loading && error && (
            <div className="py-8 max-w-lg mx-auto space-y-4">
              <InlineError message={error} />
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => executeSearch(searchQuery)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white rounded-xl text-xs sm:text-sm font-medium transition-all shadow-sm border border-slate-700/60"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Retry Search</span>
                </button>
              </div>
            </div>
          )}

          {!loading && !error && results.length === 0 && (
            <div className="text-center py-20 text-slate-400 space-y-3">
              <Search className="w-12 h-12 mx-auto text-slate-600 stroke-[1.5]" />
              <p className="text-base font-semibold text-slate-300">No results found across your indexers.</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Try searching with a shorter title, scene name, or removing release years using the search bar above.
              </p>
            </div>
          )}

          {!loading && results.length > 0 && filteredAndSortedResults.length === 0 && (
            <div className="text-center py-16 text-slate-500 space-y-2">
              <Filter className="w-8 h-8 mx-auto opacity-40 mb-2" />
              <p className="text-sm font-medium text-slate-400">No releases match your active filters.</p>
              <button
                onClick={() => {
                  setFilterText('');
                  setSelectedQuality('all');
                  setSelectedIndexer('all');
                  setSelectedProtocol('all');
                  setHideZeroSeeders(false);
                }}
                className="text-xs text-cyan-400 hover:text-cyan-300 underline font-medium"
              >
                Reset active filters
              </button>
            </div>
          )}

          {!loading && filteredAndSortedResults.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2 px-1">
                <span>
                  Showing {filteredAndSortedResults.length} of {results.length} result{results.length !== 1 ? 's' : ''}
                </span>
                <span>Sorted by {sortBy} ({sortOrder})</span>
              </div>              {filteredAndSortedResults.map((r, idx) => {
                const isGrabbed = grabbing === (r.guid || idx);
                const hasBadges = Boolean(
                  (r.parsed.resolution && r.parsed.resolution !== '—') ||
                  r.parsed.source ||
                  r.parsed.hdr ||
                  r.parsed.codec ||
                  r.parsed.audio ||
                  r.isFreeleech ||
                  r.isCam
                );

                return (
                  <div
                    key={r.guid || r.link || `${r.title}-${idx}`}
                    className="p-3 sm:p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900/90 transition-all space-y-2 group"
                  >
                    {/* Top Row: Release Title & Desktop Actions */}
                    <div className="flex items-start justify-between gap-2.5 min-w-0">
                      <p
                        className="text-xs sm:text-sm font-semibold text-slate-200 leading-snug break-words flex-1 min-w-0"
                        title={r.title}
                      >
                        {r.title}
                      </p>

                      {/* Desktop Action Buttons */}
                      <div className="hidden sm:flex items-center gap-1.5 shrink-0 ml-2">
                        {r.infoUrl && (
                          <a
                            href={r.infoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                            title="Open tracker release details"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}

                        <button
                          onClick={() => handleCopyLink(r.link, r.guid || idx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
                          title="Copy magnet link"
                          aria-label="Copy magnet link"
                        >
                          {copiedId === (r.guid || idx) ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Magnet className="w-4 h-4 text-cyan-400/80 hover:text-cyan-300" />
                          )}
                        </button>

                        <button
                          onClick={() => handleGrab(r, idx)}
                          disabled={grabbing !== null}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 active:scale-[0.98] text-white font-medium text-xs transition-all shadow-sm shadow-cyan-950/40 disabled:opacity-50"
                        >
                          {isGrabbed ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          Grab
                        </button>
                      </div>
                    </div>

                    {/* Middle Row: Badges Container (full-width wrapping, never squishes title) */}
                    {hasBadges && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Resolution */}
                        {r.parsed.resolution && r.parsed.resolution !== '—' && (
                          <span className={`text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md border ${getResolutionBadge(r.parsed.resolution)}`}>
                            {r.parsed.resolution}
                          </span>
                        )}

                        {/* Source (e.g. REMUX, BluRay, WEB-DL) */}
                        {r.parsed.source && (
                          <span className={`text-[10px] sm:text-[11px] font-semibold px-1.5 py-0.5 rounded border ${
                            r.parsed.isRemux
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 font-bold'
                              : 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                          }`}>
                            {r.parsed.source}
                          </span>
                        )}

                        {/* HDR / DV */}
                        {r.parsed.hdr && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30">
                            {r.parsed.hdr}
                          </span>
                        )}

                        {/* Codec */}
                        {r.parsed.codec && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60">
                            {r.parsed.codec}
                          </span>
                        )}

                        {/* Audio */}
                        {r.parsed.audio && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                            {r.parsed.audio}
                          </span>
                        )}

                        {/* Freeleech */}
                        {r.isFreeleech && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-0.5">
                            <Sparkles className="w-2.5 h-2.5" />
                            Freeleech
                          </span>
                        )}

                        {/* CAM Warning */}
                        {r.isCam && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            CAM
                          </span>
                        )}
                      </div>
                    )}

                    {/* Bottom Row: Metadata info strip + Mobile Action Buttons */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/50 sm:border-0 sm:pt-0">
                      <div className="flex items-center gap-x-2.5 gap-y-1 flex-wrap text-[11px] text-slate-400 min-w-0 flex-1">
                        {/* Protocol indicator */}
                        <span className="flex items-center gap-1 text-slate-400 font-medium shrink-0">
                          {r.isUsenet ? (
                            <>
                              <Server className="w-3 h-3 text-blue-400" />
                              <span className="text-blue-400">Usenet</span>
                            </>
                          ) : r.isMagnet ? (
                            <>
                              <Magnet className="w-3 h-3 text-cyan-400" />
                              <span>Magnet</span>
                            </>
                          ) : (
                            <>
                              <HardDrive className="w-3 h-3 text-slate-400" />
                              <span>Torrent</span>
                            </>
                          )}
                        </span>

                        {/* Size */}
                        {r.size > 0 && (
                          <span className="flex items-center gap-1 text-slate-200 font-semibold shrink-0">
                            {formatSize(r.size)}
                          </span>
                        )}

                        {/* Peers (Seeders / Leechers) */}
                        {!r.isUsenet && (
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="flex items-center gap-0.5 text-emerald-400 font-semibold" title="Seeders">
                              <ArrowUp className="w-3 h-3" />
                              {r.seeders ?? '?'}
                            </span>
                            <span className="flex items-center gap-0.5 text-slate-400 font-medium" title="Leechers">
                              <ArrowDown className="w-3 h-3" />
                              {r.leechers ?? 0}
                            </span>
                          </div>
                        )}

                        {/* Age / Date */}
                        {(r.publishDate || r.age) && (
                          <span className="text-slate-400 font-medium shrink-0">
                            {r.publishDate ? formatRelativeTime(r.publishDate) : `${Math.round(r.age)}d ago`}
                          </span>
                        )}

                        {/* Indexer tag */}
                        {r.indexer && (
                          <span className="text-slate-400 truncate max-w-[120px] bg-slate-950 px-1.5 py-0.5 rounded-md border border-slate-800/90 text-[10px] font-medium shrink-0">
                            {r.indexer}
                          </span>
                        )}

                        {/* Group tag */}
                        {r.parsed.group && (
                          <span className="text-slate-300 font-mono bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-[10px] shrink-0">
                            {r.parsed.group}
                          </span>
                        )}
                      </div>

                      {/* Mobile Action Buttons */}
                      <div className="sm:hidden flex items-center gap-1 shrink-0 ml-auto">
                        {r.infoUrl && (
                          <a
                            href={r.infoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                            title="Open tracker release details"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}

                        <button
                          onClick={() => handleCopyLink(r.link, r.guid || idx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
                          title="Copy magnet link"
                          aria-label="Copy magnet link"
                        >
                          {copiedId === (r.guid || idx) ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Magnet className="w-3.5 h-3.5 text-cyan-400/80 hover:text-cyan-300" />
                          )}
                        </button>

                        <button
                          onClick={() => handleGrab(r, idx)}
                          disabled={grabbing !== null}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white font-medium text-xs transition-all shadow-sm shadow-cyan-950/40 disabled:opacity-50"
                        >
                          {isGrabbed ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          Grab
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
