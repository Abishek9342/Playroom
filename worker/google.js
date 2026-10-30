// Helpers for Sign in with Google. Pure functions, so they're unit-tested in test/games.test.js.

const b64urlDecode = s => {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
};

// Reads the ID token Google's token endpoint returned to us. It came straight from Google over
// HTTPS in exchange for our client secret, so (per Google's docs) its signature needn't be
// re-checked; we still check who issued it, who it's for, expiry and a verified email.
// Returns { sub, email, name } or null.
export function googleProfile(idToken, clientId, now = Date.now()) {
  if (typeof idToken !== 'string' || idToken.split('.').length !== 3) return null;
  let c;
  try { c = JSON.parse(b64urlDecode(idToken.split('.')[1])); } catch { return null; }
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(c.iss)) return null;
  if (c.aud !== clientId) return null;
  if (!c.exp || c.exp * 1000 < now) return null;
  if (!c.sub || !c.email || !(c.email_verified === true || c.email_verified === 'true')) return null;
  return { sub: String(c.sub), email: String(c.email).toLowerCase(), name: c.name ? String(c.name) : '' };
}

// A starting username from the Google profile: letters, numbers and underscores, 3–16 long.
export function usernameBase({ email = '', name = '' }) {
  const pick = s => s.normalize('NFKD').replace(/[^A-Za-z0-9_]/g, '').slice(0, 16);
  const b = [pick(email.split('@')[0]), pick(name)].find(x => x.length >= 3);
  return b || 'player';
}
