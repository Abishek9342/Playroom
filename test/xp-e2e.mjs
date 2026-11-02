// XP, streaks and the daily puzzle over the real API (needs `npm run dev`; BASE=http://localhost:5180).
import { genPatches } from '../shared/games.js';
import { seeded, dayKey, XP } from '../shared/xp.js';
const B = process.env.BASE || 'http://localhost:5173';
const WS = B.replace(/^http/, 'ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const check = (label, ok, extra = '') => { if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', label, extra); };
const n = Date.now() % 100000;
async function signup(u) {
  const r = await fetch(B + '/api/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: 'password123' }) });
  await r.text();
  return r.headers.get('set-cookie').split(';')[0];
}
const me = async c => (await fetch(B + '/api/me', { headers: { cookie: c } })).json();
const post = async (path, body, c) => { const r = await fetch(B + path, { method: 'POST', headers: { cookie: c, 'content-type': 'application/json', origin: B }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };

// XP from an online XO game: winner gets play + win, loser gets play
const ca = await signup('xa' + n), cb = await signup('xb' + n);
check('new players start at 0 XP, no streak', (await me(ca)).xp === 0 && (await me(ca)).streak === 0);
const { token } = await (await fetch(B + '/api/rooms', { method: 'POST', headers: { cookie: ca, 'content-type': 'application/json' }, body: JSON.stringify({ game: 'xo', players: 2 }) })).json();
const conn = c => new Promise(res => { const ws = new WebSocket(`${WS}/api/rooms/${token}/ws`, { headers: { cookie: c } }); ws.onmessage = () => {}; ws.onopen = () => setTimeout(() => res(ws), 300); });
const wa = await conn(ca), wb = await conn(cb);
await sleep(400);
const mv = (ws, i) => ws.send(JSON.stringify({ type: 'move', move: { type: 'place', i } }));
for (const [w, i] of [[wa, 0], [wb, 3], [wa, 1], [wb, 4], [wa, 2]]) { mv(w, i); await sleep(200); }
await sleep(1500);
const A = await me(ca), Bm = await me(cb);
check('winner got play + win XP', A.xp === XP.play + XP.win, A.xp);
check('loser got play XP', Bm.xp === XP.play, Bm.xp);
check('both have a 1-day streak', A.streak === 1 && Bm.streak === 1, `${A.streak}/${Bm.streak}`);
wa.close(); wb.close();

// daily puzzle: everyone gets the same grid; a solve gives XP once
const d1 = await (await fetch(B + '/api/daily', { headers: { cookie: ca } })).json();
const d2 = await (await fetch(B + '/api/daily', { headers: { cookie: cb } })).json();
check('same daily grid for everyone', JSON.stringify(d1.clues) === JSON.stringify(d2.clues) && d1.day === dayKey());
const answer = genPatches(6, seeded('playroom-daily-' + d1.day)).answer;
const wrong = await post('/api/daily/solve', { rects: [{ r: 0, c: 0, h: 6, w: 6 }] }, ca);
check('wrong solution rejected', wrong.status === 400, wrong.body.error);
await sleep(1100);
const ok = await post('/api/daily/solve', { rects: answer }, ca);
check('solve accepted with XP', ok.status === 200 && ok.body.xpGain === XP.daily && ok.body.ms > 0, JSON.stringify({ ms: ok.body.ms, xp: ok.body.xpGain }));
check('on today’s board', ok.body.board.top.some(r => r.me));
const again = await post('/api/daily/solve', { rects: answer }, ca);
check('no XP for solving twice', again.body.xpGain === 0);
check('XP total now game + daily', (await me(ca)).xp === XP.play + XP.win + XP.daily);
const solvedView = await (await fetch(B + '/api/daily', { headers: { cookie: ca } })).json();
check('daily shows as solved after reopening', !!solvedView.solvedAt);
console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
