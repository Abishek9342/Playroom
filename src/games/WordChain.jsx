import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useAnimate } from 'motion/react';
import { colorFor } from '../lib/meta.js';

export function WordChain({ state, send, error }) {
  const g = state.g;
  const me = state.players.find(p => p.id === state.you);
  const myTurn = state.status === 'playing' && me && me.alive && g.turn === state.you;
  const listRef = useRef(null);
  const name = id => (id === state.you ? 'You' : (state.players.find(p => p.id === id) || {}).name || '');

  useEffect(() => { const el = listRef.current; if (el && el.scrollTo) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }, [g.words.length]);

  return (
    <div className="wc">
      <div className="wc-head">
        <div className="wc-next" aria-live="polite">
          <span className="kicker">{state.status === 'playing' ? 'Next word starts with' : 'Final chain'}</span>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={g.need || 'any'} className="lt lt-xl hot" initial={{ rotateX: 90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} exit={{ rotateX: -90, opacity: 0 }}>
              {g.need ? g.need : '·'}
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="wc-stats">
          <div><b>{g.words.length}</b><span>{g.words.length === 1 ? 'word' : 'words'}</span></div>
        </div>
      </div>

      <div className="wc-chain card" ref={listRef} role="list" aria-label="Words played">
        {g.words.length === 0 && <p className="muted wc-empty">No words yet. {g.turn === state.you ? 'You start, so any word works.' : `${name(g.turn)} starts.`}</p>}
        <AnimatePresence initial={false}>
          {g.words.map((w, i) => (
            <motion.div key={w.w} role="listitem" className="wc-row" layout
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
              <span className="wc-who"><i style={{ background: colorFor(w.by) }} />{name(w.by)}</span>
              <span className="wc-tiles">
                {w.w.split('').map((c, j) => (
                  <motion.span key={j} className={`lt${(i > 0 && j === 0) || j === w.w.length - 1 ? ' hot' : ''}`}
                    initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: j * 0.025 }}>{c}</motion.span>
                ))}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>{myTurn && <Composer key="c" need={g.need} send={send} error={error} />}</AnimatePresence>
      {!myTurn && state.status === 'playing' && me && me.alive && <p className="wc-wait muted">Waiting for {name(g.turn)}…</p>}
    </div>
  );
}

function Composer({ need, send, error }) {
  const [text, setText] = useState('');
  const [scope, animate] = useAnimate();
  const input = useRef(null);
  const seen = useRef(error ? error.n : 0);
  useEffect(() => { input.current && input.current.focus(); }, []);
  useEffect(() => {
    if (error && error.n !== seen.current) {
      seen.current = error.n;
      animate(scope.current, { x: [0, -10, 9, -6, 4, 0] }, { duration: 0.4 });
    }
  }, [error, animate, scope]);
  const clean = text.toLowerCase().replace(/[^a-z]/g, '');
  const wrongStart = need && clean && clean[0] !== need;
  const submit = e => { e.preventDefault(); if (clean.length >= 2 && !wrongStart) send({ type: 'move', move: { type: 'word', word: clean } }); };
  return (
    <motion.form ref={scope} className="composer" onSubmit={submit}
      initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}>
      <label className="sr-only" htmlFor="wc-input">Your word</label>
      <div className={`composer-field${wrongStart ? ' invalid' : ''}`}>
        <input id="wc-input" ref={input} value={text} onChange={e => setText(e.target.value)} maxLength={30}
          placeholder={need ? `Word starting with ${need.toUpperCase()}` : 'Type any word'}
          autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck="false" />
        <button className="btn btn-primary" disabled={clean.length < 2 || wrongStart}>Play</button>
      </div>
      <p className={`composer-hint${wrongStart ? ' invalid' : ''}`}>{wrongStart ? `Must start with ${need.toUpperCase()}` : 'Real English words only. No repeats.'}</p>
    </motion.form>
  );
}
