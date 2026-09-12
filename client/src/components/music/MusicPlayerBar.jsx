import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Shuffle,
  Repeat, Repeat1, ListMusic, Menu, Monitor, X, Disc, Trash2
} from 'lucide-react';
import { useAudioPlayer } from '../../context/AudioPlayerContext';
import { albumCoverUrl } from '../../lib/posterUrl';

export default function MusicPlayerBar() {
  const navigate = useNavigate();
  const {
    currentTrack,
    queue,
    queueIndex,
    isPlaying,
    progress,
    duration,
    volume,
    isMuted,
    repeatMode,
    isShuffle,
    queueVisible,
    setQueueVisible,
    togglePlay,
    nextTrack,
    prevTrack,
    seekTo,
    setVolume,
    toggleMute,
    toggleRepeat,
    toggleShuffle,
    clearQueue,
    playTrackAtIndex,
    removeFromQueue
  } = useAudioPlayer();

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubProgress, setScrubProgress] = useState(0);

  if (!currentTrack) return null;

  const formatTime = (secs) => {
    if (!secs || isNaN(secs) || !isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const activeProgress = isScrubbing ? scrubProgress : progress;
  const progressPercent = duration > 0 ? (activeProgress / duration) * 100 : 0;
  const coverUrl = albumCoverUrl(currentTrack.album_id || currentTrack.album_mbid);

  const formatLabel = (currentTrack.format || currentTrack.file_format || '').toUpperCase();

  return (
    <>
      {/* ── Up-Next Queue Drawer ────────────────────────────────────────────── */}
      {queueVisible && (
        <div className="fixed bottom-20 right-4 sm:right-6 w-80 sm:w-96 max-h-[420px] bg-slate-950/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-2xl z-50 flex flex-col overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="p-3.5 border-b border-white/5 flex items-center justify-between bg-slate-900/60">
            <div className="flex items-center gap-2">
              <ListMusic className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-bold text-slate-100">Play Queue</span>
              <span className="text-[11px] text-slate-400">({queue.length} tracks)</span>
            </div>
            <button
              onClick={() => setQueueVisible(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Track List */}
          <div className="flex-1 overflow-y-auto p-2 divide-y divide-white/5 space-y-0.5 custom-scrollbar">
            {queue.map((track, idx) => {
              const isCurrent = idx === queueIndex;
              return (
                <div
                  key={`${track.id}-${idx}`}
                  onClick={() => playTrackAtIndex(idx)}
                  className={`group px-2.5 py-2 rounded-xl flex items-center justify-between gap-3 text-sm cursor-pointer transition-colors ${
                    isCurrent
                      ? 'bg-cyan-500/15 text-cyan-300 font-semibold border border-cyan-500/30'
                      : 'hover:bg-white/5 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="w-5 text-center text-[11px] text-slate-500 font-mono">
                      {isCurrent && isPlaying ? (
                        <span className="inline-flex gap-0.5 items-end h-3">
                          <span className="w-0.5 h-3 bg-cyan-400 animate-pulse" />
                          <span className="w-0.5 h-2 bg-cyan-400 animate-pulse delay-75" />
                          <span className="w-0.5 h-2.5 bg-cyan-400 animate-pulse delay-150" />
                        </span>
                      ) : (
                        idx + 1
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{track.title}</p>
                      <p className="text-xs text-slate-400 truncate">{track.artist_name}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-500 font-mono">
                      {formatTime(track.duration)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromQueue(idx);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-400 transition-opacity"
                      title="Remove from queue"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Main Persistent Bottom Player Bar ───────────────────────────────── */}
      <div className="fixed bottom-0 left-0 lg:left-64 right-0 z-40 bg-slate-950/80 backdrop-blur-2xl border-t border-white/10 shadow-[0_-8px_30px_rgba(0,0,0,0.6)]">
        <div className="w-full px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
          {/* Left: Track info */}
          <div className="flex items-center gap-3 min-w-0 w-1/4 sm:w-1/3">
            <div
              onClick={() => {
                if (currentTrack.album_id) navigate(`/music/albums/${currentTrack.album_id}`);
              }}
              className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-lg overflow-hidden bg-slate-900 shrink-0 border border-white/10 shadow-md cursor-pointer group"
            >
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={currentTrack.album_title || ''}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-600">
                  <Disc className="w-6 h-6 text-cyan-400" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p
                  onClick={() => {
                    if (currentTrack.artist_id) navigate(`/music/artists/${currentTrack.artist_id}`);
                  }}
                  className="text-sm sm:text-base font-bold text-white hover:text-cyan-400 transition-colors truncate cursor-pointer leading-tight"
                  title={currentTrack.artist_name}
                >
                  {currentTrack.artist_name || 'Unknown Artist'}
                </p>
                {formatLabel && (
                  <span className="shrink-0 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {formatLabel}
                  </span>
                )}
              </div>

              <p
                onClick={() => {
                  if (currentTrack.album_id) navigate(`/music/albums/${currentTrack.album_id}`);
                }}
                className="text-xs sm:text-sm text-slate-300 hover:text-white transition-colors truncate cursor-pointer mt-0.5"
                title={currentTrack.title || currentTrack.album_title}
              >
                {currentTrack.title || currentTrack.album_title || 'Unknown Track'}
              </p>
            </div>
          </div>

          {/* Center: Controls & Scrubber */}
          <div className="flex flex-col items-center flex-1 max-w-lg min-w-0">
            {/* Control buttons */}
            <div className="flex items-center gap-5 sm:gap-6">
              <button
                onClick={toggleShuffle}
                className={`p-1 transition-colors ${
                  isShuffle ? 'text-cyan-400' : 'text-slate-400/80 hover:text-white'
                }`}
                title="Shuffle"
              >
                <Shuffle className="w-4 h-4" />
              </button>

              <button
                onClick={prevTrack}
                className="p-1 text-slate-300 hover:text-white transition-colors"
                title="Previous Track"
              >
                <SkipBack className="w-4.5 h-4.5 fill-current" />
              </button>

              <button
                onClick={togglePlay}
                className="p-1.5 text-white hover:scale-110 transition-transform active:scale-95 flex items-center justify-center"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 fill-white text-white" />
                ) : (
                  <Play className="w-5 h-5 fill-white text-white ml-0.5" />
                )}
              </button>

              <button
                onClick={nextTrack}
                className="p-1 text-slate-300 hover:text-white transition-colors"
                title="Next Track"
              >
                <SkipForward className="w-4.5 h-4.5 fill-current" />
              </button>

              <button
                onClick={toggleRepeat}
                className={`p-1 transition-colors relative ${
                  repeatMode !== 'none' ? 'text-cyan-400' : 'text-slate-400/80 hover:text-white'
                }`}
                title={`Repeat: ${repeatMode}`}
              >
                {repeatMode === 'one' ? (
                  <Repeat1 className="w-4 h-4" />
                ) : (
                  <Repeat className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Scrub slider */}
            <div className="w-full flex items-center gap-3 mt-1">
              <span className="text-xs font-semibold text-slate-300 w-10 text-right shrink-0 tabular-nums">
                {formatTime(activeProgress)}
              </span>

              <div className="relative flex-1 flex items-center group/scrubber cursor-pointer py-1">
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={activeProgress}
                  onChange={(e) => {
                    setIsScrubbing(true);
                    setScrubProgress(parseFloat(e.target.value));
                  }}
                  onMouseUp={(e) => {
                    setIsScrubbing(false);
                    seekTo(parseFloat(e.target.value));
                  }}
                  onTouchEnd={(e) => {
                    setIsScrubbing(false);
                    seekTo(parseFloat(e.target.value));
                  }}
                  onKeyUp={(e) => {
                    setIsScrubbing(false);
                    seekTo(parseFloat(e.target.value));
                  }}
                  onBlur={(e) => {
                    setIsScrubbing(false);
                    seekTo(parseFloat(e.target.value));
                  }}
                  className="w-full h-1 group-hover/scrubber:h-1.5 rounded-full appearance-none cursor-pointer transition-all bg-white/20 accent-white"
                  style={{
                    background: `linear-gradient(to right, #ffffff 0%, #ffffff ${progressPercent}%, rgba(255,255,255,0.2) ${progressPercent}%, rgba(255,255,255,0.2) 100%)`
                  }}
                />
                <div
                  className={`absolute top-1/2 -translate-y-1/2 pointer-events-none rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all duration-150 ${
                    isScrubbing
                      ? 'w-3.5 h-3.5 opacity-100'
                      : 'w-2 h-2 opacity-0 group-hover/scrubber:opacity-100 group-hover/scrubber:w-3.5 group-hover/scrubber:h-3.5'
                  }`}
                  style={{ left: `calc(${progressPercent}% - ${isScrubbing ? 7 : 4}px)` }}
                />
              </div>

              <span className="text-xs font-semibold text-slate-300 w-10 shrink-0 tabular-nums">
                {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* Right: Devices, Volume & Queue */}
          <div className="flex items-center gap-3 sm:gap-4 justify-end w-1/4 sm:w-1/3">
            {/* Devices / Cast Icon */}
            <button
              className="text-slate-400 hover:text-white transition-colors"
              title="Devices"
            >
              <Monitor className="w-4 h-4" />
            </button>

            {/* Volume Control */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                className="text-slate-400 hover:text-white transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>

              <div className="relative flex items-center w-16 sm:w-20">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer accent-white"
                  style={{
                    background: `linear-gradient(to right, #ffffff 0%, #ffffff ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.2) ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.2) 100%)`
                  }}
                />
              </div>
            </div>

            {/* Queue / Menu Toggle */}
            <button
              onClick={() => setQueueVisible((prev) => !prev)}
              className={`text-slate-400 hover:text-white transition-colors ${
                queueVisible ? 'text-cyan-400' : ''
              }`}
              title="Queue"
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Dismiss / Close Player */}
            <button
              onClick={clearQueue}
              className="text-slate-500 hover:text-rose-400 transition-colors p-1"
              title="Close player"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
