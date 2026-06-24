import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Discover from './pages/Discover';
import Settings from './pages/Settings';
import SystemTasks from './pages/SystemTasks';
import ShowDetails from './pages/ShowDetails';
import MovieDetails from './pages/MovieDetails';
import Downloads from './pages/Downloads';
import Issues from './pages/Issues';

function App() {
  return (
    <>
      <Toaster position="bottom-right" toastOptions={{ className: 'bg-slate-800 text-white border border-slate-700' }} />
      <BrowserRouter>
        <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/movies" replace />} />
          <Route path="movies" element={<Dashboard />} />
          <Route path="movies/:id" element={<MovieDetails />} />
          <Route path="shows" element={<Dashboard />} />
          <Route path="shows/:id" element={<ShowDetails />} />
          <Route path="downloads" element={<Downloads />} />
          <Route path="discover" element={<Discover />} />
          <Route path="tasks" element={<SystemTasks />} />
          <Route path="settings" element={<Settings />} />
          <Route path="issues" element={<Issues />} />
        </Route>
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
