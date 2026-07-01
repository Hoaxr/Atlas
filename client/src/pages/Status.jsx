import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle, CheckCircle2, Activity, Database, Zap,
  Film, Tv, Server, Cloud, DownloadCloud, Globe, Cpu,
  Settings, BookOpen, MessageSquare, FolderTree, Clock, List
} from 'lucide-react';
import useWebSocket from '../lib/useWebSocket';
import EmptyState from '../components/shared/EmptyState';
import HealthWidget from '../components/shared/HealthWidget';
import Spinner from '../components/shared/Spinner';

const statusIcons = {
  tmdb: Database,
  trakt: Activity,
  opensubtitles: BookOpen,
  subdl: DownloadCloud,
  subsource: Cloud,
  gemini: Cpu,
  deepseek: Cpu,
  claude: Cpu,
};

const statusLabels = {
  tmdb: 'TMDB',
  trakt: 'Trakt',
  opensubtitles: 'OpenSubtitles',
  subdl: 'SubDL',
  subsource: 'SubSource',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
  claude: 'Claude',
};

const statusColors = {
  connected: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', dot: 'bg-emerald-400' },
  error: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20', dot: 'bg-rose-400' },
  unconfigured: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20', dot: 'bg-slate-400' },
};

function StatusBadge({ status, label }) {
  const c = statusColors[status] || statusColors.unconfigured;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${c.bg} ${c.text} ${c.border} border`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {label || status}
    </span>
  );
}

function ServiceCard({ name, service }) {
  const Icon = statusIcons[name] || Server;
  const c = statusColors[service.status] || statusColors.unconfigured;

  return (
    <div className={`glass-panel rounded-2xl p-5 border ${c.border} flex items-center gap-4 transition-all hover:scale-[1.02]`}>
      <div className={`p-3 rounded-2xl ${c.bg}`}>
        <Icon className={`w-6 h-6 ${c.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-slate-200">{statusLabels[name] || name}</p>
        <p className={`text-xs mt-0.5 ${c.text}`}>
          {service.status === 'connected' ? 'Connected' : service.status === 'error' ? service.message || 'Error' : 'Not configured'}
        </p>
      </div>
      <StatusBadge status={service.status} />
    </div>
  );
}

