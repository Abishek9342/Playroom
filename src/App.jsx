import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { api, DEMO } from './lib/api.js';
import { GAMES, defaultOptions } from './lib/meta.js';
import { normalizeOptions } from '../shared/games.js';
import { Landing } from './screens/Landing.jsx';
import { Home } from './screens/Home.jsx';
import { RemoteRoom, PracticeRoom } from './screens/Room.jsx';
import { Toaster } from './components/Toaster.jsx';
import { Confirmer } from './components/Confirmer.jsx';
import { InstallButton } from './components/InstallButton.jsx';
import { Logo, Icon } from './components/Icon.jsx';
import { ask } from './lib/confirm.js';
import { toast } from './lib/toast.js';
import { AccountSheet } from './components/AccountSheet.jsx';
import { AUTH_MESSAGES } from './components/Google.jsx';

const page = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.14 } },
};

// Routes: #room-CODE, #join-CODE (invite link), #practice,
//   #practice-<game>-<n>[-d<decks>][-e<exit>][-b<board>][-o<bestOf>][-<nonce>]
function parse(hash) {
  let m = hash.match(/^#(room|join)-([A-Z2-9]{6})$/);
  if (m && !DEMO) return { kind: m[1], token: m[2], key: 'room-' + m[2] };
  m = hash.match(/^#practice-(wordchain|xo|patches|cards)-(\d+)(?:-d(\d))?(?:-e(\d+))?(?:-b(\d))?(?:-o(\d))?(?:-\d+)?$/);
  if (m) {
    const g = GAMES[m[1]], n = +m[2];
    if (n >= g.min && n <= g.max) {
      const raw = {};
      if (m[3]) raw.decks = +m[3];
      if (m[4]) raw.exitAt = +m[4];
      if (m[5]) raw.board = +m[5];
      if (m[6]) raw.bestOf = +m[6];
      const { options } = normalizeOptions(m[1], n, raw);
      return { kind: 'practice', game: m[1], size: n, options: options || defaultOptions(m[1], n), key: hash };
    }
  }
  if (hash === '#practice') return { kind: 'practice-home', key: 'home' };
  return { kind: 'home', key: 'home' };
}

const remember = u => { try { u ? localStorage.setItem('playroom-user', JSON.stringify(u)) : localStorage.removeItem('playroom-user'); } catch {} };
const remembered = () => { try { return JSON.parse(localStorage.getItem('playroom-user')); } catch { return null; } };

export default function App() {
  const [user, setUser] = useState(DEMO ? null : undefined); // undefined = still checking
  const [hash, setHash] = useState(location.hash);
  const [config, setConfig] = useState({ google: false });
  const [account, setAccount] = useState(null); // null | 'open' | 'reset'

  // Back from Google: the Worker lands us on #auth-<outcome>. Say what happened, then tidy the URL.
  useEffect(() => {
    const check = () => {
      const m = location.hash.match(/^#auth-([a-z]+)(?:-([A-Z2-9]{6}))?$/);
      if (!m) return setHash(location.hash);
      if (AUTH_MESSAGES[m[1]]) toast(AUTH_MESSAGES[m[1]]);
      if (m[1] === 'reset' || m[1] === 'linked' || m[1] === 'confirm') setAccount(m[1] === 'reset' ? 'reset' : 'open');
      // signed in from an invite link: go on to that room
      const next = m[2] ? (['signedin', 'welcome'].includes(m[1]) ? '#room-' : '#join-') + m[2] : '';
      history.replaceState(null, '', location.pathname + location.search + next);
      setHash(next);
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, []);
  useEffect(() => { if (!DEMO) api('/api/config').then(setConfig).catch(() => {}); }, []);
  useEffect(() => {
    if (DEMO) return;
    api('/api/me').then(u => { remember(u); setUser(u); })
      // offline (installed app): keep the last user so practice still works
      .catch(err => setUser(err.status === 401 ? null : remembered()));
  }, []);

  async function signOut() {
    const ok = await ask({ title: 'Sign out?', body: user && user.guest ? 'You’re a guest, so you’ll join with your name again next time.' : '', confirm: 'Sign out' });
    if (!ok) return;
    try { await api('/api/logout', {}); } catch {}
    setAccount(null); remember(null); setUser(null); location.hash = '';
  }

  const route = parse(hash);
  let screen, key = route.key;
  if (user === undefined) { key = 'loading'; screen = <div className="empty-state"><span className="spinner" aria-label="Loading" /></div>; }
  else if (route.kind === 'practice') screen = <PracticeRoom game={route.game} size={route.size} options={route.options} name={user ? user.name : 'You'} />;
  else if (route.kind === 'practice-home' || DEMO) screen = <Home user={user} />;
  else if (!user) { key = 'landing'; screen = <Landing config={config} onSignedIn={u => { remember(u); setUser(u); }} inviteToken={route.kind === 'join' ? route.token : null} />; }
  else if (route.kind === 'room' || route.kind === 'join') screen = <RemoteRoom token={route.token} />;
  else screen = <Home user={user} />;

  const inRoom = route.kind === 'room' || route.kind === 'join' || route.kind === 'practice';
  return (
    <div className={`app${inRoom ? ' in-room' : ''}`}>
      {!inRoom && key !== 'landing' && (
        <header className="topbar">
          <a href="#" className="brand"><Logo size={26} /><span>Playroom</span></a>
          <div className="topbar-right">
            {!DEMO && <InstallButton />}
            {user ? (
              <button className="account" onClick={() => setAccount('open')} aria-label={`Signed in as ${user.name}. Account`}>
                <span className="account-name">{user.name}</span><Icon name="user" size={18} />
              </button>
            ) : !DEMO && <a className="btn btn-secondary btn-sm" href="#">Sign in</a>}
          </div>
        </header>
      )}
      <AnimatePresence mode="wait">
        <motion.main key={key} className={`page${inRoom ? ' page-room' : ''}`} variants={page} initial="initial" animate="animate" exit="exit">{screen}</motion.main>
      </AnimatePresence>
      <AccountSheet open={!!account && !!user} reset={account === 'reset'} onClose={() => setAccount(null)} user={user} config={config}
        onUser={u => { remember(u); setUser(u); }} onSignOut={signOut} />
      <Toaster />
      <Confirmer />
    </div>
  );
}
