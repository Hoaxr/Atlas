import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Toaster } from 'react-hot-toast';
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
const Issues = lazy(() => import('./pages/Issues'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Statistics = lazy(() => import('./pages/Statistics'));
const PersonDetails = lazy(() => import('./pages/PersonDetails'));

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

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <Toaster
            position="bottom-right"
            toastOptions={{ className: 'bg-slate-800 text-white border border-slate-700' }}
          />
          <BrowserRouter>
            <Routes>
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
                <Route path="issues" element={<LazyPage><Issues /></LazyPage>} />
                <Route path="calendar" element={<LazyPage><Calendar /></LazyPage>} />
                <Route path="stats" element={<LazyPage><Statistics /></LazyPage>} />
                <Route path="person/:id" element={<LazyPage><PersonDetails /></LazyPage>} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
