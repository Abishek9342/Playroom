import { GAMES, normalizeOptions } from '../shared/games.js';
import { googleProfile, usernameBase } from './google.js';
export { GameRoom } from './room.js';

const SESSION_DAYS = 30;
const TOKEN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const enc = new TextEncoder();

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const randomHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
  // 100k is the maximum PBKDF2 iteration count Workers allow
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256));
}

function sameString(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function getCookie(req, name) {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}

// via: 'password' | 'google' | 'guest'. A Google sign-in less than RESET_WINDOW_MS old may set a
// new password without the old one (that's the forgot-password flow).
const RESET_WINDOW_MS = 15 * 60e3;
async function createSession(env, userId, url, via = 'password') {
  const token = randomHex(32);
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, via, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256(token), userId, Date.now() + SESSION_DAYS * 864e5, via, Date.now()).run();
  return `sid=${token}; HttpOnly${secure(url)}; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`;
}

// Production is always HTTPS; local dev (and dev tunnels) may reach the Worker over plain HTTP.
const secure = url => (url.protocol === 'https:' ? '; Secure' : '');

// The signed-in session: { user (safe to send to the app), row (server-only details) } or null.
async function currentSession(req, env) {
  const t = getCookie(req, 'sid');
  if (!t || !/^[0-9a-f]{64}$/.test(t)) return null;
  const tokenHash = await sha256(t);
  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.is_guest, u.email, u.google_sub, u.pass_hash <> '' AS has_password,
            s.via, s.created_at AS session_created
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`
  ).bind(tokenHash, Date.now()).first();
  return row ? { user: publicUser(row), row, tokenHash } : null;
}

// What the app sees about a user.
function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id, username: row.username, name: row.display_name || row.username, guest: !!row.is_guest,
    google: row.google_sub ? (row.email || 'Google account') : null, hasPassword: !!row.has_password,
  };
}

const googleOn = env => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const redirect = (to, cookie) => new Response(null, { status: 302, headers: { location: to, ...(cookie ? { 'set-cookie': cookie } : {}) } });

async function freeUsername(env, base) {
  for (let i = 0; i < 25; i++) {
    const name = i === 0 ? base : (base.slice(0, 15) + Math.floor(1000 + Math.random() * 9000));
    if (!(await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(name).first())) return name;
  }
  return 'player' + randomHex(4);
}

// Sign in with Google (OAuth 2.0 authorization code flow, done entirely on the server).
//   GET /api/auth/google?intent=signin|link|reset[&room=CODE]  -> redirect to Google
//   GET /api/auth/google/callback                               -> back from Google, then into the app
// The app learns the outcome from the hash it lands on: #auth-<outcome>[-<ROOM>] (ROOM = the invite
// the player came from, so signing in from an invite link still takes them to that room).
// Connecting Google to an existing account needs a fresh password check first (POST /api/link/google
// sets the short-lived glink cookie), so someone holding a signed-in phone can't attach their Google.
const LINK_MS = 10 * 60e3;
async function hmac(env, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.GOOGLE_CLIENT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}
const linkCookie = (url, v) => `glink=${v}; HttpOnly${secure(url)}; SameSite=Lax; Path=/api/auth; Max-Age=${v ? LINK_MS / 1000 : 0}`;
async function linkAllowed(req, env, session) {
  const [exp, sig] = (getCookie(req, 'glink') || '').split('.');
  if (!session || !exp || !sig || Number(exp) < Date.now()) return false;
  return sameString(sig, await hmac(env, `link.${session.tokenHash}.${exp}`));
}

async function handleGoogle(req, env, url) {
  if (!googleOn(env)) return redirect('/#auth-off');
  const stateCookie = v => `gstate=${v}; HttpOnly${secure(url)}; SameSite=Lax; Path=/api/auth; Max-Age=${v ? 600 : 0}`;
  const callback = `${url.origin}/api/auth/google/callback`;

  if (url.pathname === '/api/auth/google') {
    const intent = ['signin', 'link', 'reset'].includes(url.searchParams.get('intent')) ? url.searchParams.get('intent') : 'signin';
    const room = /^[A-Z2-9]{6}$/.test(url.searchParams.get('room') || '') ? url.searchParams.get('room') : '';
    if (intent === 'link' && !(await linkAllowed(req, env, await currentSession(req, env)))) return redirect('/#auth-confirm');
    const state = randomHex(16);
    const q = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID, redirect_uri: callback, response_type: 'code',
      scope: 'openid email profile', state, prompt: 'select_account',
    });
    return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`, stateCookie(`${state}.${intent}.${room}`));
  }

  // callback
  const [state, intent, room] = (getCookie(req, 'gstate') || '').split('.');
  const to = outcome => `/#auth-${outcome}${room && /^[A-Z2-9]{6}$/.test(room) ? '-' + room : ''}`;
  const fail = outcome => new Response(null, { status: 302, headers: [['location', to(outcome)], ['set-cookie', stateCookie('')], ['set-cookie', linkCookie(url, '')]] });
  const signIn = async (userId, outcome) => new Response(null, {
    status: 302, headers: [['location', to(outcome)], ['set-cookie', await createSession(env, userId, url, 'google')], ['set-cookie', stateCookie('')]],
  });
  try {
    if (url.searchParams.get('error')) return fail('cancelled');
    if (!state || !sameString(state, url.searchParams.get('state') || '')) return fail('failed'); // CSRF: the state must round-trip
    const code = url.searchParams.get('code');
    if (!code) return fail('failed');
    const tr = await fetch(env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: callback, grant_type: 'authorization_code' }),
    });
    const tokens = tr.ok ? await tr.json().catch(() => ({})) : {};
    const profile = googleProfile(tokens.id_token, env.GOOGLE_CLIENT_ID);
    if (!profile) return fail('failed');

    const owner = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind(profile.sub).first();

    if (intent === 'link') {
      const s = await currentSession(req, env);
      if (!s || s.user.guest || !(await linkAllowed(req, env, s))) return fail('confirm');
      if (owner && owner.id !== s.user.id) return fail('taken');
      if (s.row.google_sub && s.row.google_sub !== profile.sub) return fail('already'); // never silently swap
      await env.DB.prepare('UPDATE users SET google_sub = ?, email = ? WHERE id = ?').bind(profile.sub, profile.email, s.user.id).run();
      return fail('linked');
    }

    if (owner) {
      await env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(profile.email, owner.id).run();
      return signIn(owner.id, intent === 'reset' ? 'reset' : 'signedin');
    }
    if (intent === 'reset') return fail('notlinked');

    // first time with this Google account: make a Playroom account for it
    const id = crypto.randomUUID();
    const username = await freeUsername(env, usernameBase(profile));
    const display = (profile.name || username).trim().replace(/\s+/g, ' ').slice(0, 20);
    await env.DB.prepare('INSERT INTO users (id, username, display_name, pass_hash, salt, is_guest, created_at, email, google_sub) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)')
      .bind(id, username, display, '', '', Date.now(), profile.email, profile.sub).run();
    return signIn(id, 'welcome');
  } catch (e) {
    // a top-level page load: never show raw JSON (e.g. Google unreachable, a double-submitted callback)
    console.error(e);
    return fail('failed');
  }
}

function makeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map(b => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join('');
}

async function readBody(req) { try { return await req.json(); } catch { return {}; } }

// Blocks other websites from using a signed-in visitor's cookie (CSRF / WebSocket hijacking).
// Behind a dev tunnel the Host header and URL can differ, so accept either.
function badOrigin(req, url) {
  const o = req.headers.get('origin');
  if (!o) return false;
  let host;
  try { host = new URL(o).host; } catch { return true; }
  const allowed = [url.host, req.headers.get('host'), req.headers.get('x-forwarded-host')].filter(Boolean);
  return !allowed.includes(host);
}

async function handleApi(req, env, url) {
  const path = url.pathname;
  const unsafe = req.method !== 'GET' || req.headers.get('upgrade') === 'websocket';
  if (unsafe && badOrigin(req, url)) return json({ error: 'Request blocked.' }, 403);

  /* ----- auth ----- */
  if (path === '/api/config') return json({ google: googleOn(env) });
  if ((path === '/api/auth/google' || path === '/api/auth/google/callback') && req.method === 'GET') return handleGoogle(req, env, url);

  if (path === '/api/signup' && req.method === 'POST') {
    const { username = '', password = '' } = await readBody(req);
    const name = String(username).trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) return json({ error: 'Usernames are 3–20 letters, numbers or underscores.' }, 400);
    if (String(password).length < 8) return json({ error: 'Passwords need at least 8 characters.' }, 400);
    const exists = await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(name).first();
    if (exists) return json({ error: 'That username is taken.' }, 409);
    const id = crypto.randomUUID();
    const salt = randomHex(16);
    try {
      await env.DB.prepare('INSERT INTO users (id, username, display_name, pass_hash, salt, is_guest, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)')
        .bind(id, name, name, await hashPassword(String(password), salt), salt, Date.now()).run();
    } catch {
      return json({ error: 'That username is taken.' }, 409);
    }
    return json({ id, username: name, name, guest: false, google: null, hasPassword: true }, 201, { 'set-cookie': await createSession(env, id, url) });
  }

  // Join with just a name: friends who got an invite token don't need an account.
  if (path === '/api/guest' && req.method === 'POST') {
    const { name = '' } = await readBody(req);
    const display = String(name).trim().replace(/\s+/g, ' ');
    if (!/^[\p{L}\p{M}\p{N} _.'-]{1,20}$/u.test(display)) return json({ error: 'Use 1–20 letters or numbers for your name.' }, 400);
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO users (id, username, display_name, pass_hash, salt, is_guest, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)')
      .bind(id, 'guest_' + id.slice(0, 8), display, '', '', Date.now()).run();
    return json({ id, username: null, name: display, guest: true, google: null, hasPassword: false }, 201, { 'set-cookie': await createSession(env, id, url, 'guest') });
  }

  if (path === '/api/login' && req.method === 'POST') {
    const { username = '', password = '' } = await readBody(req);
    const row = await env.DB.prepare(`SELECT id, username, display_name, is_guest, pass_hash, salt, email, google_sub, pass_hash <> '' AS has_password FROM users WHERE username = ? AND is_guest = 0`)
      .bind(String(username).trim()).first();
    const ok = row && row.pass_hash && sameString(await hashPassword(String(password), row.salt), row.pass_hash);
    if (!ok) {
      if (row && !row.pass_hash && row.google_sub) return json({ error: 'This account signs in with Google. Use Continue with Google.' }, 401);
      return json({ error: 'Wrong username or password.' }, 401);
    }
    return json(publicUser(row), 200, { 'set-cookie': await createSession(env, row.id, url) });
  }

  if (path === '/api/logout' && req.method === 'POST') {
    const t = getCookie(req, 'sid');
    if (t) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(t)).run();
    return json({ ok: true }, 200, { 'set-cookie': `sid=; HttpOnly${secure(url)}; SameSite=Lax; Path=/; Max-Age=0` });
  }

  const session = await currentSession(req, env);
  const user = session && session.user;

  if (path === '/api/me') {
    if (!user) return json({ error: 'Not signed in.' }, 401);
    const r = session.row;
    return json({ ...user, resetUntil: r.via === 'google' ? (r.session_created || 0) + RESET_WINDOW_MS : 0 });
  }

  // Step 1 of connecting Google to an existing account: confirm the password, get a 10-minute pass.
  if (path === '/api/link/google' && req.method === 'POST') {
    if (!googleOn(env)) return json({ error: 'Google sign-in isn’t set up on this server yet.' }, 400);
    if (user.guest) return json({ error: 'Guests can’t connect Google.' }, 403);
    if (session.row.google_sub) return json({ error: 'Google is already connected to this account.' }, 409);
    const { password = '' } = await readBody(req);
    const cur = await env.DB.prepare('SELECT pass_hash, salt FROM users WHERE id = ?').bind(user.id).first();
    if (!cur.pass_hash || !sameString(await hashPassword(String(password), cur.salt), cur.pass_hash)) return json({ error: 'That password isn’t right.' }, 401);
    const exp = Date.now() + LINK_MS;
    return json({ ok: true }, 200, { 'set-cookie': linkCookie(url, `${exp}.${await hmac(env, `link.${session.tokenHash}.${exp}`)}`) });
  }
  if (!user) return json({ error: 'Sign in first.' }, 401);

  // Set or change your password. Needs the current one, unless the account has none yet
  // (Google-only) or you signed in with Google in the last 15 minutes (forgot password).
  if (path === '/api/password' && req.method === 'POST') {
    if (user.guest) return json({ error: 'Guests don’t have a password.' }, 403);
    const { password = '', current = '' } = await readBody(req);
    if (String(password).length < 8) return json({ error: 'Passwords need at least 8 characters.' }, 400);
    const r = session.row;
    const viaGoogle = r.via === 'google' && Date.now() - (r.session_created || 0) < RESET_WINDOW_MS;
    if (r.has_password && !viaGoogle) {
      const cur = await env.DB.prepare('SELECT pass_hash, salt FROM users WHERE id = ?').bind(user.id).first();
      if (!sameString(await hashPassword(String(current), cur.salt), cur.pass_hash)) return json({ error: 'Your current password isn’t right.' }, 401);
    }
    const salt = randomHex(16);
    await env.DB.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').bind(await hashPassword(String(password), salt), salt, user.id).run();
    // sign out everywhere else
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').bind(user.id, session.tokenHash).run();
    return json({ ...user, hasPassword: true });
  }

  /* ----- rooms ----- */
  if (path === '/api/rooms' && req.method === 'POST') {
    if (user.guest) return json({ error: 'Create a free account to host a room. Guests can join with a token.' }, 403);
    const { game, players, options: rawOptions } = await readBody(req);
    const def = GAMES[game];
    if (!def) return json({ error: 'Pick a game.' }, 400);
    const size = Number(players);
    if (!Number.isInteger(size) || size < def.min || size > def.max)
      return json({ error: `${def.name} takes ${def.min === def.max ? def.min : def.min + '–' + def.max} players.` }, 400);
    const { options, error } = normalizeOptions(game, size, rawOptions || {});
    if (error) return json({ error }, 400);
    for (let i = 0; i < 5; i++) {
      const token = makeToken();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(token));
      const r = await stub.fetch('https://room/init', {
        method: 'POST', headers: { 'x-user-id': user.id }, body: JSON.stringify({ token, game, size, options }),
      });
      if (r.status === 201) return json({ token }, 201);
    }
    return json({ error: 'Couldn’t create a room. Try again.' }, 500);
  }

  const m = path.match(/^\/api\/rooms\/([A-Za-z0-9]{6})(\/ws)?$/);
  if (m) {
    const token = m[1].toUpperCase();
    const stub = env.ROOMS.get(env.ROOMS.idFromName(token));
    const headers = new Headers(req.headers);
    headers.set('x-user-id', user.id);
    headers.set('x-user-name', user.name);
    headers.set('x-user-guest', user.guest ? '1' : '0');
    if (m[2]) {
      if (req.headers.get('upgrade') !== 'websocket') return json({ error: 'Expected a WebSocket.' }, 426);
      return stub.fetch('https://room/ws', { headers });
    }
    return stub.fetch('https://room/info', { headers });
  }

  return json({ error: 'Not found.' }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await handleApi(req, env, url); }
      catch (e) { console.error(e); return json({ error: 'Server error. Try again.' }, 500); }
    }
    return env.ASSETS.fetch(req);
  },
};
