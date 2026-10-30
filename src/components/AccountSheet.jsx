import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { Sheet } from './Sheet.jsx';
import { Field } from './Controls.jsx';
import { Icon } from './Icon.jsx';
import { GoogleMark } from './Google.jsx';

// Account: who you are, Google connection, set/change password, sign out.
// reset = arrived from the forgot-password flow (fresh Google sign-in): no current password needed.
export function AccountSheet({ open, onClose, user, config, reset, onUser, onSignOut }) {
  const [password, setPassword] = useState('');
  const [current, setCurrent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [askCurrent, setAskCurrent] = useState(false); // server said the current password is needed
  const [linkPw, setLinkPw] = useState('');
  const [linkError, setLinkError] = useState('');
  useEffect(() => { if (!open) { setPassword(''); setCurrent(''); setError(''); setAskCurrent(false); setLinkPw(''); setLinkError(''); } }, [open]);
  if (!user) return null;
  // skipping the old password only works for 15 min after a Google sign-in; the server says until when
  const canSkip = reset && (user.resetUntil || 0) > Date.now();
  const needCurrent = user.hasPassword && (!canSkip || askCurrent);

  async function connectGoogle(e) {
    e.preventDefault();
    setLinkError('');
    try { await api('/api/link/google', { password: linkPw }); location.href = '/api/auth/google?intent=link'; }
    catch (err) { setLinkError(err.message); }
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const u = await api('/api/password', { password, current });
      onUser(u);
      toast(user.hasPassword ? 'Password changed. Other devices were signed out.' : 'Password set. You can now sign in with it too.');
      onClose();
    } catch (err) { setError(err.message); if (err.status === 401) setAskCurrent(true); }
    setBusy(false);
  }

  return (
    <Sheet open={open} onClose={onClose} title="Your account">
      <div className="account-sheet">
        <div className="account-who">
          <span className="account-avatar" aria-hidden="true">{(user.name || '?').slice(0, 1).toUpperCase()}</span>
          <div><b>{user.name}</b><span>{user.guest ? 'Guest: you joined with a name only' : `Username: ${user.username}`}</span></div>
        </div>

        {!user.guest && (
          <>
            <section className="account-block">
              <h3>Google</h3>
              {user.google
                ? <p className="account-ok"><Icon name="check" size={16} /> Connected to {user.google}. Use it to sign in, or to reset your password if you forget it.</p>
                : config.google
                  ? <form className="form" onSubmit={connectGoogle} noValidate>
                      <p className="muted">Connect Google so you can sign in with it, and get back in if you forget your password. Confirm your password first.</p>
                      <Field label="Your password">
                        <input className="input" type="password" value={linkPw} onChange={e => setLinkPw(e.target.value)} autoComplete="current-password" />
                      </Field>
                      {linkError && <p className="form-error" role="alert">{linkError}</p>}
                      <button className="btn btn-google btn-block" disabled={!linkPw}><GoogleMark /> <span>Connect Google</span></button>
                    </form>
                  : <p className="muted">Google sign-in isn’t set up on this server yet.</p>}
            </section>

            <section className="account-block">
              <h3>{user.hasPassword ? (reset ? 'Set a new password' : 'Change password') : 'Set a password'}</h3>
              {!user.hasPassword && <p className="muted">You sign in with Google. Add a password to sign in with your username too.</p>}
              <form className="form" onSubmit={save} noValidate>
                {needCurrent && (
                  <Field label="Current password">
                    <input className="input" type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" />
                  </Field>
                )}
                <Field label="New password" hint="At least 8 characters.">
                  <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" autoFocus={reset} />
                </Field>
                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="btn btn-primary btn-block" disabled={busy || password.length < 8}>{busy ? 'Saving…' : 'Save password'}</button>
              </form>
            </section>
          </>
        )}

        <button className="btn btn-secondary btn-block" onClick={onSignOut}><Icon name="logout" size={18} /> Sign out</button>
      </div>
    </Sheet>
  );
}
