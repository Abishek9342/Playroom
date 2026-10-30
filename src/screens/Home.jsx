import { useState } from 'react';
import { motion } from 'motion/react';
import { api, DEMO } from '../lib/api.js';
import { GAMES, OPTIONS, defaultOptions } from '../lib/meta.js';
import { toast } from '../lib/toast.js';
import { TokenInput } from '../components/TokenInput.jsx';
import { GameArt } from '../components/GameArt.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { Stepper, Segmented } from '../components/Controls.jsx';
import { Icon } from '../components/Icon.jsx';
import { GuideBody } from '../components/Guide.jsx';

export function practiceHash(game, players, options = {}) {
  let h = `practice-${game}-${players}`;
  if (options.decks) h += `-d${options.decks}`;
  if (options.exitAt) h += `-e${options.exitAt}`;
  if (options.board) h += `-b${options.board}`;
  if (options.bestOf) h += `-o${options.bestOf}`;
  return h;
}

export function Home({ user }) {
  const [token, setToken] = useState('');
  const [open, setOpen] = useState(null);
  const [guide, setGuide] = useState(false);
  const guest = !!user && user.guest;

  async function join() {
    if (!/^[A-Z2-9]{6}$/.test(token)) return toast('Room codes are 6 letters and numbers.');
    try {
      const info = await api('/api/rooms/' + token);
      if (!info.exists) return toast('No room with that code. Check it with your host.');
      if (!info.member && info.status !== 'waiting') return toast('That game has already started.');
      if (!info.member && info.joined >= info.size) return toast('That room is full.');
      location.hash = 'room-' + token;
    } catch (err) { toast(err.message); }
  }

  return (
    <div className="home">
      <header className="page-head">
        <p className="kicker">{DEMO ? 'Preview' : user ? `Signed in as ${user.name}${guest ? ' (guest)' : ''}` : 'Practice mode'}</p>
        <h1 className="h-page">Play</h1>
      </header>

      {!DEMO && user && (
        <section className="card join-card">
          <div>
            <h2 className="h-section">Join a game</h2>
            <p className="muted">Enter the code your host shared.</p>
          </div>
          <div className="join-row">
            <TokenInput value={token} onChange={setToken} onSubmit={join} />
            <button className="btn btn-primary" onClick={join} disabled={token.length !== 6}>Join</button>
          </div>
        </section>
      )}

      <section>
        <div className="section-head">
          <h2 className="h-section">{DEMO || !user || guest ? 'Practice with bots' : 'Host a game'}</h2>
          {DEMO && <p className="muted">Preview build: every game runs against bots in your browser.</p>}
        </div>
        <motion.div className="game-grid" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }}>
          {Object.entries(GAMES).map(([k, g]) => (
            <motion.button key={k} className="game-card" onClick={() => setOpen(k)}
              variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }} whileTap={{ scale: 0.985 }}>
              <div className="game-card-art"><GameArt kind={k} /></div>
              <div className="game-card-body">
                <div className="game-card-top"><h3>{g.name}</h3><span className="tag">{g.kind}</span></div>
                <p>{g.tagline}</p>
                <div className="game-card-meta">
                  <span><Icon name="users" size={15} /> {g.min === g.max ? g.min : `${g.min}–${g.max}`} players</span>
                  <span><Icon name="clock" size={15} /> {g.time}</span>
                </div>
              </div>
            </motion.button>
          ))}
        </motion.div>
      </section>

      <Sheet open={!!open} onClose={() => { setOpen(null); setGuide(false); }} title={open ? (guide ? `How to play ${GAMES[open].name}` : GAMES[open].name) : ''}>
        {open && guide && (
          <>
            <GuideBody game={open} />
            <button className="btn btn-primary btn-block guide-back" onClick={() => setGuide(false)}><Icon name="back" size={18} /> Back to settings</button>
          </>
        )}
        {/* stays mounted while the guide is open, so the chosen settings survive */}
        {open && <div hidden={guide}><Settings key={open} game={open} canHost={!DEMO && !!user && !guest} guest={guest} onGuide={() => setGuide(true)} onClose={() => setOpen(null)} /></div>}
      </Sheet>
    </div>
  );
}

