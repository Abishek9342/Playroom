import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { api, DEMO } from '../lib/api.js';
import { GAMES, describeOptions } from '../lib/meta.js';
import { toast } from '../lib/toast.js';
import { ask } from '../lib/confirm.js';
import { useRemoteRoom, useLocalRoom } from '../lib/useRoom.js';
import { useNow } from '../lib/useNow.js';
import { Avatar } from '../components/Avatar.jsx';
import { Icon } from '../components/Icon.jsx';
import { Confetti } from '../components/Confetti.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { GuideBody } from '../components/Guide.jsx';
import { copyText } from '../lib/clipboard.js';
import { buzz, vibrateOn, setVibrate, onVibrate } from '../lib/haptics.js';
import { VoiceContext, VoiceDock, useVoice, useReactions } from '../components/VoiceDock.jsx';
import { drawWinCard, shareWinCard } from '../lib/winCard.js';
import { TURN_MS } from '../../shared/games.js';
import { WordChain } from '../games/WordChain.jsx';
import { XO } from '../games/XO.jsx';
import { Patches } from '../games/Patches.jsx';
import { Cards } from '../games/Cards.jsx';
import { Imposter } from '../games/Imposter.jsx';

const BOARDS = { wordchain: WordChain, xo: XO, patches: Patches, cards: Cards, imposter: Imposter };
const inviteLink = token => `${location.origin}${location.pathname}#join-${token}`;
async function copy(text, done, token) {
  if (await copyText(text)) toast(done);
  else toast(`Couldn’t copy on this browser. Press and hold the code to select it: ${token}`);
}

const LEAVE = { title: 'Leave this game?', body: 'You’ll be out of this game and can’t rejoin it.', confirm: 'Leave game', danger: true };

export function RemoteRoom({ token }) {
  const room = useRemoteRoom(token);
  return <Table {...room} practice={false} />;
}
export function PracticeRoom({ game, size, name, options }) {
  const room = useLocalRoom(game, size, name, options);
  return <Table {...room} practice />;
}

function Table({ state, send, fatal, error, offset, practice, subscribeRtc, subscribeReact }) {
  const lastErr = useRef(0);
  const voice = useVoice(practice ? null : state, send, practice ? null : subscribeRtc);
  const reactions = useReactions(practice ? null : subscribeReact);
  const ctxValue = { ...voice.snap, reactions };
  const [guide, setGuide] = useState(false);
  useEffect(() => { if (error && error.n !== lastErr.current) { lastErr.current = error.n; toast(error.message); } }, [error]);

  if (fatal) return (
    <div className="empty-state">
      <Icon name="wifi" size={32} />
      <h1 className="h-page">Can’t open this room</h1>
      <p className="muted">{fatal}</p>
      <button className="btn btn-primary" onClick={() => { location.hash = ''; }}>Back to games</button>
    </div>
  );
  if (!state) return <div className="empty-state"><span className="spinner" aria-label="Connecting" /><p className="muted">Connecting to the room…</p></div>;

  const g = GAMES[state.game];
  const me = state.players.find(p => p.id === state.you);
  const playing = state.status === 'playing' && me && me.alive;

  async function back() {
    if (playing && !(await ask(LEAVE))) return;
    location.hash = '';
  }

  return (
    <VoiceContext.Provider value={ctxValue}>
    <div className={`room room-${state.game}${state.status === 'waiting' ? '' : ' in-game'}`}>
      <div className="room-bar">
        <button className="icon-btn" onClick={back} aria-label="Back to games"><Icon name="back" /></button>
        <div className="room-bar-title">
          <b>{g.name}</b>
          <span>{[practice ? 'Practice' : null, ...describeOptions(state.game, state.size, state.options)].filter(Boolean).join(' · ')}</span>
        </div>
        {!practice && (
          <button className="code-pill" onClick={() => copy(state.token, `Code ${state.token} copied.`, state.token)} aria-label={`Room code ${state.token}. Tap to copy.`}>
            <span>{state.token}</span><Icon name="copy" size={15} />
          </button>
        )}
        <button className="icon-btn" onClick={() => setGuide(true)} aria-label={`How to play ${g.name}`}><Icon name="help" /></button>
        {state.status === 'playing' && me && me.alive && (
          <button className="btn btn-quiet btn-sm" onClick={async () => { if (await ask(LEAVE)) send({ type: 'leave' }); }}>Leave</button>
        )}
      </div>
      <Sheet open={guide} onClose={() => setGuide(false)} title={`How to play ${g.name}`}>
        <VibrateSwitch />
        <GuideBody game={state.game} />
        <button className="btn btn-primary btn-block guide-back" onClick={() => setGuide(false)}>Got it</button>
      </Sheet>
      <AnimatePresence mode="wait">
        {state.status === 'waiting'
          ? <Lobby key="lobby" state={state} practice={practice} />
          : <Game key="game" state={state} send={send} offset={offset} error={error} practice={practice} />}
      </AnimatePresence>
      {!practice && <VoiceDock state={state} snap={voice.snap} mesh={voice.mesh} send={send} />}
    </div>
    </VoiceContext.Provider>
  );
}

