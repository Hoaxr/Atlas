import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Mic2, Disc, RefreshCw, Search, Trash2, Bookmark, BookmarkMinus,
  CheckCircle2, AlertCircle, Calendar, ShieldCheck, Loader2, Sparkles, ExternalLink, FileAudio,
  Play, Pause, ChevronLeft, ChevronRight, SlidersHorizontal
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { formatSize } from '../lib/format';
import { albumCoverUrl, artistImageUrl } from '../lib/posterUrl';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import ModalShell from '../components/shared/ModalShell';
import ManualSearchModal from '../components/ManualSearchModal';
import AlbumCard from '../components/music/AlbumCard';

export default function ArtistDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { playTrack, playAlbum, playArtist, currentTrack, isPlaying, togglePlay } = useAudioPlayer();

  const [artist, setArtist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchingMissing, setSearchingMissing] = useState(false);
  const [searchingAlbum, setSearchingAlbum] = useState(false);

  // Tab: 'albums' | 'singles' | 'all'
  const [activeTab, setActiveTab] = useState('albums');
  const [selectedAlbumId, setSelectedAlbumId] = useState(null);
  const [tracklist, setTracklist] = useState([]);
  const [tracklistLoading, setTracklistLoading] = useState(false);
  const tracklistCache = useRef({});
  const scrollRef = useRef(null);

  // Modals
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [manualSearchAlbum, setManualSearchAlbum] = useState(null);

  const fetchArtist = async () => {
    try {
      const res = await api.get(`/library/music/artists/${id}`);
      if (res.data.status === 'success') {
        setArtist(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load artist:', err);
      toast.error('Failed to load artist details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArtist();
  }, [id]);

  const handleToggleMonitor = async () => {
    if (!artist) return;
    try {
      const newMonitored = artist.monitored ? 0 : 1;
      await api.put(`/library/music/artists/${id}`, { monitored: newMonitored });
      setArtist((prev) => ({ ...prev, monitored: newMonitored }));
      toast.success(newMonitored ? 'Artist monitored' : 'Artist unmonitored', { id: `artist-monitor-${id}` });
    } catch (err) {
      toast.error('Failed to update monitoring status', { id: `artist-monitor-${id}` });
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await api.post(`/library/music/artists/${id}/refresh`);
      if (res.data.status === 'success') {
        toast.success(res.data.message || 'Metadata refreshed', { id: `artist-refresh-${id}`, duration: 2500 });
        fetchArtist();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to refresh metadata', { id: `artist-refresh-${id}` });
    } finally {
      setRefreshing(false);
    }
  };

  const handleSearchMissing = async () => {
    setSearchingMissing(true);
    try {
      const res = await api.post(`/library/music/artists/${id}/search`);
      if (res.data.status === 'success') {
        toast.success(res.data.message || 'Searching releases for missing albums', { id: `artist-search-${id}`, duration: 2500 });
      }
    } catch (err) {
      toast.error('Failed to trigger search', { id: `artist-search-${id}` });
    } finally {
      setSearchingMissing(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/library/music/artists/${id}?deleteFiles=${deleteFiles}`);
      toast.success(`Removed ${artist.name} from library`);
      navigate('/music?tab=artists');
    } catch (err) {
      toast.error('Failed to delete artist');
    } finally {
      setDeleting(false);
    }
  };

  const hasSinglesOrEPs = useMemo(() => {
    return (artist?.albums || []).some((a) => {
      const type = (a.album_type || '').toLowerCase();
      return type === 'single' || type === 'ep';
    });
  }, [artist]);

  const filteredAlbums = useMemo(() => {
    if (!artist || !artist.albums) return [];
    if (!hasSinglesOrEPs || activeTab === 'albums') {
      return artist.albums.filter((a) => (a.album_type || '').toLowerCase() === 'album');
    }
    if (activeTab === 'singles') {
      return artist.albums.filter((a) => {
        const type = (a.album_type || '').toLowerCase();
        return type === 'single' || type === 'ep';
      });
    }
    return artist.albums;
  }, [artist, activeTab, hasSinglesOrEPs]);

  // Set default selected album if none selected or current is not in filtered list
  useEffect(() => {
    if (!filteredAlbums.length) {
      setSelectedAlbumId(null);
      return;
    }

    const currentExists = filteredAlbums.some((a) => a.id === selectedAlbumId);
    if (!currentExists) {
      const preferred =
        filteredAlbums.find((a) => a.status === 'downloaded' || Number(a.downloaded_tracks) > 0) ||
        filteredAlbums[0];
      setSelectedAlbumId(preferred?.id || null);
    }
  }, [filteredAlbums, selectedAlbumId]);

  const selectedAlbum = useMemo(() => {
    if (!selectedAlbumId) return filteredAlbums[0] || null;
    return filteredAlbums.find((a) => a.id === selectedAlbumId) || filteredAlbums[0] || null;
  }, [filteredAlbums, selectedAlbumId]);

  // Fetch tracklist for selected album
  useEffect(() => {
    if (!selectedAlbum?.id) {
      setTracklist([]);
      return;
    }

    const albumId = selectedAlbum.id;
    if (tracklistCache.current[albumId]) {
      setTracklist(tracklistCache.current[albumId]);
      return;
    }

    let isMounted = true;
    setTracklistLoading(true);

    api
      .get(`/library/music/albums/${albumId}/tracklist`)
      .then((res) => {
        if (!isMounted) return;
        if (res.data.status === 'success') {
          const raw = res.data.data || [];
          const list = raw.map((t) => ({
            ...t,
            artist_name: t.artist_name || artist?.name,
            artist_id: t.artist_id || artist?.id,
            album_title: t.album_title || selectedAlbum?.title,
            album_id: t.album_id || selectedAlbum?.id,
            album_mbid: t.album_mbid || selectedAlbum?.mbid,
          }));
          tracklistCache.current[albumId] = list;
          setTracklist(list);
        }
      })
      .catch((err) => {
        console.warn('Failed to load tracklist for album:', albumId, err);
      })
      .finally(() => {
        if (isMounted) setTracklistLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedAlbum?.id]);

  const handleScroll = (direction) => {
    if (!scrollRef.current) return;
    const scrollAmount = direction === 'left' ? -380 : 380;
    scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  const handleAutoSearchAlbum = async () => {
    if (!selectedAlbum) return;
    setSearchingAlbum(true);
    try {
      const res = await api.post(`/library/music/albums/${selectedAlbum.id}/search`);
      if (res.data.status === 'success') {
        toast.success(res.data.message || `Search triggered for ${selectedAlbum.title}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Search failed');
    } finally {
      setSearchingAlbum(false);
    }
  };

  const formatDuration = (secs) => {
    if (!secs) return '--:--';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Group tracks by disc number if multi-disc
  const discGroups = useMemo(() => {
    const source = tracklist || [];
    if (!source.length) return {};
    const groups = {};
    for (const track of source) {
      const disc = track.disc_number || 1;
      if (!groups[disc]) groups[disc] = [];
      groups[disc].push(track);
    }
    for (const disc of Object.keys(groups)) {
      groups[disc].sort((a, b) => (a.track_number || 0) - (b.track_number || 0));
    }
    return groups;
  }, [tracklist]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-slate-400">
        <AlertCircle className="w-12 h-12 text-rose-400 mb-3" />
        <h2 className="text-xl font-bold text-slate-100">Artist Not Found</h2>
        <p className="text-sm text-slate-400 mt-1 mb-4">This artist might have been removed.</p>
        <button
          onClick={() => navigate('/music?tab=artists')}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded-xl font-semibold transition-colors"
        >
          Back to Music
        </button>
      </div>
    );
  }

  const artistImg = artist.image_url || artistImageUrl(artist);
  const totalAlbumsCount = artist.albums?.length || 0;
  const downloadedAlbumsCount = (artist.albums || []).filter((a) => {
    const d = Number(a.downloaded_tracks || 0);
    const tot = Math.max(a.expected_track_count || 0, a.track_count || 0, d);
    return (a.status === 'downloaded' || (tot > 0 && d >= tot)) && (tot === 0 ? d > 0 : d >= tot);
  }).length;
  const partialAlbumsCount = (artist.albums || []).filter((a) => {
    const d = Number(a.downloaded_tracks || 0);
    const tot = Math.max(a.expected_track_count || 0, a.track_count || 0, d);
    const isComp = (a.status === 'downloaded' || (tot > 0 && d >= tot)) && (tot === 0 ? d > 0 : d >= tot);
    return d > 0 && !isComp;
  }).length;
  const missingAlbumsCount = Math.max(0, totalAlbumsCount - downloadedAlbumsCount - partialAlbumsCount);

  const isCurrentArtistPlaying =
    isPlaying &&
    currentTrack?.artist_name &&
    artist?.name &&
    currentTrack.artist_name.toLowerCase() === artist.name.toLowerCase();

  const isSelectedAlbumPlaying =
    isPlaying &&
    selectedAlbum &&
    ((currentTrack?.album_mbid && currentTrack.album_mbid === selectedAlbum.mbid) ||
      currentTrack?.album_id === selectedAlbum.id);

  const handlePlaySelectedAlbum = () => {
    if (!selectedAlbum) return;
    if (isSelectedAlbumPlaying) {
      togglePlay();
    } else {
      const readyTracks = (tracklist || [])
        .filter((t) => !t.missing)
        .map((t) => ({
          ...t,
          artist_name: t.artist_name || artist?.name,
          artist_id: t.artist_id || artist?.id,
          album_title: t.album_title || selectedAlbum.title,
          album_id: t.album_id || selectedAlbum.id,
          album_mbid: t.album_mbid || selectedAlbum.mbid,
        }));
      playAlbum(selectedAlbum, readyTracks.length > 0 ? readyTracks : undefined);
    }
  };

  const selectedAlbumCover = selectedAlbum ? (selectedAlbum.cover_url || albumCoverUrl(selectedAlbum)) : null;
  const downloadedTracksCount = (tracklist || []).filter(
    (t) => !t.missing && (t.status === 'downloaded' || t.file_path)
  ).length;
  const hasDownloadedFiles = downloadedTracksCount > 0 || selectedAlbum?.status === 'downloaded';
  const selectedAlbumFormat = hasDownloadedFiles && selectedAlbum?.file_format
    ? selectedAlbum.file_format.toUpperCase()
    : '';
  const totalTracksCount = tracklist.length > 0
    ? tracklist.length
    : Math.max(selectedAlbum?.expected_track_count || 0, selectedAlbum?.track_count || 0);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-950 text-slate-100 custom-scrollbar">
      {/* ── Top Nav Bar ────────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-slate-950/80 backdrop-blur-md sticky top-0 z-30">
        <button
          onClick={() => navigate('/music?tab=artists')}
          className="flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-cyan-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Artists
        </button>

        {/* Action buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleToggleMonitor}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              artist.monitored
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/25'
                : 'bg-slate-900 text-slate-400 border border-white/5 hover:text-slate-200'
            }`}
          >
            {artist.monitored ? <Bookmark className="w-4 h-4 fill-cyan-400" /> : <BookmarkMinus className="w-4 h-4" />}
            {artist.monitored ? 'Monitored' : 'Unmonitored'}
          </button>

          <button
            onClick={handleSearchMissing}
            disabled={searchingMissing}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-white/5 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Search releases for missing albums"
          >
            <Search className={`w-4 h-4 ${searchingMissing ? 'animate-spin text-cyan-400' : ''}`} />
            Auto Search
          </button>

          {downloadedAlbumsCount > 0 && (
            <button
              onClick={() => {
                if (isCurrentArtistPlaying) {
                  togglePlay();
                } else {
                  playArtist(artist);
                }
              }}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-white/5 flex items-center gap-1.5 transition-colors"
              title="Play all downloaded tracks by this artist"
            >
              {isCurrentArtistPlaying ? (
                <Pause className="w-4 h-4 fill-slate-200" />
              ) : (
                <Play className="w-4 h-4 fill-slate-200 ml-0.5" />
              )}
              {isCurrentArtistPlaying ? 'Pause Artist' : 'Play Artist'}
            </button>
          )}

          {selectedAlbum && (
            <button
              onClick={() => setManualSearchAlbum(selectedAlbum)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-white/5 flex items-center gap-1.5 transition-colors"
              title="Interactive release search for selected album"
            >
              <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
              Interactive Search
            </button>
          )}

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-white/5 transition-colors disabled:opacity-50"
            title="Refresh metadata from MusicBrainz"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>

          <button
            onClick={() => setDeleteModalOpen(true)}
            className="p-2 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors"
            title="Delete Artist"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Artist Hero Header ──────────────────────────────────────────────── */}
      <div className="relative px-6 py-8 border-b border-white/5 overflow-hidden">
        {/* Background Backdrop Glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {artistImg && (
            <img
              src={artistImg}
              alt=""
              className="w-full h-full object-cover blur-3xl scale-125 opacity-20"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-slate-950/90" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/60 to-slate-950" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Left: Circular Artist Avatar with Cyan Glow Ring + Name & Stats */}
          <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden shrink-0 bg-slate-900 border-4 border-cyan-400/40 shadow-[0_0_35px_rgba(6,182,212,0.3)] flex items-center justify-center relative ring-4 ring-cyan-500/20">
              {artistImg ? (
                <img
                  src={artistImg}
                  alt={artist.name}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const fallback = e.currentTarget.parentElement?.querySelector('.artist-fallback');
                    if (fallback) fallback.style.display = 'flex';
                  }}
                  className="w-full h-full object-cover"
                />
              ) : null}
              <div
                className={`artist-fallback ${artistImg ? 'hidden' : 'flex'} w-full h-full items-center justify-center text-cyan-400/50`}
              >
                <Mic2 className="w-14 h-14" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-center sm:justify-start gap-2.5 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  Artist
                </span>
                {artist.monitored ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                    Monitored
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-white/5">
                    Unmonitored
                  </span>
                )}
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
                {artist.name}
              </h1>

              {/* Stats: Albums, Complete, Missing */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 text-xs text-slate-300 mt-3">
                <span className="px-3 py-1 rounded-xl bg-slate-900/80 border border-white/10 font-semibold text-slate-200 shadow-sm">
                  {totalAlbumsCount} Albums
                </span>
                <span className="px-3 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 font-semibold text-emerald-400 shadow-sm">
                  {downloadedAlbumsCount} Complete
                </span>
                {partialAlbumsCount > 0 && (
                  <span className="px-3 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 font-semibold text-amber-400 shadow-sm">
                    {partialAlbumsCount} Partial
                  </span>
                )}
                <span className="px-3 py-1 rounded-xl bg-slate-900/80 border border-white/10 font-semibold text-slate-400 shadow-sm">
                  {missingAlbumsCount} Missing
                </span>
              </div>
            </div>
          </div>

          {/* Right: Quick Play Artist button */}
          {downloadedAlbumsCount > 0 && (
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => {
                  if (isCurrentArtistPlaying) {
                    togglePlay();
                  } else {
                    playArtist(artist);
                  }
                }}
                className="px-6 py-3 rounded-2xl text-sm font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center gap-2 shadow-[0_0_25px_rgba(6,182,212,0.4)] transition-all hover:scale-105 active:scale-95"
              >
                {isCurrentArtistPlaying ? (
                  <Pause className="w-5 h-5 fill-slate-950" />
                ) : (
                  <Play className="w-5 h-5 fill-slate-950 ml-0.5" />
                )}
                {isCurrentArtistPlaying ? 'Pause Artist' : 'Play Artist'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Scrollable Albums Section ───────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-2 max-w-7xl w-full mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Disc className="w-5 h-5 text-cyan-400" />
              <h2 className="text-base font-bold text-white tracking-wide uppercase">
                Albums ({filteredAlbums.length})
              </h2>
            </div>

            {hasSinglesOrEPs && (
              <div className="flex items-center p-0.5 rounded-xl bg-slate-900 border border-white/5 ml-2">
                <button
                  onClick={() => setActiveTab('albums')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'albums'
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Albums
                </button>
                <button
                  onClick={() => setActiveTab('singles')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'singles'
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Singles & EPs
                </button>
                <button
                  onClick={() => setActiveTab('all')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'all'
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All
                </button>
              </div>
            )}
          </div>

          {/* Carousel Scroll Navigation Arrows */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleScroll('left')}
              className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/5 transition-colors"
              title="Scroll left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleScroll('right')}
              className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/5 transition-colors"
              title="Scroll right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Horizontally Scrollable Row */}
        {filteredAlbums.length === 0 ? (
          <div className="text-center py-10 text-slate-500 bg-slate-900/30 border border-white/5 rounded-2xl">
            <Disc className="w-8 h-8 mx-auto mb-2 opacity-30 text-cyan-400" />
            <p className="text-sm font-semibold text-slate-400">No releases in this category</p>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="flex items-stretch gap-4 overflow-x-auto py-3 px-2 scroll-smooth snap-x scrollbar-none custom-scrollbar"
            style={{ scrollbarWidth: 'thin' }}
          >
            {filteredAlbums.map((album) => {
              const isSelected = selectedAlbum?.id === album.id;
              return (
                <div key={album.id} className="w-48 shrink-0 snap-start">
                  <AlbumCard
                    album={album}
                    subtitleMode="type"
                    isSelected={isSelected}
                    onClick={() => setSelectedAlbumId(album.id)}
                    onManualSearch={setManualSearchAlbum}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Tracklist Section (Full Width Below Albums) ────────────────────── */}
      <div className="px-6 py-6 flex-1 flex flex-col max-w-7xl w-full mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-3 border-b border-white/5">
          <div className="flex items-center gap-3.5 min-w-0">
            {selectedAlbumCover ? (
              <img
                src={selectedAlbumCover}
                alt={selectedAlbum?.title}
                className="w-12 h-12 rounded-xl object-cover border border-white/10 shrink-0 shadow-md"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center shrink-0 text-cyan-400">
                <Disc className="w-6 h-6" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white truncate">
                  {selectedAlbum?.title || 'Tracklist'}
                </h2>
                {selectedAlbumFormat && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/25">
                    {selectedAlbumFormat}
                    {selectedAlbum?.file_bitdepth ? ` ${selectedAlbum.file_bitdepth}B` : ''}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                {selectedAlbum?.year && <span>{selectedAlbum.year}</span>}
                {selectedAlbum?.year && <span>•</span>}
                <span>{totalTracksCount} tracks</span>
                <span>•</span>
                <span className="text-emerald-400 font-medium">{downloadedTracksCount} downloaded</span>
              </div>
            </div>
          </div>

          {/* Selected Album Quick Actions */}
          {selectedAlbum && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {downloadedTracksCount > 0 && (
                <button
                  onClick={handlePlaySelectedAlbum}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center gap-1.5 shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all hover:scale-105 active:scale-95"
                >
                  {isSelectedAlbumPlaying ? (
                    <Pause className="w-3.5 h-3.5 fill-slate-950" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-slate-950 ml-0.5" />
                  )}
                  {isSelectedAlbumPlaying ? 'Pause' : 'Play Album'}
                </button>
              )}

              <button
                onClick={handleAutoSearchAlbum}
                disabled={searchingAlbum}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-white/10 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title="Auto search releases for this album"
              >
                <Search className={`w-3.5 h-3.5 ${searchingAlbum ? 'animate-spin text-cyan-400' : ''}`} />
                Auto Search
              </button>

              <button
                onClick={() => setManualSearchAlbum(selectedAlbum)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-white/10 flex items-center gap-1.5 transition-colors"
                title="Interactive release search"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                Interactive
              </button>

              <button
                onClick={() => navigate(`/music/albums/${selectedAlbum.id}`)}
                className="p-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-white/10 transition-colors"
                title="Open full album page"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Tracks List Table */}
        <div className="space-y-6">
          {tracklistLoading ? (
            <div className="flex items-center justify-center py-16 bg-slate-900/40 border border-white/5 rounded-2xl">
              <Loader2 className="w-7 h-7 animate-spin text-cyan-400" />
            </div>
          ) : Object.keys(discGroups).length === 0 ? (
            <div className="text-center py-14 bg-slate-900/30 border border-white/5 rounded-2xl text-slate-500">
              <FileAudio className="w-10 h-10 mx-auto mb-2 opacity-30 text-cyan-400" />
              <p className="text-base font-semibold text-slate-300">No track listing available</p>
              <p className="text-sm text-slate-500 mt-1">Tracks will be populated during download or manual search.</p>
            </div>
          ) : (
            Object.keys(discGroups).map((discNum) => (
              <div key={discNum} className="space-y-2">
                {Object.keys(discGroups).length > 1 && (
                  <div className="flex items-center gap-2.5 px-1 pt-1">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold uppercase tracking-wider shadow-sm">
                      <Disc className="w-4 h-4" />
                      <span>Disc {discNum}</span>
                    </div>
                    <span className="text-xs text-slate-400 font-medium">
                      {discGroups[discNum].length} track{discGroups[discNum].length !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}

                <div className="bg-slate-900/60 border border-white/5 rounded-2xl overflow-hidden shadow-xl backdrop-blur-sm">
                  <table className="w-full text-left">
                    <thead className="bg-slate-900/95 text-slate-400 border-b border-white/5 uppercase tracking-wider font-bold text-xs">
                      <tr>
                        <th className="py-3.5 px-4 w-12 text-center">PLAY</th>
                        <th className="py-3.5 px-4 w-14">#</th>
                        <th className="py-3.5 px-4">TITLE</th>
                        <th className="py-3.5 px-4">DURATION</th>
                        <th className="py-3.5 px-4">FORMAT</th>
                        <th className="py-3.5 px-4">BITRATE</th>
                        <th className="py-3.5 px-4">SIZE</th>
                        <th className="py-3.5 px-4 text-right">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-200">
                      {discGroups[discNum].map((track) => {
                        const isMissing = track.missing === true;
                        const isTrackDownloaded =
                          !isMissing && (track.status === 'downloaded' || track.file_path);
                        const isThisTrackPlaying = currentTrack?.id === track.id && isPlaying;

                        return (
                          <tr
                            key={track.id || track.mbid || `${track.disc_number}-${track.track_number}`}
                            className={`transition-colors text-sm ${
                              isMissing
                                ? 'opacity-40 hover:opacity-75'
                                : isThisTrackPlaying
                                  ? 'bg-cyan-500/15'
                                  : 'hover:bg-white/[0.03]'
                            }`}
                          >
                            <td className="py-3.5 px-4 text-center">
                              {isTrackDownloaded ? (
                                <button
                                  onClick={() => {
                                    if (isThisTrackPlaying) {
                                      togglePlay();
                                    } else {
                                      const readyQueue = (tracklist || [])
                                        .filter((t) => !t.missing)
                                        .map((t) => ({
                                          ...t,
                                          artist_name: t.artist_name || artist.name,
                                          artist_id: t.artist_id || artist.id,
                                          album_title: t.album_title || selectedAlbum?.title,
                                          album_id: t.album_id || selectedAlbum?.id,
                                          album_mbid: t.album_mbid || selectedAlbum?.mbid,
                                        }));
                                      const currentPlayable = {
                                        ...track,
                                        artist_name: track.artist_name || artist.name,
                                        artist_id: track.artist_id || artist.id,
                                        album_title: track.album_title || selectedAlbum?.title,
                                        album_id: track.album_id || selectedAlbum?.id,
                                        album_mbid: track.album_mbid || selectedAlbum?.mbid,
                                      };
                                      playTrack(currentPlayable, readyQueue);
                                    }
                                  }}
                                  className={`p-2 rounded-lg transition-colors ${
                                    isThisTrackPlaying
                                      ? 'text-cyan-400 bg-cyan-500/20'
                                      : 'text-slate-400 hover:text-cyan-400 hover:bg-white/10'
                                  }`}
                                  title={isThisTrackPlaying ? 'Pause' : 'Play'}
                                >
                                  {isThisTrackPlaying ? (
                                    <span className="inline-flex gap-0.5 items-end h-3.5 w-3.5 justify-center">
                                      <span className="w-0.5 h-3.5 bg-cyan-400 animate-pulse" />
                                      <span className="w-0.5 h-2.5 bg-cyan-400 animate-pulse delay-75" />
                                      <span className="w-0.5 h-3 bg-cyan-400 animate-pulse delay-150" />
                                    </span>
                                  ) : (
                                    <Play className="w-4 h-4 fill-current ml-0.5" />
                                  )}
                                </button>
                              ) : (
                                <span className="text-slate-600 text-sm">—</span>
                              )}
                            </td>

                            <td className="py-3.5 px-4 text-slate-400 tabular-nums font-semibold text-sm">
                              {track.track_number ? String(track.track_number).padStart(2, '0') : '—'}
                            </td>

                            <td
                              className={`py-3.5 px-4 font-semibold text-sm sm:text-base ${
                                isMissing ? 'text-slate-400 italic' : 'text-slate-100 hover:text-cyan-300 transition-colors'
                              }`}
                            >
                              {track.title}
                            </td>

                            <td className="py-3.5 px-4 text-slate-300 tabular-nums font-medium text-sm">
                              {formatDuration(track.duration)}
                            </td>

                            <td className="py-3.5 px-4">
                              {track.format ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                  {track.format}
                                </span>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>

                            <td className="py-3.5 px-4 text-slate-300 tabular-nums font-medium text-sm">
                              {track.bitrate ? `${track.bitrate} kbps` : '—'}
                            </td>

                            <td className="py-3.5 px-4 text-slate-300 tabular-nums font-medium text-sm">
                              {track.file_size ? formatSize(track.file_size) : '—'}
                            </td>

                            <td className="py-3.5 px-4 text-right">
                              {isMissing ? (
                                <span className="inline-flex items-center gap-1.5 text-rose-400 font-semibold text-xs">
                                  <AlertCircle className="w-4 h-4" /> Missing
                                </span>
                              ) : isTrackDownloaded ? (
                                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold text-xs">
                                  <CheckCircle2 className="w-4 h-4" /> Ready
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-rose-400 font-semibold text-xs">
                                  <AlertCircle className="w-4 h-4" /> Missing
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Delete Confirmation Modal ───────────────────────────────────────── */}
      <ModalShell
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        size="md"
        title={`Delete ${artist.name}`}
        icon={<Trash2 className="w-5 h-5 text-rose-400" />}
      >
        <div className="space-y-4 text-sm text-slate-300">
          <p>
            Are you sure you want to remove <strong className="text-white">{artist.name}</strong> from your library?
          </p>
          <p className="text-xs text-slate-400">
            This will remove all tracked albums and release metadata for this artist.
          </p>

          <label className="flex items-center gap-2.5 pt-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={deleteFiles}
              onChange={(e) => setDeleteFiles(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-rose-500/30"
            />
            <span className="text-xs text-rose-300 font-medium">
              Also delete all audio files from disk
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <button
              onClick={() => setDeleteModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-500 hover:bg-rose-400 text-white flex items-center gap-1.5 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {deleting ? 'Deleting...' : 'Delete Artist'}
            </button>
          </div>
        </div>
      </ModalShell>

      {/* ── Manual Search Modal ─────────────────────────────────────────────── */}
      {manualSearchAlbum && (
        <ManualSearchModal
          mediaId={manualSearchAlbum.id}
          mediaType="album"
          title={`${artist.name} - ${manualSearchAlbum.title}`}
          onClose={() => setManualSearchAlbum(null)}
          onGrabbed={() => {
            setManualSearchAlbum(null);
            fetchArtist();
          }}
        />
      )}
    </div>
  );
}
