import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Живое соединение с партией. Синхронно, как за одним столом:
 * любое действие сервер рассылает всем сразу.
 */
export function useGameSocket({ roomId, playerId }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [connected, setConnected] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!roomId || !playerId) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws?room=${roomId}&player=${playerId}`;
    let ws; let retry; let closed = false;

    const open = () => {
      ws = new WebSocket(url);
      ref.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'state') setState(msg.state);
        if (msg.type === 'notice') { setNotice(msg.text); setTimeout(() => setNotice(null), 4000); }
        if (msg.type === 'error') { setError(msg.error); setTimeout(() => setError(null), 3500); }
      };
      ws.onclose = () => { setConnected(false); if (!closed) retry = setTimeout(open, 1200); };
      ws.onerror = () => ws.close();
    };
    open();

    return () => { closed = true; clearTimeout(retry); ws?.close(); };
  }, [roomId, playerId]);

  const send = useCallback((type, payload = {}) => {
    const ws = ref.current;
    if (ws?.readyState === 1) ws.send(JSON.stringify({ type, payload }));
  }, []);

  return { state, send, error, notice, connected };
}
