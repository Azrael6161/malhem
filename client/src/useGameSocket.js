import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Живое соединение с партией.
 * @param {{roomId: string, playerId: string}} creds
 * @param {() => void} [onAuthError] — вызывается при 4001/4002 (комната/игрок исчезли)
 */
export function useGameSocket({ roomId, playerId }, onAuthError) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [connected, setConnected] = useState(false);
  const ref = useRef(null);

  // Колбэк храним в ref — чтобы смена ссылки не пересоздавала сокет.
  const authErrorRef = useRef(onAuthError);
  useEffect(() => { authErrorRef.current = onAuthError; }, [onAuthError]);

  useEffect(() => {
    if (!roomId || !playerId) return;

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws?room=${roomId}&player=${playerId}`;

    let ws;
    let retry;
    let closed = false;

    const open = () => {
      if (closed) return;                     // не открываем, если компонент уже размонтирован
      ws = new WebSocket(url);
      ref.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.type === 'state') setState(msg.state);
        if (msg.type === 'notice') {
          setNotice(msg.text);
          setTimeout(() => setNotice(null), 4000);
        }
        if (msg.type === 'error') {
          setError(msg.error);
          setTimeout(() => setError(null), 3500);
        }
      };

      ws.onclose = (event) => {
        setConnected(false);
        if (event.code === 4001 || event.code === 4002) {
          authErrorRef.current?.();
          return;                              // не ретраим
        }
        if (!closed) retry = setTimeout(open, 1200);
      };

      ws.onerror = () => ws.close();
    };

    open();

    return () => {
      closed = true;
      clearTimeout(retry);
      // Закрываем только если сокет был создан и ещё жив.
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
      ref.current = null;
    };
  }, [roomId, playerId]);   // ← onAuthError здесь БОЛЬШЕ НЕТ

  const send = useCallback((type, payload = {}) => {
    const ws = ref.current;
    if (ws?.readyState === 1) ws.send(JSON.stringify({ type, payload }));
  }, []);

  return { state, send, error, notice, connected };
};