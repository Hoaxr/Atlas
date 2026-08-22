import { useEffect, useRef, useCallback } from 'react';
import { customAlert } from '../utils/alerts';

// Singleton WebSocket shared across all components
let sharedWs = null;
const handlers = new Set();
let reconnectTimer = null;
let isConnecting = false;
let reconnectAttempts = 0;
let reconnectDisabled = false;

// Codes sent by the server on auth failure — don't retry until an explicit connect()
const FATAL_CLOSE_CODES = new Set([4001, 4003]);

const connect = () => {
  if (reconnectDisabled) return;
  if (isConnecting && sharedWs?.readyState === WebSocket.CONNECTING) return;
  isConnecting = true;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const url = `${protocol}//${host}/ws`;

  try {
    const ws = new WebSocket(url);

    ws.onopen = () => {
      isConnecting = false;
      reconnectAttempts = 0;
      // Send auth if logged in
      try {
        const token = localStorage.getItem('atlas_token');
        if (token) {
          ws.send(JSON.stringify({ type: 'auth', token }));
        }
      } catch { /* ignore */ }
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

    ws.onclose = (event) => {
      isConnecting = false;
      clearTimeout(reconnectTimer);
      if (FATAL_CLOSE_CODES.has(event.code)) {
        reconnectDisabled = true;
        return;
      }
      reconnectAttempts += 1;
      const delay = Math.min(30000, 5000 * reconnectAttempts);
      reconnectTimer = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws?.close();
    };

    sharedWs = ws;
  } catch {
    isConnecting = false;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, Math.min(30000, 5000 * (reconnectAttempts + 1)));
  }
};

/**
 * Close the shared socket and stop reconnection attempts (e.g. on logout).
 * A subsequent useWebSocket() consumer will trigger a fresh connect().
 */
export const closeWebSocket = () => {
  reconnectDisabled = true;
  clearTimeout(reconnectTimer);
  isConnecting = false;
  if (sharedWs) {
    sharedWs.onclose = null;
    sharedWs.onerror = null;
    try { sharedWs.close(); } catch { /* ignore */ }
    sharedWs = null;
  }
};

export default function useWebSocket() {
  const handlerRef = useRef(null);

  const onEvent = useCallback((handler) => {
    handlerRef.current = handler;
    handlers.add(handler);
    if (!sharedWs || sharedWs.readyState > 1) {
      clearTimeout(reconnectTimer);
      reconnectDisabled = false;
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
