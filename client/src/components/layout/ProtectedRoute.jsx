import { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import api from '../../lib/api';
import Spinner from '../shared/Spinner';

export default function ProtectedRoute() {
  const token = localStorage.getItem('atlas_token');
  const [authState, setAuthState] = useState({
    checking: true,
    allowed: !!token,
  });

  useEffect(() => {
    let isMounted = true;
    api.get('/auth/status')
      .then(res => {
        if (!isMounted) return;
        if (res.data.status === 'success') {
          const { authEnabled, isPrivate } = res.data.data;
          // If auth is disabled or request is from private/bypassed IP or user has token
          if (!authEnabled || isPrivate || localStorage.getItem('atlas_token')) {
            setAuthState({ checking: false, allowed: true });
          } else {
            setAuthState({ checking: false, allowed: false });
          }
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setAuthState({ checking: false, allowed: !!localStorage.getItem('atlas_token') });
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (authState.checking && !token) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!authState.allowed) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
