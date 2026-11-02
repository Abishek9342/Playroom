import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { GAMES } from '../lib/meta.js';
import { Segmented } from './Controls.jsx';

const TABS = [['', 'All'], ...Object.entries(GAMES).map(([k, g]) => [k, g.name])];

// Ranking of registered players by games won (online games), overall or per game.
export function Ranking() {
  const [game, setGame] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setData(null); setError('');
    api('/api/ranking' + (game ? '?game=' + game : '')).then(d => live && setData(d)).catch(e => live && setError(e.message));
    return () => { live = false; };
  }, [game]);

  const meOutside = data && data.me && !data.top.some(r => r.me);
  return (
    <section className="account-block ranking">
      <h3>Ranking</h3>
      <p className="muted">1 mark for every online game you win. Tied on marks? The better win rate goes first, then more games played.</p>
      <div className="rank-tabs">
        <Segmented label="Game" value={game} onChange={setGame} options={TABS.map(([value, label]) => ({ value, label }))} />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!data && !error && <p className="muted">Loading…</p>}
      {data && (
        data.top.length === 0
          ? <p className="muted">No wins here yet. Win an online game to get on the board.</p>
          : <>
              {data.me
                ? <p className="rank-me">You’re <b>#{data.me.rank}</b> of {data.players} with <b>{data.me.wins}</b> {data.me.wins === 1 ? 'win' : 'wins'}.</p>
                : <p className="rank-me">Play an online game to get your rank.</p>}
              <ol className="rank-list">
                <li className="rank-head" aria-hidden="true"><span>#</span><span>Player</span><span>Wins</span><span>Played</span><span>Win %</span></li>
                {data.top.map(r => <Row key={r.rank + r.name} r={r} />)}
                {meOutside && <><li className="rank-gap" aria-hidden="true">…</li><Row r={data.me} /></>}
              </ol>
            </>
      )}
    </section>
  );
}

function Row({ r }) {
  return (
    <li className={`rank-row${r.me ? ' me' : ''}${r.rank <= 3 ? ' top' + r.rank : ''}`}>
      <span className="rank-pos">{r.rank}</span>
      <span className="rank-name">{r.name}{r.me ? ' (you)' : ''}</span>
      <b>{r.wins}</b>
      <span>{r.played}</span>
      <span>{r.rate}%</span>
    </li>
  );
}
