import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { IMPOSTER_CATEGORIES } from '../../shared/imposterWords.js';
import { pickSecret } from '../../shared/games.js';
import { SecretCard } from '../games/Imposter.jsx';
import { Segmented, Stepper } from '../components/Controls.jsx';
import { Icon } from '../components/Icon.jsx';
import { ask } from '../lib/confirm.js';

// Imposter on one phone, passed round the table. Nothing goes to the server: the phone deals
// the cards, runs the timer and reveals the Imposter. Clues and the vote happen out loud.
const KEY = 'playroom-pass-names';
const loadNames = () => { try { const n = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(n) && n.length >= 3) return n; } catch {} return ['Player 1', 'Player 2', 'Player 3', 'Player 4']; };
const saveNames = n => { try { localStorage.setItem(KEY, JSON.stringify(n)); } catch {} };
const pick = n => Math.floor(Math.random() * n);

export function PassPlay() {
  const [names, setNames] = useState(loadNames);
  const [opts, setOpts] = useState({ imposters: 1, category: 0, hint: 1, minutes: 3 });
  const [game, setGame] = useState(null); // { word, category, imposters:[i], starter, step, seen }

  function deal() {
    const clean = names.map((n, i) => n.trim() || `Player ${i + 1}`);
    saveNames(clean);
    const order = [...clean.keys()].sort(() => Math.random() - 0.5);
    const secret = pickSecret(opts.category);
    setNames(clean);
    setGame({ ...secret, imposters: order.slice(0, Math.min(opts.imposters, clean.length - 2)), starter: pick(clean.length), turn: 0, shown: false, phase: 'cards' });
  }
  async function quit() {
    if (game && !(await ask({ title: 'Leave this game?', body: 'The cards will be dealt again next time.', confirm: 'Leave' }))) return;
    location.hash = '';
  }

  return (
    <div className="pass">
      <div className="room-bar">
        <button className="icon-btn" onClick={quit} aria-label="Back to games"><Icon name="back" /></button>
        <div className="room-bar-title"><b>Imposter</b><span>One phone · pass it round</span></div>
      </div>
      <AnimatePresence mode="wait">
        {!game && <Setup key="setup" names={names} setNames={setNames} opts={opts} setOpts={setOpts} onStart={deal} />}
        {game && game.phase === 'cards' && <Cards key={'cards' + game.turn} game={game} setGame={setGame} names={names} opts={opts} />}
        {game && game.phase === 'talk' && <Talk key="talk" game={game} setGame={setGame} names={names} minutes={opts.minutes} />}
        {game && game.phase === 'reveal' && <Reveal key="reveal" game={game} names={names} onAgain={deal} onChange={() => setGame(null)} />}
      </AnimatePresence>
    </div>
  );
}

