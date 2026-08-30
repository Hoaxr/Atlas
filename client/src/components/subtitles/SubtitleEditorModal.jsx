import { useState, useEffect, useMemo } from 'react';
import { Search, Save, Download, Trash2, Plus, X, Loader2, Clock, Check, FileText } from 'lucide-react';
import ModalShell from '../shared/ModalShell';
import api from '../../lib/api';
import { customAlert } from '../../utils/alerts';
import { formatSize } from '../../lib/format';

export default function SubtitleEditorModal({
  open,
  onClose,
  mediaType,
  mediaId,
  filename,
  onSaved
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cues, setCues] = useState([]);
  const [format, setFormat] = useState('srt');
  const [header, setHeader] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCueIndex, setSelectedCueIndex] = useState(0);

  // Load subtitle content
  useEffect(() => {
    if (!open || !mediaType || !mediaId || !filename) return;

    let mounted = true;
    setLoading(true);

    api.get(`/library/subtitles/content/${mediaType}/${mediaId}/${encodeURIComponent(filename)}`)
      .then(res => {
        if (!mounted) return;
        if (res.data?.status === 'success') {
          setCues(res.data.data.cues || []);
          setFormat(res.data.data.format || 'srt');
          setHeader(res.data.data.header || '');
          setSelectedCueIndex(0);
        }
      })
      .catch(err => {
        if (!mounted) return;
        customAlert(err.response?.data?.message || 'Failed to load subtitle content', 'error');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, [open, mediaType, mediaId, filename]);

  // Filtered cues based on search
  const filteredCues = useMemo(() => {
    if (!searchQuery.trim()) return cues;
    const q = searchQuery.toLowerCase();
    return cues.filter(c => 
      c.text.toLowerCase().includes(q) || 
      String(c.id).includes(q) ||
      c.startTime.includes(q)
    );
  }, [cues, searchQuery]);

  const handleUpdateCueText = (index, newText) => {
    const updated = [...cues];
    updated[index] = { ...updated[index], text: newText };
    setCues(updated);
  };

  const handleUpdateCueTimes = (index, startTime, endTime) => {
    const updated = [...cues];
    updated[index] = { ...updated[index], startTime, endTime };
    setCues(updated);
  };

  const handleDeleteCue = (index) => {
    const updated = cues.filter((_, i) => i !== index);
    setCues(updated);
    if (selectedCueIndex >= updated.length) {
      setSelectedCueIndex(Math.max(0, updated.length - 1));
    }
  };

  const handleAddCueAfter = (index) => {
    const current = cues[index];
    const newCue = {
      id: cues.length + 1,
      startTime: current ? current.endTime : '00:00:00,000',
      endTime: current ? current.endTime : '00:00:03,000',
      text: 'New subtitle line'
    };
    const updated = [...cues];
    updated.splice(index + 1, 0, newCue);
    setCues(updated);
    setSelectedCueIndex(index + 1);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put(`/library/subtitles/content/${mediaType}/${mediaId}/${encodeURIComponent(filename)}`, {
        cues,
        format
      });

      if (res.data.status === 'success') {
        customAlert('Subtitle saved successfully', 'success');
        if (onSaved) onSaved();
        onClose();
      }
    } catch (err) {
      customAlert(err.response?.data?.message || 'Failed to save subtitle', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = () => {
    window.open(`/api/library/subtitles/download/${mediaType}/${mediaId}/${encodeURIComponent(filename)}`, '_blank');
  };

  if (!open) return null;

  return (
    <ModalShell open={open} onClose={onClose} size="4xl" noHeader noPadding noFloatingClose>
      <div className="flex flex-col h-[88vh]">
        {/* Top Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0 bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Subtitle Editor
                <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-slate-800 border border-white/10 text-slate-400">
                  {filename}
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {cues.length} total dialogue cues • Format: {format.toUpperCase()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Download Subtitle File"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search & Actions Bar */}
        <div className="p-3 border-b border-white/5 bg-slate-900/40 flex items-center justify-between gap-4 shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search dialogue or timestamps..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800/80 border border-white/10 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAddCueAfter(cues.length - 1)}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-cyan-400" /> Add Cue
            </button>
          </div>
        </div>

        {/* Editor Body: Split Cues List & Selected Cue Editor */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
            <span className="text-sm">Loading subtitle cues...</span>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
            {/* Left Cue List */}
            <div className="w-full md:w-1/2 border-r border-white/5 overflow-y-auto divide-y divide-white/5 bg-slate-950/40">
              {filteredCues.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No cues match your search query.
                </div>
              ) : (
                filteredCues.map((cue, idx) => {
                  const originalIndex = cues.findIndex(c => c === cue);
                  const isSelected = selectedCueIndex === originalIndex;

                  return (
                    <div
                      key={originalIndex}
                      onClick={() => setSelectedCueIndex(originalIndex)}
                      className={`p-3 text-left transition-colors cursor-pointer flex flex-col gap-1 ${
                        isSelected
                          ? 'bg-cyan-500/10 border-l-2 border-cyan-400'
                          : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono font-bold text-slate-400">#{originalIndex + 1}</span>
                        <span className="font-mono text-cyan-400/80 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {cue.startTime} → {cue.endTime}
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 line-clamp-2 leading-relaxed">
                        {cue.text || <span className="text-slate-600 italic">Empty line</span>}
                      </p>
                    </div>
                  );
                })
              )}
            </div>

            {/* Right Cue Detail / Live Edit Panel */}
            <div className="w-full md:w-1/2 p-5 overflow-y-auto bg-slate-900/30 flex flex-col justify-between">
              {cues[selectedCueIndex] ? (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Edit Cue #{selectedCueIndex + 1}
                    </span>
                    <button
                      onClick={() => handleDeleteCue(selectedCueIndex)}
                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-1 text-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>

                  {/* Timing Inputs */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Start Timestamp
                      </label>
                      <input
                        type="text"
                        value={cues[selectedCueIndex].startTime || ''}
                        onChange={(e) => handleUpdateCueTimes(selectedCueIndex, e.target.value, cues[selectedCueIndex].endTime)}
                        className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 font-mono text-xs text-cyan-300 focus:outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        End Timestamp
                      </label>
                      <input
                        type="text"
                        value={cues[selectedCueIndex].endTime || ''}
                        onChange={(e) => handleUpdateCueTimes(selectedCueIndex, cues[selectedCueIndex].startTime, e.target.value)}
                        className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 font-mono text-xs text-cyan-300 focus:outline-none focus:border-cyan-500/50"
                      />
                    </div>
                  </div>

                  {/* Dialogue Text Area */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Dialogue Text
                    </label>
                    <textarea
                      rows={6}
                      value={cues[selectedCueIndex].text || ''}
                      onChange={(e) => handleUpdateCueText(selectedCueIndex, e.target.value)}
                      placeholder="Enter subtitle dialogue..."
                      className="w-full bg-slate-800 border border-white/10 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:border-cyan-500/50 resize-none font-sans leading-relaxed"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Formatting tags such as &lt;i&gt;italics&lt;/i&gt;, speaker labels, and sound descriptions are supported.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-slate-500">
                  Select a cue from the left list to edit.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom Actions Footer */}
        <div className="p-4 border-t border-white/5 bg-slate-900/80 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || cues.length === 0}
            className="px-6 py-2.5 text-sm font-bold bg-cyan-500 text-slate-950 rounded-xl hover:bg-cyan-400 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-cyan-500/20"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving Changes...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Subtitle
              </>
            )}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
