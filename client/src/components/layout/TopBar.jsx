import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Search, Menu, SlidersHorizontal, Activity, Keyboard, Bell, AlertTriangle, Heart, DownloadCloud, Eye, CheckCircle2, Inbox, X, CircleUser } from 'lucide-react';

function RunningManIcon({ className }) {
  return (
    <img
      src="/running-man.png"
      alt=""
      aria-hidden="true"
      className={className}
      style={{ filter: 'brightness(0) invert(1)' }}
    />
  );
}
import { MOD_KEY } from '../../lib/platform';

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
export default function TopBar({ user, activity, alerts = [], onDismissAlert, onClearAlerts, onOpenSearch, onOpenShortcuts, onLogout }) {
  const navigate = useNavigate();
  const [activityOpen, setActivityOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const [clearedSnapshots, setClearedSnapshots] = useState({});
  const activityRef = useRef(null);
  const activityMenuRef = useRef(null);
  const activityButtonRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  // Close the notifications menu on any click outside both the bell button and
  // the (portaled) menu panel.
  useEffect(() => {
    if (!activityOpen) return;
    const listener = (e) => {
      const inButton = activityRef.current?.contains(e.target);
      const inMenu = activityMenuRef.current?.contains(e.target);
      if (!inButton && !inMenu) setActivityOpen(false);
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [activityOpen]);

  // Position the notifications dropdown with a fixed anchor so it can escape the
  // header's z-40 stacking context and render above the mobile sidebar (z-50).
  const updateMenuPosition = useCallback(() => {
    if (!activityButtonRef.current) return;
    const rect = activityButtonRef.current.getBoundingClientRect();
    const width = 288; // matches w-72
    setMenuStyle({
      position: 'fixed',
      top: `${rect.bottom + 8}px`,
      right: `${Math.max(8, window.innerWidth - rect.right)}px`,
      width: `${width}px`,
      maxWidth: `calc(100vw - 1rem)`,
      zIndex: 60,
    });
  }, []);

  useEffect(() => {
    if (!activityOpen) {
      setMenuStyle(null);
      return;
    }
    const raf = requestAnimationFrame(updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    window.addEventListener('resize', updateMenuPosition);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', updateMenuPosition, true);
      window.removeEventListener('resize', updateMenuPosition);
    };
  }, [activityOpen, updateMenuPosition]);

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

  const notificationCount = notifications.reduce((total, entry) => total + entry.count, 0) + alerts.length;
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
    onClearAlerts?.();
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
    <header className="h-16 shrink-0 flex items-center justify-between gap-2.5 sm:gap-4 px-3 sm:px-6 lg:px-8 bg-slate-100/90 dark:bg-[#101b2b] border-b border-slate-200 dark:border-slate-800/80 backdrop-blur-md relative z-40 max-w-full">
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('atlas-toggle-sidebar'))}
        className="lg:hidden p-2 -ml-1 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800/70 transition-colors shrink-0"
        aria-label="Open navigation menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Global search trigger */}
      <div className="flex-1 min-w-0 max-w-xl md:max-w-2xl flex items-center bg-white dark:bg-[#101e31] border border-slate-200 dark:border-[#1c2d46] hover:border-slate-300 dark:hover:border-slate-600 rounded-xl px-2.5 sm:px-4 py-1.5 sm:py-2 transition-all shadow-sm group">
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Find movies, shows, music, and more..."
          className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 text-left py-0.5"
        >
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-300 group-hover:text-white transition-colors shrink-0" />
          <span className="truncate text-xs sm:text-sm text-slate-500 dark:text-slate-200 font-normal">
            <span className="sm:hidden">Search...</span>
            <span className="hidden sm:inline">Find movies, shows, music, and more...</span>
          </span>
        </button>
        <div className="hidden sm:flex items-center gap-2 shrink-0 ml-2">
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
      <div className="ml-auto flex items-center gap-1 sm:gap-3 md:gap-4 shrink-0">
        <a
          href="https://www.paypal.com/donate/?business=C5EDZZUFSMX4J&no_recurring=0&item_name=Thanks+for+the+coffee&currency_code=EUR"
          target="_blank"
          rel="noopener noreferrer"
          title="Donate"
          aria-label="Donate"
          className="hidden md:flex p-2 rounded-xl text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors items-center justify-center group"
        >
          <Heart className="w-5 h-5 text-rose-500 fill-rose-500 group-hover:scale-110 transition-transform duration-200" />
        </a>

        <div ref={activityRef} className="relative">
          <button
            ref={activityButtonRef}
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

          {activityOpen && menuStyle && createPortal(
            <div
              ref={activityMenuRef}
              role="menu"
              style={menuStyle}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl shadow-black/10 dark:shadow-black/50 overflow-hidden"
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

              {notifications.length === 0 && alerts.length === 0 ? (
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

                  {/* Warn / Error alerts from the activity log */}
                  {alerts.length > 0 && (
                    <>
                      {notifications.length > 0 && (
                        <div className="mx-3 my-1 border-t border-slate-200 dark:border-slate-700/60" />
                      )}
                      {alerts.map((alert) => (
                        <div
                          key={alert.id}
                          className={clsx(
                            'group flex items-start justify-between rounded-lg transition-colors',
                            alert.level === 'error'
                              ? 'hover:bg-rose-500/5'
                              : 'hover:bg-amber-500/5'
                          )}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => { setActivityOpen(false); navigate('/status'); }}
                            className="flex-1 min-w-0 flex items-start gap-2.5 px-3 py-2 text-left transition-colors"
                          >
                            <AlertTriangle className={clsx(
                              'w-4 h-4 shrink-0 mt-0.5',
                              alert.level === 'error' ? 'text-rose-400' : 'text-amber-400'
                            )} />
                            <span className="min-w-0">
                              <span className={clsx(
                                'block text-xs font-semibold uppercase tracking-wide mb-0.5',
                                alert.level === 'error' ? 'text-rose-400' : 'text-amber-400'
                              )}>
                                {alert.level === 'error' ? 'Error' : 'Warning'}
                              </span>
                              <span className="block text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
                                {alert.message}
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            title="Dismiss"
                            aria-label="Dismiss alert"
                            onClick={(e) => { e.stopPropagation(); onDismissAlert?.(alert.id); }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 mt-1 mr-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-slate-200 dark:hover:bg-slate-700/60 transition-all cursor-pointer shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>,
            document.body
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate('/status')}
          title="Status"
          aria-label="Status"
          className="flex p-2 rounded-xl text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800/60 transition-colors shrink-0"
        >
          <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        <button
          type="button"
          onClick={() => navigate('/settings')}
          title="Settings"
          aria-label="Settings"
          className="hidden sm:flex p-2 rounded-xl text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800/60 transition-colors"
        >
          <SlidersHorizontal className="w-5 h-5" />
        </button>

        {/* Divider */}
        <div className="h-6 w-px bg-slate-200 dark:bg-slate-700/60 mx-1 hidden sm:block" />

        {/* Account — text only, no avatar */}
        <div className="hidden sm:flex items-center gap-2 cursor-default select-none shrink-0">
          <CircleUser className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0" />
          <div className="flex flex-col items-start justify-center leading-tight min-w-0">
            <span className="text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
              {displayName}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 truncate max-w-[120px]">
              {role}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-slate-200 dark:bg-slate-700/60 mx-1 hidden sm:block" />

        {/* Logout */}
        <button
          type="button"
          onClick={onLogout}
          title="Logout"
          aria-label="Logout"
          className="flex p-2 rounded-xl text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-500/10 dark:hover:bg-rose-500/10 transition-colors shrink-0"
        >
          <RunningManIcon className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>
    </header>
  );
}
