import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Disc, Search, Play, RefreshCw, Trash2, Bookmark, BookmarkMinus,
  CheckCircle2, AlertCircle, Calendar, ShieldCheck, HardDrive, FileAudio,
  Folder, Loader2, Sparkles, ExternalLink, ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { formatSize } from '../lib/format';
import { albumCoverUrl } from '../lib/posterUrl';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import ModalShell from '../components/shared/ModalShell';
import ManualSearchModal from '../components/ManualSearchModal';

export default function AlbumDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [album, setAlbum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [fullTracklist, setFullTracklist] = useState(null);
  const { playTrack, playAlbum, currentTrack, isPlaying, togglePlay } = useAudioPlayer();

  // Modals
  const [manualSearchOpen, setManualSearchOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchAlbum = async () => {
    try {
      const res = await api.get(`/library/music/albums/${id}`);
      if (res.data.status === 'success') {
        setAlbum(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load album:', err);
      toast.error('Failed to load album details');
    } finally {
      setLoading(false);
    }
  };

  const fetchFullTracklist = async () => {
    try {
      const res = await api.get(`/library/music/albums/${id}/tracklist`);
      if (res.data.status === 'success') {
        setFullTracklist(res.data.data);
      }
    } catch (err) {
      console.warn('Could not load full tracklist:', err);
    }
  };

  useEffect(() => {
    fetchAlbum();
    fetchFullTracklist();
  }, [id]);

  const handleToggleMonitor = async () => {
    if (!album) return;
    try {
      const newMonitored = album.monitored ? 0 : 1;
      await api.put(`/library/music/albums/${id}`, { monitored: newMonitored });
      setAlbum((prev) => ({ ...prev, monitored: newMonitored }));
      toast.success(newMonitored ? 'Album monitored' : 'Album unmonitored');
    } catch (err) {
      toast.error('Failed to update monitor status');
    }
  };

  const handleAutoSearch = async () => {
    setSearching(true);
    try {
      const res = await api.post(`/library/music/albums/${id}/search`);
      if (res.data.status === 'success') {
        toast.success(res.data.message || 'Search triggered');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/library/music/albums/${id}?deleteFiles=${deleteFiles}`);
      toast.success(`Removed ${album.title}`);
      if (album.artist_id) {
        navigate(`/music/artists/${album.artist_id}`);
      } else {
        navigate('/music?tab=albums');
      }
    } catch (err) {
      toast.error('Failed to delete album');
    } finally {
      setDeleting(false);
    }
  };

  const formatDuration = (secs) => {
    if (!secs) return '--:--';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Group tracks by disc number if multi-disc
  // Prefer fullTracklist (includes missing tracks from MusicBrainz) over local tracks only
  const discGroups = useMemo(() => {
    const source = fullTracklist || album?.tracks || [];
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
  }, [album, fullTracklist]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!album) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-slate-400">
        <AlertCircle className="w-12 h-12 text-rose-400 mb-3" />
        <h2 className="text-lg font-bold text-slate-100">Album Not Found</h2>
        <p className="text-xs text-slate-400 mt-1 mb-4">This album might have been removed.</p>
        <button
          onClick={() => navigate('/music?tab=albums')}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-xl font-semibold transition-colors"
        >
          Back to Music
        </button>
      </div>
    );
  }

  const coverUrl = album.cover_url || albumCoverUrl(album);
  const isDownloaded = album.status === 'downloaded';
  const source = fullTracklist || album.tracks || [];
  const totalTracks = source.length || album.track_count || 0;
  const downloadedTracks = source.filter((t) => !t.missing && (t.status === 'downloaded' || t.file_path)).length;

  const genres = Array.isArray(album.genres)
    ? album.genres
    : (() => {
        try { return JSON.parse(album.genres || '[]'); } catch { return []; }
      })();

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 custom-scrollbar">
      {/* ── Top Nav Bar ────────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-slate-200/60 dark:border-white/5 flex items-center justify-between">
        <button
          onClick={() => {
            if (album.artist_id) navigate(`/music/artists/${album.artist_id}`);
            else navigate('/music?tab=albums');
          }}
          className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {album.artist_name ? `Back to ${album.artist_name}` : 'Back to Albums'}
        </button>

        {/* Top Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleMonitor}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              album.monitored
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/25'
                : 'bg-slate-800 text-slate-400 border border-white/5 hover:text-slate-200'
            }`}
          >
            {album.monitored ? <Bookmark className="w-3.5 h-3.5 fill-cyan-400" /> : <BookmarkMinus className="w-3.5 h-3.5" />}
            {album.monitored ? 'Monitored' : 'Unmonitored'}
          </button>

          <button
            onClick={handleAutoSearch}
            disabled={searching}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-white/5 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Auto-search release via indexers"
          >
            <Search className={`w-3.5 h-3.5 ${searching ? 'animate-spin text-cyan-400' : ''}`} />
            Auto Search
          </button>

          {downloadedTracks > 0 && (
            <button
              onClick={() => playAlbum(album, album.tracks)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center gap-1.5 shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all hover:scale-105 active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-slate-950" />
              Play Album
            </button>
          )}

          <button
            onClick={() => setManualSearchOpen(true)}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/5 flex items-center gap-1.5 transition-all font-bold"
          >
            <Search className="w-3.5 h-3.5" />
            Interactive Search
          </button>

          <button
            onClick={() => setDeleteModalOpen(true)}
            className="p-2 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors"
            title="Delete Album"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Album Hero Header ──────────────────────────────────────────────── */}
      <div className="relative px-6 py-8 border-b border-slate-200/60 dark:border-white/5 overflow-hidden bg-gradient-to-b from-cyan-950/25 via-slate-900/40 to-slate-950">
        <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-6 max-w-6xl">
          {/* Cover Art */}
          <div className="w-48 h-48 md:w-56 md:h-56 rounded-2xl overflow-hidden flex-shrink-0 bg-slate-800 border-2 border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
            <img
              src={coverUrl}
              alt=""
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%2306b6d4" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>';
              }}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Album Information */}
          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-slate-800/80 text-cyan-300 border border-cyan-500/20">
                {album.album_type || 'Album'}
              </span>

              {isDownloaded ? (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Downloaded
                </span>
              ) : (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> Missing
                </span>
              )}

              {(album.disc_count > 1 || Object.keys(discGroups).length > 1) && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5 shadow-sm">
                  <Disc className="w-3.5 h-3.5" />
                  {album.disc_count || Object.keys(discGroups).length} Discs
                </span>
              )}

              {album.file_format && (
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 border border-white/10">
                  {album.file_format}
                  {album.file_bitdepth ? ` ${album.file_bitdepth}-bit` : ''}
                  {album.file_samplerate ? ` ${Math.round(album.file_samplerate / 1000)}kHz` : ''}
                </span>
              )}
            </div>

            <h1 className="text-3xl md:text-4xl font-black font-display tracking-tight text-white mb-1">
              {album.title}
            </h1>

            {album.artist_name && (
              <p className="text-base text-slate-400 mb-3">
                by{' '}
                <Link
                  to={`/music/artists/${album.artist_id}`}
                  className="font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  {album.artist_name}
                </Link>
              </p>
            )}

            {/* Metadata tags */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 text-xs text-slate-400 mb-4">
              {album.year && (
                <div className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>{album.year}</span>
                </div>
              )}
              {album.label && (
                <>
                  <div className="w-1 h-1 rounded-full bg-slate-700" />
                  <span>Label: {album.label}</span>
                </>
              )}
              {genres.length > 0 && (
                <>
                  <div className="w-1 h-1 rounded-full bg-slate-700" />
                  <div className="flex items-center gap-1">
                    {genres.slice(0, 3).map((g) => (
                      <span key={g} className="px-1.5 py-0.5 rounded bg-slate-800/80 text-[10px] text-slate-300">
                        {g}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Folder path */}
            {album.folder_path && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono pt-2 border-t border-white/5 truncate max-w-2xl">
                <Folder className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                <span className="truncate">{album.folder_path}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Track Listing Section ───────────────────────────────────────────── */}
      <div className="p-6 flex-1 flex flex-col max-w-6xl w-full mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Disc className="w-4 h-4 text-cyan-400" />
            Tracklist ({totalTracks} tracks)
          </h2>
          <span className="text-xs text-slate-400">
            {downloadedTracks} of {totalTracks} downloaded
          </span>
        </div>

        {/* Tracks List (grouped by disc) */}
        <div className="space-y-6">
          {Object.keys(discGroups).length === 0 ? (
            <div className="text-center py-16 bg-slate-900/30 border border-white/5 rounded-2xl text-slate-500">
              <FileAudio className="w-10 h-10 mx-auto mb-2 opacity-30 text-cyan-400" />
              <p className="text-sm font-semibold text-slate-400">No track listing available</p>
              <p className="text-xs mt-1">Tracks will be populated during download or manual search.</p>
            </div>
          ) : (
            Object.keys(discGroups).map((discNum) => (
              <div key={discNum} className="space-y-2">
                {Object.keys(discGroups).length > 1 && (
                  <div className="flex items-center gap-2 px-1 pt-1">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold uppercase tracking-wider shadow-sm">
                      <Disc className="w-3.5 h-3.5" />
                      <span>Disc {discNum}</span>
                    </div>
                    <span className="text-xs text-slate-500 font-mono">
                      {discGroups[discNum].length} track{discGroups[discNum].length !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}

                <div className="bg-slate-900/40 border border-white/5 rounded-2xl overflow-hidden shadow">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/80 text-slate-400 border-b border-white/5 uppercase tracking-wider font-semibold text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">Play</th>
                        <th className="py-2.5 px-4 w-12">#</th>
                        <th className="py-2.5 px-4">Title</th>
                        <th className="py-2.5 px-4">Duration</th>
                        <th className="py-2.5 px-4">Format</th>
                        <th className="py-2.5 px-4">Bitrate</th>
                        <th className="py-2.5 px-4">Size</th>
                        <th className="py-2.5 px-4 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                      {discGroups[discNum].map((track) => {
                        const isMissing = track.missing === true;
                        const isTrackDownloaded = !isMissing && (track.status === 'downloaded' || track.file_path);
                        const isThisTrackPlaying = currentTrack?.id === track.id && isPlaying;

                        return (
                          <tr
                            key={track.id || track.mbid || `${track.disc_number}-${track.track_number}`}
                            className={`transition-colors ${
                              isMissing
                                ? 'opacity-40'
                                : isThisTrackPlaying
                                  ? 'bg-cyan-500/10'
                                  : 'hover:bg-white/[0.02]'
                            }`}
                          >
                            <td className="py-2.5 px-3 text-center">
                              {isTrackDownloaded ? (
                                <button
                                  onClick={() => {
                                    if (isThisTrackPlaying) {
                                      togglePlay();
                                    } else {
                                      playTrack(
                                        {
                                          ...track,
                                          artist_name: track.artist_name || album.artist_name,
                                          album_title: track.album_title || album.title,
                                          album_mbid: track.album_mbid || album.mbid,
                                        },
                                        (fullTracklist || album.tracks || []).filter(t => !t.missing)
                                      );
                                    }
                                  }}
                                  className={`p-1.5 rounded-lg transition-colors ${
                                    isThisTrackPlaying
                                      ? 'text-cyan-400 bg-cyan-500/20'
                                      : 'text-slate-400 hover:text-cyan-400 hover:bg-white/10'
                                  }`}
                                  title={isThisTrackPlaying ? 'Pause' : 'Play'}
                                >
                                  {isThisTrackPlaying ? (
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
                            <td className="py-2.5 px-4 text-slate-500 font-mono">
                              {track.track_number ? String(track.track_number).padStart(2, '0') : '—'}
                            </td>
                            <td className={`py-2.5 px-4 font-semibold ${ isMissing ? 'text-slate-400 italic' : 'text-slate-100' }`}>
                              {track.title}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-slate-400">
                              {formatDuration(track.duration)}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-cyan-300">
                              {track.format || '—'}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-slate-400">
                              {track.bitrate ? `${track.bitrate} kbps` : '—'}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-slate-400">
                              {track.file_size ? formatSize(track.file_size) : '—'}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              {isMissing ? (
                                <span className="inline-flex items-center gap-1 text-rose-400 font-semibold text-[11px]">
                                  <AlertCircle className="w-3.5 h-3.5" /> Missing
                                </span>
                              ) : isTrackDownloaded ? (
                                <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-rose-400 font-semibold text-[11px]">
                                  <AlertCircle className="w-3.5 h-3.5" /> Missing
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
        title={`Delete ${album.title}`}
        icon={<Trash2 className="w-5 h-5 text-rose-400" />}
      >
        <div className="space-y-4 text-sm text-slate-300">
          <p>
            Are you sure you want to remove <strong className="text-white">{album.title}</strong> from your library?
          </p>

          <label className="flex items-center gap-2.5 pt-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={deleteFiles}
              onChange={(e) => setDeleteFiles(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-rose-500/30"
            />
            <span className="text-xs text-rose-300 font-medium">
              Also delete all audio files for this album from disk
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
              {deleting ? 'Deleting...' : 'Delete Album'}
            </button>
          </div>
        </div>
      </ModalShell>

      {/* ── Manual Search Modal ─────────────────────────────────────────────── */}
      {manualSearchOpen && (
        <ManualSearchModal
          mediaId={album.id}
          mediaType="album"
          title={`${album.artist_name || ''} - ${album.title}`}
          onClose={() => setManualSearchOpen(false)}
          onGrabbed={() => {
            setManualSearchOpen(false);
            fetchAlbum();
          }}
        />
      )}
    </div>
  );
}
