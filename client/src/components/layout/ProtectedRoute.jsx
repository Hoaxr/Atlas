import { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import api from '../../lib/api';
import Spinner from '../shared/Spinner';

export default function ProtectedRoute({ adminOnly = false }) {
  const token = localStorage.getItem('atlas_token');
  const [authState, setAuthState] = useState({
    checking: true,
    allowed: !!token,
    isAdmin: true,
  });

  useEffect(() => {
    let isMounted = true;
    api.get('/auth/status')
      .then(res => {
        if (!isMounted) return;
        if (res.data.status === 'success') {
          const { authEnabled } = res.data.data;
          let userRole = 'admin';
          try {
            const user = JSON.parse(localStorage.getItem('atlas_user'));
            if (user?.role) userRole = user.role;
          } catch { /* ignore */ }

          if (!authEnabled) {
            setAuthState({ checking: false, allowed: true, isAdmin: true });
          } else if (localStorage.getItem('atlas_token')) {
            setAuthState({
              checking: false,
              allowed: true,
              isAdmin: userRole === 'admin',
            });
          } else {
            setAuthState({ checking: false, allowed: false, isAdmin: false });
          }
        }
      })
      .catch(() => {
        if (!isMounted) return;
        let userRole = 'admin';
        try {
          const user = JSON.parse(localStorage.getItem('atlas_user'));
          if (user?.role) userRole = user.role;
        } catch { /* ignore */ }
        setAuthState({
          checking: false,
          allowed: !!localStorage.getItem('atlas_token'),
          isAdmin: userRole === 'admin',
        });
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (authState.checking && !token) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950" style={{ height: '100dvh' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  if (!authState.allowed) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !authState.isAdmin) {
    return <Navigate to="/portal" replace />;
  }

  return <Outlet />;
}
