import { useState, useEffect } from 'react';
import { Sparkles, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import api from '../../lib/api';

export default function SubtitleJobBanner() {
  const [jobs, setJobs] = useState([]);

  // Fetch running jobs on mount and poll occasionally if active
  const checkActiveJobs = async () => {
    try {
      const res = await api.get('/library/subtitles/jobs?limit=5');
      if (res.data?.status === 'success') {
        const active = (res.data.data || []).filter(j => j.status === 'processing' || j.status === 'pending');
        setJobs(active);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    checkActiveJobs();
    const interval = setInterval(checkActiveJobs, 4000);
    return () => clearInterval(interval);
  }, []);

  // Listen to WebSocket messages
  useEffect(() => {
    const handleWsEvent = (e) => {
      try {
        const data = e.detail || e.data;
        if (data && data.type === 'SUBTITLE_JOB_UPDATE' && data.job) {
          setJobs(prev => {
            const updated = prev.filter(j => j.id !== data.job.id);
            if (data.job.status === 'processing' || data.job.status === 'pending') {
              return [data.job, ...updated];
            }
            return updated;
          });
        }
      } catch { /* ignore */ }
    };

    window.addEventListener('atlas:ws-message', handleWsEvent);
    window.addEventListener('message', handleWsEvent);
    return () => {
      window.removeEventListener('atlas:ws-message', handleWsEvent);
      window.removeEventListener('message', handleWsEvent);
    };
  }, []);

  const handleCancel = async (jobId) => {
    try {
      await api.post(`/library/subtitles/jobs/${jobId}/cancel`);
      setJobs(prev => prev.filter(j => j.id !== jobId));
    } catch { /* ignore */ }
  };

  if (jobs.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-auto">
      {jobs.map(job => (
        <div
          key={job.id}
          className="p-4 rounded-2xl bg-slate-900/95 border border-pink-500/30 shadow-2xl backdrop-blur-xl animate-fade-in flex flex-col gap-2.5"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-pink-400 animate-pulse" />
              <span className="text-xs font-bold text-slate-100 truncate max-w-[220px]">
                {job.title}
              </span>
            </div>
            <button
              onClick={() => handleCancel(job.id)}
              className="text-slate-500 hover:text-slate-300 p-0.5 rounded transition-colors text-xs"
              title="Cancel translation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Subtitle Target & Step */}
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-pink-300 font-medium">
              Translating into {job.targetLang}
            </span>
            <span className="text-slate-400 font-mono">
              {job.progress || 0}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-300 rounded-full"
              style={{ width: `${Math.max(5, job.progress || 0)}%` }}
            />
          </div>

          {/* Current Step */}
          <p className="text-[10px] text-slate-500 truncate">
            {job.currentStep || 'Processing cues...'}
          </p>
        </div>
      ))}
    </div>
  );
}
