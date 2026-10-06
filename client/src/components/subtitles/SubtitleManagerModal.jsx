import { useState, useEffect, useCallback } from 'react';
import { 
  Languages, Download, Trash2, Edit3, Sparkles, 
  Search, X, Loader2, CheckCircle2, AlertTriangle, XCircle,
  Wrench, Undo2
} from 'lucide-react';
import ModalShell from '../shared/ModalShell';
import api from '../../lib/api';
import { customAlert, customConfirm } from '../../utils/alerts';
import { formatSize, LANG_LABEL, LANG_NAME } from '../../lib/format';
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
  const [verifyingSync, setVerifyingSync] = useState(false);
  const [repairingFile, setRepairingFile] = useState(null);

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
    const confirmed = await customConfirm(`Are you sure you want to delete subtitle track "${filename}"?`, {
      title: 'Delete Subtitle',
      confirmText: 'Delete',
      type: 'error',
    });
    if (!confirmed) return;
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

  const handleVerifySync = async () => {
    setVerifyingSync(true);
    try {
      const res = await api.post(`/library/subtitles/verify-sync/${mediaType}/${mediaId}`);
      if (res.data?.status === 'success') {
        const results = res.data.data?.results || [];
        const desynced = results.filter(r => r.status && r.status !== 'in_sync');
        if (desynced.length > 0) {
          customAlert(`Sync check completed: ${desynced.length} timing issue(s) detected`, 'warning');
        } else {
          customAlert('All subtitles are in sync with speech dialogue!', 'success');
        }
        fetchTracks();
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      customAlert(err.response?.data?.message || 'Failed to verify subtitle sync', 'error');
    } finally {
      setVerifyingSync(false);
    }
  };

  const handleRepairOffset = async (track) => {
    setRepairingFile(track.filename);
    try {
      const res = await api.post('/library/subtitles/repair/offset', {
        mediaType,
        mediaId,
        filename: track.filename,
        offset: track.syncOffset
      });
      if (res.data?.status === 'success') {
        const v = res.data.data?.verification;
        const statusMsg = v?.status === 'in_sync' ? 'In Sync' : (v?.status || 'verified');
        customAlert(`Offset repaired (${track.syncOffset > 0 ? '+' : ''}${track.syncOffset}s)! Verification: ${statusMsg}`, 'success');
        fetchTracks();
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      customAlert(err.response?.data?.message || 'Failed to repair offset', 'error');
    } finally {
      setRepairingFile(null);
    }
  };

  const handleRepairDrift = async (track) => {
    setRepairingFile(track.filename);
    try {
      const res = await api.post('/library/subtitles/repair/drift', {
        mediaType,
        mediaId,
        filename: track.filename,
        slope: track.syncDrift
      });
      if (res.data?.status === 'success') {
        const v = res.data.data?.verification;
        const statusMsg = v?.status === 'in_sync' ? 'In Sync' : (v?.status || 'verified');
        customAlert(`Framerate drift corrected! Verification: ${statusMsg}`, 'success');
        fetchTracks();
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      customAlert(err.response?.data?.message || 'Failed to repair drift', 'error');
    } finally {
      setRepairingFile(null);
    }
  };

  const handleRestoreBackup = async (track) => {
    const confirmed = await customConfirm(`Restore unedited backup for "${track.filename}"? This will overwrite current changes with the .bak file.`, {
      title: 'Restore Subtitle Backup',
      confirmText: 'Restore Backup',
      type: 'warning',
    });
    if (!confirmed) return;

    setRepairingFile(track.filename);
    try {
      const res = await api.post('/library/subtitles/repair/restore', {
        mediaType,
        mediaId,
        filename: track.filename
      });
      if (res.data?.status === 'success') {
        customAlert('Original subtitle restored from backup', 'success');
        fetchTracks();
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      customAlert(err.response?.data?.message || 'Failed to restore backup', 'error');
    } finally {
      setRepairingFile(null);
    }
  };

  const renderSyncBadge = (track) => {
    if (!track.syncStatus || track.syncStatus === 'unknown') return null;

    switch (track.syncStatus) {
      case 'in_sync':
        return (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1"
            title={`In sync with audio dialogue (${Math.round((track.syncConfidence ?? track.syncDetails?.confidence ?? 1) * 100)}% confidence)`}
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            In Sync
          </span>
        );
      case 'offset_detected':
        return (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1"
            title={track.syncDetails?.message || `Timing offset: ${track.syncOffset > 0 ? '+' : ''}${track.syncOffset}s`}
          >
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            Offset {track.syncOffset > 0 ? `+${track.syncOffset}s` : `${track.syncOffset}s`}
          </span>
        );
      case 'drift_detected':
        return (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1"
            title={track.syncDetails?.message || 'Framerate drift (e.g. 23.976 vs 25fps)'}
          >
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            Framerate Drift
          </span>
        );
      case 'duration_mismatch':
        return (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1"
            title="Different video/subtitle edition detected. Automatic repair is unsafe."
          >
            <XCircle className="w-3 h-3 text-rose-400" />
            Cut Mismatch
          </span>
        );
      case 'partial_subtitle':
        return (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1"
            title={track.syncDetails?.message || 'Subtitle only covers part of the video'}
          >
            <AlertTriangle className="w-3 h-3 text-blue-400" />
            Partial Subtitle
          </span>
        );
      case 'desynced':
      case 'invalid_timing':
        return (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1"
            title={track.syncDetails?.message || 'Subtitle out of sync with speech dialogue'}
          >
            <XCircle className="w-3 h-3 text-rose-400" />
            Desynced
          </span>
        );
      default:
        return null;
    }
  };

  if (!open) return null;

  return (
    <>
      <ModalShell open={open} onClose={onClose} size="3xl" noHeader noPadding noFloatingClose>
        <div className="flex flex-col max-h-[85vh]">
          {/* Header */}
          <div className="p-5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/90">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
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
                onClick={handleVerifySync}
                disabled={verifyingSync || loading || tracks.length === 0}
                className="px-3 py-1.5 text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                title="Verify subtitle sync against speech"
              >
                {verifyingSync ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Verify Sync
              </button>
              <button
                onClick={() => setTranslateModalOpen(true)}
                className="px-3.5 py-1.5 text-xs font-medium bg-cyan-600/20 text-cyan-300 border border-cyan-500/40 rounded-lg hover:bg-cyan-600/30 transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" /> Translate
              </button>
              {onOpenSubSearch && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenSubSearch();
                  }}
                  className="px-3.5 py-1.5 text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-1.5"
                >
                  <Search className="w-3.5 h-3.5" /> Download Subs
                </button>
              )}
              <button onClick={onClose} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors ml-1">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-5 overflow-y-auto flex-1">
            {loading ? (
              <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-3">
                <Loader2 className="w-7 h-7 animate-spin text-cyan-400" />
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
                      className="p-3.5 rounded-xl bg-slate-900/60 hover:bg-slate-850/60 border border-slate-800 hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                    >
                      {/* Left: Info */}
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shrink-0">
                          {langLabel}
                        </span>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-slate-200 truncate" title={track.filename}>
                              {track.filename}
                            </span>

                            {/* Status Badges */}
                            {renderSyncBadge(track)}
                            {track.isForced && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                Forced
                              </span>
                            )}
                            {track.isSdh && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                SDH
                              </span>
                            )}
                            {!track.isSdh && track.isHearingImpaired && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                HI
                              </span>
                            )}
                            {track.qualityScore !== null && track.qualityScore !== undefined && (
                              <span
                                className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                                  track.qualityScore >= 80
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                    : track.qualityScore >= 60
                                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                    : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                }`}
                                title="Subtitle Quality Score (0-100)"
                              >
                                Quality {track.qualityScore}
                              </span>
                            )}
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
                            {(track.syncConfidence !== null && track.syncConfidence !== undefined && track.syncConfidence > 0) || (track.syncDetails?.confidence !== null && track.syncDetails?.confidence !== undefined) ? (
                              <>
                                <span>•</span>
                                <span className={track.syncStatus === 'in_sync' ? 'text-emerald-400/80' : 'text-amber-400/80'}>
                                  {Math.round((track.syncConfidence || track.syncDetails?.confidence || 0) * 100)}% confidence
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                        {track.syncStatus === 'offset_detected' && (
                          <button
                            onClick={() => handleRepairOffset(track)}
                            disabled={repairingFile === track.filename}
                            className="px-2.5 py-1 text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                            title={`Automatically fix offset (${track.syncOffset > 0 ? '+' : ''}${track.syncOffset}s)`}
                          >
                            {repairingFile === track.filename ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Wrench className="w-3.5 h-3.5" />
                            )}
                            Fix Offset
                          </button>
                        )}
                        {track.syncStatus === 'drift_detected' && (
                          <button
                            onClick={() => handleRepairDrift(track)}
                            disabled={repairingFile === track.filename}
                            className="px-2.5 py-1 text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                            title="Apply timing stretch for framerate drift"
                          >
                            {repairingFile === track.filename ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Wrench className="w-3.5 h-3.5" />
                            )}
                            Fix Drift
                          </button>
                        )}
                        {track.hasBackup && (
                          <button
                            onClick={() => handleRestoreBackup(track)}
                            disabled={repairingFile === track.filename}
                            className="p-2 text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition-colors disabled:opacity-50"
                            title="Restore Original Backup (.bak)"
                          >
                            {repairingFile === track.filename ? (
                              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                            ) : (
                              <Undo2 className="w-4 h-4" />
                            )}
                          </button>
                        )}
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
          <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between shrink-0">
            <span className="text-xs text-slate-500">
              {tracks.length} subtitle track{tracks.length !== 1 ? 's' : ''} available
            </span>
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
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
