import { useEffect, useRef, useCallback } from 'react';
import { customAlert } from '../utils/alerts';

export default function useWebSocket() {
  const wsRef = useRef(null);
  const handlersRef = useRef([]);

  const onEvent = useCallback((handler) => {
    handlersRef.current.push(handler);
    return () => {
      handlersRef.current = handlersRef.current.filter(h => h !== handler);
    };
  }, []);

  useEffect(() => {
    let ws;
    let reconnectTimer;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      // In dev, Vite proxies /ws to the backend
      const url = `${protocol}//${host}/ws`;

      try {
        ws = new WebSocket(url);

        ws.onopen = () => {
          console.log('[WS] Connected');
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Show toast for background events (throttled: only errors, warnings, and significant successes)
            if (data.level === 'success') {
              const msg = (data.message || '').toLowerCase();
              if (msg.includes('download') || msg.includes('translat') || msg.includes('scan') || msg.includes('subtitle')) {
                customAlert(data.message, 'success', 4000);
              }
            } else if (data.level === 'error') {
              customAlert(data.message, 'error', 5000);
            } else if (data.level === 'warn') {
              customAlert(data.message, 'info', 4000);
            } else if (data.level === 'info') {
              // Skip info toasts to reduce spam — info events still go to handlers
            }

            // Forward to all registered handlers
            handlersRef.current.forEach(h => {
              try { h(data); } catch { /* handler error — isolate from other handlers */ }
            });
          } catch { /* malformed WS message — ignore */ }
        };

        ws.onclose = () => {
          console.log('[WS] Disconnected, reconnecting in 5s...');
          reconnectTimer = setTimeout(connect, 5000);
        };

        ws.onerror = () => {
          ws?.close();
        };

        wsRef.current = ws;
      } catch {
        reconnectTimer = setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, []);

  return { onEvent };
}