function Settings({ game, canHost, guest, onGuide, onClose }) {
  const g = GAMES[game];
  const [players, setPlayers] = useState(g.min);
  const [opts, setOpts] = useState(() => defaultOptions(game, g.min));
  const [decksTouched, setDecksTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const spec = OPTIONS[game] || {};

  const changePlayers = n => {
    setPlayers(n);
    if (!decksTouched && spec.decks) setOpts(o => ({ ...o, decks: defaultOptions(game, n).decks }));
  };
  async function create() {
    setBusy(true);
    try {
      const { token } = await api('/api/rooms', { game, players, options: opts });
      onClose();
      location.hash = 'room-' + token;
    } catch (err) { toast(err.message); setBusy(false); }
  }
  const practice = () => { onClose(); location.hash = practiceHash(game, players, opts); };

  return (
    <div className="settings">
      <div className="settings-intro">
        <p className="muted">{g.tagline}</p>
        <button className="btn btn-secondary btn-sm" onClick={onGuide}><Icon name="help" size={16} /> How to play</button>
      </div>
      <div className="setting-row">
        <div className="setting-label"><b>Players</b><span>{g.min === g.max ? 'Always 2' : `${g.min} to ${g.max}`}</span></div>
        {g.min === g.max ? <span className="setting-fixed">2</span> : <Stepper label="players" value={players} min={g.min} max={g.max} onChange={changePlayers} />}
      </div>
      {spec.board && (
        <div className="setting-row">
          <div className="setting-label"><b>Board</b><span>{opts.board === 5 ? 'Five in a row wins' : 'Three in a row wins'}</span></div>
          <Segmented id="board" label="Board size" value={opts.board} onChange={v => setOpts(o => ({ ...o, board: v }))}
            options={[3, 5].map(v => ({ value: v, label: `${v}×${v}` }))} />
        </div>
      )}
      {spec.bestOf && (
        <div className="setting-row">
          <div className="setting-label"><b>Match</b><span>{opts.bestOf > 1 ? `${opts.bestOf} rounds, most wins takes it` : 'One game decides it'}</span></div>
          <Segmented id="bestOf" label="Best of" value={opts.bestOf} onChange={v => setOpts(o => ({ ...o, bestOf: v }))}
            options={[{ value: 1, label: 'Single' }, { value: 3, label: 'Best of 3' }, { value: 5, label: 'Best of 5' }]} />
        </div>
      )}
      {spec.decks && (
        <div className="setting-row">
          <div className="setting-label"><b>Decks</b><span>52 cards + 3 jokers each</span></div>
          <Segmented id="decks" label="Decks" value={opts.decks} onChange={v => { setDecksTouched(true); setOpts(o => ({ ...o, decks: v })); }}
            options={[1, 2, 3].map(v => ({ value: v, label: String(v) }))} />
        </div>
      )}
      {spec.exitAt && (
        <div className="setting-row">
          <div className="setting-label"><b>Exit point</b><span>Reach this total and you’re out</span></div>
          <Stepper label="exit point" value={opts.exitAt} min={spec.exitAt.min} max={spec.exitAt.max} step={spec.exitAt.step} onChange={v => setOpts(o => ({ ...o, exitAt: v }))} />
        </div>
      )}
      <div className="settings-actions">
        {canHost && <button className="btn btn-primary btn-block" onClick={create} disabled={busy}>{busy ? 'Creating room…' : 'Create room'}</button>}
        {guest && <p className="note"><Icon name="info" size={16} /> You’re playing as a guest. To host a room, sign out and create a free account.</p>}
        <button className={`btn ${canHost ? 'btn-secondary' : 'btn-primary'} btn-block`} onClick={practice}>
          <Icon name="bot" size={18} /> Practice with bots
        </button>
      </div>
    </div>
  );
}
