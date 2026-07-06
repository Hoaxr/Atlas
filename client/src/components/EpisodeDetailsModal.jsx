import ModalShell from './shared/ModalShell';
import React from 'react';
import { X, HardDrive, CheckCircle2, Zap, Search, Trash2 } from 'lucide-react';
import { formatSize, parseResolution, parseCodec, getReleaseTitleFromPath } from '../lib/format';

const EpisodeDetailsModal = ({ episode, show, onClose, onAutoSearch, onManualSearch, onDeleteFile }) => {
  if (!episode) return null;

  const resolution = parseResolution(episode.scene_name || episode.file_path);

  return (
    <ModalShell open onClose={onClose} size="xl" noHeader noPadding noBackdropBlur noFloatingClose>
      <div className="flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-start p-6 border-b border-white/5 bg-slate-800/50 shrink-0">
          <div>
            <p className="text-purple-400 font-bold text-sm mb-1">{show?.title || 'Unknown Show'}</p>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <span className="text-slate-400 font-mono text-xl bg-slate-800 px-2 py-0.5 rounded border border-white/5">
                S{String(episode.season_number).padStart(2, '0')}E{String(episode.episode_number).padStart(2, '0')}
              </span>
              {episode.title}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors bg-slate-800 hover:bg-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          {episode.overview ? (
            <p className="text-slate-300 leading-relaxed mb-6">
              {episode.overview}
            </p>
          ) : (
            <p className="text-slate-500 italic mb-6">No overview available for this episode.</p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6 w-full mt-4 text-sm bg-slate-900/50 p-5 rounded-xl border border-white/5">
            <div className="col-span-full">
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Path</p>
              <p className="font-mono text-xs text-slate-300 break-all">{episode.file_path || 'Not downloaded'}</p>
            </div>
            {(episode.scene_name || episode.file_path) && (
              <div className="col-span-full">
                <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Release Name</p>
                <p className="font-mono text-xs text-slate-400 break-all">
                  {episode.scene_name || getReleaseTitleFromPath(episode.file_path)}
                </p>
              </div>
            )}
            
            <div>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Resolution</p>
              {resolution !== 'Unknown' ? (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                  {(() => {
                    const codecVal = episode.codec || parseCodec(episode.scene_name || episode.file_path);
                    return codecVal !== 'Unknown' ? `${resolution} (${codecVal})` : resolution;
                  })()}
                </span>
              ) : (
                <p className="font-medium text-slate-500">-</p>
              )}
            </div>
            
            <div>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Size</p>
              <p className="font-medium text-slate-300">{episode.file_size ? formatSize(episode.file_size) : '-'}</p>
            </div>
            
            <div>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Status</p>
              <p className="font-medium text-slate-300 capitalize">{episode.status}</p>
            </div>
            
            <div>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Monitored</p>
              <p className={`font-medium ${episode.monitored ? 'text-emerald-400' : 'text-slate-500'}`}>
                {episode.monitored ? 'Yes' : 'No'}
              </p>
            </div>
            
            <div>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Air Date</p>
              <p className="font-medium text-slate-300">
                {episode.air_date ? new Date(episode.air_date).toLocaleDateString() : 'Unknown'}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 mt-6">
            <div className="flex flex-row gap-2 sm:flex-1">
              <button
                onClick={() => onAutoSearch && onAutoSearch(episode)}
                className="flex-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-sm font-bold px-5 py-3 rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                <Zap className="w-4 h-4" /> Auto Search
              </button>
              <button
                onClick={() => onManualSearch && onManualSearch(episode)}
                className="flex-1 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 text-sm font-bold px-5 py-3 rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                <Search className="w-4 h-4" /> Manual Search
              </button>
            </div>
            {episode.file_path && onDeleteFile && (
              <button
                onClick={() => onDeleteFile(episode)}
                className="sm:mr-auto sm:order-first bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 p-3 rounded-xl flex items-center justify-center transition-colors"
                title="Delete file from disk"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
};

export default EpisodeDetailsModal;
