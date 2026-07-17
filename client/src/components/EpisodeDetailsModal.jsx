import ModalShell from './shared/ModalShell';
import React from 'react';
import { X, HardDrive, CheckCircle2, Zap, Search, Trash2, Calendar, FileType, Hash, MonitorPlay, Volume2, Info } from 'lucide-react';
import { formatSize, parseResolution, parseCodec, parseAudio, getReleaseTitleFromPath } from '../lib/format';

const EpisodeDetailsModal = ({ episode, show, onClose, onAutoSearch, onManualSearch, onDeleteFile, renderSubtitles, renderMonitored }) => {
  if (!episode) return null;

  const resolution = episode.resolution || parseResolution(episode.scene_name || episode.file_path);
  const codecVal = episode.codec || parseCodec(episode.scene_name || episode.file_path);
  const audioVal = episode.audio || parseAudio(episode.scene_name || episode.file_path);

  return (
    <ModalShell open onClose={onClose} size="xl" noHeader noPadding noFloatingClose>
      <div className="flex flex-col max-h-[85vh] overflow-hidden bg-slate-900/40 backdrop-blur-3xl rounded-2xl border border-white/10 shadow-[0_0_50px_-12px_rgba(0,0,0,0.8)]">
        {/* Header */}
        <div className="relative flex justify-between items-start p-8 shrink-0 border-b border-white/5">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/5 opacity-50 pointer-events-none" />
          
          <div className="relative z-10 pr-8">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-bold uppercase tracking-widest text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-500/20">
                {show?.title || 'Unknown Show'}
              </span>
              <span className="text-xs font-mono font-medium text-slate-400 bg-slate-800/80 px-2 py-1 rounded-md border border-white/5 flex items-center gap-1">
                <Hash className="w-3 h-3" />
                S{String(episode.season_number).padStart(2, '0')}E{String(episode.episode_number).padStart(2, '0')}
              </span>
              {renderMonitored && (
                <div className="flex items-center">
                  {renderMonitored()}
                </div>
              )}
            </div>
            <h2 className="text-3xl font-extrabold text-white tracking-tight leading-tight">
              {episode.title}
            </h2>
          </div>
          <button 
            onClick={onClose} 
            className="relative z-10 text-slate-400 hover:text-white p-2 rounded-full transition-all bg-slate-800/50 hover:bg-slate-700/80 border border-transparent hover:border-white/10 backdrop-blur-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto custom-scrollbar">
          {/* Overview */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-200 tracking-wide uppercase">Overview</h3>
            </div>
            {episode.overview ? (
              <p className="text-slate-300/90 leading-relaxed text-[15px] max-w-4xl font-light">
                {episode.overview}
              </p>
            ) : (
              <p className="text-slate-500 italic">No overview available for this episode.</p>
            )}
          </div>

          {/* Metadata Grid */}
          <div className="flex flex-wrap gap-3 w-full mb-8">
            <div className="flex-1 min-w-[130px] bg-slate-800/30 p-3 sm:p-4 rounded-xl border border-white/5 flex flex-col justify-center transition-colors hover:bg-slate-800/50">
              <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-2">
                <MonitorPlay className="w-3.5 h-3.5" /> Resolution
              </div>
              {resolution !== 'Unknown' ? (
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-sm sm:text-base font-bold text-slate-200">{resolution}</span>
                  {codecVal !== 'Unknown' && (
                    <span className="text-xs font-bold text-slate-300 uppercase bg-slate-800/80 px-2 py-0.5 rounded-md border border-white/10 whitespace-nowrap">
                      {codecVal}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-sm font-medium text-slate-500">-</span>
              )}
            </div>

            <div className="flex-1 min-w-[130px] bg-slate-800/30 p-3 sm:p-4 rounded-xl border border-white/5 flex flex-col justify-center transition-colors hover:bg-slate-800/50">
              <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-2">
                <Volume2 className="w-3.5 h-3.5" /> Audio
              </div>
              {audioVal !== 'Unknown' ? (
                <span className="inline-flex px-2 py-0.5 w-fit rounded-lg text-xs sm:text-sm font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                  {audioVal}
                </span>
              ) : (
                <span className="text-sm font-medium text-slate-500">-</span>
              )}
            </div>
            
            <div className="flex-1 min-w-[130px] bg-slate-800/30 p-3 sm:p-4 rounded-xl border border-white/5 flex flex-col justify-center transition-colors hover:bg-slate-800/50">
              <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-2">
                <HardDrive className="w-3.5 h-3.5" /> Size
              </div>
              <span className="text-sm sm:text-base font-bold text-slate-200 whitespace-nowrap">
                {episode.file_size ? formatSize(episode.file_size) : '-'}
              </span>
            </div>
            

            <div className="flex-1 min-w-[130px] bg-slate-800/30 p-3 sm:p-4 rounded-xl border border-white/5 flex flex-col justify-center transition-colors hover:bg-slate-800/50">
              <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-2">
                <Calendar className="w-3.5 h-3.5" /> Air Date
              </div>
              <span className="text-sm sm:text-base font-medium text-slate-300 whitespace-nowrap">
                {episode.air_date ? new Date(episode.air_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown'}
              </span>
            </div>
            
            {renderSubtitles && (
              <div className="flex-1 min-w-[130px] bg-slate-800/30 p-3 sm:p-4 rounded-xl border border-white/5 flex flex-col justify-center transition-colors hover:bg-slate-800/50">
                <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-2">
                  <FileType className="w-3.5 h-3.5" /> Subtitles
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {renderSubtitles()}
                </div>
              </div>
            )}
          </div>

          {/* Paths and Filenames */}
          <div className="space-y-4 mb-4">
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/80">
              <div className="flex items-center gap-2 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-2">
                <HardDrive className="w-3.5 h-3.5" /> File Path
              </div>
              <p className="font-mono text-xs text-slate-400 break-all select-all">
                {episode.file_path || <span className="text-slate-600">Not downloaded</span>}
              </p>
            </div>

            {(episode.scene_name || episode.file_path) && (
              <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/80">
                <div className="flex items-center gap-2 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-2">
                  <FileType className="w-3.5 h-3.5" /> Release Name
                </div>
                <p className="font-mono text-xs text-slate-400 break-all select-all">
                  {episode.scene_name || getReleaseTitleFromPath(episode.file_path)}
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 mt-8 pt-6 border-t border-white/5">
            {episode.file_path && onDeleteFile && (
              <button
                onClick={() => onDeleteFile(episode)}
                className="sm:mr-auto sm:order-first bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/40 px-4 py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_-5px_rgba(239,68,68,0)] hover:shadow-[0_0_20px_-5px_rgba(239,68,68,0.3)]"
                title="Delete file from disk"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-sm font-medium sm:hidden block">Delete File</span>
              </button>
            )}
            
            <button
              onClick={() => onAutoSearch && onAutoSearch(episode)}
              className="flex-1 sm:flex-none relative overflow-hidden group bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-sm font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_-5px_rgba(6,182,212,0.2)] hover:shadow-[0_0_25px_-5px_rgba(6,182,212,0.4)]"
            >
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-cyan-400/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
              <Zap className="w-4 h-4 relative z-10" /> 
              <span className="relative z-10">Auto Search</span>
            </button>
            
            <button
              onClick={() => onManualSearch && onManualSearch(episode)}
              className="flex-1 sm:flex-none bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 text-sm font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_-5px_rgba(168,85,247,0.1)] hover:shadow-[0_0_20px_-5px_rgba(168,85,247,0.3)]"
            >
              <Search className="w-4 h-4" /> 
              <span>Manual Search</span>
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
};

export default EpisodeDetailsModal;