const Fade = ({ children, className = '' }) => (
  <motion.div className={`pass-step ${className}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>{children}</motion.div>
);

function Setup({ names, setNames, opts, setOpts, onStart }) {
  const set = (i, v) => setNames(n => n.map((x, j) => (j === i ? v : x)));
  const canTwo = names.length >= 5;
  useEffect(() => { if (!canTwo && opts.imposters > 1) setOpts(o => ({ ...o, imposters: 1 })); }, [canTwo]);
  return (
    <Fade>
      <section className="card pass-card">
        <h2 className="h-section">Players</h2>
        <p className="muted">Sit in a circle. The phone goes round in this order.</p>
        <ol className="pass-names">
          {names.map((n, i) => (
            <li key={i}>
              <span className="pass-num">{i + 1}</span>
              <label className="sr-only" htmlFor={`pn-${i}`}>Player {i + 1} name</label>
              <input id={`pn-${i}`} className="input" value={n} maxLength={16} onChange={e => set(i, e.target.value)} onFocus={e => e.target.select()} />
              <button type="button" className="icon-btn" aria-label={`Remove ${n || 'player'}`} disabled={names.length <= 3}
                onClick={() => setNames(list => list.filter((_, j) => j !== i))}><Icon name="close" size={18} /></button>
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn-secondary btn-block" disabled={names.length >= 12}
          onClick={() => setNames(list => [...list, `Player ${list.length + 1}`])}><Icon name="plus" size={18} /> Add player</button>
      </section>

      <section className="card pass-card">
        <h2 className="h-section">Settings</h2>
        <div className="setting-row">
          <div className="setting-label"><b>Imposters</b><span>{canTwo ? 'Two needs 5+ players' : 'Add players for two'}</span></div>
          <Segmented id="pp-imp" label="Imposters" value={opts.imposters} onChange={v => setOpts(o => ({ ...o, imposters: v }))}
            options={[{ value: 1, label: '1' }, ...(canTwo ? [{ value: 2, label: '2' }] : [])]} />
        </div>
        <div className="setting-row">
          <div className="setting-label"><b>Category</b><span>Where the secret word comes from</span></div>
          <select className="input select" value={opts.category} onChange={e => setOpts(o => ({ ...o, category: +e.target.value }))} aria-label="Category">
            <option value={0}>Mixed</option>
            {IMPOSTER_CATEGORIES.map((c, i) => <option key={c.name} value={i + 1}>{c.name}</option>)}
          </select>
        </div>
        <div className="setting-row">
          <div className="setting-label"><b>Imposter hint</b><span>Imposter sees the category</span></div>
          <Segmented id="pp-hint" label="Imposter hint" value={opts.hint} onChange={v => setOpts(o => ({ ...o, hint: v }))}
            options={[{ value: 0, label: 'Off' }, { value: 1, label: 'On' }]} />
        </div>
        <div className="setting-row">
          <div className="setting-label"><b>Timer</b><span>For clues and discussion</span></div>
          <Stepper label="minutes" value={opts.minutes} min={1} max={10} onChange={v => setOpts(o => ({ ...o, minutes: v }))} format={v => `${v} min`} />
        </div>
      </section>
      <button className="btn btn-primary btn-block btn-lg" onClick={onStart}>Deal the cards</button>
    </Fade>
  );
}

function Cards({ game, setGame, names, opts }) {
  const i = game.turn;
  const imp = game.imposters.includes(i);
  const last = i === names.length - 1;
  const next = () => setGame(g => (last ? { ...g, phase: 'talk', shown: false } : { ...g, turn: g.turn + 1, shown: false }));
  const partners = imp ? game.imposters.filter(x => x !== i).map(x => names[x]) : [];
  return (
    <Fade className="pass-center">
      <span className="kicker">Card {i + 1} of {names.length}</span>
      <h1 className="h-page">{game.shown ? names[i] : `Pass the phone to ${names[i]}`}</h1>
      {!game.shown ? (
        <>
          <p className="muted">Only {names[i]} should look at the next screen.</p>
          <button className="btn btn-primary btn-lg" onClick={() => setGame(g => ({ ...g, shown: true }))}>I’m {names[i]}, show my card</button>
        </>
      ) : (
        <>
          <SecretCard big shown role={imp ? 'imposter' : 'crew'} word={game.word} category={!imp || opts.hint ? game.category : null}
            partners={partners} onToggle={() => {}} />
          <button className="btn btn-primary btn-lg" onClick={next}>{last ? 'Hide card and start' : `Hide card and pass to ${names[i + 1]}`}</button>
        </>
      )}
    </Fade>
  );
}

function Talk({ game, setGame, names, minutes }) {
  const [left, setLeft] = useState(minutes * 60);
  const [running, setRunning] = useState(true);
  useEffect(() => {
    if (!running || left <= 0) return;
    const t = setTimeout(() => setLeft(l => l - 1), 1000);
    return () => clearTimeout(t);
  }, [running, left]);
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
  return (
    <Fade className="pass-center">
      <span className="kicker">Everyone has seen their card</span>
      <h1 className="h-page">{names[game.starter]} starts</h1>
      <p className="muted pass-rules">Go round the circle. Each person says <b>one word</b> about the secret word. Go round again if you like, then talk it over and point at who you think the Imposter is.</p>
      <div className={`pass-timer${left <= 10 ? ' urgent' : ''}`} role="timer" aria-live="off">{mm}:{ss}</div>
      <div className="row">
        <button className="btn btn-secondary" onClick={() => setRunning(r => !r)} disabled={left <= 0}>{running ? 'Pause' : 'Resume'}</button>
        <button className="btn btn-secondary" onClick={() => { setLeft(minutes * 60); setRunning(true); }}>Restart timer</button>
      </div>
      <button className="btn btn-danger btn-lg" onClick={() => setGame(g => ({ ...g, phase: 'reveal' }))}>Votes are in: reveal the Imposter</button>
    </Fade>
  );
}

function Reveal({ game, names, onAgain, onChange }) {
  return (
    <Fade className="pass-center">
      <span className="kicker">The Imposter{game.imposters.length > 1 ? 's were' : ' was'}</span>
      <h1 className="h-display pass-imp">{game.imposters.map(i => names[i]).join(' & ')}</h1>
      <div className="pass-word"><small>The secret word</small><b>{game.word}</b><span>{game.category}</span></div>
      <p className="muted">Did you catch them? If the Imposter can now say the secret word, they still win.</p>
      <button className="btn btn-primary btn-lg" onClick={onAgain}>Play again, new word</button>
      <button className="btn btn-quiet" onClick={onChange}>Change players or settings</button>
    </Fade>
  );
}
