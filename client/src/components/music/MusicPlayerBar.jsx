import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Shuffle,
  Repeat, Repeat1, ListMusic, X, Disc, Music, Trash2
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
  const coverUrl = currentTrack.album_mbid ? albumCoverUrl(currentTrack.album_mbid) : null;

  return (
    <>
      {/* ── Up-Next Queue Drawer ────────────────────────────────────────────── */}
      {queueVisible && (
        <div className="fixed bottom-24 right-4 sm:right-6 w-80 sm:w-96 max-h-[420px] bg-slate-900/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-2xl z-50 flex flex-col overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="p-3.5 border-b border-white/5 flex items-center justify-between bg-slate-950/60">
            <div className="flex items-center gap-2">
              <ListMusic className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-slate-100">Play Queue</span>
              <span className="text-[10px] text-slate-400">({queue.length} tracks)</span>
            </div>
            <button
              onClick={() => setQueueVisible(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Track List */}
          <div className="flex-1 overflow-y-auto p-2 divide-y divide-white/5 space-y-0.5">
            {queue.map((track, idx) => {
              const isCurrent = idx === queueIndex;
              return (
                <div
                  key={`${track.id}-${idx}`}
                  onClick={() => playTrackAtIndex(idx)}
                  className={`group px-2.5 py-2 rounded-xl flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors ${
                    isCurrent
                      ? 'bg-cyan-500/15 text-cyan-300 font-semibold border border-cyan-500/30'
                      : 'hover:bg-white/5 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="w-5 text-center text-[10px] text-slate-500 font-mono">
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
                      <p className="text-[10px] text-slate-400 truncate">{track.artist_name}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-slate-500 font-mono">
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
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 border-t border-slate-700/50 dark:border-white/10 backdrop-blur-2xl shadow-[0_-10px_35px_rgba(0,0,0,0.6)]">
        {/* Glow accent line */}
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent" />

        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3 sm:gap-6">
          {/* Left: Track info */}
          <div className="flex items-center gap-3 min-w-0 w-1/4 sm:w-1/3">
            <div
              onClick={() => {
                if (currentTrack.album_id) navigate(`/music/albums/${currentTrack.album_id}`);
              }}
              className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden bg-slate-800 shrink-0 border border-white/10 shadow-md cursor-pointer group"
            >
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={currentTrack.album_title || ''}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-500">
                  <Disc className="w-6 h-6 text-cyan-400" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p
                onClick={() => {
                  if (currentTrack.album_id) navigate(`/music/albums/${currentTrack.album_id}`);
                }}
                className="text-xs sm:text-sm font-bold text-slate-100 hover:text-cyan-400 transition-colors truncate cursor-pointer leading-tight"
                title={currentTrack.title}
              >
                {currentTrack.title}
              </p>
              <p
                onClick={() => {
                  if (currentTrack.artist_id) navigate(`/music/artists/${currentTrack.artist_id}`);
                }}
                className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors truncate cursor-pointer mt-0.5"
                title={currentTrack.artist_name}
              >
                {currentTrack.artist_name}
              </p>
              {currentTrack.format && (
                <span className="hidden md:inline-block text-[9px] font-mono font-bold text-cyan-300 bg-cyan-950/60 border border-cyan-500/30 px-1 py-0.2 rounded mt-0.5">
                  {currentTrack.format}
                  {currentTrack.bitdepth ? ` ${currentTrack.bitdepth}b` : ''}
                  {currentTrack.bitrate ? ` ${currentTrack.bitrate}k` : ''}
                </span>
              )}
            </div>
          </div>

          {/* Center: Controls & Scrubber */}
          <div className="flex flex-col items-center flex-1 max-w-lg min-w-0">
            {/* Control buttons */}
            <div className="flex items-center gap-3 sm:gap-4">
              <button
                onClick={toggleShuffle}
                className={`p-1.5 rounded-lg transition-colors ${
                  isShuffle ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Shuffle"
              >
                <Shuffle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              <button
                onClick={prevTrack}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white transition-colors"
                title="Previous Track"
              >
                <SkipBack className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              <button
                onClick={togglePlay}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all hover:scale-105 active:scale-95"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-slate-950" />
                ) : (
                  <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-slate-950 ml-0.5" />
                )}
              </button>

              <button
                onClick={nextTrack}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white transition-colors"
                title="Next Track"
              >
                <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              <button
                onClick={toggleRepeat}
                className={`p-1.5 rounded-lg transition-colors relative ${
                  repeatMode !== 'none' ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-400 hover:text-slate-200'
                }`}
                title={`Repeat: ${repeatMode}`}
              >
                {repeatMode === 'one' ? (
                  <Repeat1 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                ) : (
                  <Repeat className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                )}
              </button>
            </div>

            {/* Scrub slider */}
            <div className="w-full flex items-center gap-2 mt-1 sm:mt-1.5">
              <span className="text-[10px] sm:text-[11px] text-slate-400 font-mono w-8 sm:w-10 text-right shrink-0">
                {formatTime(activeProgress)}
              </span>

              <div className="relative flex-1 flex items-center group/scrubber cursor-pointer">
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
                  className="w-full h-1 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 hover:h-2 transition-all"
                  style={{
                    background: `linear-gradient(to right, #06b6d4 0%, #06b6d4 ${progressPercent}%, #1e293b ${progressPercent}%, #1e293b 100%)`
                  }}
                />
              </div>

              <span className="text-[10px] sm:text-[11px] text-slate-400 font-mono w-8 sm:w-10 shrink-0">
                {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* Right: Volume, Queue & Close */}
          <div className="flex items-center gap-2 sm:gap-3 justify-end w-1/4 sm:w-1/3">
            {/* Queue Toggle */}
            <button
              onClick={() => setQueueVisible((prev) => !prev)}
              className={`p-2 rounded-xl transition-colors relative ${
                queueVisible
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
              title="Toggle Queue"
            >
              <ListMusic className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              {queue.length > 0 && (
                <span className="absolute -top-1 -right-1 px-1 min-w-[14px] h-[14px] rounded-full bg-cyan-500 text-slate-950 font-bold text-[9px] flex items-center justify-center">
                  {queue.length}
                </span>
              )}
            </button>

            {/* Volume Control */}
            <div className="hidden lg:flex items-center gap-1.5">
              <button
                onClick={toggleMute}
                className="p-1.5 text-slate-400 hover:text-slate-200 transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>

              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-16 sm:w-20 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                style={{
                  background: `linear-gradient(to right, #06b6d4 0%, #06b6d4 ${(isMuted ? 0 : volume) * 100}%, #1e293b ${(isMuted ? 0 : volume) * 100}%, #1e293b 100%)`
                }}
              />
            </div>

            {/* Dismiss Player */}
            <button
              onClick={clearQueue}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors ml-1"
              title="Close Player"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
