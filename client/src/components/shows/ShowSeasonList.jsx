import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bookmark,
  BookmarkMinus,
  CheckSquare,
  Download,
  ChevronRight,
  ChevronDown,
  Loader2,
  Search,
  CheckCircle2,
} from 'lucide-react';
import api from '../../lib/api';
import { customAlert, customConfirm } from '../../utils/alerts';
import SubtitleLanguageBadge from '../shared/SubtitleLanguageBadge';
import { LANG_NAME } from '../../lib/format';

export default function ShowSeasonList({
  show,
  seasons,
  episodes,
  setEpisodes,
  fetchShowData,
  providerLangs = [],
  onSelectEpisode,
  onManualSearch,
  onSeasonSearch,
  onOpenSubSearch,
}) {
  const [collapsedSeasons, setCollapsedSeasons] = useState({});
  const [autoSearchingEpId, setAutoSearchingEpId] = useState(null);
  const [openLangMenu, setOpenLangMenu] = useState(null);
  const [downloadingSubs, setDownloadingSubs] = useState({});

  useEffect(() => {
    if (!openLangMenu) return;
    const handler = (e) => {
      if (e.target.closest('[data-lang-badge]') || e.target.closest('[data-lang-menu]')) return;
      setOpenLangMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openLangMenu]);

  const toggleSeason = (season) => {
    setCollapsedSeasons((prev) => ({
      ...prev,
      [season]: prev[season] !== undefined ? !prev[season] : false,
    }));
  };

  const sortedSeasonKeys = Object.keys(seasons).sort((a, b) => Number(b) - Number(a));
  const latestSeason = sortedSeasonKeys.length > 0 ? sortedSeasonKeys[0] : null;

  return (
    <div className="bg-slate-900/50 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-xl shadow-black/30 overflow-hidden">
      <div className="px-5 py-4 border-b border-white/5">
        <h3 className="text-sm font-bold text-slate-200">Episodes</h3>
      </div>
      <div className="p-4 space-y-3">
        {sortedSeasonKeys.map((season) => {
          const isCollapsed =
            collapsedSeasons[season] !== undefined ? collapsedSeasons[season] : season !== latestSeason;
          const seasonEpisodes = seasons[season];
          const seasonHasDownloads = seasonEpisodes.some((e) => e.file_path || e.status === 'downloaded');
          const maxEpNumber = Math.max(...seasonEpisodes.map((e) => e.episode_number));

          return (
            <div key={season} className="glass-panel rounded-2xl border border-white/5">
              <div
                onClick={() => toggleSeason(season)}
                className="w-full flex justify-between items-center p-4 sm:p-5 bg-slate-800/50 hover:bg-slate-800 transition-colors border-b border-white/5 cursor-pointer"
              >
                <div className="flex items-center gap-1.5 sm:gap-3">
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      try {
                        await api.post(`/library/shows/${show.id}/seasons/${season}/toggle-monitor`);
                        fetchShowData();
                      } catch {
                        customAlert('Failed to toggle season monitor', 'error');
                      }
                    }}
                    className="p-1.5 sm:p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
                    title="Toggle Monitor for entire Season"
                  >
                    {seasonEpisodes.some((ep) => ep.monitored) ? (
                      <Bookmark className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400 fill-purple-400" />
                    ) : (
                      <BookmarkMinus className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />
                    )}
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const sNum = Number(season);
                      const allWatched = seasonEpisodes.every((ep) => ep.watched);
                      const targetWatched = allWatched ? 0 : 1;
                      const prevEpisodes = episodes;
                      setEpisodes((prev) =>
                        prev.map((ep) => (ep.season_number === sNum ? { ...ep, watched: targetWatched } : ep))
                      );
                      try {
                        await api.post(`/library/shows/${show.id}/seasons/${season}/watched`, {
                          watched: targetWatched,
                        });
                        sessionStorage.setItem('tracker-stale', 'true');
                        fetchShowData();
                      } catch {
                        customAlert('Failed to mark season as watched', 'error');
                        setEpisodes(prevEpisodes);
                      }
                    }}
                    className={`p-2 rounded-lg transition-all ${
                      seasonEpisodes.every((ep) => ep.watched)
                        ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                        : 'text-slate-500 bg-slate-800/80 hover:bg-slate-700/80 hover:text-slate-300'
                    }`}
                    title="Toggle season watched status"
                  >
                    <CheckSquare className="w-5 h-5" />
                  </button>
                  <h3 className="text-xl font-bold text-purple-400">Season {season}</h3>
                </div>
                <div className="flex items-center gap-2 sm:gap-4">
                  {seasonEpisodes.every((ep) => ep.air_date && new Date(ep.air_date) <= new Date()) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onSeasonSearch(Number(season));
                      }}
                      className="p-1.5 sm:p-2 hover:bg-purple-500/20 rounded-lg transition-colors text-slate-400 hover:text-purple-400"
                      title={`Search for Season ${season} pack`}
                    >
                      <Download className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  )}
                  <span className="text-xs sm:text-sm font-medium text-slate-400 bg-slate-900 px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg">
                    <span className="sm:hidden">{seasonEpisodes.length}</span>
                    <span className="hidden sm:inline">{seasonEpisodes.length} Episodes</span>
                  </span>
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 sm:w-6 sm:h-6 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 sm:w-6 sm:h-6 text-slate-400" />
                  )}
                </div>
              </div>

              <AnimatePresence>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    {/* Desktop table */}
                    <table className="hidden md:table w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900/50 text-slate-400 text-sm uppercase tracking-wider border-b border-white/5">
                          <th className="px-6 py-4 font-medium w-16">#</th>
                          <th className="px-6 py-4 font-medium">Title</th>
                          <th className="px-6 py-4 font-medium w-32 text-center">Status</th>
                          <th className="px-6 py-4 font-medium w-48">Subtitles</th>
                          <th className="px-6 py-4 font-medium w-32 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {seasonEpisodes.map((ep) => (
                          <tr
                            key={ep.id}
                            className="hover:bg-slate-800/50 transition-colors group cursor-pointer"
                            onClick={() => onSelectEpisode(ep)}
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-slate-500">{ep.episode_number}</span>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    const isCurrentlyWatched = Boolean(ep.watched);
                                    const newWatched = isCurrentlyWatched ? 0 : 1;
                                    setEpisodes((prev) =>
                                      prev.map((item) => (item.id === ep.id ? { ...item, watched: newWatched } : item))
                                    );
                                    try {
                                      await api.post(`/library/episodes/${ep.id}/watched`, { watched: newWatched });
                                      sessionStorage.setItem('tracker-stale', 'true');
                                    } catch (err) {
                                      console.error(err);
                                      customAlert('Failed to update watched status', 'error');
                                      setEpisodes((prev) =>
                                        prev.map((item) => (item.id === ep.id ? { ...item, watched: ep.watched } : item))
                                      );
                                    }
                                  }}
                                  className={`p-1.5 rounded-lg transition-all flex items-center justify-center ${
                                    ep.watched
                                      ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
                                      : 'text-slate-500 bg-slate-800/80 hover:bg-slate-700/80 hover:text-slate-300'
                                  }`}
                                  title={ep.watched ? 'Mark unwatched' : 'Mark watched'}
                                >
                                  <CheckSquare className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-slate-700 dark:text-slate-200 group-hover:text-purple-400 transition-colors">
                                  {ep.title}
                                </p>
                                {ep.episode_number === 1 && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
                                    Season Premiere
                                  </span>
                                )}
                                {ep.episode_number === maxEpNumber && maxEpNumber > 1 && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 whitespace-nowrap">
                                    Season Finale
                                  </span>
                                )}
                              </div>
                              {ep.watch_progress > 0 && !ep.watched && (
                                <div className="w-full max-w-[200px] h-1 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                                  <div
                                    className="h-full bg-purple-500 rounded-full"
                                    style={{ width: `${ep.watch_progress}%` }}
                                  ></div>
                                </div>
                              )}
                              {ep.overview && (
                                <p className="text-xs text-slate-500 line-clamp-1 mt-1 max-w-xl">{ep.overview}</p>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  if (ep.status === 'downloading') {
                                    if (await customConfirm('Reset status to monitored?')) {
                                      try {
                                        await api.post(`/library/episodes/${ep.id}/reset`);
                                        fetchShowData();
                                        customAlert('Status reset to monitored');
                                      } catch (e) {
                                        console.error('Failed to reset status', e);
                                        customAlert('Failed to reset status', 'error');
                                      }
                                    }
                                  } else {
                                    try {
                                      await api.post(`/library/episodes/${ep.id}/toggle-monitor`);
                                      fetchShowData();
                                    } catch (e) {
                                      console.error('Failed to toggle monitor status', e);
                                      customAlert('Failed to toggle monitor status', 'error');
                                    }
                                  }
                                }}
                                disabled={
                                  ep.monitored &&
                                  ep.status !== 'downloading' &&
                                  ep.status !== 'downloaded' &&
                                  ((!ep.file_path && !ep.air_date && !seasonHasDownloads) ||
                                    (ep.air_date && new Date(ep.air_date) > new Date()))
                                }
                                className={`text-[10px] uppercase font-bold px-3 py-1 rounded-full mx-auto inline-block cursor-pointer transition-colors whitespace-nowrap disabled:cursor-default ${
                                  ep.status === 'downloading'
                                    ? 'hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                    : ep.status === 'downloaded'
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-slate-700'
                                    : !ep.monitored
                                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-emerald-500/20 hover:text-emerald-400 hover:border-emerald-500/30'
                                    : (!ep.file_path && !ep.air_date && !seasonHasDownloads) ||
                                      (ep.air_date && new Date(ep.air_date) > new Date())
                                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 cursor-default'
                                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/30'
                                }`}
                                title={
                                  ep.status === 'downloading'
                                    ? 'Click to reset if stuck'
                                    : !ep.file_path && !ep.air_date && !seasonHasDownloads
                                    ? 'Season has not started airing yet'
                                    : ep.air_date && new Date(ep.air_date) > new Date()
                                    ? `Airs on ${new Date(ep.air_date).toLocaleDateString()}`
                                    : 'Click to toggle monitor status'
                                }
                              >
                                {ep.status === 'downloading'
                                  ? 'Downloading'
                                  : ep.status === 'downloaded'
                                  ? 'Downloaded'
                                  : !ep.monitored
                                  ? 'Unmonitored'
                                  : (!ep.file_path && !ep.air_date && !seasonHasDownloads) ||
                                    (ep.air_date && new Date(ep.air_date) > new Date())
                                  ? 'Not released'
                                  : 'Monitored'}
                              </button>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {!ep.file_path ? (
                                  <span className="text-[10px] text-slate-600">—</span>
                                ) : (
                                  (() => {
                                    const subsData = (() => {
                                      const raw = ep.subtitles;
                                      if (!raw) return [];
                                      if (Array.isArray(raw)) return raw;
                                      try {
                                        return JSON.parse(raw);
                                      } catch {
                                        return [];
                                      }
                                    })();
                                    const existingCodes = subsData
                                      .map((s) => (typeof s === 'string' ? s : s.lang))
                                      .filter(Boolean);
                                    const hasExistingSub = subsData.length > 0;
                                    const subKey = `tbl-${ep.id}`;
                                    return providerLangs.map((code) => (
                                      <SubtitleLanguageBadge
                                        key={code}
                                        code={code}
                                        exists={existingCodes.includes(code)}
                                        hasExistingSub={hasExistingSub}
                                        isOpen={openLangMenu === `${subKey}-${code}`}
                                        downloading={downloadingSubs[`${subKey}-${code}`]}
                                        onOpenMenu={() =>
                                          setOpenLangMenu(
                                            openLangMenu === `${subKey}-${code}` ? null : `${subKey}-${code}`
                                          )
                                        }
                                        onAutoSearch={async () => {
                                          setOpenLangMenu(null);
                                          setDownloadingSubs((prev) => ({ ...prev, [`${subKey}-${code}`]: true }));
                                          try {
                                            const res = await api.post(`/library/episodes/${ep.id}/download-subs`, {
                                              langCode: code,
                                            });
                                            customAlert(res.data.message);
                                            fetchShowData();
                                          } catch (err) {
                                            customAlert(err.response?.data?.message || 'Auto search failed', 'error');
                                          } finally {
                                            setDownloadingSubs((prev) => ({ ...prev, [`${subKey}-${code}`]: false }));
                                          }
                                        }}
                                        onManualSearch={() => {
                                          setOpenLangMenu(null);
                                          onOpenSubSearch({
                                            open: true,
                                            code,
                                            label: LANG_NAME[code] || code,
                                            episodeId: ep.id,
                                            subKey,
                                          });
                                        }}
                                        onAutoTranslate={async () => {
                                          setOpenLangMenu(null);
                                          try {
                                            const res = await api.post('/library/subtitles/translate', {
                                              mediaType: 'episode',
                                              mediaId: ep.id,
                                              targetLangs: [LANG_NAME[code] || 'Dutch'],
                                            });
                                            if (res.data.status === 'success') {
                                              customAlert(
                                                `Started translating ${LANG_NAME[code] || code} in background`,
                                                'success'
                                              );
                                            }
                                          } catch (err) {
                                            customAlert(err.response?.data?.message || 'Translation failed', 'error');
                                          }
                                        }}
                                      />
                                    ));
                                  })()
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    if (autoSearchingEpId !== null) return;
                                    setAutoSearchingEpId(ep.id);
                                    customAlert(`Starting auto-search for S${ep.season_number}E${ep.episode_number}...`);
                                    try {
                                      const res = await api.post(`/library/episodes/${ep.id}/auto-search`);
                                      if (res.data.status === 'success') {
                                        customAlert(
                                          `Found & downloading: ${res.data.data?.title || res.data.message || 'Search started'}`
                                        );
                                        fetchShowData();
                                      }
                                    } catch (err) {
                                      console.error(err);
                                      customAlert('Auto-search failed to find any results', 'error');
                                    } finally {
                                      setAutoSearchingEpId(null);
                                    }
                                  }}
                                  disabled={autoSearchingEpId !== null}
                                  className="bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 border border-emerald-500/30 text-xs font-bold p-2 rounded-lg inline-flex items-center justify-center transition-colors tooltip disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Auto Search & Download (Best Result)"
                                >
                                  {autoSearchingEpId === ep.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="lucide lucide-zap"
                                    >
                                      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
                                    </svg>
                                  )}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    onManualSearch(ep);
                                  }}
                                  className="bg-purple-500/20 hover:bg-purple-500/40 text-purple-400 border border-purple-500/30 text-xs font-bold p-2 rounded-lg inline-flex items-center justify-center transition-colors tooltip"
                                  title="Manual Search"
                                >
                                  <Search className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Mobile episode cards */}
                    <div className="md:hidden">
                      {seasonEpisodes.map((ep) => {
                        const isDownloaded = Boolean(ep.file_path || ep.status === 'downloaded');
                        const isDownloading = ep.status === 'downloading';
                        const isUnmonitored = !ep.monitored;

                        return (
                          <div
                            key={ep.id}
                            className={`p-3 sm:px-4 sm:py-3.5 border-b border-white/5 last:border-b-0 transition-colors cursor-pointer space-y-2 ${
                              isDownloading
                                ? 'bg-blue-500/[0.07] hover:bg-blue-500/[0.12]'
                                : isDownloaded
                                ? 'bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08]'
                                : isUnmonitored
                                ? 'bg-rose-500/[0.03] hover:bg-rose-500/[0.07]'
                                : 'hover:bg-slate-800/40'
                            }`}
                            onClick={() => onSelectEpisode(ep)}
                          >
                            {/* Top Line: Episode Number + Full Title + Status */}
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span
                                  className={`font-mono text-xs font-bold w-5 shrink-0 text-center ${
                                    isDownloaded
                                      ? 'text-emerald-400'
                                      : isDownloading
                                      ? 'text-blue-400'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {ep.episode_number}
                                </span>
                                <p className="text-sm font-bold text-slate-200 truncate">{ep.title}</p>
                                {ep.episode_number === 1 && (
                                  <span className="shrink-0 px-1.5 py-0.2 rounded text-[8px] uppercase font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                    Premiere
                                  </span>
                                )}
                                {ep.episode_number === maxEpNumber && maxEpNumber > 1 && (
                                  <span className="shrink-0 px-1.5 py-0.2 rounded text-[8px] uppercase font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                    Finale
                                  </span>
                                )}
                              </div>

                              {isDownloaded ? (
                                <div className="shrink-0 flex items-center text-emerald-400" title="Downloaded">
                                  <CheckCircle2 className="w-4 h-4" />
                                </div>
                              ) : isDownloading ? (
                                <div
                                  className="shrink-0 flex items-center gap-1 text-blue-400 text-[10px] font-bold uppercase bg-blue-500/20 border border-blue-500/30 px-2 py-0.5 rounded-full"
                                  title="Downloading"
                                >
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>DL</span>
                                </div>
                              ) : isUnmonitored ? (
                                <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                                  Unmonitored
                                </span>
                              ) : null}
                            </div>

                            {ep.watch_progress > 0 && !ep.watched && (
                              <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-purple-500 rounded-full"
                                  style={{ width: `${ep.watch_progress}%` }}
                                ></div>
                              </div>
                            )}

                            {/* Bottom Line: Watched Checkbox + Subtitles on Left, Search Actions on Right */}
                            <div className="flex items-center justify-between gap-2 pt-0.5">
                              <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    const isCurrentlyWatched = Boolean(ep.watched);
                                    const newWatched = isCurrentlyWatched ? 0 : 1;
                                    setEpisodes((prev) =>
                                      prev.map((item) => (item.id === ep.id ? { ...item, watched: newWatched } : item))
                                    );
                                    try {
                                      await api.post(`/library/episodes/${ep.id}/watched`, { watched: newWatched });
                                      sessionStorage.setItem('tracker-stale', 'true');
                                    } catch (err) {
                                      console.error(err);
                                      customAlert('Failed to update watched status', 'error');
                                      setEpisodes((prev) =>
                                        prev.map((item) => (item.id === ep.id ? { ...item, watched: ep.watched } : item))
                                      );
                                    }
                                  }}
                                  className="p-1 -ml-1 rounded-lg transition-all flex items-center justify-center text-slate-500 hover:text-slate-300"
                                  title={ep.watched ? 'Mark unwatched' : 'Mark watched'}
                                >
                                  {ep.watched ? (
                                    <div className="w-4 h-4 rounded bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center">
                                      <CheckSquare className="w-3 h-3 text-emerald-400" />
                                    </div>
                                  ) : (
                                    <div className="w-4 h-4 rounded bg-slate-900/80 border border-slate-600/60 hover:border-slate-400 transition-colors" />
                                  )}
                                </button>

                                {/* Subtitles */}
                                <div className="flex items-center gap-1 flex-wrap min-w-0">
                                  {!ep.file_path ? (
                                    <span className="text-[10px] text-slate-600">—</span>
                                  ) : (
                                    (() => {
                                      const subsData = (() => {
                                        const raw = ep.subtitles;
                                        if (!raw) return [];
                                        if (Array.isArray(raw)) return raw;
                                        try {
                                          return JSON.parse(raw);
                                        } catch {
                                          return [];
                                        }
                                      })();
                                      const existingCodes = subsData
                                        .map((s) => (typeof s === 'string' ? s : s.lang))
                                        .filter(Boolean);
                                      const hasExistingSub = subsData.length > 0;
                                      const subKey = `m-${ep.id}`;
                                      return providerLangs.map((code) => (
                                        <SubtitleLanguageBadge
                                          key={code}
                                          code={code}
                                          exists={existingCodes.includes(code)}
                                          hasExistingSub={hasExistingSub}
                                          isOpen={openLangMenu === `${subKey}-${code}`}
                                          downloading={downloadingSubs[`${subKey}-${code}`]}
                                          onOpenMenu={() =>
                                            setOpenLangMenu(
                                              openLangMenu === `${subKey}-${code}` ? null : `${subKey}-${code}`
                                            )
                                          }
                                          onAutoSearch={async () => {
                                            setOpenLangMenu(null);
                                            setDownloadingSubs((prev) => ({ ...prev, [`${subKey}-${code}`]: true }));
                                            try {
                                              const res = await api.post(`/library/episodes/${ep.id}/download-subs`, {
                                                langCode: code,
                                              });
                                              customAlert(res.data.message);
                                              fetchShowData();
                                            } catch (err) {
                                              customAlert(err.response?.data?.message || 'Auto search failed', 'error');
                                            } finally {
                                              setDownloadingSubs((prev) => ({
                                                ...prev,
                                                [`${subKey}-${code}`]: false,
                                              }));
                                            }
                                          }}
                                          onManualSearch={() => {
                                            setOpenLangMenu(null);
                                            onOpenSubSearch({
                                              open: true,
                                              code,
                                              label: LANG_NAME[code] || code,
                                              episodeId: ep.id,
                                              subKey,
                                            });
                                          }}
                                          onAutoTranslate={async () => {
                                            setOpenLangMenu(null);
                                            try {
                                              const res = await api.post('/library/subtitles/translate', {
                                                mediaType: 'episode',
                                                mediaId: ep.id,
                                                targetLangs: [LANG_NAME[code] || 'Dutch'],
                                              });
                                              if (res.data.status === 'success') {
                                                customAlert(
                                                  `Started translating ${LANG_NAME[code] || code} in background`,
                                                  'success'
                                                );
                                              }
                                            } catch (err) {
                                              customAlert(err.response?.data?.message || 'Translation failed', 'error');
                                            }
                                          }}
                                        />
                                      ));
                                    })()
                                  )}
                                </div>
                              </div>

                              {/* Search buttons */}
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    if (autoSearchingEpId !== null) return;
                                    setAutoSearchingEpId(ep.id);
                                    customAlert(`Starting auto-search for S${ep.season_number}E${ep.episode_number}...`);
                                    try {
                                      const res = await api.post(`/library/episodes/${ep.id}/auto-search`);
                                      if (res.data.status === 'success') {
                                        customAlert(
                                          `Found & downloading: ${res.data.data?.title || res.data.message || 'Search started'}`
                                        );
                                        fetchShowData();
                                      }
                                    } catch {
                                      customAlert('Auto-search failed', 'error');
                                    } finally {
                                      setAutoSearchingEpId(null);
                                    }
                                  }}
                                  disabled={autoSearchingEpId !== null}
                                  className="bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/25 p-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Auto Search"
                                >
                                  {autoSearchingEpId === ep.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="13"
                                      height="13"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
                                    </svg>
                                  )}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    onManualSearch(ep);
                                  }}
                                  className="bg-purple-500/15 hover:bg-purple-500/30 text-purple-400 border border-purple-500/25 p-1.5 rounded-lg transition-colors"
                                  title="Manual Search"
                                >
                                  <Search className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
