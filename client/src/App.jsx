import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { Toaster, useToasterStore, toast } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './lib/ThemeContext';
import ErrorBoundary from './components/shared/ErrorBoundary';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Discover from './pages/Discover';
import ShowDetails from './pages/ShowDetails';
import MovieDetails from './pages/MovieDetails';

const Settings = lazy(() => import('./pages/Settings'));
const SystemTasks = lazy(() => import('./pages/SystemTasks'));
const Downloads = lazy(() => import('./pages/Downloads'));
const Status = lazy(() => import('./pages/Status'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Statistics = lazy(() => import('./pages/Statistics'));
const PersonDetails = lazy(() => import('./pages/PersonDetails'));
const Login = lazy(() => import('./pages/Login'));
const UserPortal = lazy(() => import('./pages/UserPortal'));
const Requests = lazy(() => import('./pages/Requests'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function PageFallback() {
  return (
    <div className="flex items-center justify-center h-96">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500" />
    </div>
  );
}

function LazyPage({ children }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

function ToastLimiter() {
  const { toasts } = useToasterStore();

  useEffect(() => {
    toasts
      .filter((t) => t.visible)
      .filter((_, i) => i >= 3)
      .forEach((t) => toast.dismiss(t.id));
  }, [toasts]);

  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ToastLimiter />
          <Toaster
            position="bottom-right"
            toastOptions={{ className: 'bg-slate-800 text-white border border-slate-700' }}
          />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LazyPage><Login /></LazyPage>} />
              <Route path="/" element={<Layout />}>
                <Route index element={<Navigate to="/movies" replace />} />
                <Route path="movies" element={<Dashboard />} />
                <Route path="movies/:id" element={<MovieDetails />} />
                <Route path="shows" element={<Dashboard />} />
                <Route path="shows/:id" element={<ShowDetails />} />
                <Route path="downloads" element={<LazyPage><Downloads /></LazyPage>} />
                <Route path="discover" element={<Discover />} />
                <Route path="tasks" element={<LazyPage><SystemTasks /></LazyPage>} />
                <Route path="settings" element={<LazyPage><Settings /></LazyPage>} />
                <Route path="status" element={<LazyPage><Status /></LazyPage>} />
                <Route path="calendar" element={<LazyPage><Calendar /></LazyPage>} />
                <Route path="stats" element={<LazyPage><Statistics /></LazyPage>} />
                <Route path="requests" element={<LazyPage><Requests /></LazyPage>} />
                <Route path="person/:id" element={<LazyPage><PersonDetails /></LazyPage>} />
              </Route>
              <Route path="/portal" element={<LazyPage><UserPortal /></LazyPage>} />
            </Routes>
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
