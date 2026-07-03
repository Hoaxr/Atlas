import { useEffect, useRef, useCallback } from 'react';
import { customAlert } from '../utils/alerts';

// Singleton WebSocket shared across all components
let sharedWs = null;
const handlers = new Set();
let reconnectTimer = null;
let isConnecting = false;

const connect = () => {
  if (isConnecting && sharedWs?.readyState === WebSocket.CONNECTING) return;
  isConnecting = true;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const url = `${protocol}//${host}/ws`;

  try {
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('[WS] Connected');
      isConnecting = false;
      // Send auth if logged in
      try {
        const token = localStorage.getItem('atlas_token');
        if (token) {
          ws.send(JSON.stringify({ type: 'auth', token }));
        }
      } catch {}
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle presence events (don't show alerts for these)
        if (data.type === 'userOnline' || data.type === 'userOffline') {
          handlers.forEach(h => {
            try { h(data); } catch { /* isolate */ }
          });
          return;
        }

        if (data.level === 'success') {
          const msg = (data.message || '').toLowerCase();
          if (msg.includes('download') || msg.includes('translat') || msg.includes('scan') || msg.includes('subtitle')) {
            customAlert(data.message, 'success', 4000);
          }
        } else if (data.level === 'error') {
          customAlert(data.message, 'error', 5000);
        } else if (data.level === 'warn') {
          customAlert(data.message, 'info', 4000);
        }

        handlers.forEach(h => {
          try { h(data); } catch { /* isolate */ }
        });
      } catch { /* malformed */ }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected, reconnecting in 5s...');
      isConnecting = false;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 5000);
    };

    ws.onerror = () => {
      ws?.close();
    };

    sharedWs = ws;
  } catch {
    isConnecting = false;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 5000);
  }
};

export default function useWebSocket() {
  const handlerRef = useRef(null);

  const onEvent = useCallback((handler) => {
    handlerRef.current = handler;
    handlers.add(handler);
    if (!sharedWs || sharedWs.readyState > 1) {
      clearTimeout(reconnectTimer);
      connect();
    }
    return () => {
      handlers.delete(handler);
    };
  }, []);

  // Initial connection
  useEffect(() => {
    if (!sharedWs) connect();
    return () => {
      // Don't disconnect on unmount — the singleton stays alive
    };
  }, []);

  return { onEvent };
}