export default function Status() {
  const [statusData, setStatusData] = useState(null);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('status');
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const navigate = useNavigate();
  const { onEvent } = useWebSocket();

  // Listen for real-time events to prepend to log
  useEffect(() => {
    return onEvent((data) => {
      setLogs(prev => [{
        id: Date.now(),
        level: data.level || 'info',
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  const services = statusData?.services || {};
  const apiKeys = ['tmdb', 'trakt', 'opensubtitles', 'subdl', 'subsource'];
  const aiServices = ['gemini', 'deepseek', 'claude'];
  const downloadClients = services.downloadClients || [];
  const mounts = services.mounts || {};
  const hasIssues = issues.length > 0 || mounts.issues?.length > 0;

  const levelConfig = {
    success: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
    info: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', dot: 'bg-cyan-400' },
    warn: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
    error: { bg: 'bg-rose-500/10', text: 'text-rose-400', dot: 'bg-rose-400' },
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header with tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-100 dark:text-slate-100 text-slate-800 flex items-center gap-3">
            {hasIssues ? (
              <AlertCircle className="w-8 h-8 text-amber-400" />
            ) : (
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            )}
            System Status
          </h1>
          <p className="text-slate-400 mt-1">
            {hasIssues
              ? `${issues.length} issue${issues.length !== 1 ? 's' : ''} need${issues.length === 1 ? 's' : ''} attention`
              : 'All systems are running smoothly'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/30 dark:bg-slate-800/30 bg-slate-200/60 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('status')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'status'
              ? 'bg-slate-700 dark:bg-slate-700 bg-white text-slate-200 dark:text-slate-200 text-slate-700 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 dark:hover:text-slate-200 hover:text-slate-600'
          }`}
        >
          <Activity className="w-4 h-4" /> Status
        </button>
        <button
          onClick={() => { setActiveTab('activity'); if (logs.length === 0) fetchLogs(); }}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'activity'
              ? 'bg-slate-700 dark:bg-slate-700 bg-white text-slate-200 dark:text-slate-200 text-slate-700 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 dark:hover:text-slate-200 hover:text-slate-600'
          }`}
        >
          <Clock className="w-4 h-4" /> Activity Log
        </button>
      </div>

      {activeTab === 'status' ? (
        <div className="space-y-6">
          <HealthWidget />
          {/* Issues — shown first if there are any */}
          {issues.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-slate-300 dark:text-slate-300 text-slate-600 flex items-center gap-2 mb-4">
                <AlertCircle className="w-5 h-5 text-amber-400" /> Issues
              </h2>
              <div className="space-y-3">
                {issues.map(issue => (
                  <div
                    key={issue.id}
                    className="glass-panel p-5 rounded-2xl border-l-4 flex items-center justify-between gap-4"
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
                        <p className="font-bold text-slate-200 dark:text-slate-200 text-slate-700">
                          {issue.id.includes('tmdb') ? 'TMDB Configuration Required' :
                           issue.id === 'no_indexers' ? 'Prowlarr Not Configured' :
                           issue.id === 'no_clients' ? 'No Download Client' :
                           issue.id.includes('mount_empty') ? 'Library Mount Empty/Disconnected' :
                           issue.id.includes('mount_unreachable') ? 'Library Mount Unreachable' :
                           issue.id.includes('mount_not_dir') ? 'Invalid Library Path' :
                           issue.id.includes('client_offline') ? 'Download Client Offline' :
                           'Issue'}
                        </p>
                        <p className="text-sm text-slate-300 mt-0.5">{issue.message}</p>
                      </div>
                    </div>
                    {issue.actionLink && (
                      <button
                        onClick={() => navigate(issue.actionLink)}
                        className={`shrink-0 flex items-center gap-2 font-bold px-5 py-2.5 rounded-xl transition-all hover:scale-105 text-sm ${
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

      {/* API Services */}
      {apiKeys.some(name => services[name] && services[name].status !== 'unconfigured') && (
        <section>
          <h2 className="text-lg font-bold text-slate-300 flex items-center gap-2 mb-4">
            <Globe className="w-5 h-5 text-cyan-400" /> API Services
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {apiKeys.map(name => {
              const service = services[name];
              if (!service || service.status === 'unconfigured') return null;
              return <ServiceCard key={name} name={name} service={service} />;
            })}
          </div>
        </section>
      )}

      {/* AI Translation Services */}
      {aiServices.some(name => services[name] && services[name].status !== 'unconfigured') && (
        <section>
          <h2 className="text-lg font-bold text-slate-300 flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-purple-400" /> AI Translation
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {aiServices.map(name => {
              const service = services[name];
              if (!service || service.status === 'unconfigured') return null;
              return <ServiceCard key={name} name={name} service={service} />;
            })}
          </div>
        </section>
      )}

      {/* Download Clients */}
      <section>
        <h2 className="text-lg font-bold text-slate-300 flex items-center gap-2 mb-4">
          <DownloadCloud className="w-5 h-5 text-blue-400" /> Download Clients
        </h2>
        {downloadClients.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {downloadClients.map((client, i) => (
              <div key={`row-${i}`} className={`glass-panel rounded-2xl p-5 border ${statusColors[client.status]?.border} flex items-center gap-4`}>
                <div className={`p-3 rounded-2xl ${statusColors[client.status]?.bg}`}>
                  <Server className={`w-6 h-6 ${statusColors[client.status]?.text}`} />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-200">{client.name}</p>
                  <p className={`text-xs mt-0.5 ${statusColors[client.status]?.text}`}>
                    {client.status === 'connected' ? 'Connected' : client.message || 'Disconnected'}
                  </p>
                </div>
                <StatusBadge status={client.status} />
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-panel rounded-2xl p-6 border border-slate-500/20 text-center">
            <p className="text-slate-400">No download clients configured</p>
            <button
              onClick={() => navigate('/settings')}
              className="mt-3 text-sm text-cyan-400 hover:text-cyan-300 font-medium"
            >
              Configure in Settings →
            </button>
          </div>
        )}
      </section>

      {/* Indexers & Library */}
      <section>
        <h2 className="text-lg font-bold text-slate-300 flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-amber-400" /> Indexers & Library
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-panel rounded-2xl p-5 border border-white/10 flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-amber-500/10">
              <Zap className="w-6 h-6 text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-slate-200">Indexers</p>
              <p className="text-xs text-slate-400 mt-0.5">{services.indexers?.status === 'connected' ? 'Prowlarr configured' : 'Not configured'}</p>
            </div>
            <StatusBadge status={services.indexers?.status} label={services.indexers?.status === 'connected' ? 'Active' : 'None'} />
          </div>

          <div className="glass-panel rounded-2xl p-5 border border-white/10 flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-cyan-500/10">
              <Film className="w-6 h-6 text-cyan-400" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-slate-200">Movies</p>
              <p className="text-xs text-slate-400 mt-0.5">{services.library?.movies || 0} in library</p>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-5 border border-white/10 flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-purple-500/10">
              <Tv className="w-6 h-6 text-purple-400" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-slate-200">TV Shows</p>
              <p className="text-xs text-slate-400 mt-0.5">{services.library?.shows || 0} in library</p>
            </div>
          </div>
        </div>
      </section>

      {/* Library Mounts */}
      <section>
        <h2 className="text-lg font-bold text-slate-300 flex items-center gap-2 mb-4">
          <FolderTree className="w-5 h-5 text-indigo-400" /> Library Mounts
        </h2>
        {mounts.paths > 0 ? (
          <div className="glass-panel rounded-2xl p-5 border border-white/10 space-y-3">
            <p className="text-slate-400 text-sm">{mounts.paths} path{mounts.paths !== 1 ? 's' : ''} configured</p>
            {(mounts.entries || []).map((entry, i) => {
              const colors = entry.status === 'healthy'
                ? { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400', border: 'border-emerald-500/20' }
                : entry.status === 'warning'
                ? { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400', border: 'border-amber-500/20' }
                : { bg: 'bg-rose-500/10', text: 'text-rose-400', dot: 'bg-rose-400', border: 'border-rose-500/20' };
              return (
                <div key={`row-${i}`} className={`flex items-center gap-3 p-3 rounded-xl border ${colors.border} ${colors.bg}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
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
          <div className="glass-panel rounded-2xl p-6 border border-slate-500/20 text-center">
            <p className="text-slate-400">No library paths configured</p>
          </div>
        )}
      </section>
        </div>
      ) : (
        /* Activity Feed Tab */
        <div className="space-y-4">
          {logsLoading && logs.length === 0 ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              icon="activity"
              title="No activity yet"
              description="System events will appear here as background tasks run."
            />
          ) : (
            <div className="space-y-2">
              {logs.map((log) => {
                const cfg = levelConfig[log.level] || levelConfig.info;
                const time = new Date(log.created_at).toLocaleTimeString();
                return (
                  <div
                    key={log.id}
                    className={`glass-panel rounded-xl p-4 flex items-start gap-3 border-l-4 transition-all ${
                      log._live ? 'animate-pulse border-l-cyan-400' : 'border-l-transparent'
                    } ${cfg.bg}`}
                  >
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${cfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
                          {log.level}
                        </span>
                        <span className="text-xs text-slate-500">{time}</span>
                      </div>
                      <p className="text-sm text-slate-200 dark:text-slate-200 text-slate-700 mt-1">{log.message}</p>
                      {log.metadata?.title && (
                        <p className="text-xs text-slate-500 mt-0.5">{log.metadata.title}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
