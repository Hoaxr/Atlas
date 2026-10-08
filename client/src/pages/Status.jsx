import { useState, useEffect } from 'react';
import { Virtuoso } from 'react-virtuoso';
import api from '../lib/api';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import {
  AlertCircle, CheckCircle2, Activity, Database, Zap,
  Film, Tv, Server, Cloud, DownloadCloud, Globe, Cpu, Music,
  Settings, BookOpen, MessageSquare, FolderTree, Clock, Trash2
} from 'lucide-react';
import useWebSocket from '../lib/useWebSocket';
import EmptyState from '../components/shared/EmptyState';
import HealthWidget from '../components/shared/HealthWidget';
import LoadingState from '../components/shared/LoadingState';
import StickyBar from '../components/shared/StickyBar';
import VersionBadge from '../components/shared/VersionBadge';
import { useStickyBar } from '../lib/useStickyBar';
import { customConfirm, customAlert } from '../utils/alerts';

const statusIcons = {
  tmdb: Database,
  simkl: Activity,
  opensubtitles: BookOpen,
  subdl: DownloadCloud,
  subsource: Cloud,
  gemini: Cpu,
  deepseek: Cpu,
  claude: Cpu,
};

const statusLabels = {
  tmdb: 'TMDB',
  simkl: 'Simkl',
  opensubtitles: 'OpenSubtitles',
  subdl: 'SubDL',
  subsource: 'SubSource',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
  claude: 'Claude',
};

const mountIcons = {
  movies: Film,
  tv: Tv,
  downloads: DownloadCloud,
  music: Music,
};

import StatusBadge from '../components/shared/StatusBadge';

function ServiceCard({ name, service, compact = false }) {
  const Icon = statusIcons[name] || Server;

  let displayMessage = 'Not configured';
  if (service.status === 'connected') {
    displayMessage = service.message || 'Connected';
  } else if (service.status === 'warning') {
    displayMessage = service.message || 'Quota limit reached (Connected)';
  } else if (service.status === 'error') {
    if (service.message && (service.message.includes('429') || service.message.toLowerCase().includes('quota'))) {
      displayMessage = 'Quota limit reached (Connected)';
    } else {
      displayMessage = service.message && service.message.length > 80
        ? service.message.slice(0, 80) + '...'
        : (service.message || 'Error');
    }
  }

  return (
    <div className={compact ? 'flex min-h-16 items-center gap-3 px-4 py-3' : 'glass-panel rounded-2xl p-4 border border-white/10 flex items-center gap-3.5 hover:border-slate-700 transition-colors shadow-sm'}>
      <div className={compact ? 'flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800/80 border border-slate-700/50 shrink-0' : 'p-2.5 rounded-xl bg-slate-800/80 text-cyan-400 border border-slate-700/50 shrink-0'}>
        <Icon className={compact ? 'w-4 h-4 text-cyan-400' : 'w-5 h-5 text-cyan-400'} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-200 truncate">{statusLabels[name] || name}</p>
        <p className="text-xs mt-0.5 truncate text-slate-400" title={service.message || displayMessage}>
          {displayMessage}
        </p>
      </div>
      <StatusBadge status={service.status} label={service.status === 'warning' ? 'Quota' : undefined} />
    </div>
  );
}

