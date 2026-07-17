import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 120000,
});

api.interceptors.request.use((config) => {
  // Support dynamic server URLs for mobile apps
  const serverUrl = localStorage.getItem('atlas_server_url');
  if (serverUrl) {
    config.baseURL = serverUrl.replace(/\/$/, '') + '/api';
  }

  const token = localStorage.getItem('atlas_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401 && window.location.pathname !== '/login') {
      localStorage.removeItem('atlas_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
