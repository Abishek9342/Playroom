import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../lib/api.js';
import { Logo, Icon } from '../components/Icon.jsx';
import { Segmented, Field } from '../components/Controls.jsx';
import { TokenInput } from '../components/TokenInput.jsx';
import { GameArt } from '../components/GameArt.jsx';
import { GAMES } from '../lib/meta.js';
import { GoogleButton } from '../components/Google.jsx';

export function Landing({ onSignedIn, inviteToken, config = {} }) {
  const [mode, setMode] = useState('join');
  return (
    <div className={`landing${inviteToken ? ' invited' : ''}`}>
      <section className="landing-hero">
        <div className="brand-lg"><Logo size={40} /><span>Playroom</span></div>
        <h1 className="h-display">{inviteToken ? 'You’re invited to a game' : <>Game night,<br />wherever you are.</>}</h1>
        <p className="lead">Card, word and puzzle games for friends. One person hosts a room and shares the code; everyone else joins with their name.</p>
        <ul className="landing-games">
          {Object.entries(GAMES).map(([k, g], i) => (
            <motion.li key={k} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06 }}>
              <GameArt kind={k} /><span>{g.name}</span>
            </motion.li>
          ))}
        </ul>
      </section>

      <motion.section className="card landing-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Segmented id="landing" label="Choose" value={mode} onChange={setMode} options={[
          { value: 'join', label: 'Join a game' }, { value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' },
        ]} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={mode} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.16 }}>
            {mode === 'join' ? <JoinForm onSignedIn={onSignedIn} inviteToken={inviteToken} /> : <AccountForm signup={mode === 'signup'} onSignedIn={onSignedIn} google={config.google} room={inviteToken} />}
          </motion.div>
        </AnimatePresence>
        <a className="link-row" href="#practice">
          <span><b>Just looking?</b> Practice against bots, no sign-up.</span><Icon name="arrow" size={18} />
        </a>
        <a className="privacy-link" href="/privacy">Privacy</a>
      </motion.section>
    </div>
  );
}

function JoinForm({ onSignedIn, inviteToken }) {
  const [name, setName] = useState('');
  const [token, setToken] = useState(inviteToken || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const guest = useRef(null); // reuse the guest session if the first code was wrong

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name so others know who you are.');
    if (!/^[A-Z2-9]{6}$/.test(token)) return setError('Room codes are 6 letters and numbers.');
    setBusy(true); setError('');
    try {
      if (!guest.current || guest.current.name !== name.trim()) guest.current = await api('/api/guest', { name });
      const info = await api('/api/rooms/' + token);
      if (!info.exists) { setBusy(false); return setError('No room with that code. Check it with your host.'); }
      if (!info.member && info.status !== 'waiting') { setBusy(false); return setError('That game has already started.'); }
      if (!info.member && info.joined >= info.size) { setBusy(false); return setError('That room is full.'); }
      location.hash = 'room-' + token;
      onSignedIn(guest.current);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="form" noValidate>
      <p className="muted">Got a code from a friend? You don’t need an account.</p>
      <Field label="Your name"><input className="input" value={name} onChange={e => setName(e.target.value)} maxLength={20} autoComplete="nickname" placeholder="e.g. Priya" /></Field>
      <div className="field"><span className="field-label">Room code</span><TokenInput value={token} onChange={setToken} onSubmit={() => {}} /></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Joining…' : 'Join game'}</button>
    </form>
  );
}

function AccountForm({ signup, onSignedIn, google, room }) {
  const [forgot, setForgot] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try { onSignedIn(await api(signup ? '/api/signup' : '/api/login', { username, password })); }
    catch (err) { setError(err.message); setBusy(false); }
  }
  if (forgot) return (
    <div className="form">
      <p className="muted"><b>Forgot your password?</b> If your account is connected to Google, continue with Google to get back in, then set a new password.</p>
      {google ? <GoogleButton intent="reset" label="Continue with Google" />
        : <p className="note"><Icon name="info" size={16} /> Password reset works through Google sign-in, which isn’t set up on this server yet.</p>}
      <p className="muted small">Never connected Google? Ask the person who runs this Playroom to help, or create a new account.</p>
      <button type="button" className="btn btn-quiet btn-block" onClick={() => setForgot(false)}><Icon name="back" size={18} /> Back to sign in</button>
    </div>
  );
  return (
    <form onSubmit={submit} className="form" noValidate>
      <p className="muted">{signup ? 'An account lets you host rooms and keeps your name.' : 'Sign in to host a room.'}</p>
      {google && <>
        <GoogleButton intent="signin" room={room || ''} label={signup ? 'Sign up with Google' : 'Continue with Google'} />
        <div className="or" role="separator"><span>or use a username</span></div>
      </>}
      <Field label="Username" hint={signup ? '3–20 letters, numbers or underscores.' : null}>
        <input className="input" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="off" />
      </Field>
      <Field label="Password" hint={signup ? 'At least 8 characters.' : null}>
        <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={signup ? 'new-password' : 'current-password'} />
      </Field>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'One moment…' : signup ? 'Create account' : 'Sign in'}</button>
      {!signup && <button type="button" className="btn btn-quiet btn-block forgot" onClick={() => setForgot(true)}>Forgot password?</button>}
    </form>
  );
}
