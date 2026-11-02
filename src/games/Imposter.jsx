import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { colorFor } from '../lib/meta.js';
import { Avatar } from '../components/Avatar.jsx';
import { Icon } from '../components/Icon.jsx';

// The secret card: the word (crew) or "You're the Imposter". Hidden until tapped so people
// sitting next to you can't read it.
export function SecretCard({ role, word, category, partners = [], shown, onToggle, big }) {
  return (
    <button type="button" className={`secret${shown ? ' shown' : ''}${role === 'imposter' ? ' imp' : ''}${big ? ' big' : ''}`} onClick={onToggle}
      aria-label={shown ? 'Hide your card' : 'Show your card'}>
      <AnimatePresence mode="wait" initial={false}>
        {!shown ? (
          <motion.span key="back" className="secret-back" initial={{ rotateY: -90 }} animate={{ rotateY: 0 }} exit={{ rotateY: 90 }} transition={{ duration: 0.16 }}>
            <Icon name="eye" size={22} />
            <b>Tap to see your card</b>
            <small>Make sure nobody else can see your screen</small>
          </motion.span>
        ) : role === 'imposter' ? (
          <motion.span key="imp" className="secret-face" initial={{ rotateY: -90 }} animate={{ rotateY: 0 }} exit={{ rotateY: 90 }} transition={{ duration: 0.16 }}>
            <small>Your role</small>
            <b className="secret-word">Imposter</b>
            {category ? <span className="secret-cat">Hint: the category is <b>{category}</b></span> : <span className="secret-cat">No hint this time</span>}
            {partners.length > 0 && <span className="secret-cat">Other Imposter: <b>{partners.join(', ')}</b></span>}
            <small>Blend in. Work out the word from everyone’s clues.</small>
          </motion.span>
        ) : (
          <motion.span key="word" className="secret-face" initial={{ rotateY: -90 }} animate={{ rotateY: 0 }} exit={{ rotateY: 90 }} transition={{ duration: 0.16 }}>
            <small>Secret word</small>
            <b className="secret-word">{word}</b>
            {category && <span className="secret-cat">{category}</span>}
            <small>Give clues that prove you know it, without giving it away.</small>
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

export function Imposter({ state, send, now, error }) {
  const g = state.g;
  const me = state.players.find(p => p.id === state.you);
  const inGame = state.status === 'playing' && me && me.alive;
  const name = id => (id === state.you ? 'You' : (state.players.find(p => p.id === id) || {}).name || '');
  const player = id => state.players.find(p => p.id === id);
  const secs = Math.max(0, Math.ceil((g.deadline - now) / 1000));
  const [shown, setShown] = useState(false);
  const imp = g.role === 'imposter';
  const partners = imp && g.imposters ? g.imposters.filter(x => x !== state.you).map(name) : [];
  const over = g.phase === 'over';

  return (
    <div className="imp">
      {g.role && !over && (
        <SecretCard role={g.role} word={g.word} category={g.category} partners={partners}
          shown={shown} onToggle={() => setShown(s => !s)} big={g.phase === 'reveal'} />
      )}

      {g.phase === 'reveal' && (
        <section className="imp-panel">
          <div className="imp-status"><b>Look at your card</b><span className="secs">{secs}s</span></div>
          <p className="muted">Clues start when everyone’s ready. {g.ready.length} of {state.players.filter(p => p.alive).length} ready.</p>
          {inGame && (g.ready.includes(state.you)
            ? <p className="imp-wait"><Icon name="check" size={16} /> You’re ready. Waiting for the others…</p>
            : <button className="btn btn-primary btn-block" onClick={() => { setShown(false); send({ type: 'move', move: { type: 'ready' } }); }}>I’ve seen my card</button>)}
        </section>
      )}

      {/* voting goes first so it's on screen without scrolling past the clues */}
      {g.phase === 'vote' && <Vote g={g} state={state} name={name} player={player} send={send} inGame={inGame} secs={secs} />}

      {(g.phase === 'clues' || g.phase === 'vote' || g.phase === 'lastchance' || over) && (
        <Clues g={g} state={state} name={name} send={send} inGame={inGame} secs={secs} error={error} />
      )}

      {(g.phase === 'vote' || g.phase === 'lastchance' || over) && <Chat g={g} state={state} name={name} send={send} canChat={inGame && !over} />}

      {g.phase === 'lastchance' && (
        <section className="imp-panel caught">
          <div className="imp-status"><b>{g.votedOut === state.you ? 'You’ve been caught' : `${name(g.votedOut)} was caught`}</b><span className="secs">{secs}s</span></div>
          {g.votedOut === state.you
            ? <><p className="muted">Last chance: guess the secret word and you still win.</p><GuessBox send={send} label="Guess the word" /></>
            : <p className="muted">They get one guess at the secret word. If they get it, the Imposter{g.impostersCount > 1 ? 's' : ''} still win.</p>}
        </section>
      )}

      {imp && inGame && (g.phase === 'clues' || g.phase === 'vote') && <EarlyGuess send={send} />}

      {over && <Reveal g={g} name={name} player={player} you={state.you} />}
    </div>
  );
}

function Clues({ g, state, name, send, inGame, secs, error }) {
  const mine = g.phase === 'clues' && g.turn === state.you && inGame;
  const listRef = useRef(null);
  useEffect(() => { const el = listRef.current; if (el && el.scrollTo) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }, [g.clues.length]);
  const byLap = Array.from({ length: g.laps }, (_, i) => g.clues.filter(c => c.lap === i + 1));
  return (
    <section className="imp-panel">
      {g.phase === 'clues' && (
        <div className="imp-status">
          <b>{mine ? 'Your clue' : `${name(g.turn)} is thinking…`}</b>
          <span className="muted">Round {g.lap} of {g.laps} · <span className="secs">{secs}s</span></span>
        </div>
      )}
      {g.phase !== 'clues' && <div className="imp-status"><b>Clues</b></div>}
      <div className="imp-clues" ref={listRef}>
        {g.clues.length === 0 && <p className="muted">No clues yet. {name(g.turn)} goes first.</p>}
        {byLap.map((list, i) => list.length > 0 && (
          <div key={i} className="imp-lap">
            {g.laps > 1 && <span className="imp-lap-label">Round {i + 1}</span>}
            <AnimatePresence initial={false}>
              {list.map((c, j) => (
                <motion.div key={`${i}-${j}`} className="imp-clue" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <span className="imp-who"><i style={{ background: colorFor(c.by) }} />{name(c.by)}</span>
                  {c.text ? <b>{c.text}</b> : <em>ran out of time</em>}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ))}
      </div>
      {mine && <ClueBox send={send} error={error} />}
    </section>
  );
}

function ClueBox({ send, error }) {
  const [text, setText] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current && ref.current.focus(); }, []);
  const clean = text.trim();
  const ok = /^[A-Za-z][A-Za-z'-]{0,19}$/.test(clean);
  return (
    <form className="imp-input" onSubmit={e => { e.preventDefault(); if (ok) send({ type: 'move', move: { type: 'clue', text: clean } }); }}>
      <label className="sr-only" htmlFor="imp-clue">Your one-word clue</label>
      <input id="imp-clue" ref={ref} className="input" value={text} onChange={e => setText(e.target.value.replace(/\s/g, ''))} maxLength={20}
        placeholder="One word" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck="false" />
      <button className="btn btn-primary" disabled={!ok}>Give clue</button>
    </form>
  );
}

function Vote({ g, state, name, player, send, inGame, secs }) {
  const others = state.players.filter(p => p.alive && p.id !== state.you);
  const alive = state.players.filter(p => p.alive).length;
  return (
    <section className="imp-panel">
      <div className="imp-status"><b>Who’s the Imposter?</b><span className="secs">{secs}s</span></div>
      <p className="muted">{g.voted.length} of {alive} voted. You can change your vote until everyone has voted or time’s up.</p>
      <div className="imp-votes" role="radiogroup" aria-label="Vote for the Imposter">
        {others.map(p => (
          <button key={p.id} type="button" role="radio" aria-checked={g.myVote === p.id} disabled={!inGame}
            className={`imp-vote${g.myVote === p.id ? ' picked' : ''}`} onClick={() => send({ type: 'move', move: { type: 'vote', who: p.id } })}>
            <Avatar player={p} size={34} compact />
            <span>{p.name}</span>
            {g.voted.includes(p.id) && <small><Icon name="check" size={13} /> voted</small>}
          </button>
        ))}
      </div>
    </section>
  );
}

function Chat({ g, state, name, send, canChat }) {
  const [text, setText] = useState('');
  const listRef = useRef(null);
  useEffect(() => { const el = listRef.current; if (el && el.scrollTo) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }, [g.messages.length]);
  return (
    <section className="imp-panel">
      <div className="imp-status"><b>Discussion</b></div>
      <div className="imp-chat" ref={listRef}>
        {g.messages.length === 0 && <p className="muted">Talk it over. Whose clue didn’t fit?</p>}
        {g.messages.map((m, i) => (
          <p key={i} className={`imp-msg${m.by === state.you ? ' mine' : ''}`}><b style={{ color: 'inherit' }}>{name(m.by)}</b> {m.text}</p>
        ))}
      </div>
      {canChat && (
        <form className="imp-input" onSubmit={e => { e.preventDefault(); if (text.trim()) { send({ type: 'move', move: { type: 'chat', text } }); setText(''); } }}>
          <label className="sr-only" htmlFor="imp-chat">Message</label>
          <input id="imp-chat" className="input" value={text} onChange={e => setText(e.target.value)} maxLength={80} placeholder="Say something" autoComplete="off" />
          <button className="btn btn-secondary" disabled={!text.trim()}>Send</button>
        </form>
      )}
    </section>
  );
}

function GuessBox({ send, label }) {
  const [text, setText] = useState('');
  return (
    <form className="imp-input" onSubmit={e => { e.preventDefault(); if (text.trim()) send({ type: 'move', move: { type: 'guess', text } }); }}>
      <label className="sr-only" htmlFor="imp-guess">{label}</label>
      <input id="imp-guess" className="input" value={text} onChange={e => setText(e.target.value)} maxLength={30} placeholder="The secret word is…" autoComplete="off" autoFocus />
      <button className="btn btn-danger" disabled={!text.trim()}>Guess</button>
    </form>
  );
}

function EarlyGuess({ send }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="imp-panel imp-early">
      {!open ? (
        <button className="btn btn-quiet btn-block" onClick={() => setOpen(true)}>Think you know the word? Guess it</button>
      ) : (
        <>
          <p className="note"><Icon name="info" size={16} /> Right and you win straight away. Wrong and you lose. Only you see this box.</p>
          <GuessBox send={send} label="Guess the secret word" />
          <button className="btn btn-quiet btn-block" onClick={() => setOpen(false)}>Not yet</button>
        </>
      )}
    </section>
  );
}

function Reveal({ g, name, player, you }) {
  const crewWon = g.outcome && g.outcome.team === 'crew';
  const tally = g.tally ? Object.entries(g.tally).sort((a, b) => b[1] - a[1]) : [];
  return (
    <section className="imp-panel imp-reveal">
      <div className="imp-reveal-grid">
        <div>
          <small>The Imposter{g.imposters && g.imposters.length > 1 ? 's' : ''}</small>
          <div className="imp-reveal-who">
            {(g.imposters || []).map(id => player(id) && <span key={id}><Avatar player={player(id)} size={30} compact /> {name(id)}</span>)}
          </div>
        </div>
        <div>
          <small>The secret word</small>
          <b className="imp-reveal-word">{g.word}</b>
          <span className="muted">{g.category}</span>
        </div>
      </div>
      {g.guess && <p className="muted">{name(g.guess.by)} guessed “{g.guess.text}”: {g.guess.right ? 'right' : 'wrong'}.</p>}
      {tally.length > 0 && <p className="muted">Votes: {tally.map(([id, n]) => `${name(id)} ${n}`).join(' · ')}</p>}
      <p className={`imp-verdict ${crewWon ? 'crew' : 'imps'}`}>{g.outcome ? g.outcome.reason : ''}</p>
    </section>
  );
}
