import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { Toaster } from 'react-hot-toast';
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

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
      <Toaster position="bottom-right" toastOptions={{ className: 'bg-slate-800 text-white border border-slate-700' }} />
      <BrowserRouter>
        <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/movies" replace />} />
          <Route path="movies" element={<Dashboard />} />
          <Route path="movies/:id" element={<MovieDetails />} />
          <Route path="shows" element={<Dashboard />} />
          <Route path="shows/:id" element={<ShowDetails />} />
          <Route path="downloads" element={<Suspense fallback={<div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500" /></div>}><Downloads /></Suspense>} />
          <Route path="discover" element={<Discover />} />
          <Route path="tasks" element={<Suspense fallback={<div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500" /></div>}><SystemTasks /></Suspense>} />
          <Route path="settings" element={<Suspense fallback={<div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500" /></div>}><Settings /></Suspense>} />
          <Route path="issues" element={<Suspense fallback={<div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500" /></div>}><Issues /></Suspense>} />
          <Route path="calendar" element={<Suspense fallback={<div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500" /></div>}><Calendar /></Suspense>} />
          <Route path="stats" element={<Suspense fallback={<div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500" /></div>}><Statistics /></Suspense>} />
        </Route>
        </Routes>
      </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
