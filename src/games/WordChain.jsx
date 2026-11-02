import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useAnimate } from 'motion/react';
import { colorFor } from '../lib/meta.js';
import { WC_POINTS, WC_TURN_MS, wordPoints } from '../../shared/games.js';

// the speed ladder shown while it's your turn: 5 / 3 / 2 / 1 points
const TIERS = [...WC_POINTS.map(([ms, pts]) => ({ pts, label: `${ms / 1000} s` })), { pts: 1, label: `${WC_TURN_MS / 1000} s` }];

export function WordChain({ state, send, error, now }) {
  const g = state.g;
  const me = state.players.find(p => p.id === state.you);
  const myTurn = state.status === 'playing' && me && me.alive && g.turn === state.you;
  const listRef = useRef(null);
  const name = id => (id === state.you ? 'You' : (state.players.find(p => p.id === id) || {}).name || '');

  const total = g.total ?? g.words.length;
  useEffect(() => { const el = listRef.current; if (el && el.scrollTo) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }, [total]);

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
          {g.scores && <div><b>{g.scores[state.you] || 0}<small>/{g.target || 250}</small></b><span>your points</span></div>}
          <div><b>{total}</b><span>{total === 1 ? 'word' : 'words'}</span></div>
        </div>
      </div>

      <div className="wc-chain card" ref={listRef} role="list" aria-label="Words played">
        {g.set > 1 && (
          <div className="wc-set">
            <span>Set {g.set}</span>
            <span>{total - g.words.length} earlier {total - g.words.length === 1 ? 'word' : 'words'} hidden. They still can’t be repeated.</span>
          </div>
        )}
        {g.prev && (
          <div className="wc-row wc-prev" role="listitem">
            <span className="wc-who"><i style={{ background: colorFor(g.prev.by) }} />{name(g.prev.by)}</span>
            <span className="wc-tiles">{g.prev.w.split('').map((c, j) => <span key={j} className={`lt${j === g.prev.w.length - 1 ? ' hot' : ''}`}>{c}</span>)}</span>
          </div>
        )}
        {total === 0 && <p className="muted wc-empty">No words yet. {g.turn === state.you ? 'You start, so any word works.' : `${name(g.turn)} starts.`}</p>}
        <AnimatePresence initial={false}>
          {g.words.map((w, i) => (
            <motion.div key={w.w} role="listitem" className="wc-row" layout
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
              <span className="wc-who"><i style={{ background: colorFor(w.by) }} />{name(w.by)}</span>
              <span className="wc-tiles">
                {w.w.split('').map((c, j) => (
                  <motion.span key={j} className={`lt${(i > 0 || g.set > 1) && j === 0 || j === w.w.length - 1 ? ' hot' : ''}`}
                    initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: j * 0.025 }}>{c}</motion.span>
                ))}
              </span>
              {w.pts != null && <span className={`wc-pts p${w.pts}`} title={`${w.secs} s`}>+{w.pts}</span>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>{myTurn && <Composer key={`c${total}`} need={g.need} send={send} error={error}
        elapsed={g.turnStart ? Math.max(0, now - g.turnStart) : 0} />}</AnimatePresence>
      {!myTurn && state.status === 'playing' && me && me.alive && <p className="wc-wait muted">Waiting for {name(g.turn)}…</p>}
    </div>
  );
}

function Composer({ need, send, error, elapsed }) {
  const worth = wordPoints(elapsed);
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
      <div className="wc-ladder" aria-label={`A valid word now scores ${worth} ${worth === 1 ? 'point' : 'points'}`}>
        {TIERS.map(t => <span key={t.label} className={`wc-tier${t.pts === worth ? ' now' : ''}${t.pts > worth ? ' gone' : ''}`}><b>+{t.pts}</b> within {t.label}</span>)}
      </div>
      <p className={`composer-hint${wrongStart ? ' invalid' : ''}`}>{wrongStart ? `Must start with ${need.toUpperCase()}` : 'Real English words only. No repeats. Faster answers score more.'}</p>
    </motion.form>
  );
}
