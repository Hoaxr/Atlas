import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Mic2, Disc, RefreshCw, Search, Trash2, Bookmark, BookmarkMinus,
  CheckCircle2, AlertCircle, Calendar, ShieldCheck, Loader2, Sparkles, ExternalLink, FileAudio,
  ChevronDown, ChevronUp, LayoutGrid, List, Play, Pause
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
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
  const [overviewExpanded, setOverviewExpanded] = useState(false);

  // Tab: 'albums' | 'singles' | 'all'
  const [activeTab, setActiveTab] = useState('albums');
  const [layoutMode, setLayoutMode] = useState('grid');

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
      toast.success(newMonitored ? 'Artist monitored' : 'Artist unmonitored');
    } catch (err) {
      toast.error('Failed to update monitoring status');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await api.post(`/library/music/artists/${id}/refresh`);
      if (res.data.status === 'success') {
        toast.success(res.data.message || 'Metadata refreshed');
        fetchArtist();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to refresh metadata');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSearchMissing = async () => {
    setSearchingMissing(true);
    try {
      const res = await api.post(`/library/music/artists/${id}/search`);
      if (res.data.status === 'success') {
        toast.success(res.data.message || 'Searching releases for missing albums');
      }
    } catch (err) {
      toast.error('Failed to trigger search');
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

  const filteredAlbums = useMemo(() => {
    if (!artist || !artist.albums) return [];
    if (activeTab === 'albums') {
      return artist.albums.filter((a) => (a.album_type || '').toLowerCase() === 'album');
    }
    if (activeTab === 'singles') {
      return artist.albums.filter((a) => {
        const type = (a.album_type || '').toLowerCase();
        return type === 'single' || type === 'ep';
      });
    }
    return artist.albums;
  }, [artist, activeTab]);

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
        <h2 className="text-lg font-bold text-slate-100">Artist Not Found</h2>
        <p className="text-xs text-slate-400 mt-1 mb-4">This artist might have been removed.</p>
        <button
          onClick={() => navigate('/music?tab=artists')}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-xl font-semibold transition-colors"
        >
          Back to Music
        </button>
      </div>
    );
  }

  const artistImg = artist.image_url || artistImageUrl(artist);
  const genres = Array.isArray(artist.genres)
    ? artist.genres
    : (() => {
        try { return JSON.parse(artist.genres || '[]'); } catch { return []; }
      })();

  const downloadedCount = (artist.albums || []).filter((a) => a.status === 'downloaded').length;
  const isCurrentArtistPlaying =
    isPlaying &&
    currentTrack?.artist_name &&
    artist?.name &&
    currentTrack.artist_name.toLowerCase() === artist.name.toLowerCase();

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 custom-scrollbar">
      {/* ── Top Nav Bar ────────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-slate-200/60 dark:border-white/5 flex items-center justify-between">
        <button
          onClick={() => navigate('/music?tab=artists')}
          className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Artists
        </button>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {downloadedCount > 0 && (
            <button
              onClick={() => {
                if (isCurrentArtistPlaying) {
                  togglePlay();
                } else {
                  playArtist(artist);
                }
              }}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center gap-1.5 shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all hover:scale-105 active:scale-95"
              title="Play all downloaded releases by this artist"
            >
              {isCurrentArtistPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-slate-950" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-slate-950 ml-0.5" />
              )}
              {isCurrentArtistPlaying ? 'Pause' : 'Play All Downloaded'}
            </button>
          )}

          <button
            onClick={handleToggleMonitor}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              artist.monitored
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/25'
                : 'bg-slate-800 text-slate-400 border border-white/5 hover:text-slate-200'
            }`}
          >
            {artist.monitored ? <Bookmark className="w-3.5 h-3.5 fill-cyan-400" /> : <BookmarkMinus className="w-3.5 h-3.5" />}
            {artist.monitored ? 'Monitored' : 'Unmonitored'}
          </button>

          <button
            onClick={handleSearchMissing}
            disabled={searchingMissing}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-white/5 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Search releases for missing albums"
          >
            <Search className={`w-3.5 h-3.5 ${searchingMissing ? 'animate-spin text-cyan-400' : ''}`} />
            Search Missing
          </button>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-white/5 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Refresh metadata from MusicBrainz"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-cyan-400' : ''}`} />
            Refresh
          </button>

          <button
            onClick={() => setDeleteModalOpen(true)}
            className="p-2 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors"
            title="Delete Artist"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Artist Hero Header ──────────────────────────────────────────────── */}
      <div className="relative px-6 py-8 border-b border-slate-200/60 dark:border-white/5 overflow-hidden bg-gradient-to-b from-cyan-950/20 via-slate-900/40 to-slate-950">
        <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-6 max-w-6xl">
          {/* Artist Photo */}
          <div className="w-36 h-36 md:w-44 md:h-44 rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-tr from-cyan-950 via-slate-900 to-indigo-950 border-4 border-cyan-500/20 shadow-[0_0_35px_rgba(6,182,212,0.2)] flex items-center justify-center relative">
            {artistImg ? (
              <img
                src={artistImg}
                alt=""
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.parentElement?.querySelector('.artist-fallback');
                  if (fallback) fallback.style.display = 'flex';
                }}
                className="w-full h-full object-cover"
              />
            ) : null}
            <div className={`artist-fallback ${artistImg ? 'hidden' : 'flex'} w-full h-full items-center justify-center text-cyan-400/50`}>
              <Mic2 className="w-16 h-16" />
            </div>
          </div>

          {/* Artist Details */}
          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5 mb-1.5">
              <h1 className="text-3xl md:text-4xl font-black font-display tracking-tight text-white">
                {artist.name}
              </h1>
              {artist.disambiguation && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-white/5">
                  {artist.disambiguation}
                </span>
              )}
            </div>

            {artist.sort_name && artist.sort_name !== artist.name && (
              <p className="text-xs text-slate-400 mb-3">Sort name: {artist.sort_name}</p>
            )}

            {/* Genres */}
            {genres.length > 0 && (
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-1.5 mb-4">
                {genres.slice(0, 6).map((g) => (
                  <span
                    key={g}
                    className="text-[11px] px-2 py-0.5 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-medium"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Overview / Bio */}
            {artist.overview && (
              <div className="max-w-3xl text-xs text-slate-300 leading-relaxed mb-4">
                <p className={overviewExpanded ? '' : 'line-clamp-3'}>{artist.overview}</p>
                {artist.overview.length > 200 && (
                  <button
                    onClick={() => setOverviewExpanded(!overviewExpanded)}
                    className="text-cyan-400 hover:text-cyan-300 font-semibold text-[11px] mt-1 flex items-center gap-1"
                  >
                    {overviewExpanded ? (
                      <>
                        Show less <ChevronUp className="w-3 h-3" />
                      </>
                    ) : (
                      <>
                        Read more <ChevronDown className="w-3 h-3" />
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Stats Pills */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-xs text-slate-400 pt-2 border-t border-white/5">
              <div>
                <span className="font-bold text-slate-100 text-sm">{artist.albums?.length || 0}</span>{' '}
                Releases
              </div>
              <div className="w-1 h-1 rounded-full bg-slate-700" />
              <div>
                <span className="font-bold text-emerald-400 text-sm">{downloadedCount}</span>{' '}
                Downloaded
              </div>
              <div className="w-1 h-1 rounded-full bg-slate-700" />
              <div>
                <span className="font-bold text-rose-400 text-sm">
                  {(artist.albums?.length || 0) - downloadedCount}
                </span>{' '}
                Missing
              </div>
              {artist.folder_path && (
                <>
                  <div className="w-1 h-1 rounded-full bg-slate-700" />
                  <div className="text-[11px] text-slate-500 font-mono truncate max-w-xs" title={artist.folder_path}>
                    {artist.folder_path}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Discography Section ─────────────────────────────────────────────── */}
      <div className="p-6 flex-1 flex flex-col">
        {/* Discography subheader controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center p-1 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/40 dark:border-white/5">
            <button
              onClick={() => setActiveTab('albums')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'albums'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Studio Albums
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
              All Releases ({artist.albums?.length || 0})
            </button>
          </div>

          <div className="flex items-center p-0.5 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/40 dark:border-white/5">
            <button
              onClick={() => setLayoutMode('grid')}
              className={`p-1.5 rounded-lg transition-colors ${
                layoutMode === 'grid' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setLayoutMode('list')}
              className={`p-1.5 rounded-lg transition-colors ${
                layoutMode === 'list' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Albums Content */}
        {filteredAlbums.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Disc className="w-10 h-10 mx-auto mb-2 opacity-30 text-cyan-400" />
            <p className="text-sm font-semibold text-slate-400">No releases in this category</p>
          </div>
        ) : layoutMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredAlbums.map((album) => (
              <AlbumCard
                key={album.id}
                album={album}
                subtitleMode="type"
                onManualSearch={setManualSearchAlbum}
              />
            ))}
          </div>
        ) : (
          /* List View */
          <div className="bg-slate-900/40 border border-white/5 rounded-2xl overflow-hidden shadow">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 border-b border-white/5 uppercase tracking-wider font-semibold text-[10px]">
                <tr>
                  <th className="py-3 px-3 w-10 text-center">Play</th>
                  <th className="py-3 px-4 w-12">Cover</th>
                  <th className="py-3 px-4">Title</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Year</th>
                  <th className="py-3 px-4">Tracks</th>
                  <th className="py-3 px-4">Format</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {filteredAlbums.map((album) => {
                  const isDownloaded = album.status === 'downloaded' || Number(album.downloaded_tracks) > 0;
                  const isCurrentAlbumPlaying =
                    isPlaying &&
                    ((currentTrack?.album_mbid && currentTrack.album_mbid === album.mbid) ||
                      currentTrack?.album_id === album.id);

                  return (
                    <tr
                      key={album.id}
                      className={`hover:bg-white/[0.02] transition-colors cursor-pointer ${
                        isCurrentAlbumPlaying ? 'bg-cyan-500/10' : ''
                      }`}
                      onClick={() => navigate(`/music/albums/${album.id}`)}
                    >
                      <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        {isDownloaded ? (
                          <button
                            onClick={() => {
                              if (isCurrentAlbumPlaying) {
                                togglePlay();
                              } else {
                                playAlbum(album);
                              }
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isCurrentAlbumPlaying
                                ? 'text-cyan-400 bg-cyan-500/20'
                                : 'text-slate-400 hover:text-cyan-400 hover:bg-white/10'
                            }`}
                            title={isCurrentAlbumPlaying ? 'Pause' : 'Play Album'}
                          >
                            {isCurrentAlbumPlaying ? (
                              <span className="inline-flex gap-0.5 items-end h-3 w-3 justify-center">
                                <span className="w-0.5 h-3 bg-cyan-400 animate-pulse" />
                                <span className="w-0.5 h-2 bg-cyan-400 animate-pulse delay-75" />
                                <span className="w-0.5 h-2.5 bg-cyan-400 animate-pulse delay-150" />
                              </span>
                            ) : (
                              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                            )}
                          </button>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-2 px-4">
                        <img
                          src={album.cover_url || albumCoverUrl(album)}
                          alt=""
                          className="w-9 h-9 rounded-lg object-cover bg-slate-800"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-100 hover:text-cyan-400 transition-colors">
                        {album.title}
                      </td>
                      <td className="py-3 px-4 text-slate-400 capitalize">{album.album_type || 'Album'}</td>
                      <td className="py-3 px-4 text-slate-400">{album.year || '—'}</td>
                      <td className="py-3 px-4 text-slate-400">
                        {Math.max(album.expected_track_count || 0, album.track_count || 0)}
                        {album.disc_count > 1 && (
                          <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium whitespace-nowrap">
                            {album.disc_count} Discs
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-cyan-300">
                        {album.file_format || '—'}
                      </td>
                      <td className="py-3 px-4">
                        {album.status === 'downloaded' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Downloaded
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-400 font-semibold text-[11px]">
                            <AlertCircle className="w-3.5 h-3.5" /> Missing
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setManualSearchAlbum(album)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-400 transition-colors"
                          title="Search releases"
                        >
                          <Search className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
