import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './lib/ThemeContext';
import ErrorBoundary from './components/shared/ErrorBoundary';
import Layout from './components/layout/Layout';
import Dashboard from './pages/dashboard/Dashboard';
import Discover from './pages/Discover';
import ShowDetails from './pages/ShowDetails';
import MovieDetails from './pages/MovieDetails';
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
const Tracker = lazy(() => import('./pages/Tracker'));

import ProtectedRoute from './components/layout/ProtectedRoute';

function PageFallback() {
  return (
    <div className="flex items-center justify-center h-96">
      <Spinner size="lg" />
    </div>
  );
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

function App() {
  return (
    <ErrorBoundary>
        <ThemeProvider>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'transparent',
                boxShadow: 'none',
                padding: '0',
                maxWidth: '100%',
              },
            }}
          />
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
                  <Route path="tracker" element={<LazyPage><Tracker /></LazyPage>} />
                  <Route path="person/:id" element={<LazyPage><PersonDetails /></LazyPage>} />
                </Route>
                <Route path="/portal" element={<LazyPage><UserPortal /></LazyPage>} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
