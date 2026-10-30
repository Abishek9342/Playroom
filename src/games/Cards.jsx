import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { handPoints, validDrop } from '../../shared/fivecards.js';
import { ask } from '../lib/confirm.js';
import { PlayingCard, CardBack, cardLabel } from '../components/PlayingCard.jsx';
import { Icon } from '../components/Icon.jsx';
import { Avatar } from '../components/Avatar.jsx';

// Phones get the card table in landscape, like a real card-room app. In portrait we ask
// them to turn the phone (and offer full screen + orientation lock where the browser
// allows it, which is Android Chrome; iPhones just need rotation lock off).
const isPhone = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
const PORTRAIT_OK = 'playroom-portrait-ok';
function useOrientation() {
  const q = typeof matchMedia === 'function' ? matchMedia('(orientation: portrait)') : null;
  const [portrait, setPortrait] = useState(() => !!(q && q.matches));
  useEffect(() => {
    if (!q) return;
    const f = () => setPortrait(q.matches);
    q.addEventListener ? q.addEventListener('change', f) : q.addListener(f);
    return () => (q.removeEventListener ? q.removeEventListener('change', f) : q.removeListener(f));
  }, []);
  return portrait;
}
const canLock = () => !!(document.documentElement.requestFullscreen && screen.orientation && screen.orientation.lock);
async function goLandscape() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    await screen.orientation.lock('landscape');
  } catch { /* not allowed here: the prompt stays, the player turns the phone by hand */ }
}

function RotatePrompt({ onDismiss }) {
  return (
    <motion.div className="rotate-prompt" role="dialog" aria-modal="true" aria-label="Turn your phone sideways"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="rotate-phone" aria-hidden="true"><span /></div>
      <h2>Turn your phone sideways</h2>
      <p>5 Cards plays on a full table in landscape, like a real card room.</p>
      {canLock() && <button className="btn btn-primary" onClick={goLandscape}><Icon name="rotate" size={18} /> Play full screen</button>}
      {!canLock() && <p className="rotate-small">If the screen doesn’t turn, switch off rotation lock.</p>}
      <button className="btn btn-quiet" onClick={onDismiss}>Keep playing upright</button>
    </motion.div>
  );
}

