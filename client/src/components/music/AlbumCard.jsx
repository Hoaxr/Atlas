import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, Pause, Search, AlertCircle, Disc, FileAudio,
  Check, X
} from 'lucide-react';
import { useAudioPlayer } from '../../context/AudioPlayerContext';
import { albumCoverUrl } from '../../lib/posterUrl';

export default function AlbumCard({
  album,
  subtitleMode = 'type', // 'type' | 'artist'
  selectMode = false,
  isSelected = false,
  onToggleSelect,
  onManualSearch,
  onClick
}) {
  const navigate = useNavigate();
  const { playAlbum, currentTrack, isPlaying, togglePlay } = useAudioPlayer();
  const [imgFailed, setImgFailed] = useState(false);

  if (!album) return null;

  const downloadedTracks = Number(album.downloaded_tracks || 0);
  const totalTracks = Math.max(album.expected_track_count || 0, album.track_count || 0, downloadedTracks);
  const isComplete = (album.status === 'downloaded' || (totalTracks > 0 && downloadedTracks >= totalTracks)) && (totalTracks === 0 ? downloadedTracks > 0 : downloadedTracks >= totalTracks);
  const isPartial = downloadedTracks > 0 && !isComplete;
  const isDownloaded = isComplete;
  const isCurrentAlbumPlaying =
    isPlaying &&
    ((currentTrack?.album_mbid && currentTrack.album_mbid === album.mbid) ||
      currentTrack?.album_id === album.id);

  const coverUrl = album.cover_url || albumCoverUrl(album);
  const hasFiles = isDownloaded || isPartial || downloadedTracks > 0;
  const formatLabel = hasFiles && album.file_format ? album.file_format.toUpperCase() : '';

  const handleCardClick = (e) => {
    if (onClick) {
      onClick(album, e);
      return;
    }
    if (selectMode && onToggleSelect) {
      onToggleSelect(album.id);
    } else {
      navigate(`/music/albums/${album.id}`);
    }
  };

  const handlePlayClick = (e) => {
    e.stopPropagation();
    if (isCurrentAlbumPlaying) {
      togglePlay();
    } else {
      playAlbum(album);
    }
  };

  const handleSearchClick = (e) => {
    e.stopPropagation();
    if (onManualSearch) {
      onManualSearch(album);
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className={`group relative flex flex-col p-3 rounded-2xl transition-all duration-200 cursor-pointer select-none ${
        isSelected
          ? 'bg-slate-800/95 border border-cyan-400/80 shadow-[0_4px_24px_-4px_rgba(6,182,212,0.3)]'
          : 'bg-slate-900/70 hover:bg-slate-800/80 border border-slate-800/80 hover:border-slate-700/80 shadow-md hover:shadow-xl'
      }`}
    >
      {/* ── Album Artwork Frame ────────────────────────────────────────────── */}
      <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-slate-950 shadow-md">
        {/* Ambient Glow / Fallback Backdrop */}
        <div className="absolute inset-0 flex items-center justify-center text-slate-800 pointer-events-none">
          <Disc className="w-16 h-16 stroke-[1.2] opacity-40 animate-pulse" />
        </div>

        {!imgFailed && coverUrl ? (
          <img
            src={coverUrl}
            alt={album.title || 'Album artwork'}
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            loading="lazy"
          />
        ) : null}

        {/* Status Indicator (Top-Left Circular Mark) */}
        <div className="absolute top-2.5 left-2.5 z-20">
          {selectMode ? (
            <div
              onClick={(e) => e.stopPropagation()}
              className="p-1 rounded-lg bg-slate-950/90 backdrop-blur-md border border-white/20 shadow-lg"
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect && onToggleSelect(album.id)}
                className="w-4 h-4 rounded text-cyan-500 accent-cyan-500 cursor-pointer block"
              />
            </div>
          ) : isComplete ? (
            <div
              title="Downloaded"
              className="w-6 h-6 rounded-full bg-slate-950/90 backdrop-blur-md border border-emerald-500/60 flex items-center justify-center text-emerald-400 shadow-lg"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
          ) : isPartial ? (
            <div
              title={`Partial (${downloadedTracks}/${totalTracks} tracks)`}
              className="w-6 h-6 rounded-full bg-slate-950/90 backdrop-blur-md border border-amber-500/60 flex items-center justify-center text-amber-400 shadow-lg"
            >
              <AlertCircle className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
          ) : (
            <div
              title="Missing"
              className="w-6 h-6 rounded-full bg-slate-950/90 backdrop-blur-md border border-rose-500/60 flex items-center justify-center text-rose-400 shadow-lg"
            >
              <X className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
          )}
        </div>

        {/* Format Badge (Top-Right Pill) */}
        {formatLabel && (
          <div className="absolute top-2.5 right-2.5 z-20">
            <span className="px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-950/80 backdrop-blur-md text-slate-200 border border-white/10 shadow-sm">
              {formatLabel}
              {album.file_format && album.file_bitdepth ? ` ${album.file_bitdepth}b` : ''}
            </span>
          </div>
        )}

        {/* Hover Overlay with Action Buttons */}
        <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3 z-30">
          {/* Play / Pause button */}
          {isDownloaded && (
            <button
              type="button"
              onClick={handlePlayClick}
              className={`w-12 h-12 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center shadow-[0_0_25px_rgba(6,182,212,0.6)] transition-transform duration-200 hover:scale-110 active:scale-95 ${
                isCurrentAlbumPlaying ? 'ring-4 ring-cyan-300/60' : ''
              }`}
              title={isCurrentAlbumPlaying ? 'Pause Album' : `Play ${album.title}`}
            >
              {isCurrentAlbumPlaying ? (
                <Pause className="w-5 h-5 fill-slate-950" />
              ) : (
                <Play className="w-5 h-5 fill-slate-950 ml-0.5" />
              )}
            </button>
          )}

          {/* Quick Manual Search Button */}
          {onManualSearch && (
            <button
              type="button"
              onClick={handleSearchClick}
              className="w-10 h-10 rounded-full bg-slate-900/90 hover:bg-white text-slate-200 hover:text-slate-950 border border-white/20 flex items-center justify-center shadow-lg transition-transform duration-200 hover:scale-110 active:scale-95"
              title="Search releases for this album"
            >
              <Search className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Currently playing badge if audio is playing */}
        {isCurrentAlbumPlaying && (
          <div className="absolute bottom-2.5 right-2.5 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500 text-slate-950 text-[10px] font-bold shadow-lg">
            <span className="w-2 h-2 rounded-full bg-slate-950 animate-ping" />
            Playing
          </div>
        )}
      </div>

      {/* ── Details Section ────────────────────────────────────────────────── */}
      <div className="pt-3 px-1 flex flex-col justify-between flex-1">
        <div>
          <h3
            title={album.title}
            className="font-bold text-sm text-slate-100 group-hover:text-cyan-400 transition-colors truncate"
          >
            {album.title}
          </h3>

          {subtitleMode === 'artist' ? (
            <p
              onClick={(e) => {
                e.stopPropagation();
                if (album.artist_id) navigate(`/music/artists/${album.artist_id}`);
              }}
              title={album.artist_name}
              className="text-xs text-slate-400 hover:text-cyan-300 transition-colors truncate mt-0.5 cursor-pointer"
            >
              {album.artist_name || 'Unknown Artist'}
            </p>
          ) : (
            <p className="text-xs text-slate-400 truncate mt-0.5 capitalize">
              {album.album_type || 'Album'}
            </p>
          )}
        </div>

        {/* Meta Bar: Year · Discs / Tracks */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-2.5 mt-2.5 border-t border-slate-800/80 font-medium">
          <span className="text-slate-400">{album.year || 'Unknown'}</span>

          <div className="flex items-center gap-1.5">
            {album.disc_count > 1 ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-400/90">
                <Disc className="w-3 h-3" />
                {album.disc_count} Discs
              </span>
            ) : totalTracks > 0 ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                <FileAudio className="w-3 h-3 text-slate-400" />
                {`${downloadedTracks}/${totalTracks}`}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
