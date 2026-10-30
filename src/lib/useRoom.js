import { useCallback, useEffect, useRef, useState } from 'react';
import { LocalRoom } from './localRoom.js';
import { loadWords, loadCommonWords } from './words.js';

// Both hooks return { state, send, fatal, error, offset }.
// `error` is {message, n} so the same message twice still re-triggers effects.

export function useRemoteRoom(token) {
  const [state, setState] = useState(null);
  const [fatal, setFatal] = useState(null);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const ws = useRef(null);

  useEffect(() => {
    let alive = true, tries = 0, dead = false, over = false;
    const connect = () => {
      const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/rooms/${token}/ws`);
      ws.current = sock;
      sock.onopen = () => { if (document.hidden) sock.send(JSON.stringify({ type: 'hidden' })); };
      sock.onmessage = e => {
        const m = JSON.parse(e.data);
        if (m.type === 'state') { tries = 0; over = m.status === 'over'; setOffset(m.serverNow - Date.now()); setState(m); }
        else if (m.type === 'error') {
          if (m.fatal) { dead = true; setFatal(m.message); }
          else setError({ message: m.message, n: Date.now() });
        }
      };
      sock.onclose = () => {
        if (!alive || ws.current !== sock) return;
        ws.current = null;
        if (dead || over) return;
        if (tries++ < 3) setTimeout(() => alive && connect(), 500);
        else setFatal('Lost connection to the room.');
      };
    };
    connect();
    const vis = () => { const s = ws.current; if (s && s.readyState === 1) s.send(JSON.stringify({ type: document.hidden ? 'hidden' : 'visible' })); };
    const hide = () => ws.current && ws.current.close();
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('pagehide', hide);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('pagehide', hide);
      const s = ws.current; ws.current = null; s && s.close();
    };
  }, [token]);

  const send = useCallback(obj => { const s = ws.current; if (s && s.readyState === 1) s.send(JSON.stringify(obj)); }, []);
  return { state, send, fatal, error, offset };
}

export function useLocalRoom(game, size, name, options) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [fatal, setFatal] = useState(null);
  const room = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let words = null, common = null;
      if (game === 'wordchain') {
        try { [words, common] = await Promise.all([loadWords(), loadCommonWords()]); }
        catch { setFatal('Couldn’t load the dictionary. Check your connection and try again.'); return; }
      }
      if (cancelled) return;
      room.current = new LocalRoom({
        game, size, name, words, common, options,
        onState: s => setState(s),
        onError: message => setError({ message, n: Date.now() }),
      });
      room.current.begin();
    })();
    const vis = () => room.current && room.current.send({ type: document.hidden ? 'hidden' : 'visible' });
    document.addEventListener('visibilitychange', vis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', vis);
      room.current && room.current.destroy();
      room.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, size, name, JSON.stringify(options || {})]);

  const send = useCallback(obj => room.current && room.current.send(obj), []);
  return { state, send, fatal, error, offset: 0 };
}