/* ---------- lobby ---------- */
function Lobby({ state, practice }) {
  const seats = Array.from({ length: state.size }, (_, i) => state.players[i] || null);
  const link = inviteLink(state.token);
  // Share link: the phone's share sheet (WhatsApp, Telegram, SMS…); without one, WhatsApp directly
  const shareLink = async () => {
    const text = `Join my ${GAMES[state.game].name} game on Playroom! Room code: ${state.token}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Playroom', text, url: link }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text}
${link}`)}`, '_blank', 'noopener');
  };

  return (
    <motion.div className="lobby" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
      {!practice && (
        <section className="card code-card">
          <span className="kicker">Room code</span>
          <button className="code" onClick={() => copy(state.token, `Code ${state.token} copied.`, state.token)}
            aria-label={`Room code ${state.token.split('').join(' ')}. Tap to copy.`}>
            {state.token.split('').map((c, i) => (
              <motion.span key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}>{c}</motion.span>
            ))}
          </button>
          <span className="code-hint"><Icon name="copy" size={14} /> Tap the code to copy it</span>
          <p className="muted">Friends open Playroom, tap <b>Join a game</b>, and enter this code with their name. Or tap Share link to send it on WhatsApp: it fills the code in for them.</p>
          <div className="code-actions">
            <button className="btn btn-primary" onClick={shareLink}><Icon name="share" size={18} /> Share link</button>
            <button className="btn btn-secondary" onClick={() => copy(state.token, `Code ${state.token} copied.`, state.token)}><Icon name="copy" size={18} /> Copy code</button>
          </div>
        </section>
      )}

      <section className="card">
        <div className="list-head">
          <h2 className="h-section">Players</h2>
          <span className="count">{state.players.length} of {state.size}</span>
        </div>
        <ul className="seat-list">
          {seats.map((p, i) => (
            <li key={p ? p.id : 'empty' + i} className={p ? '' : 'empty'}>
              {p ? <>
                <Avatar player={p} you={p.id === state.you} size={36} compact />
                <span className="seat-name">{p.id === state.you ? `${p.name} (you)` : p.name}</span>
                {i === 0 && !practice && <span className="badge">Host</span>}
                {p.guest && <span className="badge badge-quiet">Guest</span>}
                {p.bot && <span className="badge badge-quiet">Bot</span>}
              </> : <>
                <span className="seat-dot" aria-hidden="true" />
                <span className="seat-name muted">Waiting for a player…</span>
              </>}
            </li>
          ))}
        </ul>
        <div className="chips">
          {describeOptions(state.game, state.size, state.options).map(t => <span key={t} className="chip">{t}</span>)}
        </div>
      </section>

      <p className="note"><Icon name="info" size={16} /> The game starts automatically when every seat is filled.{' '}
        {GAMES[state.game].strictPresence
          ? 'Once it starts, stay on this screen: switching apps or tabs for more than 3 seconds takes you out of the game.'
          : 'If you switch apps during the game you’ll show as Away; just come back to carry on.'}</p>
    </motion.div>
  );
}

/* ---------- game ---------- */
// Turn vibration on/off, shown in the in-game help sheet and the account sheet.
export function VibrateSwitch() {
  const [on, setOn] = useState(vibrateOn());
  useEffect(() => onVibrate(setOn), []);
  return (
    <div className="setting-row sound-row">
      <div className="setting-label"><b>Vibrate on my turn</b><span>A short buzz when it’s your move. No sounds.</span></div>
      <button type="button" role="switch" aria-checked={on} className={`switch${on ? ' on' : ''}`} onClick={() => setVibrate(!on)}><span /></button>
    </div>
  );
}

// 3, 2, 1, GO! when a game (or a rematch) starts.
function Countdown({ onDone }) {
  const [step, setStep] = useState(3);
  useEffect(() => {
    const t = setTimeout(() => (step > 0 ? setStep(step - 1) : onDone()), step > 0 ? 620 : 520);
    return () => clearTimeout(t);
  }, [step]);
  return (
    <motion.div className="countdown" role="status" aria-live="assertive" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
      <AnimatePresence mode="popLayout">
        <motion.span key={step} className={step ? 'cd-num' : 'cd-go'} initial={{ scale: 2.4, opacity: 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 22 }}>
          {step || 'GO!'}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );
}

function Game({ state, send, offset, error, practice }) {
  const now = useNow(offset, 100);
  const Board = BOARDS[state.game];
  const g = state.g || {};
  const me = state.players.find(p => p.id === state.you);
  const progress = id => {
    if (state.status !== 'playing' || !g.deadline || g.turn !== id) return null;
    return Math.max(0, Math.min(1, (g.deadline - now) / (g.turnMs || TURN_MS)));
  };
  const latest = state.events[state.events.length - 1];

  // game start countdown (first start and every rematch)
  const [counting, setCounting] = useState(false);
  const started = useRef(null);
  useEffect(() => {
    if (state.status !== 'playing') return;
    const key = state.match || 0;
    if (started.current === key) return;
    started.current = key;
    setCounting(true);
  }, [state.status, state.match]);

  // your turn: a short vibration and a glow round the screen (no sounds)
  const myTurn = state.status === 'playing' && !!me && me.alive && g.turn === state.you && g.phase !== 'roundover' && g.phase !== 'reveal';
  const [spot, setSpot] = useState(0);
  const wasMine = useRef(false);
  useEffect(() => {
    if (myTurn && !wasMine.current) { buzz([220, 90, 220]); setSpot(n => n + 1); }
    wasMine.current = myTurn;
  }, [myTurn, g.deadline]);
  const left = myTurn && g.deadline ? Math.ceil((g.deadline - now) / 1000) : 99;

  return (
    <motion.div className="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="players-strip" role="list" aria-label="Players">
        {state.players.map((p, i) => (
          <div role="listitem" key={p.id}>
            <Avatar player={p} you={p.id === state.you} host={i === 0 && !practice} size={44} progress={progress(p.id)}
              score={state.game === 'cards' && g.totals ? g.totals[p.id] : state.game === 'wordchain' && g.scores ? g.scores[p.id] : undefined} />
          </div>
        ))}
      </div>
      <div className="ticker" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          {latest && <motion.span key={latest.t + latest.text} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }}>{latest.text}</motion.span>}
        </AnimatePresence>
      </div>
      {me && !me.alive && state.status === 'playing' && (
        <div className="banner banner-danger" role="status"><Icon name="flag" size={18} /> You’re out: you {me.reason}. You can keep watching.</div>
      )}
      <Board state={state} send={send} now={now} error={error} />
      <AnimatePresence>{counting && <Countdown key="cd" onDone={() => setCounting(false)} />}</AnimatePresence>
      <AnimatePresence>{spot > 0 && myTurn && <motion.div key={'spot' + spot} className={`spotlight${left <= 5 ? ' urgent' : ''}`} aria-hidden="true"
        initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.55] }} exit={{ opacity: 0 }} transition={{ duration: 0.9 }} />}</AnimatePresence>
      <AnimatePresence>{state.status === 'over' && <Result key={'r' + (state.match || 0)} state={state} send={send} practice={practice} />}</AnimatePresence>
      {state.status === 'over' && <RematchRequest state={state} send={send} />}
    </motion.div>
  );
}

// When someone else asks for a rematch, everyone who hasn't answered gets a popup, even if
// they closed the results to look at the table. Accept = vote yes; Not now = cancel it.
function RematchRequest({ state, send }) {
  const me = state.players.find(p => p.id === state.you);
  const askers = state.players.filter(p => p.id !== state.you && !p.bot && p.rematch && p.connected);
  const seen = useRef(state.declined ? state.declined.n : 0);
  useEffect(() => {
    const d = state.declined;
    if (d && d.n !== seen.current) { seen.current = d.n; if (d.by !== state.you) toast(`${d.name} said not now. No rematch this time.`); }
  }, [state.declined, state.you]);
  const open = !!me && !me.rematch && askers.length > 0;
  const names = askers.map(p => p.name).join(', ');
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="overlay rematch-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="dialog rematch-ask" role="alertdialog" aria-modal="true" aria-labelledby="rematch-title"
            initial={{ scale: 0.94, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 28 }}>
            <div className="result-icon"><Icon name="repeat" size={28} /></div>
            <h2 id="rematch-title" className="h-section">{names} {askers.length > 1 ? 'want' : 'wants'} a rematch</h2>
            <p className="muted">Same room, same settings: {describeOptions(state.game, state.size, state.options).join(' · ')}.</p>
            <div className="row stretch">
              <button className="btn btn-secondary" onClick={() => send({ type: 'rematch-decline' })}>Not now</button>
              <button className="btn btn-primary" onClick={() => send({ type: 'rematch' })} autoFocus>Accept</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// "Share my win": a ready-made image for WhatsApp / Instagram.
function ShareWin({ state, totals, wins, isWin }) {
  const [busy, setBusy] = useState(false);
  const g = GAMES[state.game];
  const me = state.players.find(p => p.id === state.you);
  async function share() {
    setBusy(true);
    try {
      const order = [...state.players].sort((a, b) => isWin(b) - isWin(a));
      const players = order.map(p => ({
        name: p.id === state.you ? `${p.name} (me)` : p.name, win: isWin(p),
        note: totals ? `${totals[p.id]} pts` : wins ? `${wins[p.id] || 0}${state.game === 'wordchain' ? ' pts' : ' wins'}` : isWin(p) ? 'Winner' : '',
      }));
      const blob = await drawWinCard({ title: 'Victory', game: g.name, line: `${me ? me.name : 'I'} won at ${g.name}! ${state.result.text}.`, players, site: location.host });
      const how = await shareWinCard(blob, `I just won ${g.name} on Playroom! Play with me:`, location.origin);
      if (how === 'downloaded') toast('Win card saved. Post it anywhere.');
    } catch { toast('Couldn’t make the win card on this phone.'); }
    setBusy(false);
  }
  return <button className="btn btn-primary btn-block share-win" onClick={share} disabled={busy}><Icon name="share" size={18} /> {busy ? 'Making your card…' : 'Share my win'}</button>;
}

function Result({ state, send, practice }) {
  const w = state.result.winner;
  const team = state.result.winners || null; // team games (Imposter): several winners
  const won = team ? team.includes(state.you) : w === state.you;
  const winner = state.players.find(p => p.id === w);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!practice) window.dispatchEvent(new Event('playroom:me'));
  }, []);
  const g = state.g || {};
  const totals = state.game === 'cards' ? g.totals : null;
  const wins = state.game === 'xo' && (g.bestOf || 1) > 1 ? g.wins : state.game === 'wordchain' ? g.scores : null;
  const isWin = p => (team ? team.includes(p.id) : p.id === w);
  const standings = [...state.players].sort((a, b) => isWin(b) - isWin(a) || (b.alive - a.alive) || (totals ? totals[a.id] - totals[b.id] : 0)
    || (state.game === 'wordchain' && g.scores ? (g.scores[b.id] || 0) - (g.scores[a.id] || 0) : 0));
  const me = state.players.find(p => p.id === state.you);
  const asked = !!(me && me.rematch);
  const others = state.players.filter(p => p.id !== state.you && !p.bot);
  const keen = others.filter(p => p.rematch);
  const gone = others.find(p => !p.connected);
  const names = list => list.map(p => p.name).join(', ');

  async function newRoom() {
    setBusy(true);
    try { const { token } = await api('/api/rooms', { game: state.game, players: state.size, options: state.options }); location.hash = 'room-' + token; }
    catch (err) { toast(err.message); setBusy(false); }
  }

  if (hidden) return (
    <motion.button className="btn btn-primary floating" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onClick={() => setHidden(false)}>
      <Icon name="trophy" size={18} /> Results
    </motion.button>
  );
  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {won && <Confetti />}
      <motion.div className="dialog result" role="dialog" aria-modal="true" aria-label="Game over"
        initial={{ scale: 0.92, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 26, delay: 0.2 }}>
        <motion.div className={`vic${won ? ' won' : ''}`} initial={{ scale: 1.8, opacity: 0, letterSpacing: '0.4em' }}
          animate={{ scale: 1, opacity: 1, letterSpacing: '0.04em' }} transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.25 }}>
          {won ? 'Victory' : team || w ? 'Game over' : 'Draw'}
        </motion.div>
        <div className={`result-icon${won ? ' won' : ''}`}><Icon name="trophy" size={30} /></div>
        <h2 className="h-page">{team ? `${state.result.title}${won ? ': you win' : ''}` : won ? 'You win' : winner ? `${winner.name} wins` : 'It’s a draw'}</h2>
        <p className="muted">{state.result.text}.</p>
        {!practice && won && <motion.span className="xp-chip" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.7 }}>+1 win on the ranking</motion.span>}
        <ol className="standings">
          {standings.map((p, i) => (
            <li key={p.id} className={isWin(p) ? 'first' : ''}>
              <span className="pos">{i + 1}</span>
              <Avatar player={p} size={28} compact />
              <span className="seat-name">{p.id === state.you ? 'You' : p.name}</span>
              <span className="muted">{p.rematch && p.id !== state.you ? 'Wants a rematch'
                : state.game === 'imposter' && g.imposters ? (g.imposters.includes(p.id) ? 'Imposter' : 'Crew')
                : isWin(p) ? 'Winner' : p.alive ? '' : p.reason}</span>
              {totals && <b className="pts">{totals[p.id]}</b>}
              {wins && <b className="pts">{wins[p.id] || 0}{state.game === 'wordchain' ? ' pts' : ''}</b>}
            </li>
          ))}
        </ol>
        {gone ? (
          <p className="note"><Icon name="info" size={16} /> {gone.name} left the room, so there’s no rematch here. Start a new room instead.</p>
        ) : (
          <motion.button className="btn btn-primary btn-block" onClick={() => send({ type: 'rematch' })} disabled={asked} whileTap={{ scale: 0.97 }}>
            <Icon name="repeat" size={18} />
            {asked ? `Waiting for ${names(others.filter(p => !p.rematch)) || 'the others'}…`
              : keen.length ? `Rematch · ${names(keen)} ${keen.length > 1 ? 'are' : 'is'} in` : 'Rematch'}
          </motion.button>
        )}
        {won && <ShareWin state={state} totals={totals} wins={wins} isWin={isWin} />}
        <div className="row stretch">
          <button className="btn btn-secondary" onClick={() => setHidden(true)}><Icon name="eye" size={18} /> View table</button>
          {!practice && !DEMO && <button className="btn btn-secondary" onClick={newRoom} disabled={busy}>New room</button>}
        </div>
        <button className="btn btn-quiet btn-block" onClick={() => { location.hash = ''; }}>Back to games</button>
      </motion.div>
    </motion.div>
  );
}
