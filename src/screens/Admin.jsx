import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { api } from '../lib/api.js';
import { GAMES } from '../lib/meta.js';
import { toast } from '../lib/toast.js';
import { copyText } from '../lib/clipboard.js';
import { Sheet } from '../components/Sheet.jsx';
import { Field, Segmented } from '../components/Controls.jsx';
import { Icon } from '../components/Icon.jsx';
import { levelInfo } from '../../shared/xp.js';

// Admin panel: who's playing, for how long, which games; add players, reset passwords.
// Only shown to admins (the server checks again on every call).

const dur = ms => {
  const m = Math.round((ms || 0) / 60000);
  if (m < 1) return ms > 0 ? '<1m' : '0m';
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
};
const ago = t => {
  if (!t) return 'never';
  const s = (Date.now() - t) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
const day = t => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const gameName = k => (GAMES[k] ? GAMES[k].name : k);
const gb = b => (b >= 1e9 ? `${(b / 1e9).toFixed(b >= 1e10 ? 0 : 1)} GB` : `${Math.round((b || 0) / 1e6)} MB`);
const newPassword = () => {
  const words = ['tiger', 'mango', 'rocket', 'pepper', 'comet', 'lotus', 'cobra', 'falcon', 'maple', 'pixel'];
  const pick = a => a[crypto.getRandomValues(new Uint32Array(1))[0] % a.length];
  return `${pick(words)}-${pick(words)}-${String(crypto.getRandomValues(new Uint32Array(1))[0] % 90 + 10)}`;
};

export function Admin({ user }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [who, setWho] = useState('accounts');
  const [sort, setSort] = useState('newest');
  const [adding, setAdding] = useState(false);
  const [resetFor, setResetFor] = useState(null);

  async function load() {
    setBusy(true);
    try { setData(await api('/api/admin/overview')); setError(''); }
    catch (e) { setError(e.message); }
    setBusy(false);
  }
  useEffect(() => { if (user && user.admin) load(); }, [user && user.id]);

  const list = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const by = {
      newest: (a, b) => b.created - a.created,
      playtime: (a, b) => b.playMs - a.playMs,
      active: (a, b) => b.activeMs - a.activeMs,
      seen: (a, b) => (b.lastSeen || 0) - (a.lastSeen || 0),
    }[sort];
    return data.users
      .filter(u => (who === 'all' ? true : who === 'guests' ? u.guest : !u.guest))
      .filter(u => !needle || [u.name, u.username, u.google].some(x => x && x.toLowerCase().includes(needle)))
      .sort(by);
  }, [data, q, who, sort]);

  if (!user || !user.admin) return (
    <div className="empty-state">
      <Icon name="info" size={30} />
      <h1 className="h-page">Admins only</h1>
      <p className="muted">Sign in with the admin Google account to see this page.</p>
      <a className="btn btn-primary" href="#">Back to games</a>
    </div>
  );

  const t = data && data.totals;
  const maxPlays = data ? Math.max(1, ...data.games.map(g => g.plays)) : 1;
  return (
    <div className="admin">
      <header className="admin-head">
        <div>
          <span className="kicker">Admin</span>
          <h1 className="h-page">Playroom at a glance</h1>
        </div>
        <div className="row">
          <button className="btn btn-secondary btn-sm" onClick={load} disabled={busy}><Icon name="repeat" size={16} /> {busy ? 'Loading…' : 'Refresh'}</button>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Add player</button>
        </div>
      </header>

      {error && <p className="form-error" role="alert">{error}</p>}
      {!data && !error && <div className="empty-state"><span className="spinner" aria-label="Loading" /></div>}

      {t && (
        <>
          <section className="admin-kpis" aria-label="Totals">
            <Kpi label="Players" value={t.accounts} note={`+${t.newWeek} this week`} />
            <Kpi label="Guests" value={t.guests} note="joined with a name" />
            <Kpi label="Games played" value={t.plays} note="online, finished" />
            <Kpi label="Playtime" value={dur(t.playMs)} note="all players, in games" />
            <Kpi label="Time in app" value={dur(t.activeMs)} note="app open on screen" />
          </section>

          {data.voice && (
            <section className="card admin-voice">
              <div className="list-head"><h2 className="h-section">Voice relay this month</h2><span className="count">{data.voice.month}</span></div>
              <div className="bar-track big" role="meter" aria-valuemin={0} aria-valuemax={data.voice.cap} aria-valuenow={data.voice.bytes}
                aria-label={`${gb(data.voice.bytes)} of ${gb(data.voice.cap)} used`}>
                <span className="bar-fill" style={{ width: `${Math.min(100, (data.voice.bytes / data.voice.cap) * 100)}%` }} />
              </div>
              <p className="muted"><b>{gb(data.voice.bytes)}</b> of {gb(data.voice.cap)} used. {data.voice.relay
                ? 'At the cap the relay pauses until next month; direct voice keeps working. Cloudflare’s free allowance is 1,000 GB.'
                : 'Relay not set up yet: voice uses direct connections only.'}</p>
            </section>
          )}

          <section className="card admin-games">
            <div className="list-head"><h2 className="h-section">Most played games</h2><span className="count">{t.plays} games</span></div>
            {data.games.length === 0 && <p className="muted">No finished online games yet. Practice games aren’t counted.</p>}
            <ul className="bars">
              {data.games.map(g => (
                <li key={g.game} title={`${gameName(g.game)}: ${g.plays} games, ${g.seats} players in total, ${dur(g.ms)} played`}>
                  <span className="bar-label">{gameName(g.game)}</span>
                  <span className="bar-track"><motion.span className="bar-fill" initial={{ width: 0 }} animate={{ width: `${(g.plays / maxPlays) * 100}%` }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} /></span>
                  <span className="bar-value"><b>{g.plays}</b> · {dur(g.ms)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card admin-users">
            <div className="list-head"><h2 className="h-section">Players</h2><span className="count">{list.length} shown</span></div>
            <div className="admin-filters">
              <label className="sr-only" htmlFor="admin-q">Search players</label>
              <input id="admin-q" className="input" placeholder="Search by name, username or email" value={q} onChange={e => setQ(e.target.value)} />
              <Segmented id="admin-who" label="Show" value={who} onChange={setWho}
                options={[{ value: 'accounts', label: 'Accounts' }, { value: 'guests', label: 'Guests' }, { value: 'all', label: 'All' }]} />
              <select className="input select" aria-label="Sort players" value={sort} onChange={e => setSort(e.target.value)}>
                <option value="newest">Newest first</option>
                <option value="playtime">Most playtime</option>
                <option value="active">Most time in app</option>
                <option value="seen">Recently seen</option>
              </select>
            </div>
            <ul className="admin-list">
              {list.map(u => (
                <li key={u.id} className="admin-user">
                  <div className="admin-user-top">
                    <span className="admin-avatar" aria-hidden="true">{(u.name || '?').slice(0, 1).toUpperCase()}</span>
                    <div className="admin-user-name">
                      <b>{u.name}</b>
                      <span>{u.guest ? 'Guest' : `@${u.username}`}{u.google ? ` · ${u.google}` : ''}</span>
                    </div>
                    <div className="admin-tags">
                      {u.google && <span className="badge">Google</span>}
                      {u.guest && <span className="badge badge-quiet">Guest</span>}
                    </div>
                  </div>
                  <dl className="admin-stats">
                    <div><dt>Playtime</dt><dd>{dur(u.playMs)}</dd></div>
                    <div><dt>Time in app</dt><dd>{dur(u.activeMs)}</dd></div>
                    <div><dt>Games</dt><dd>{u.plays}{u.plays ? <small> · {u.wins} won</small> : null}</dd></div>
                    <div><dt>Favourite</dt><dd>{u.favGame ? gameName(u.favGame) : '–'}</dd></div>
                    <div><dt>Level</dt><dd>{levelInfo(u.xp).level}<small> · {u.xp} XP</small></dd></div>
                    <div><dt>Streak</dt><dd>{u.streak} {u.streak === 1 ? 'day' : 'days'}</dd></div>
                    <div><dt>Joined</dt><dd>{day(u.created)}</dd></div>
                    <div><dt>Last seen</dt><dd>{ago(u.lastSeen)}</dd></div>
                  </dl>
                  {!u.guest && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setResetFor(u)}><Icon name="repeat" size={15} /> Reset password</button>
                  )}
                </li>
              ))}
              {list.length === 0 && <li className="muted">No players match.</li>}
            </ul>
          </section>
          <p className="note"><Icon name="info" size={16} /> Playtime counts finished online games (practice with bots isn’t recorded). Time in app counts minutes with Playroom open and on screen.</p>
        </>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add a player">
        {adding && <AddPlayer onDone={() => { setAdding(false); load(); }} />}
      </Sheet>
      <Sheet open={!!resetFor} onClose={() => setResetFor(null)} title="Reset password">
        {resetFor && <ResetPassword target={resetFor} onDone={() => setResetFor(null)} />}
      </Sheet>
    </div>
  );
}

function Kpi({ label, value, note }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <b className="kpi-value">{value}</b>
      <span className="kpi-note">{note}</span>
    </div>
  );
}

// Shows the sign-in details once, ready to copy and send to the player.
function Handover({ username, password, onDone }) {
  const text = `Your Playroom login\nUsername: ${username}\nPassword: ${password}\n${location.origin}`;
  return (
    <div className="form">
      <p className="muted">Send these to the player. They can change the password from Your account after signing in.</p>
      <pre className="handover">{`Username: ${username}\nPassword: ${password}`}</pre>
      <button className="btn btn-primary btn-block" onClick={async () => toast((await copyText(text)) ? 'Login details copied.' : 'Couldn’t copy. Select the text instead.')}>
        <Icon name="copy" size={18} /> Copy login details
      </button>
      <button className="btn btn-quiet btn-block" onClick={onDone}>Done</button>
    </div>
  );
}

function AddPlayer({ onDone }) {
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState(newPassword);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState(null);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try { const u = await api('/api/admin/users', { username, name, password }); setMade({ username: u.username, password }); toast(`${u.name} added.`); }
    catch (err) { setError(err.message); }
    setBusy(false);
  }
  if (made) return <Handover {...made} onDone={onDone} />;
  return (
    <form className="form" onSubmit={submit} noValidate>
      <Field label="Username" hint="3–20 letters, numbers or underscores. They sign in with this.">
        <input className="input" value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="off" autoComplete="off" />
      </Field>
      <Field label="Name other players see" hint="Optional. Defaults to the username.">
        <input className="input" value={name} onChange={e => setName(e.target.value)} maxLength={20} />
      </Field>
      <Field label="Starting password" hint="At least 8 characters.">
        <div className="pw-row">
          <input className="input" value={password} onChange={e => setPassword(e.target.value)} autoComplete="off" />
          <button type="button" className="btn btn-secondary" onClick={() => setPassword(newPassword())}>New</button>
        </div>
      </Field>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Adding…' : 'Add player'}</button>
    </form>
  );
}

function ResetPassword({ target, onDone }) {
  const [password, setPassword] = useState(newPassword);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try { await api('/api/admin/password', { userId: target.id, password }); setDone(true); toast(`Password reset for ${target.name}.`); }
    catch (err) { setError(err.message); }
    setBusy(false);
  }
  if (done) return <Handover username={target.username} password={password} onDone={onDone} />;
  return (
    <form className="form" onSubmit={submit} noValidate>
      <p className="muted"><b>{target.name}</b> (@{target.username}) gets this new password and is signed out on every device.</p>
      <Field label="New password" hint="At least 8 characters.">
        <div className="pw-row">
          <input className="input" value={password} onChange={e => setPassword(e.target.value)} autoComplete="off" />
          <button type="button" className="btn btn-secondary" onClick={() => setPassword(newPassword())}>New</button>
        </div>
      </Field>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-danger btn-block" disabled={busy}>{busy ? 'Resetting…' : 'Reset password'}</button>
    </form>
  );
}
