import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { Toaster, ToastBar, useToasterStore, toast } from 'react-hot-toast';
import { ThemeProvider } from './lib/ThemeContext';
import { AudioPlayerProvider, useAudioPlayer } from './context/AudioPlayerContext';
import ErrorBoundary from './components/shared/ErrorBoundary';
import Layout from './components/layout/Layout';
import Dashboard from './pages/dashboard/Dashboard';
import Discover from './pages/Discover';
import ShowDetails from './pages/ShowDetails';
import MovieDetails from './pages/MovieDetails';
import Tracker from './pages/Tracker';
import Spinner from './components/shared/Spinner';

const Settings = lazy(() => import('./pages/Settings'));
const SystemTasks = lazy(() => import('./pages/SystemTasks'));
const Downloads = lazy(() => import('./pages/Downloads'));
const Status = lazy(() => import('./pages/Status'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Statistics = lazy(() => import('./pages/Statistics'));
const MediaHealth = lazy(() => import('./pages/MediaHealth'));
const CleanupCandidates = lazy(() => import('./pages/CleanupCandidates'));
const PersonDetails = lazy(() => import('./pages/PersonDetails'));
const Login = lazy(() => import('./pages/Login'));
const UserPortal = lazy(() => import('./pages/UserPortal'));
const Requests = lazy(() => import('./pages/Requests'));
const Watcher = lazy(() => import('./pages/Watcher'));
const Music = lazy(() => import('./pages/Music'));
const ArtistDetails = lazy(() => import('./pages/ArtistDetails'));
const AlbumDetails = lazy(() => import('./pages/AlbumDetails'));

import ProtectedRoute from './components/layout/ProtectedRoute';

function PageFallback() {
  return (
    <div className="flex items-center justify-center h-96">
      <Spinner size="lg" />
    </div>
  );
}

/**
 * Keeps at most `limit` transient toasts on screen so bursts of notifications
 * (e.g. rapidly adding artists) don't stack into a wall of cards. Persistent
 * toasts (duration: Infinity, used by confirm dialogs) are never dismissed.
 */
function ToastLimiter({ limit = 3 }) {
  const { toasts } = useToasterStore();
  useEffect(() => {
    toasts
      .filter((t) => t.visible && t.duration !== Infinity)
      .filter((_, i) => i >= limit)
      .forEach((t) => toast.dismiss(t.id));
  }, [toasts, limit]);
  return null;
}

function LazyPage({ children }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.querySelector('main')?.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function AppToaster() {
  const { currentTrack } = useAudioPlayer();

  return (
    <Toaster
      position="bottom-right"
      gutter={10}
      containerStyle={{
        bottom: currentTrack ? 90 : 20,
        right: 20,
        transition: 'bottom 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 9999,
      }}
      toastOptions={{
        duration: 3000,
        style: {
          background: 'transparent',
          boxShadow: 'none',
          padding: '0',
          maxWidth: '100%',
        },
        success: {
          duration: 2500,
          style: {
            background: 'rgba(15, 23, 42, 0.95)',
            color: '#e2e8f0',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            borderRadius: '0.75rem',
            padding: '10px 14px',
            fontSize: '0.8125rem',
            maxWidth: '380px',
            boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.6)',
          },
          iconTheme: { primary: '#10b981', secondary: '#0f172a' },
        },
        error: {
          duration: 4500,
          style: {
            background: 'rgba(15, 23, 42, 0.95)',
            color: '#e2e8f0',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '0.75rem',
            padding: '10px 14px',
            fontSize: '0.8125rem',
            maxWidth: '380px',
            boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.6)',
          },
          iconTheme: { primary: '#ef4444', secondary: '#0f172a' },
        },
        loading: {
          style: {
            background: 'rgba(15, 23, 42, 0.95)',
            color: '#e2e8f0',
            border: '1px solid rgba(6, 182, 212, 0.35)',
            borderRadius: '0.75rem',
            padding: '10px 14px',
            fontSize: '0.8125rem',
            maxWidth: '380px',
          },
          iconTheme: { primary: '#06b6d4', secondary: '#0f172a' },
        },
      }}
    >
      {(t) => (
        <div
          onClick={() => toast.dismiss(t.id)}
          className="cursor-pointer transition-transform active:scale-95 select-none"
          title="Click to dismiss"
        >
          <ToastBar toast={t} />
        </div>
      )}
    </Toaster>
  );
}

function App() {
  return (
    <ErrorBoundary>
        <ThemeProvider>
          <AudioPlayerProvider>
          <AppToaster />
          <ToastLimiter limit={3} />
          <BrowserRouter>
            <ScrollToTop />
            <Routes>
              <Route path="/login" element={<LazyPage><Login /></LazyPage>} />
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Layout />}>
                  <Route index element={<Navigate to="/tracker" replace />} />
                  <Route path="movies" element={<Dashboard key="movies-view" />} />
                  <Route path="shows" element={<Dashboard key="shows-view" />} />
                  <Route path="movies/:id" element={<MovieDetails />} />
                  <Route path="shows/:id" element={<ShowDetails />} />
                  <Route path="music" element={<LazyPage><Music /></LazyPage>} />
                  <Route path="music/artists/:id" element={<LazyPage><ArtistDetails /></LazyPage>} />
                  <Route path="music/albums/:id" element={<LazyPage><AlbumDetails /></LazyPage>} />
                  <Route path="downloads" element={<LazyPage><Downloads /></LazyPage>} />
                  <Route path="discover" element={<Discover />} />
                  <Route path="tasks" element={<LazyPage><SystemTasks /></LazyPage>} />
                  <Route path="settings" element={<LazyPage><Settings /></LazyPage>} />
                  <Route path="status" element={<LazyPage><Status /></LazyPage>} />
                  <Route path="calendar" element={<LazyPage><Calendar /></LazyPage>} />
                  <Route path="stats" element={<LazyPage><Statistics /></LazyPage>} />
                  <Route path="stats/health" element={<LazyPage><MediaHealth /></LazyPage>} />
                  <Route path="stats/cleanup" element={<LazyPage><CleanupCandidates /></LazyPage>} />
                  <Route path="requests" element={<LazyPage><Requests /></LazyPage>} />
                  <Route path="watcher" element={<LazyPage><Watcher /></LazyPage>} />
                  <Route path="tracker" element={<Tracker />} />
                  <Route path="person/:id" element={<LazyPage><PersonDetails /></LazyPage>} />
                </Route>
                <Route path="/portal" element={<LazyPage><UserPortal /></LazyPage>} />
              </Route>
            </Routes>
          </BrowserRouter>
          </AudioPlayerProvider>
        </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