export default function Status() {
  const { updateUrl, isLatest } = useOutletContext();
  const { headerRef, stickyVisible } = useStickyBar();
  const [statusData, setStatusData] = useState(null);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('status');
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [scrollElement, setScrollElement] = useState(null);

  useEffect(() => {
    setScrollElement(document.querySelector('main'));
  }, []);

  const navigate = useNavigate();
  const { onEvent } = useWebSocket();

  // Listen for real-time events to prepend to log
  useEffect(() => {
    return onEvent((data) => {
      if (!data.message || !['info', 'success', 'warn', 'error'].includes(data.level)) return;
      
      setLogs(prev => [{
        id: Date.now(),
        level: data.level,
        message: data.message,
        metadata: data.metadata,
        created_at: new Date().toISOString(),
        _live: true,
      }, ...prev.slice(0, 49)]);
    });
  }, [onEvent]);

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await api.get('/logs?limit=50');
      if (res.data.status === 'success') {
        setLogs(res.data.data);
      }
    } catch (e) {
      console.error('Failed to fetch logs', e);
    } finally {
      setLogsLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      const [statusRes, issuesRes] = await Promise.all([
        api.get('/settings/status'),
        api.get('/settings/issues')
      ]);
      if (statusRes.data.status === 'success') setStatusData(statusRes.data.data);
      if (issuesRes.data.status === 'success') setIssues(issuesRes.data.data);
    } catch (e) {
      console.error('Failed to fetch status', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchLogs();
    const interval = setInterval(fetchData, 15000);
    const logInterval = setInterval(fetchLogs, 30000);
    return () => {
      clearInterval(interval);
      clearInterval(logInterval);
    };
  }, []);

  const services = statusData?.services || {};
  const apiKeys = ['tmdb', 'simkl', 'opensubtitles', 'subdl', 'subsource'];
  const aiServices = ['gemini', 'deepseek', 'claude'];
  const downloadClients = services.downloadClients || [];
  const mounts = services.mounts || {};
  const hasIssues = issues.length > 0 || mounts.issues?.length > 0;

  const levelConfig = {
    success: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400', border: 'border-l-emerald-400' },
    info: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', dot: 'bg-cyan-400', border: 'border-l-cyan-400' },
    warn: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400', border: 'border-l-amber-400' },
    error: { bg: 'bg-rose-500/10', text: 'text-rose-400', dot: 'bg-rose-400', border: 'border-l-rose-400' },
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div ref={headerRef} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2.5 sm:gap-3 !mb-0">
            <Activity className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400 shrink-0" /> <span className="truncate">System Status</span>
          </h1>
          <p className="text-xs sm:text-base text-slate-400 mt-0.5 sm:mt-1 hidden sm:block !mb-0">
            Monitor system health, services connectivity, and activity logs.
          </p>
        </div>

        {/* Live status badge & version */}
        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
          {loading ? (
            <div className="h-6 w-36 rounded-full bg-slate-800/50 animate-pulse" />
          ) : (
            <>
              <div className={clsx(
                'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border shadow-sm',
                hasIssues
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              )}>
                {hasIssues ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>{hasIssues ? `${issues.length} ${issues.length === 1 ? 'Issue' : 'Issues'}` : 'All Systems Healthy'}</span>
              </div>
              <VersionBadge version={statusData?.version} updateUrl={updateUrl} isLatest={isLatest} />
            </>
          )}
        </div>
      </div>

      <StickyBar visible={stickyVisible} />

      {/* Tabs */}
      <div className="relative flex items-center bg-[#101e31] p-1 rounded-xl border border-[#1c2d46] shadow-inner select-none w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('status')}
          className={`relative flex items-center justify-center gap-2.5 px-4 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors duration-150 ${
            activeTab === 'status' ? 'text-slate-950 font-bold' : 'text-slate-100 hover:text-white'
          }`}
        >
          {activeTab === 'status' && (
            <motion.div
              layoutId="status-tab-slider"
              className="absolute inset-0 rounded-lg bg-gradient-to-b from-[#38a7f4] to-[#2291ea] shadow-sm"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <Activity className={`relative z-10 w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0 transition-colors duration-150 ${activeTab === 'status' ? 'text-slate-950' : 'text-slate-100'}`} />
          <span className="relative z-10">Status</span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('activity'); if (logs.length === 0) fetchLogs(); }}
          className={`relative flex items-center justify-center gap-2.5 px-4 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors duration-150 ${
            activeTab === 'activity' ? 'text-slate-950 font-bold' : 'text-slate-100 hover:text-white'
          }`}
        >
          {activeTab === 'activity' && (
            <motion.div
              layoutId="status-tab-slider"
              className="absolute inset-0 rounded-lg bg-gradient-to-b from-[#38a7f4] to-[#2291ea] shadow-sm"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <Clock className={`relative z-10 w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0 transition-colors duration-150 ${activeTab === 'activity' ? 'text-slate-950' : 'text-slate-100'}`} />
          <span className="relative z-10">Activity Log</span>
        </button>
      </div>

      {loading ? (
        <LoadingState className="min-h-[40vh] py-16" />
      ) : activeTab === 'status' ? (
        <div className="space-y-6">
          <HealthWidget />

          {/* Issues — shown first if there are any */}
          {issues.length > 0 && (
            <section>
              <h2 className="text-sm sm:text-base font-bold text-slate-200 flex items-center gap-2 mb-3 sm:mb-4">
                <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" /> Issues
              </h2>
              <div className="space-y-3">
                {issues.map(issue => (
                  <div
                    key={issue.id}
                    className="glass-panel p-4 sm:p-5 rounded-2xl border-l-4 flex items-center justify-between gap-4 border border-white/10"
                    style={{ borderLeftColor: issue.type === 'error' ? '#f43f5e' : '#f59e0b' }}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`p-3 rounded-2xl shrink-0 ${issue.type === 'error' ? 'bg-rose-500/10' : 'bg-amber-500/10'}`}>
                        {issue.id.includes('tmdb') ? <Database className="w-5 h-5 text-rose-400" /> :
                         issue.id.includes('indexer') ? <Zap className="w-5 h-5 text-amber-400" /> :
                         issue.id.includes('mount') ? <FolderTree className="w-5 h-5 text-amber-400" /> :
                         issue.id.includes('client') ? <Server className="w-5 h-5 text-rose-400" /> :
                         <Activity className="w-5 h-5 text-rose-400" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-200">
                          {issue.id.includes('tmdb') ? 'TMDB Configuration Required' :
                           issue.id === 'no_indexers' ? 'Prowlarr Not Configured' :
                           issue.id === 'no_clients' ? 'No Download Client' :
                           issue.id.includes('mount_empty') ? 'Library Mount Empty/Disconnected' :
                           issue.id.includes('mount_unreachable') ? 'Library Mount Unreachable' :
                           issue.id.includes('mount_not_dir') ? 'Invalid Library Path' :
                           issue.id.includes('client_offline') ? 'Download Client Offline' :
                           'Issue'}
                        </p>
                        <p className="text-sm text-slate-400 mt-0.5">{issue.message}</p>
                      </div>
                    </div>
                    {issue.actionLink && (
                      <button
                        onClick={() => navigate(issue.actionLink)}
                        className={`shrink-0 flex items-center gap-2 font-bold px-4 py-2 rounded-xl transition-all hover:scale-105 text-xs sm:text-sm ${
                          issue.type === 'error'
                            ? 'bg-rose-500 text-white hover:bg-rose-400'
                            : 'bg-amber-500 text-slate-900 hover:bg-amber-400'
                        }`}
                      >
                        <Settings className="w-4 h-4" />
                        {issue.actionText}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 items-start">
          {/* Connected services */}
          <section>
            <h2 className="text-sm sm:text-base font-bold text-slate-200 flex items-center gap-2 mb-3 sm:mb-4">
              <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" /> Services & Integrations
            </h2>
            <div className="glass-panel rounded-2xl border border-white/10 divide-y divide-slate-800/70 overflow-hidden">
              {apiKeys.map(name => {
                const service = services[name];
                if (!service || service.status === 'unconfigured') return null;
                return <ServiceCard key={name} name={name} service={service} compact />;
              })}

              {downloadClients.length > 0 ? (
                downloadClients.map((client, i) => (
                  <div
                    key={`client-${i}`}
                    className="flex min-h-16 items-center gap-3 px-4 py-3"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800/80 border border-slate-700/50 shrink-0">
                      <Server className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-slate-200 truncate">{client.name}</p>
                      <p className="text-xs mt-0.5 truncate text-slate-400" title={client.message || (client.status === 'connected' ? 'Connected' : 'Disconnected')}>
                        {client.status === 'connected' ? 'Connected' : client.message || 'Disconnected'}
                      </p>
                    </div>
                    <StatusBadge status={client.status} />
                  </div>
                ))
              ) : (
                <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-3">
                  <p className="text-slate-400 text-sm">No download clients configured</p>
                  <button
                    onClick={() => navigate('/settings')}
                    className="shrink-0 text-sm text-cyan-400 hover:text-cyan-300 font-medium"
                  >
                    Configure
                  </button>
                </div>
              )}

              <div className="flex min-h-16 items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800/80 border border-slate-700/50 shrink-0">
                  <Zap className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm sm:text-base text-slate-200">Indexers</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{services.indexers?.status === 'connected' ? 'Prowlarr configured' : 'Not configured'}</p>
                </div>
                <StatusBadge status={services.indexers?.status} />
              </div>
            </div>
          </section>

          {/* Library Mounts */}
          <section>
            <h2 className="text-sm sm:text-base font-bold text-slate-200 flex items-center gap-2 mb-3 sm:mb-4">
              <FolderTree className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" /> Library Mounts
              {mounts.paths > 0 && <span className="text-xs font-medium text-slate-400">{mounts.paths} paths</span>}
            </h2>
            {mounts.paths > 0 ? (
              <div className="glass-panel rounded-2xl border border-white/10 divide-y divide-slate-800/70 overflow-hidden">
                {(mounts.entries || []).map((entry, i) => {
                  const MountIcon = mountIcons[entry.type] || FolderTree;
                  const colors = entry.status === 'healthy'
                    ? { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' }
                    : entry.status === 'warning'
                    ? { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' }
                    : { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20' };
                  return (
                    <div key={`row-${i}`} className="flex min-h-16 items-center gap-3 px-4 py-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800/80 border border-slate-700/50 shrink-0">
                        <MountIcon className="w-4 h-4 text-cyan-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200 break-all">{entry.path}</p>
                        {entry.issue && <p className={`text-xs mt-0.5 ${colors.text}`}>{entry.issue}</p>}
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} ${colors.border} border shrink-0`}>
                        {entry.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="glass-panel rounded-2xl p-6 border border-white/10 text-center">
                <p className="text-slate-400 text-sm">No library paths configured</p>
              </div>
            )}
          </section>
          </div>

          {/* AI Translation Services */}
          {aiServices.some(name => services[name] && services[name].status !== 'unconfigured') && (
            <section>
              <h2 className="text-sm sm:text-base font-bold text-slate-200 flex items-center gap-2 mb-3 sm:mb-4">
                <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" /> AI Translation
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                {aiServices.map(name => {
                  const service = services[name];
                  if (!service || service.status === 'unconfigured') return null;
                  return <ServiceCard key={name} name={name} service={service} />;
                })}
              </div>
            </section>
          )}
        </div>
      ) : (
        /* Activity Feed Tab */
        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm sm:text-base font-bold text-slate-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" /> Recent Events
            </h3>
            <button
              onClick={async () => {
                const confirmed = await customConfirm('Are you sure you want to clear all activity logs?', {
                  title: 'Clear Logs',
                  confirmText: 'Clear',
                  type: 'error',
                });
                if (confirmed) {
                  try {
                    await api.delete('/logs');
                    setLogs([]);
                    customAlert('Activity logs cleared', 'success');
                  } catch (e) {
                    console.error('Failed to clear logs', e);
                    customAlert('Failed to clear logs', 'error');
                  }
                }
              }}
              disabled={logs.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-400 transition-colors hover:border-rose-500/40 hover:bg-rose-500/20 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Logs
            </button>
          </div>
          {logsLoading && logs.length === 0 ? (
            <LoadingState text="Loading logs..." className="py-12" />
          ) : logs.length === 0 ? (
            <EmptyState
              icon="activity"
              title="No activity yet"
              description="System events will appear here as background tasks run."
            />
          ) : (
            <Virtuoso
                customScrollParent={scrollElement}
                useWindowScroll={!scrollElement}
                totalCount={logs.length}
                data={logs}
                overscan={400}
                itemContent={(_index, log) => {
                  const cfg = levelConfig[log.level] || levelConfig.info;
                  const time = new Date(log.created_at).toLocaleTimeString();
                  const failureDetails = log.failureDetails || log.metadata?.failureDetails || [];
                  const omittedFailureDetails = log.omittedFailureDetails || log.metadata?.omittedFailureDetails || 0;
                  return (
                    <div key={log.id} className="pb-2">
                      <article className={`glass-panel flex items-start gap-3 rounded-xl border border-slate-800/80 border-l-2 p-3.5 transition-colors sm:px-4 ${log._live ? 'border-l-cyan-400 bg-cyan-500/5' : `${cfg.border} hover:border-slate-700`}`}>
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${log._live ? 'bg-cyan-400' : cfg.dot}`} />
                        <div className="min-w-0 flex-1">
                          <div className="mb-1.5 flex items-center gap-2">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
                            {log.level}
                          </span>
                          <time className="text-xs text-slate-500">{time}</time>
                        </div>
                          <p className="text-sm text-slate-200 break-words">{log.message}</p>
                          {failureDetails.length > 0 && (
                            <div className="mt-2 space-y-1.5 border-t border-slate-800/70 pt-2">
                              {failureDetails.map((failure, index) => (
                                <p key={`${failure.type}-${failure.title}-${index}`} className="text-xs text-slate-400 break-words">
                                  <span className="font-semibold text-slate-300">{failure.type}: {failure.title}</span>
                                  <span className="text-slate-500"> — </span>
                                  {failure.error}
                                </p>
                              ))}
                              {omittedFailureDetails > 0 && (
                                <p className="text-xs text-slate-500">And {omittedFailureDetails} more failure{omittedFailureDetails === 1 ? '' : 's'}.</p>
                              )}
                            </div>
                          )}
                          {(log.title || log.metadata?.title || log.showId || log.metadata?.showId) && (
                            <p className="text-xs text-slate-500 mt-0.5 break-words">
                              {log.title || log.metadata?.title || `Show ID: ${log.showId || log.metadata?.showId}`}
                              {(log.language || log.metadata?.language) ? ` (${log.language || log.metadata?.language})` : ''}
                            </p>
                          )}
                        </div>
                      </article>
                    </div>
                  );
                }}
              />
          )}
        </div>
      )}
    </div>
  );
}
