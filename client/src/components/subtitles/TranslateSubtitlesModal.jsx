import { useState, useEffect } from 'react';
import { Languages, CheckCircle2, AlertTriangle, Loader2, Sparkles, X, CheckSquare, Square, RefreshCw } from 'lucide-react';
import ModalShell from '../shared/ModalShell';
import api from '../../lib/api';
import { customAlert } from '../../utils/alerts';
import { LANG_NAME, LANG_LABEL } from '../../lib/format';

const AVAILABLE_LANGUAGES = [
  { name: 'Dutch', code: 'nl' },
  { name: 'French', code: 'fr' },
  { name: 'German', code: 'de' },
  { name: 'Spanish', code: 'es' },
  { name: 'Italian', code: 'it' },
  { name: 'Portuguese', code: 'pt' },
  { name: 'English', code: 'en' }
];

export default function TranslateSubtitlesModal({
  open,
  onClose,
  mediaType,
  mediaId,
  title,
  existingTracks = [],
  onSuccess
}) {
  const [selectedSourceTrack, setSelectedSourceTrack] = useState(null);
  const [selectedTargetLangs, setSelectedTargetLangs] = useState(['Dutch']);
  const [retranslate, setRetranslate] = useState(false);
  const [provider, setProvider] = useState('googleTranslate');
  const [loading, setLoading] = useState(false);
  const [activeJobs, setActiveJobs] = useState([]);

  // Find English track as default source
  useEffect(() => {
    if (existingTracks && existingTracks.length > 0) {
      const enTrack = existingTracks.find(t => t.langCode === 'en' || t.filename.toLowerCase().includes('.en.'));
      setSelectedSourceTrack(enTrack ? enTrack.filePath : existingTracks[0].filePath);
    }
  }, [existingTracks]);

  // Existing language codes
  const existingLangCodes = new Set(existingTracks.map(t => t.langCode));

  // Check if any selected language already exists
  const hasExistingConflict = selectedTargetLangs.some(lang => {
    const code = AVAILABLE_LANGUAGES.find(l => l.name === lang)?.code;
    return code && existingLangCodes.has(code);
  });

  const handleToggleLang = (langName) => {
    if (selectedTargetLangs.includes(langName)) {
      setSelectedTargetLangs(selectedTargetLangs.filter(l => l !== langName));
    } else {
      setSelectedTargetLangs([...selectedTargetLangs, langName]);
    }
  };

  const handleStartTranslation = async () => {
    if (selectedTargetLangs.length === 0) {
      customAlert('Please select at least one target language', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/library/subtitles/translate', {
        mediaType,
        mediaId,
        sourceFile: selectedSourceTrack,
        targetLangs: selectedTargetLangs,
        provider,
        retranslate
      });

      if (res.data.status === 'success') {
        customAlert(`Translation started in background for ${selectedTargetLangs.join(', ')}`, 'success');
        setActiveJobs(res.data.jobs || []);
        if (onSuccess) onSuccess();
        // Keep modal open or close after brief delay
        setTimeout(() => {
          setLoading(false);
          onClose();
        }, 1200);
      }
    } catch (err) {
      customAlert(err.response?.data?.message || 'Failed to start translation', 'error');
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <ModalShell open={open} onClose={onClose} size="lg" noHeader noPadding noFloatingClose>
      <div className="flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-5 border-b border-white/5 flex items-center justify-between shrink-0 bg-slate-900/60">
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-pink-400" />
              Translate Subtitles
            </h3>
            <p className="text-xs text-slate-400 mt-1 truncate max-w-[450px]">
              {title}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Source Subtitle Track */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Source Subtitle Track
            </label>
            {existingTracks.length === 0 ? (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>No subtitle files found for this media. Please search or download a subtitle first.</span>
              </div>
            ) : (
              <select
                value={selectedSourceTrack || ''}
                onChange={(e) => setSelectedSourceTrack(e.target.value)}
                className="w-full bg-slate-800/80 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-pink-500/50"
              >
                {existingTracks.map(t => (
                  <option key={t.filePath} value={t.filePath}>
                    {t.filename} ({t.langName || t.langCode?.toUpperCase()}) — {t.cueCount ? `${t.cueCount} cues` : `${Math.round(t.fileSize / 1024)} KB`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Target Languages Multi-select */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                Translate into Target Languages
              </label>
              <span className="text-[11px] text-slate-500">
                {selectedTargetLangs.length} selected
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {AVAILABLE_LANGUAGES.map(lang => {
                const isSelected = selectedTargetLangs.includes(lang.name);
                const alreadyExists = existingLangCodes.has(lang.code);

                return (
                  <button
                    key={lang.name}
                    type="button"
                    onClick={() => handleToggleLang(lang.name)}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-pink-500/15 border-pink-500/40 text-pink-200 shadow-md shadow-pink-500/5'
                        : 'bg-slate-800/40 border-white/5 text-slate-400 hover:border-white/15 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="font-semibold text-sm">{lang.name}</span>
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-800/80 border border-white/10 text-slate-400">
                        {lang.code}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      {alreadyExists ? (
                        <span className="text-amber-400 flex items-center gap-1 font-medium">
                          <CheckCircle2 className="w-3 h-3" /> Exists
                        </span>
                      ) : (
                        <span className="text-slate-500">Not present</span>
                      )}
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-pink-400 ml-auto" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duplicate / Retranslate Warning */}
          {hasExistingConflict && (
            <div
              className={`p-4 rounded-xl border transition-colors cursor-pointer select-none flex items-start gap-3 ${
                retranslate
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-200'
                  : 'bg-slate-800/60 border-white/10 text-slate-300'
              }`}
              onClick={() => setRetranslate(!retranslate)}
            >
              <div className="mt-0.5 text-amber-400">
                {retranslate ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-slate-500" />}
              </div>
              <div className="text-xs">
                <span className="font-bold text-amber-400 block mb-0.5">
                  Overwrite Existing Translations
                </span>
                <p className="text-slate-400 leading-relaxed">
                  One or more selected target languages already exist. Check this box to replace existing files with a new translation. The original source track will never be overwritten.
                </p>
              </div>
            </div>
          )}

          {/* Translation Provider */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Translation Provider
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full bg-slate-800/80 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-pink-500/50"
            >
              <option value="googleTranslate">Google Translate (Free, fast & unlimited)</option>
              <option value="gemini">Gemini AI (High quality, uses Gemini API key)</option>
              <option value="deepseek">DeepSeek AI (Accurate & affordable)</option>
              <option value="claude">Claude by Anthropic (High quality)</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 bg-slate-900/60 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStartTranslation}
            disabled={loading || selectedTargetLangs.length === 0 || !selectedSourceTrack || (hasExistingConflict && !retranslate)}
            className="px-6 py-2.5 text-sm font-bold bg-pink-500 text-white rounded-xl hover:bg-pink-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-pink-500/20 flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Starting Translation...
              </>
            ) : (
              <>
                <Languages className="w-4 h-4" />
                Translate {selectedTargetLangs.length} Language{selectedTargetLangs.length > 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
