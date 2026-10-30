import { motion, AnimatePresence } from 'motion/react';

const SIZE = 300;

export function XO({ state, send, now }) {
  const g = state.g;
  const n = g.n || 3;
  const cell = SIZE / n;
  const center = i => [(i % n) * cell + cell / 2, Math.floor(i / n) * cell + cell / 2];
  const arm = cell * 0.24; // half the length of an X stroke
  const me = state.players.find(p => p.id === state.you);
  const name = id => (id === state.you ? 'You' : (state.players.find(p => p.id === id) || {}).name || '');
  const myTurn = state.status === 'playing' && me && me.alive && g.phase !== 'roundover' && g.turn === state.you;
  const mine = g.marks[state.you];
  const series = (g.bestOf || 1) > 1;
  const ids = Object.keys(g.marks);
  const last = g.history && g.history[g.history.length - 1];
  const between = state.status === 'playing' && g.phase === 'roundover';

  let status = 'Final board';
  if (state.status === 'playing') status = between ? 'Next round starting' : g.turn === state.you ? 'Your move' : `${name(g.turn)} is thinking…`;

  let win = null;
  if (g.line) {
    const [a, b] = [center(g.line[0]), center(g.line[g.line.length - 1])];
    const dx = (b[0] - a[0]) * (0.45 / (g.line.length - 1)), dy = (b[1] - a[1]) * (0.45 / (g.line.length - 1));
    win = `M${a[0] - dx} ${a[1] - dy} L${b[0] + dx} ${b[1] + dy}`;
  }
  const secs = Math.max(0, Math.ceil(((g.deadline || 0) - now) / 1000));

  return (
    <div className="xo-wrap">
      {series && (
        <div className="xo-score card" aria-label={`Best of ${g.bestOf}. Round ${g.round}.`}>
          {ids.map((id, k) => (
            <div key={id} className={`xo-side${g.turn === id && !between ? ' live' : ''}`}>
              <b className={g.marks[id] === 'X' ? 'mark-x' : 'mark-o'}>{g.marks[id]}</b>
              <span className="xo-side-name">{name(id)}</span>
              <span className="xo-pips" aria-label={`${g.wins[id]} of ${Math.ceil(g.bestOf / 2)} wins`}>
                {Array.from({ length: Math.ceil(g.bestOf / 2) }, (_, j) => <i key={j} className={j < g.wins[id] ? 'on' : ''} />)}
              </span>
              {k === 0 && <span className="xo-vs">Round {g.round} of {g.bestOf}</span>}
            </div>
          ))}
        </div>
      )}
      <div className="xo-status">
        <span className="kicker">{status}</span>
        {mine && <span className="chip">You play <b className={mine === 'X' ? 'mark-x' : 'mark-o'}>{mine}</b></span>}
      </div>
      <div className={`xo card${n === 5 ? ' xo-5' : ''}`}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="xo-svg" aria-hidden="true">
          {Array.from({ length: n - 1 }, (_, k) => (k + 1) * cell).map(v => (
            <g key={v} className="xo-grid">
              <path d={`M${v} 10 L${v} ${SIZE - 10}`} /><path d={`M10 ${v} L${SIZE - 10} ${v}`} />
            </g>
          ))}
          <g key={g.round}>
            {g.board.map((v, i) => {
              if (!v) return null;
              const [x, y] = center(i);
              return v === 'X' ? (
                <g key={i} className="xo-x">
                  <motion.path d={`M${x - arm} ${y - arm} L${x + arm} ${y + arm}`} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.16 }} />
                  <motion.path d={`M${x + arm} ${y - arm} L${x - arm} ${y + arm}`} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.14, duration: 0.16 }} />
                </g>
              ) : (
                <motion.circle key={i} className="xo-o" cx={x} cy={y} r={cell * 0.26} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3 }} />
              );
            })}
            {win && <motion.path d={win} className="xo-win" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.3, duration: 0.4 }} />}
          </g>
        </svg>
        <div className="xo-hit" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
          {g.board.map((v, i) => (
            <button key={i} disabled={!myTurn || !!v} onClick={() => send({ type: 'move', move: { type: 'place', i } })}
              aria-label={`Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}${v ? ', ' + v : ', empty'}`} />
          ))}
        </div>
        <AnimatePresence>
          {between && last && (
            <motion.div className="xo-round" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <b>{last.winner ? (last.winner === state.you ? 'You take the round' : `${name(last.winner)} takes the round`) : 'Drawn round'}</b>
              <span>{last.winner ? last.how : `${last.how}, no point`} · round {g.round + 1} of {g.bestOf} in {secs}s</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <p className="xo-rule muted">{g.k === 5 ? 'Five in a row wins' : 'Three in a row wins'}{series ? ` · ${g.bestOf} rounds, most wins takes it` : ''}</p>
    </div>
  );
}
