import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Search, Menu, SlidersHorizontal, Activity, Keyboard, LogOut, Bell, AlertTriangle, Heart, DownloadCloud, Eye, CheckCircle2, Inbox, X } from 'lucide-react';
import { useOutsideClick } from '../../lib/useOutsideClick';
import { MOD_KEY } from '../../lib/platform';

const initialsOf = (name) => {
  const clean = (name || '').trim();
  if (!clean) return '?';
  return clean.charAt(0).toUpperCase();
};

/**
 * Application top bar — global search entry point, action icons and account menu.
 * Mirrors the Atlas design: a wide "search" affordance with its shortcut hint
 * on the left, then notifications / theme / settings / account on the right.
 *
 * @param {object} props
 * @param {{ username?: string, role?: string } | null} props.user
 * @param {{ issues?: number, requests?: number, downloads?: number, watchers?: number }} [props.activity]
 *   Live counters surfaced by the notifications bell (owned by Layout).
 */
export default function TopBar({ user, activity, onOpenSearch, onOpenShortcuts, onLogout }) {
  const navigate = useNavigate();
  const [activityOpen, setActivityOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const [clearedSnapshots, setClearedSnapshots] = useState({});
  const activityRef = useOutsideClick(() => setActivityOpen(false), activityOpen);

  // Reset cleared snapshot if live count drops below snapshot
  useEffect(() => {
    setClearedSnapshots((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const k of ['requests', 'issues', 'downloads', 'watchers']) {
        const live = activity?.[k] || 0;
        if (next[k] && live < next[k]) {
          next[k] = live;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activity]);

  // Only surface the signals that actually need the user's attention.
  const notifications = [
    { key: 'requests', count: Math.max(0, (activity?.requests || 0) - (clearedSnapshots.requests || 0)), label: 'pending request', route: '/requests', icon: Inbox, tone: 'text-amber-500 dark:text-amber-400' },
    { key: 'issues', count: Math.max(0, (activity?.issues || 0) - (clearedSnapshots.issues || 0)), label: 'system issue', route: '/status', icon: AlertTriangle, tone: 'text-rose-500 dark:text-rose-400' },
    { key: 'downloads', count: Math.max(0, (activity?.downloads || 0) - (clearedSnapshots.downloads || 0)), label: 'active download', route: '/downloads', icon: DownloadCloud, tone: 'text-emerald-500 dark:text-emerald-400' },
    { key: 'watchers', count: Math.max(0, (activity?.watchers || 0) - (clearedSnapshots.watchers || 0)), label: 'active stream', route: '/watcher', icon: Eye, tone: 'text-cyan-500 dark:text-cyan-400' },
  ].filter((entry) => entry.count > 0);

  const notificationCount = notifications.reduce((total, entry) => total + entry.count, 0);
  const prevCountRef = useRef(notificationCount);

  useEffect(() => {
    if (notificationCount > prevCountRef.current) {
      setHasUnread(true);
    }
    prevCountRef.current = notificationCount;
  }, [notificationCount]);

  const handleClearAll = (e) => {
    e?.stopPropagation();
    setClearedSnapshots({
      requests: activity?.requests || 0,
      issues: activity?.issues || 0,
      downloads: activity?.downloads || 0,
      watchers: activity?.watchers || 0,
    });
    setHasUnread(false);
  };

  const handleDismissOne = (e, key) => {
    e?.stopPropagation();
    setClearedSnapshots((prev) => ({
      ...prev,
      [key]: activity?.[key] || 0,
    }));
  };

  const displayName = user?.displayName || user?.name || user?.username || 'Bart Dekker';
  const role = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase()
    : 'Admin';

  return (
    <header className="h-16 shrink-0 flex items-center justify-between gap-3 sm:gap-4 px-4 sm:px-6 lg:px-8 bg-slate-100/90 dark:bg-[#101b2b] border-b border-slate-200 dark:border-slate-800/80 backdrop-blur-md relative z-40">
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('atlas-toggle-sidebar'))}
        className="lg:hidden p-2 -ml-1 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800/70 transition-colors shrink-0"
        aria-label="Open navigation menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Global search trigger */}
      <div className="flex-1 max-w-xl md:max-w-2xl flex items-center bg-white dark:bg-[#101e31] border border-slate-200 dark:border-[#1c2d46] hover:border-slate-300 dark:hover:border-slate-600 rounded-xl px-3.5 sm:px-4 py-1.5 sm:py-2 transition-all shadow-sm group">
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Find movies, shows, music, and more..."
          className="flex items-center gap-3 min-w-0 flex-1 text-left py-0.5"
        >
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-300 group-hover:text-white transition-colors shrink-0" />
          <span className="truncate text-sm text-slate-500 dark:text-slate-200 font-normal">
            Find movies, shows, music, and more...
          </span>
        </button>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <kbd
            onClick={onOpenSearch}
            className="hidden sm:inline-flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#18283e] border border-slate-200 dark:border-slate-700/60 text-[11px] font-medium text-slate-500 dark:text-slate-200 font-mono shadow-sm cursor-pointer"
          >
            {MOD_KEY} K
          </kbd>
          <button
            type="button"
            onClick={onOpenShortcuts}
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
            className="p-1 sm:p-1.5 -mr-1 sm:-mr-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors shrink-0"
          >
            <Keyboard className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Action icons: donate, notifications, status, settings, account */}
      <div className="ml-auto flex items-center gap-2 sm:gap-3 md:gap-4 shrink-0">
        <a
          href="https://www.paypal.com/donate/?business=C5EDZZUFSMX4J&no_recurring=0&item_name=Thanks+for+the+coffee&currency_code=EUR"
          target="_blank"
          rel="noopener noreferrer"
          title="Donate"
          aria-label="Donate"
          className="p-2 rounded-xl text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center justify-center group"
        >
          <Heart className="w-5 h-5 text-rose-500 fill-rose-500 group-hover:scale-110 transition-transform duration-200" />
        </a>

        <div ref={activityRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setActivityOpen((o) => !o);
              setHasUnread(false);
            }}
            aria-haspopup="menu"
            aria-expanded={activityOpen}
            aria-label={notificationCount > 0 ? `Notifications: ${notificationCount} new` : 'Notifications'}
            title="Notifications"
            className={clsx(
              'relative p-2 rounded-xl text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800/60 transition-colors',
              activityOpen && 'bg-slate-200/70 dark:bg-slate-800/60 text-slate-800 dark:text-white'
            )}
          >
            <Bell className="w-5 h-5" />
            {notificationCount > 0 && hasUnread && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500" />
            )}
          </button>

          {activityOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl shadow-black/10 dark:shadow-black/50 overflow-hidden z-50"
            >
              <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Notifications</p>
                  {notificationCount > 0 && (
                    <span className="text-[10px] font-display font-bold px-1.5 py-0.5 rounded-md bg-sky-500/15 text-sky-400 border border-sky-500/20 leading-none">
                      {notificationCount}
                    </span>
                  )}
                </div>
                {notificationCount > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-xs font-medium text-slate-400 hover:text-cyan-400 dark:hover:text-cyan-300 transition-colors cursor-pointer"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 px-4 py-7 text-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">You&apos;re all caught up</p>
                </div>
              ) : (
                <div className="p-1.5 space-y-0.5">
                  {notifications.map((entry) => (
                    <div
                      key={entry.key}
                      className="group flex items-center justify-between rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setActivityOpen(false);
                          navigate(entry.route);
                        }}
                        className="flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 text-left transition-colors"
                      >
                        <entry.icon className={clsx('w-4 h-4 shrink-0', entry.tone)} />
                        <span className="truncate">
                          <span className="font-semibold">{entry.count}</span>{' '}
                          {entry.label}{entry.count === 1 ? '' : 's'}
                        </span>
                      </button>
                      <button
                        type="button"
                        title="Dismiss notification"
                        aria-label="Dismiss notification"
                        onClick={(e) => handleDismissOne(e, entry.key)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 mr-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-slate-200 dark:hover:bg-slate-700/60 transition-all cursor-pointer shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate('/status')}
          title="Status"
          aria-label="Status"
          className="p-2 rounded-xl text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800/60 transition-colors"
        >
          <Activity className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={() => navigate('/settings')}
          title="Settings"
          aria-label="Settings"
          className="p-2 rounded-xl text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800/60 transition-colors"
        >
          <SlidersHorizontal className="w-5 h-5" />
        </button>

        {/* Divider */}
        <div className="h-6 w-px bg-slate-200 dark:bg-slate-700/60 mx-1 hidden sm:block" />

        {/* Account */}
        <div className="flex items-center gap-2.5 py-1 px-1.5 sm:px-2 rounded-xl text-slate-700 dark:text-slate-200 shrink-0 ml-1">
          <span className="w-9 h-9 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 shadow-sm">
            {initialsOf(displayName)}
          </span>
          <span className="hidden sm:flex flex-col text-left leading-tight max-w-[140px]">
            <span className="block text-[13px] font-medium text-slate-800 dark:text-slate-100 truncate">
              {displayName}
            </span>
            <span className="block text-[11px] font-normal text-slate-400 dark:text-slate-400 mt-0.5">
              {role}
            </span>
          </span>
        </div>

        {/* Logout */}
        <button
          type="button"
          onClick={onLogout}
          title="Logout"
          aria-label="Logout"
          className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-500/10 dark:hover:bg-rose-500/10 transition-colors shrink-0"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
