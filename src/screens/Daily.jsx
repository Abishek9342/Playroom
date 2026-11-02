import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { Patches } from '../games/Patches.jsx';
import { Icon } from '../components/Icon.jsx';
import { Confetti } from '../components/Confetti.jsx';

// Daily puzzle: today's Patches grid, the same for everyone. First solve each day gives XP and
// keeps your streak alive; the board shows today's fastest times.
const clock = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function Daily({ onXp }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null); // { ms, xpGain, board }

  useEffect(() => { api('/api/daily').then(d => { setData(d); if (d.solvedAt) setDone({ ms: d.solvedAt - d.startedAt, xpGain: 0, board: d.board }); }).catch(e => setError(e.message)); }, []);

  async function solve(rects) {
    try {
      const r = await api('/api/daily/solve', { rects });
      setDone(r);
      if (r.xpGain) onXp && onXp();
    } catch (e) { toast(e.message); }
  }

  if (error) return <div className="empty-state"><Icon name="wifi" size={30} /><p className="muted">{error}</p><a className="btn btn-primary" href="#">Back</a></div>;
  if (!data) return <div className="empty-state"><span className="spinner" aria-label="Loading" /></div>;

  const fakeState = { status: 'playing', you: 'me', players: [{ id: 'me', name: 'You', alive: true }], g: { n: data.n, clues: data.clues, started: data.startedAt } };
  return (
    <div className="daily">
      <div className="room-bar">
        <a className="icon-btn" href="#" aria-label="Back to games"><Icon name="back" /></a>
        <div className="room-bar-title"><b>Daily puzzle</b><span>{new Date(data.day + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
      </div>
      {!done ? (
        <>
          <p className="note"><Icon name="info" size={16} /> Everyone gets this grid today. Solve it once for +50 XP and to keep your streak going. The clock started when you opened it.</p>
          <Patches state={fakeState} send={msg => msg.move && msg.move.type === 'solve' && solve(msg.move.rects)} />
        </>
      ) : (
        <motion.section className="card daily-done" initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }}>
          {done.xpGain > 0 && <Confetti />}
          <span className="kicker">Solved</span>
          <b className="daily-time">{clock(done.ms)}</b>
          {done.xpGain > 0 ? <span className="xp-chip">+{done.xpGain} XP</span> : <span className="muted">Already solved today. Come back tomorrow for a new grid.</span>}
          <h2 className="h-section">Today’s fastest</h2>
          <ol className="daily-board">
            {done.board.top.map(r => (
              <li key={r.rank} className={r.me ? 'me' : ''}><span className="pos">{r.rank}</span><span className="who">{r.me ? 'You' : r.name}</span><b>{clock(r.ms)}</b></li>
            ))}
          </ol>
          {done.board.mine && done.board.mine.rank > 10 && <p className="muted">You’re #{done.board.mine.rank} of {done.board.solvers} today.</p>}
          <a className="btn btn-primary btn-block" href="#">Back to games</a>
        </motion.section>
      )}
    </div>
  );
}
