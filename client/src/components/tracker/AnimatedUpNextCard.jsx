import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Check, Tv, Film } from 'lucide-react';
import { tmdbImgUrl } from '../../lib/posterUrl';

const formatRuntime = (minutes) => {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
};

// 8-12 burst particles for celebration
const PARTICLE_ANGLES = Array.from({ length: 10 }, (_, i) => (i * 36 * Math.PI) / 180);

export function AnimatedUpNextCard({ item, type, onMarkWatched }) {
  const navigate = useNavigate();
  const [animState, setAnimState] = useState('idle'); // 'idle' | 'animating' | 'exiting'

  const isEpisode = type === 'episode';
  const itemKey = isEpisode ? `ep-${item.episode_id}` : `movie-${item.id}`;
  const tmdbId = item.tmdb_id;

  // Reset animation state when episode_id or item.id changes
  React.useEffect(() => {
    setAnimState('idle');
  }, [item.episode_id, item.id]);

  const handleTitleClick = (e) => {
    e.stopPropagation();
    if (isEpisode && item.show_id) {
      navigate(`/shows/${item.show_id}`);
    } else if (!isEpisode && item.id) {
      navigate(`/movies/${item.id}`);
    } else if (tmdbId) {
      navigate(`/${isEpisode ? 'shows' : 'movies'}/${tmdbId}`);
    }
  };

  const handleTriggerWatched = (e) => {
    e.stopPropagation();
    if (animState !== 'idle') return;

    setAnimState('animating');

    // Sequence timing:
    // 0-600ms: Celebration burst, progress fill to 100%, status text to Watched ✓
    // 600ms: Start smooth exit slide/fade
    // 950ms: Trigger API mark watched to fetch next episode
    // On success the parent re-renders with fresh data and this card unmounts,
    // so we intentionally do NOT reset animState — the next episode gets a fresh card.
    setTimeout(() => {
      setAnimState('exiting');
      setTimeout(async () => {
        try {
          await onMarkWatched(
            itemKey,
            tmdbId,
            type,
            isEpisode ? item.season_number : undefined,
            isEpisode ? item.episode_number : undefined
          );
        } catch (err) {
          console.error('Failed to mark as watched', err);
        }
        // Always reset — if the parent re-rendered with new data
        // this component is already unmounted so this is a no-op.
        // If something went wrong, the card recovers to visible.
        setAnimState('idle');
      }, 350);
    }, 600);
  };

  const isCompleted = animState === 'animating' || animState === 'exiting';

  return (
    <motion.div
      initial={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
      animate={
        animState === 'exiting'
          ? { opacity: 0, scale: 0.9, y: -16, filter: 'blur(4px)' }
          : animState === 'animating'
          ? { opacity: 1, scale: 1.01, y: 0, filter: 'blur(0px)' }
          : { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }
      }
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className={`w-64 sm:w-72 md:w-80 shrink-0 snap-start bg-slate-800/60 border rounded-2xl overflow-hidden transition-all duration-500 flex flex-col group relative ${
        isCompleted
          ? 'border-cyan-500/40 ring-1 ring-cyan-500/20 shadow-lg shadow-cyan-500/10'
          : 'border-slate-700/50 shadow-xl hover:border-cyan-500/40 hover:-translate-y-1'
      }`}
    >
      {/* CARD AMBIENT GLOW ON SUCCESS */}
      <AnimatePresence>
        {isCompleted && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.25 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 bg-cyan-500/20 blur-xl pointer-events-none z-0"
          />
        )}
      </AnimatePresence>

      {/* THUMBNAIL CONTAINER */}
      <div 
        onClick={handleTitleClick}
        className="relative h-32 sm:h-36 md:h-40 bg-slate-900 overflow-hidden z-10 cursor-pointer"
      >
        {item.poster_path ? (
          <motion.img
            src={tmdbImgUrl(item.poster_path, 'w500')}
            alt=""
            animate={{
              brightness: isCompleted ? 1.08 : 1,
              scale: isCompleted ? 1.03 : 1
            }}
            transition={{ duration: 0.5 }}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600">
            {isEpisode ? <Tv className="w-10 h-10" /> : <Film className="w-10 h-10" />}
          </div>
        )}

        <motion.div
          animate={{ opacity: isCompleted ? 0.2 : 0.6 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent"
        />

        {/* SEASON / EPISODE OR MOVIE BADGE */}
        <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-600/80 text-white backdrop-blur-md shadow">
          {isEpisode ? `S${item.season_number} E${item.episode_number}` : 'Movie'}
        </span>

        {/* RUNTIME PILL (bottom-left of poster) */}
        {item.runtime && (
          <span className="absolute bottom-6 left-3 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-black/70 text-white backdrop-blur-sm">
            {formatRuntime(item.runtime)}
          </span>
        )}

        {/* POSTER PROGRESS BAR — thin bar at very bottom of poster image */}
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/20 z-20">
          <motion.div
            className="h-full bg-cyan-400"
            initial={false}
            animate={{ width: isCompleted ? '100%' : `${item.watch_progress || 0}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>

        {/* ── SATISFYING CHECKMARK BUTTON & CELEBRATION EFFECTS ── */}
        <div className="absolute bottom-3 right-3 z-20 flex items-center justify-center">
          
          {/* RIPPLE EFFECT */}
          <AnimatePresence>
            {isCompleted && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0.9 }}
                animate={{ scale: 2.4, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
                className="absolute inset-0 rounded-xl bg-emerald-400/60 pointer-events-none"
              />
            )}
          </AnimatePresence>

          {/* CELEBRATION PARTICLES */}
          {isCompleted &&
            PARTICLE_ANGLES.map((angle, i) => {
              const distance = 28 + (i % 3) * 6;
              const dx = Math.cos(angle) * distance;
              const dy = Math.sin(angle) * distance;

              return (
                <motion.span
                  key={i}
                  initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                  animate={{ x: dx, y: dy, scale: 0.2, opacity: 0 }}
                  transition={{ duration: 0.6, ease: [0, 0, 0.2, 1] }}
                  className="absolute w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-sm pointer-events-none"
                />
              );
            })}

          {/* BUTTON INTERACTION */}
          <motion.button
            onClick={handleTriggerWatched}
            disabled={isCompleted}
            whileHover={!isCompleted ? { scale: 1.08 } : {}}
            whileTap={!isCompleted ? { scale: 0.92 } : {}}
            animate={
              isCompleted
                ? { scale: [0.92, 1.15, 1], backgroundColor: '#10b981', color: '#ffffff' }
                : {}
            }
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            className={`p-2 rounded-xl backdrop-blur-md transition-colors duration-300 shadow-lg cursor-pointer flex items-center gap-1.5 ${
              isCompleted
                ? 'bg-emerald-500 text-white border-emerald-400'
                : 'bg-slate-900/80 text-slate-300 hover:bg-emerald-500 hover:text-white border border-white/10 hover:border-emerald-400'
            }`}
            title="Mark Watched"
          >
            {isCompleted ? (
              <motion.div
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              >
                <Check className="w-4 h-4 stroke-[3]" />
              </motion.div>
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
          </motion.button>
        </div>
      </div>

      {/* CARD CONTENT */}
      <div className="p-3 sm:p-4 flex-1 flex flex-col justify-between space-y-2 sm:space-y-3 z-10">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 
              onClick={handleTitleClick}
              className="font-bold text-slate-100 text-sm sm:text-base md:text-lg truncate hover:text-cyan-400 transition-colors cursor-pointer min-w-0"
            >
              {isEpisode ? item.show_title : item.title}
            </h3>
            {!isCompleted && (
              <span className="text-[10px] sm:text-[11px] font-semibold text-white bg-cyan-600/80 px-1.5 sm:px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                {isEpisode
                  ? `${item.episodes_left || 1} left${item.total_time_left ? ` · ${formatRuntime(item.total_time_left)}` : ''}`
                  : item.watch_progress !== null && item.watch_progress !== undefined ? `${item.watch_progress}%` : 'In Progress'}
              </span>
            )}
          </div>
          <p className="text-[11px] sm:text-xs text-slate-400 truncate mt-0.5">
            {isEpisode
              ? item.episode_title || `Episode ${item.episode_number}`
              : item.runtime
              ? `${item.runtime} mins`
              : 'Movie'}
          </p>
        </div>

        {/* PROGRESS BAR */}
        <div className="space-y-1.5">
          <div className="w-full h-6 bg-white/10 rounded-full overflow-hidden relative">
            <motion.div
              className={`h-full rounded-full absolute left-0 top-0 ${isCompleted ? 'bg-emerald-400' : 'bg-cyan-400'}`}
              initial={false}
              animate={{
                width: isCompleted
                  ? '100%'
                  : isEpisode && item.total_episodes > 0
                  ? `${Math.round(((item.total_episodes - (item.episodes_left || 0)) / item.total_episodes) * 100)}%`
                  : `${item.watch_progress || 0}%`
              }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
            <div className="absolute inset-0 flex items-center justify-center px-2 z-10">
              <AnimatePresence mode="wait">
                {isCompleted ? (
                  <motion.span
                    key="watched"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.25 }}
                    className="text-[11px] font-bold text-white drop-shadow-md"
                  >
                    Watched ✓
                  </motion.span>
                ) : isEpisode && item.total_episodes > 0 ? (
                  <motion.span
                    key="epProgress"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.25 }}
                    className="text-[11px] font-bold text-white drop-shadow-md tracking-wider"
                  >
                    {item.total_episodes - (item.episodes_left || 0)} / {item.total_episodes}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
