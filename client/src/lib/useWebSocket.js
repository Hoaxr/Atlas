import { useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';

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
            
            // Show toast for background events
            if (data.level === 'success') {
              toast.success(data.message, {
                style: {
                  background: '#1e293b',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '16px',
                  padding: '12px 16px',
                },
                iconTheme: { primary: '#10b981', secondary: '#1e293b' },
              });
            } else if (data.level === 'error') {
              toast.error(data.message, {
                style: {
                  background: '#1e293b',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '16px',
                  padding: '12px 16px',
                },
                iconTheme: { primary: '#ef4444', secondary: '#1e293b' },
              });
            } else if (data.level === 'warn') {
              toast(data.message, {
                icon: '⚠️',
                style: {
                  background: '#1e293b',
                  color: '#fff',
                  border: '1px solid rgba(251, 191, 36, 0.3)',
                  borderRadius: '16px',
                  padding: '12px 16px',
                },
              });
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