export function Cards({ state, send, now }) {
  const g = state.g;
  const me = state.players.find(p => p.id === state.you);
  const alive = state.status === 'playing' && me && me.alive;
  const myTurn = alive && g.turn === state.you;
  const [sel, setSel] = useState([]);
  const name = id => (id === state.you ? 'You' : (state.players.find(p => p.id === id) || {}).name || '');

  useEffect(() => { setSel([]); }, [g.turn, g.round, g.phase]);
  const portrait = useOrientation();
  const [upright, setUpright] = useState(() => { try { return sessionStorage.getItem(PORTRAIT_OK) === '1'; } catch { return false; } });
  const askRotate = portrait && !upright && state.status === 'playing' && isPhone();
  const keepUpright = () => { setUpright(true); try { sessionStorage.setItem(PORTRAIT_OK, '1'); } catch {} };
  const progress = id => (g.turn === id && g.phase !== 'roundover' && state.status === 'playing'
    ? Math.max(0, Math.min(1, (g.deadline - now) / (g.turnMs || 30000))) : null);
  const selValid = useMemo(() => validDrop(sel), [sel]);
  const toggle = c => setSel(s => (s.includes(c) ? s.filter(x => x !== c) : [...s, c]));
  const secs = Math.max(0, Math.ceil((g.deadline - now) / 1000));
  const canDrop = myTurn && g.phase === 'drop';
  const canPick = myTurn && g.phase === 'pick';
  const owner = g.openDrop.by ? name(g.openDrop.by) : null;

  const status = g.phase === 'roundover' ? null
    : canDrop ? { title: 'Your turn', text: 'Drop one card or one set, or Show.' }
    : canPick ? { title: 'Pick a card', text: 'Draw from the pile, or take one from the last drop.' }
    : { title: `${name(g.turn)}’s turn`, text: g.phase === 'pick' ? 'Picking a card…' : 'Thinking…' };

  async function show() {
    const ok = await ask({
      title: `Show with ${g.myPoints} ${g.myPoints === 1 ? 'point' : 'points'}?`,
      body: 'Everyone reveals their hand. If anyone has equal or fewer points, it’s an invalid show and you get +50.',
      confirm: 'Show', danger: true,
    });
    if (ok) send({ type: 'move', move: { type: 'show' } });
  }

  return (
    <div className="fc">
      <AnimatePresence>{askRotate && <RotatePrompt key="rotate" onDismiss={keepUpright} />}</AnimatePresence>
      <div className="fc-meta">
        <span className="chip"><Icon name="layers" size={14} /> Round {g.round}</span>
        <span className="chip">{g.decks} {g.decks > 1 ? 'decks' : 'deck'}</span>
        <span className="chip"><Icon name="flag" size={14} /> Exit at {g.threshold}</span>
      </div>

      <div className="felt">
        {g.phase !== 'roundover' && (
          <div className="fc-seats" role="list" aria-label="Players">
            {state.players.map((p, i) => (
              <div key={p.id} role="listitem" className={`fc-seat${p.id === state.you ? ' me' : ''}`}>
                <Avatar player={p} you={p.id === state.you} size={30} progress={progress(p.id)} score={g.totals ? g.totals[p.id] : undefined} />
                {p.alive && g.counts && g.counts[p.id] !== undefined && p.id !== state.you && (
                  <span className="fc-count" aria-label={`${g.counts[p.id]} cards`}>
                    {Array.from({ length: Math.min(g.counts[p.id], 6) }, (_, k) => <i key={k} />)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        <AnimatePresence mode="wait">
          {g.phase === 'roundover' && g.last ? (
            <RoundResult key={'r' + g.last.round} last={g.last} name={name} secs={secs} />
          ) : (
            <motion.div key={'t' + g.round} className="felt-piles" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="pile">
                <button className={`deck${canPick ? ' live' : ''}`} disabled={!canPick || g.drawCount === 0}
                  onClick={() => send({ type: 'move', move: { type: 'pick', from: 'draw' } })} aria-label={`Draw a card. ${g.drawCount} left in the pile.`}>
                  <CardBack className="d3" /><CardBack className="d2" /><CardBack className="d1" />
                </button>
                <span className="pile-label">Draw pile · {g.drawCount}</span>
              </div>
              <div className="pile">
                <div className="drop">
                  <AnimatePresence initial={false}>
                    {g.openDrop.cards.map((c, i) => (
                      <motion.button key={c} className={`drop-card${canPick ? ' live' : ''}`} disabled={!canPick}
                        style={{ zIndex: i }} initial={{ y: -40, opacity: 0, rotate: 8 }} animate={{ y: 0, opacity: 1, rotate: (i - (g.openDrop.cards.length - 1) / 2) * 5 }}
                        exit={{ opacity: 0, scale: 0.9 }} whileHover={canPick ? { y: -8 } : undefined}
                        transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                        onClick={() => send({ type: 'move', move: { type: 'pick', from: 'drop', card: c } })}>
                        <PlayingCard c={c} />
                      </motion.button>
                    ))}
                  </AnimatePresence>
                </div>
                <span className="pile-label">{owner ? (owner === 'You' ? 'Your last drop' : `${owner}’s drop`) : 'Opening card'}</span>
              </div>
              {g.pending && g.pending.length > 0 && (
                <div className="pile pile-pending">
                  <div className="drop">
                    {g.pending.map((c, i) => <PlayingCard key={c} c={c} size="sm" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1, rotate: (i - (g.pending.length - 1) / 2) * 5 }} />)}
                  </div>
                  <span className="pile-label">{name(g.turn) === 'You' ? 'You dropped' : `${name(g.turn)} dropped`}</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence mode="wait">
          {g.phase !== 'roundover' && g.lastPick && <PickNote key={g.lastPick.turnNo} pick={g.lastPick} name={name} />}
        </AnimatePresence>
      </div>

      {status && (
        <div className={`turn-banner${myTurn ? ' mine' : ''}`} aria-live="polite">
          <b>{status.title} <span className={`secs${secs <= 5 ? ' urgent' : ''}`}>· {secs}s</span></b><span>{status.text}</span>
        </div>
      )}

      {g.hand.length > 0 && g.phase !== 'roundover' && (
        <section className="hand-area" aria-label="Your hand">
          <div className="hand-head">
            <span className="kicker">Your hand</span>
            <span className="hand-points"><b>{g.myPoints}</b> {g.myPoints === 1 ? 'point' : 'points'}</span>
          </div>
          <div className="hand">
            {g.hand.map((c, i) => {
              const picked = sel.includes(c);
              return (
                <motion.button key={c} className={`hand-card${picked ? ' picked' : ''}`} disabled={!canDrop} aria-pressed={picked}
                  onClick={() => toggle(c)} layout
                  initial={{ y: 60, opacity: 0 }} animate={{ y: picked ? -18 : 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 30, delay: picked ? 0 : i * 0.03 }}>
                  <PlayingCard c={c} size="lg" />
                </motion.button>
              );
            })}
          </div>
          {canDrop && (
            <div className="action-bar">
              <button className="btn btn-primary" disabled={!selValid}
                onClick={() => send({ type: 'move', move: { type: 'drop', cards: sel } })}>
                {sel.length === 0 ? 'Select cards to drop' : selValid ? `Drop ${sel.length === 1 ? '1 card' : sel.length + ' cards'} · −${handPoints(sel)}` : 'Not a valid drop'}
              </button>
              <button className="btn btn-danger" onClick={show}>Show</button>
            </div>
          )}
          {canDrop && sel.length > 1 && !selValid && (
            <p className="hint">Drop one card, or one set: a pair, 3 or 4 of a kind, or a run of 3+ in one suit. Only one set per turn.</p>
          )}
        </section>
      )}
    </div>
  );
}

// What the previous player picked up. A card taken from a drop was face up, so everyone
// sees it; a card from the draw pile stays hidden.
function PickNote({ pick, name }) {
  const who = name(pick.by);
  const from = pick.owner == null ? 'the opening card' : pick.owner === pick.by ? 'their own drop' : name(pick.owner) === 'You' ? 'your drop' : `${name(pick.owner)}’s drop`;
  const text = pick.from === 'drop'
    ? `${who} took ${cardLabel(pick.card)} from ${from}`
    : `${who} drew from the pile`;
  return (
    <motion.div className={`pick-note${pick.from === 'drop' ? ' took' : ''}`} role="status" aria-live="polite"
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
      {pick.from === 'drop' ? <PlayingCard c={pick.card} size="sm" /> : <CardBack size="sm" />}
      <span>{text}</span>
    </motion.div>
  );
}

function RoundResult({ last, name, secs }) {
  const ids = Object.keys(last.hands).sort((a, b) => last.points[a] - last.points[b]);
  return (
    <motion.div className="round-result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <div className={`verdict ${last.good ? 'ok' : 'bad'}`}>
        <Icon name={last.good ? 'check' : 'close'} size={18} />
        {last.good ? `Valid show by ${name(last.caller)}` : `Invalid show by ${name(last.caller)} · +50`}
      </div>
      <div className="rr-table" role="table" aria-label={`Round ${last.round} results`}>
        <div className="rr-row rr-head" role="row"><span role="columnheader">Player</span><span role="columnheader">Hand</span><span role="columnheader">Pts</span><span role="columnheader">+</span><span role="columnheader">Total</span></div>
        {ids.map((id, row) => (
          <div key={id} role="row" className={`rr-row${id === last.caller ? ' caller' : ''}`}>
            <span className="rr-name" role="cell">{name(id)}</span>
            <span className="rr-cards" role="cell">
              {last.hands[id].map((c, i) => (
                <motion.span key={c} className="flip" initial={{ rotateY: 180 }} animate={{ rotateY: 0 }}
                  transition={{ delay: 0.15 + row * 0.12 + i * 0.04, type: 'spring', stiffness: 240, damping: 22 }}>
                  <PlayingCard c={c} size="sm" /><CardBack size="sm" className="flip-back" />
                </motion.span>
              ))}
            </span>
            <span role="cell" className="num">{last.points[id]}</span>
            <span role="cell" className={`num${last.added[id] ? ' plus' : ''}`}>{last.added[id] ? `+${last.added[id]}` : '0'}</span>
            <b role="cell" className="num">{last.totals[id]}</b>
          </div>
        ))}
      </div>
      <p className="pile-label">Next round in {secs}s</p>
    </motion.div>
  );
}
