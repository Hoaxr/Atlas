import { useState, useEffect, useCallback } from 'react';
import { 
  Languages, FileText, Download, Trash2, Edit3, Sparkles, Plus, 
  Search, RefreshCw, X, Loader2, CheckCircle2, AlertCircle 
} from 'lucide-react';
import ModalShell from '../shared/ModalShell';
import api from '../../lib/api';
import { customAlert } from '../../utils/alerts';
import { formatSize, formatRelativeTime, LANG_LABEL, LANG_NAME } from '../../lib/format';
import TranslateSubtitlesModal from './TranslateSubtitlesModal';
import SubtitleEditorModal from './SubtitleEditorModal';

export default function SubtitleManagerModal({
  open,
  onClose,
  mediaType,
  mediaId,
  title,
  onOpenSubSearch,
  onRefresh
}) {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingFile, setDeletingFile] = useState(null);

  // Modals state
  const [translateModalOpen, setTranslateModalOpen] = useState(false);
  const [editorModalFile, setEditorModalFile] = useState(null);

  const fetchTracks = useCallback(async () => {
    if (!mediaType || !mediaId) return;
    setLoading(true);
    try {
      const res = await api.get(`/library/subtitles/tracks/${mediaType}/${mediaId}`);
      if (res.data?.status === 'success') {
        setTracks(res.data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch subtitle tracks:', err);
    } finally {
      setLoading(false);
    }
  }, [mediaType, mediaId]);

  useEffect(() => {
    if (open) {
      fetchTracks();
    }
  }, [open, fetchTracks]);

  const handleDelete = async (filename) => {
    if (!window.confirm(`Are you sure you want to delete subtitle track "${filename}"?`)) return;
    setDeletingFile(filename);
    try {
      const res = await api.delete(`/library/subtitles/tracks/${mediaType}/${mediaId}/${encodeURIComponent(filename)}`);
      if (res.data?.status === 'success') {
        customAlert('Subtitle deleted', 'success');
        fetchTracks();
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      customAlert(err.response?.data?.message || 'Failed to delete subtitle', 'error');
    } finally {
      setDeletingFile(null);
    }
  };

  const handleDownload = (filename) => {
    window.open(`/api/library/subtitles/download/${mediaType}/${mediaId}/${encodeURIComponent(filename)}`, '_blank');
  };

  if (!open) return null;

  return (
    <>
      <ModalShell open={open} onClose={onClose} size="3xl" noHeader noPadding noFloatingClose>
        <div className="flex flex-col max-h-[85vh]">
          {/* Header */}
          <div className="p-5 border-b border-white/5 flex items-center justify-between shrink-0 bg-slate-900/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-pink-500/10 border border-pink-500/30 flex items-center justify-center text-pink-400">
                <Languages className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  Subtitle Manager
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[450px]">
                  {title}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setTranslateModalOpen(true)}
                className="px-3.5 py-1.5 text-xs font-bold bg-pink-500/20 text-pink-300 border border-pink-500/40 rounded-xl hover:bg-pink-500/30 transition-colors flex items-center gap-1.5 shadow-md shadow-pink-500/10"
              >
                <Sparkles className="w-3.5 h-3.5" /> Translate
              </button>
              {onOpenSubSearch && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenSubSearch();
                  }}
                  className="px-3.5 py-1.5 text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded-xl hover:bg-cyan-500/30 transition-colors flex items-center gap-1.5"
                >
                  <Search className="w-3.5 h-3.5" /> Download Subs
                </button>
              )}
              <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors ml-1">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-5 overflow-y-auto flex-1">
            {loading ? (
              <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-3">
                <Loader2 className="w-7 h-7 animate-spin text-pink-400" />
                <span className="text-xs">Scanning subtitle tracks...</span>
              </div>
            ) : tracks.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-slate-400 text-center">
                <Languages className="w-10 h-10 text-slate-600 mb-3" />
                <p className="text-sm font-semibold text-slate-300">No Subtitle Tracks Found</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Search and download subtitles via providers, or upload existing subtitle files into this media directory.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {tracks.map((track) => {
                  const langLabel = LANG_LABEL[track.langCode] || track.langCode?.toUpperCase() || '??';
                  const langFull = LANG_NAME[track.langCode] || track.langName || 'Unknown';

                  return (
                    <div
                      key={track.filename}
                      className="p-3.5 rounded-xl bg-slate-800/40 hover:bg-slate-800/70 border border-white/5 hover:border-white/15 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                    >
                      {/* Left: Info */}
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-pink-500/15 text-pink-300 border border-pink-500/30 shrink-0">
                          {langLabel}
                        </span>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-slate-200 truncate" title={track.filename}>
                              {track.filename}
                            </span>

                            {/* Status Badges */}
                            {track.trackType === 'translated' && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                AI Translated {track.sourceLang ? `from ${track.sourceLang}` : ''}
                              </span>
                            )}
                            {track.manuallyEdited && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Manually Edited
                              </span>
                            )}
                            {track.trackType === 'downloaded' && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                Downloaded
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                            <span>{langFull}</span>
                            <span>•</span>
                            <span>{track.format?.toUpperCase()}</span>
                            <span>•</span>
                            <span>{formatSize(track.fileSize)}</span>
                            {track.cueCount > 0 && (
                              <>
                                <span>•</span>
                                <span>{track.cueCount} cues</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                        <button
                          onClick={() => setEditorModalFile(track.filename)}
                          className="p-2 text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-lg transition-colors"
                          title="Preview & Edit Subtitle"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDownload(track.filename)}
                          className="p-2 text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-colors"
                          title="Download Subtitle File"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(track.filename)}
                          disabled={deletingFile === track.filename}
                          className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                          title="Delete Subtitle"
                        >
                          {deletingFile === track.filename ? (
                            <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-white/5 bg-slate-900/60 flex items-center justify-between shrink-0">
            <span className="text-xs text-slate-500">
              {tracks.length} subtitle track{tracks.length !== 1 ? 's' : ''} available
            </span>
            <button
              onClick={onClose}
              className="px-5 py-2 text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </ModalShell>

      {/* Translate Subtitles Modal */}
      {translateModalOpen && (
        <TranslateSubtitlesModal
          open={translateModalOpen}
          onClose={() => setTranslateModalOpen(false)}
          mediaType={mediaType}
          mediaId={mediaId}
          title={title}
          existingTracks={tracks}
          onSuccess={() => {
            fetchTracks();
            if (onRefresh) onRefresh();
          }}
        />
      )}

      {/* Subtitle Editor Modal */}
      {editorModalFile && (
        <SubtitleEditorModal
          open={Boolean(editorModalFile)}
          onClose={() => setEditorModalFile(null)}
          mediaType={mediaType}
          mediaId={mediaId}
          filename={editorModalFile}
          onSaved={() => {
            fetchTracks();
            if (onRefresh) onRefresh();
          }}
        />
      )}
    </>
  );
}
