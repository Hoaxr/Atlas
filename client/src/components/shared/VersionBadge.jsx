import { useState } from 'react';
import { GitBranch, GitCommit, ExternalLink, Check, Copy } from 'lucide-react';
import { BUILD_VERSION } from '../../lib/version';

export default function VersionBadge({ version: propVersion, className = '' }) {
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const versionData = propVersion || BUILD_VERSION;
  const commit = versionData?.commit || 'dev';
  const fullCommit = versionData?.fullCommit || commit;
  const branch = versionData?.branch || 'main';
  const date = versionData?.date || '';
  const message = versionData?.message || '';
  const commitCount = versionData?.commitCount;
  const repoUrl = versionData?.repoUrl || 'https://github.com/Hoaxr/Atlas';
  const commitUrl = fullCommit && fullCommit !== 'dev' ? `${repoUrl}/commit/${fullCommit}` : repoUrl;

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(fullCommit || commit);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <div
        onClick={() => setShowDetails(prev => !prev)}
        className="glass-panel group cursor-pointer px-3.5 py-1.5 rounded-xl border border-slate-700/60 hover:border-slate-500/60 bg-slate-800/40 hover:bg-slate-800/70 transition-all flex items-center gap-2.5 text-xs select-none shadow-sm"
        title="Click for build & commit details"
      >
        {/* Pulsing indicator */}
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>

        {/* Branch */}
        <div className="flex items-center gap-1 text-slate-400 font-medium">
          <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden sm:inline">{branch}</span>
        </div>

        <span className="text-slate-600 hidden sm:inline">•</span>

        {/* Commit */}
        <div className="flex items-center gap-1 font-mono font-bold text-indigo-300 group-hover:text-indigo-200">
          <GitCommit className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>{commit}</span>
        </div>

        {/* Date / Build if available */}
        {date && (
          <>
            <span className="text-slate-600 hidden md:inline">•</span>
            <span className="text-slate-400 text-[11px] hidden md:inline">{date}</span>
          </>
        )}
      </div>

      {/* Popover Details Modal/Dropdown */}
      {showDetails && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDetails(false)}
          />
          <div className="absolute right-0 mt-2 w-72 sm:w-80 glass-panel p-4 rounded-2xl border border-slate-700/80 bg-slate-900/95 shadow-2xl z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 text-left">
            <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                  Build Information
                </span>
              </div>
              {commitCount > 0 && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-bold">
                  rev #{commitCount}
                </span>
              )}
            </div>

            <div className="space-y-2.5 text-xs">
              {/* Commit Hash & Copy */}
              <div className="flex items-center justify-between bg-slate-800/50 p-2 rounded-lg border border-slate-700/40">
                <div className="min-w-0 pr-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Commit Hash</div>
                  <div className="font-mono text-indigo-300 font-bold truncate text-xs" title={fullCommit}>
                    {commit} <span className="text-slate-500 font-normal text-[11px]">({branch})</span>
                  </div>
                </div>
                <button
                  onClick={handleCopy}
                  className="shrink-0 p-1.5 rounded-md hover:bg-slate-700/60 text-slate-300 transition-colors flex items-center gap-1 text-[11px]"
                  title="Copy commit SHA"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-slate-200" />
                  )}
                </button>
              </div>

              {/* Commit Message */}
              {message && (
                <div className="bg-slate-800/30 p-2 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Latest Commit</div>
                  <div className="text-slate-300 line-clamp-2 leading-relaxed text-[11px]">{message}</div>
                </div>
              )}

              {/* Commit Date */}
              {date && (
                <div className="flex justify-between items-center text-[11px] text-slate-400 px-1">
                  <span>Commit Date</span>
                  <span className="text-slate-200 font-medium">{date}</span>
                </div>
              )}
            </div>

            {/* GitHub Link Action */}
            <a
              href={commitUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-indigo-200 border border-indigo-500/30 text-xs font-semibold transition-colors"
            >
              <span>View commit on GitHub</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </>
      )}
    </div>
  );
}
