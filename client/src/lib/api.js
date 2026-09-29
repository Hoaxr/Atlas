import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 120000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('atlas_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response &&
      error.response.status === 401 &&
      window.location.pathname !== '/login'
    ) {
      const url = error.config?.url || '';
      // Don't log out for 401s from external service tests or third-party integrations
      const isExternalOrSettings =
        url.includes('/settings/') ||
        url.includes('/test') ||
        url.includes('/tmdb/') ||
        url.includes('/simkl/') ||
        url.includes('/clients/');

      if (!isExternalOrSettings) {
        localStorage.removeItem('atlas_token');
        localStorage.removeItem('atlas_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
