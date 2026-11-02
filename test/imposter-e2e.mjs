// Imposter end to end over real WebSockets (needs `npm run dev`; BASE=http://localhost:5180).
// Checks: secrets never reach the wrong phone, clue turns, chat, vote, last-chance guess, team result.
const B = process.env.BASE || 'http://localhost:5173';
const WS = B.replace(/^http/, 'ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const s = Date.now() % 100000;
let fail = 0;
const check = (label, ok, extra = '') => { if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', label, extra); };
async function signup(u) {
  const r = await fetch(B + '/api/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: 'password123' }) });
  await r.text();
  return r.headers.get('set-cookie').split(';')[0];
}
function conn(cookie, token) {
  return new Promise(res => {
    const ws = new WebSocket(`${WS}/api/rooms/${token}/ws`, { headers: { cookie } });
    const st = { ws, last: null, errors: [], all: [] };
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'state') { st.last = m; st.all.push(e.data); } else st.errors.push(m); };
    ws.onopen = () => setTimeout(() => res(st), 300);
  });
}
const move = (p, m) => p.ws.send(JSON.stringify({ type: 'move', move: m }));

const cookies = [];
for (const n of ['ia', 'ib', 'ic', 'id']) cookies.push(await signup(n + s));
const r = await fetch(B + '/api/rooms', { method: 'POST', headers: { cookie: cookies[0], 'content-type': 'application/json' }, body: JSON.stringify({ game: 'imposter', players: 4, options: { laps: 1, hint: 0, voteSecs: 60 } }) });
const { token } = await r.json();
const P = [];
for (const c of cookies) { P.push(await conn(c, token)); await sleep(150); }
await sleep(400);
const g0 = P[0].last.g;
check('game starts in the reveal phase', P[0].last.status === 'playing' && g0.phase === 'reveal', g0.phase);
const imp = P.find(p => p.last.g.role === 'imposter');
const crew = P.filter(p => p !== imp);
const word = crew[0].last.g.word;
check('exactly one Imposter', P.filter(p => p.last.g.role === 'imposter').length === 1);
check('crew all see the same word', crew.every(p => p.last.g.word === word) && !!word, word);
check('Imposter view has no word and no category (hint off)', imp.last.g.word === null && imp.last.g.category === null);
check('crew views never name the Imposter', crew.every(p => p.last.g.imposters === null));
check('word never sent to the Imposter in any message so far', !imp.all.some(m => m.toLowerCase().includes(`"word":"${word.toLowerCase()}"`)));

P.forEach(p => p.ws.send(JSON.stringify({ type: 'move', move: { type: 'ready' } })));
await sleep(500);
check('everyone ready -> clues', P[0].last.g.phase === 'clues');
const byId = id => P.find(p => p.last.you === id);
const notTurn = P.find(p => p.last.you !== P[0].last.g.turn);
move(notTurn, { type: 'clue', text: 'early' }); await sleep(200);
check('out of turn clue rejected', notTurn.errors.at(-1) && /not your turn/.test(notTurn.errors.at(-1).message));
const clues = ['shiny', 'round', 'tasty', 'cold'];
for (let i = 0; i < 4; i++) { const t = byId(P[0].last.g.turn); move(t, { type: 'clue', text: clues[i] }); await sleep(250); }
check('one lap of clues -> vote', P[0].last.g.phase === 'vote' && P[0].last.g.clues.length === 4, P[0].last.g.phase);
move(crew[0], { type: 'chat', text: 'hmm, suspicious' }); await sleep(200);
check('chat reaches everyone', P.every(p => p.last.g.messages.length === 1));
crew.forEach(p => move(p, { type: 'vote', who: imp.last.you }));
move(imp, { type: 'vote', who: crew[0].last.you }); await sleep(400);
check('Imposter caught -> last chance', P[0].last.g.phase === 'lastchance' && P[0].last.g.votedOut === imp.last.you);
check('still no word for the Imposter', imp.last.g.word === null);
move(imp, { type: 'guess', text: 'definitelywrong' }); await sleep(400);
const res = P[0].last.result;
check('crew wins', P[0].last.status === 'over' && res.title === 'The crew wins', JSON.stringify(res));
check('winners are the three crew', res.winners.length === 3 && !res.winners.includes(imp.last.you));
check('at the end everyone sees the word and the Imposter', P.every(p => p.last.g.word === word && p.last.g.imposters[0] === imp.last.you));
P.forEach(p => p.ws.close());
console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
