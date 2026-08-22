import ModalShell from './shared/ModalShell';
import { useState } from 'react';
import { X, HardDrive, Zap, Search, Trash2, Calendar, FileType, MonitorPlay, Volume2, Info, Eye, Loader2 } from 'lucide-react';
import { formatSize, parseResolution, parseCodec, parseAudio, getReleaseTitleFromPath } from '../lib/format';

const EpisodeDetailsModal = ({ episode, show, onClose, onAutoSearch, onManualSearch, onDeleteFile, renderSubtitles, renderMonitored }) => {
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);
  const [autoSearching, setAutoSearching] = useState(false);
  if (!episode) return null;

  const resolution = episode.resolution || parseResolution(episode.scene_name || episode.file_path);
  const codecVal = episode.codec || parseCodec(episode.scene_name || episode.file_path);
  const audioVal = episode.audio || parseAudio(episode.scene_name || episode.file_path);

  return (
    <ModalShell open onClose={onClose} size="xl" noHeader noPadding noFloatingClose>
      <div className="flex flex-col max-h-[85vh] overflow-hidden bg-slate-900/40 backdrop-blur-3xl rounded-2xl border border-white/10 shadow-[0_0_50px_-12px_rgba(0,0,0,0.8)]">
        {/* Header */}
        <div className="relative flex justify-between items-start p-4 sm:p-6 lg:p-8 shrink-0 border-b border-white/5">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/5 opacity-50 pointer-events-none" />
          
          <div className="relative z-10 pr-4 sm:pr-8 min-w-0 flex-1">
            <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-1">
              {show?.title || 'Unknown Show'}
            </p>
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight leading-tight break-words mb-2.5">
              {episode.title}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
              <span className="font-medium text-slate-300">
                Season {episode.season_number}, Episode {episode.episode_number}
              </span>
              {renderMonitored && (
                <>
                  <span className="text-slate-600 font-bold">•</span>
                  {renderMonitored()}
                </>
              )}
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="relative z-10 text-slate-400 hover:text-white p-2 rounded-full transition-all bg-slate-800/50 hover:bg-slate-700/80 border border-transparent hover:border-white/10 backdrop-blur-md shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 lg:p-8 overflow-y-auto custom-scrollbar">
          {/* Overview */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-4 h-4 text-slate-400" />
              <h3 className="text-xs sm:text-sm font-semibold text-slate-200 tracking-wide uppercase">Overview</h3>
            </div>
            {episode.overview ? (
              <div>
                <p className={`text-slate-300/90 leading-relaxed text-sm sm:text-[15px] font-light ${!isOverviewExpanded ? 'line-clamp-3 sm:line-clamp-none' : ''}`}>
                  {episode.overview}
                </p>
                {episode.overview.length > 160 && (
                  <button
                    onClick={() => setIsOverviewExpanded(!isOverviewExpanded)}
                    className="sm:hidden text-xs font-semibold text-purple-400 hover:text-purple-300 mt-1 inline-flex items-center gap-1 transition-colors"
                  >
                    {isOverviewExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-slate-500 italic text-sm">No overview available for this episode.</p>
            )}
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 w-full mb-6">
            <div className="bg-slate-800/30 p-3 rounded-xl border border-white/5 flex flex-col justify-center transition-colors hover:bg-slate-800/50">
              <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1.5 truncate">
                <MonitorPlay className="w-3.5 h-3.5 shrink-0" /> Resolution
              </div>
              {resolution !== 'Unknown' ? (
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-xs sm:text-sm font-bold text-slate-200">{resolution}</span>
                  {codecVal !== 'Unknown' && (
                    <span className="text-[10px] sm:text-xs font-bold text-slate-300 uppercase bg-slate-800/80 px-1.5 py-0.5 rounded border border-white/10 whitespace-nowrap">
                      {codecVal}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-xs sm:text-sm font-medium text-slate-500">-</span>
              )}
            </div>

            <div className="bg-slate-800/30 p-3 rounded-xl border border-white/5 flex flex-col justify-center transition-colors hover:bg-slate-800/50">
              <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1.5 truncate">
                <Volume2 className="w-3.5 h-3.5 shrink-0" /> Audio
              </div>
              {audioVal !== 'Unknown' ? (
                <span className="inline-flex px-1.5 py-0.5 w-fit rounded-md text-[11px] sm:text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap truncate">
                  {audioVal}
                </span>
              ) : (
                <span className="text-xs sm:text-sm font-medium text-slate-500">-</span>
              )}
            </div>
            
            <div className="bg-slate-800/30 p-3 rounded-xl border border-white/5 flex flex-col justify-center transition-colors hover:bg-slate-800/50">
              <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1.5 truncate">
                <HardDrive className="w-3.5 h-3.5 shrink-0" /> Size
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-200 truncate">
                {episode.file_size ? formatSize(episode.file_size) : '-'}
              </span>
            </div>
            
            <div className="bg-slate-800/30 p-3 rounded-xl border border-white/5 flex flex-col justify-center transition-colors hover:bg-slate-800/50">
              <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1.5 truncate">
                <Calendar className="w-3.5 h-3.5 shrink-0" /> Air Date
              </div>
              <span className="text-xs sm:text-sm font-medium text-slate-300 truncate">
                {episode.air_date ? new Date(episode.air_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown'}
              </span>
            </div>
            
            <div className="bg-slate-800/30 p-3 rounded-xl border border-white/5 flex flex-col justify-center transition-colors hover:bg-slate-800/50">
              <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1.5 truncate">
                <Eye className="w-3.5 h-3.5 shrink-0" /> Watched
              </div>
              <span className={`text-xs sm:text-sm font-bold truncate ${episode.watched ? 'text-emerald-400' : 'text-slate-500'}`}>
                {episode.watched ? 'Yes' : 'No'}
              </span>
            </div>
            
            {renderSubtitles && (
              <div className="bg-slate-800/30 p-3 rounded-xl border border-white/5 flex flex-col justify-center transition-colors hover:bg-slate-800/50">
                <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1.5 truncate">
                  <FileType className="w-3.5 h-3.5 shrink-0" /> Subtitles
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {renderSubtitles()}
                </div>
              </div>
            )}
          </div>

          {/* Paths and Filenames */}
          <div className="space-y-3 mb-4">
            <div className="bg-slate-950/50 p-3.5 rounded-xl border border-slate-800/80">
              <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1.5">
                <HardDrive className="w-3.5 h-3.5" /> File Path
              </div>
              <p className="font-mono text-xs text-slate-400 break-all select-all">
                {episode.file_path || <span className="text-slate-600 italic">Not downloaded</span>}
              </p>
            </div>

            {(episode.scene_name || episode.file_path) && (
              <div className="bg-slate-950/50 p-3.5 rounded-xl border border-slate-800/80">
                <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1.5">
                  <FileType className="w-3.5 h-3.5" /> Release Name
                </div>
                <p className="font-mono text-xs text-slate-400 break-all select-all">
                  {episode.scene_name || getReleaseTitleFromPath(episode.file_path)}
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 sm:flex items-center justify-end gap-2.5 mt-6 pt-5 border-t border-white/5">
            {episode.file_path && onDeleteFile && (
              <button
                onClick={() => onDeleteFile(episode)}
                className="col-span-2 sm:col-span-1 sm:mr-auto bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/30 px-3.5 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all text-xs font-semibold"
                title="Delete file from disk"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete File</span>
              </button>
            )}
            
            <button
              onClick={async () => {
                if (!onAutoSearch || autoSearching) return;
                setAutoSearching(true);
                try {
                  await onAutoSearch(episode);
                } finally {
                  setAutoSearching(false);
                }
              }}
              disabled={autoSearching}
              className="flex items-center justify-center gap-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-2.5 px-4 rounded-xl shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-all text-xs group disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {autoSearching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 fill-current group-hover:scale-110 transition-transform" />
              )}
              <span>{autoSearching ? 'Searching...' : 'Auto Search'}</span>
            </button>
            
            <button
              onClick={() => onManualSearch && onManualSearch(episode)}
              className="flex items-center justify-center gap-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 hover:text-white border border-white/10 hover:border-white/20 font-semibold py-2.5 px-4 rounded-xl active:scale-[0.98] transition-all text-xs shadow-sm"
            >
              <Search className="w-3.5 h-3.5 text-slate-400" /> 
              <span>Manual</span>
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
};

export default EpisodeDetailsModal;
