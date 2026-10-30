import assert from 'node:assert/strict';
import { createGame, genPatches, checkPatches, normalizeOptions, xoLines } from '../shared/games.js';
import { RoomCore } from '../shared/roomCore.js';
import { validDrop as splitDrop, handPoints, botMove, isJoker } from '../shared/fivecards.js';

function makeCtx(ids) {
  const alive = new Set(ids);
  const ctx = {
    result: null, timerFn: null,
    seats: () => ids, alive: () => ids.filter(i => alive.has(i)),
    setTimer: (ms, fn) => { ctx.timerFn = fn; },
    eliminate: id => { alive.delete(id); if (ctx.alive().length <= 1) ctx.result = { winner: ctx.alive()[0] }; else ctx.game.onEliminated(id); },
    finish: (winner, text) => { ctx.result = { winner, text }; },
  };
  return ctx;
}

// Word chain
{
  const ctx = makeCtx(['a', 'b', 'c']);
  const g = ctx.game = createGame('wordchain', ctx); g.start();
  assert.equal(g.handle('b', { type: 'word', word: 'cat' }), 'It’s not your turn.');
  assert.equal(g.handle('a', { type: 'word', word: 'cat' }), null);
  assert.match(g.handle('b', { type: 'word', word: 'dog' }), /start with T/);
  assert.equal(g.handle('b', { type: 'word', word: 'Tiger' }), null);
  assert.equal(g.handle('c', { type: 'word', word: 'rat' }), null);
  assert.equal(g.handle('a', { type: 'word', word: 'tic' }), null);
  assert.equal(g.handle('b', { type: 'word', word: 'cat' }), '“cat” was already played. Words can’t repeat.');
  assert.match(g.handle('b', { type: 'word', word: 'c4t' }), /letters only/);
  ctx.timerFn(); // b times out
  assert.equal(g.turn, 'c');
  console.log('word chain ok');
}
// XO
{
  const ctx = makeCtx(['a', 'b']);
  const g = ctx.game = createGame('xo', ctx); g.start();
  for (const [p, i] of [['a', 0], ['b', 3], ['a', 1], ['b', 4]]) assert.equal(g.handle(p, { type: 'place', i }), null);
  assert.equal(g.handle('a', { type: 'place', i: 4 }), 'Pick an empty square.');
  assert.equal(g.handle('a', { type: 'place', i: 2 }), null);
  assert.equal(ctx.result.winner, 'a');

  // 5x5 needs all five in a row
  assert.equal(xoLines(3).length, 8);
  assert.equal(xoLines(5).length, 12);
  const c5 = makeCtx(['a', 'b']);
  const g5 = c5.game = createGame('xo', c5, { options: { board: 5, bestOf: 1 } }); g5.start();
  assert.equal(g5.board.length, 25);
  for (const [p, i] of [['a', 0], ['b', 5], ['a', 1], ['b', 6], ['a', 2], ['b', 7], ['a', 3], ['b', 8]]) assert.equal(g5.handle(p, { type: 'place', i }), null);
  assert.equal(c5.result, null, 'four in a row is not enough on 5x5');
  assert.equal(g5.handle('a', { type: 'place', i: 4 }), null);
  assert.equal(c5.result.winner, 'a');
  assert.equal(c5.result.text, 'Five in a row');

  // best of 3: 2-0 can't be caught, so it ends after round 2; starter alternates; a timeout loses the round
  const c3 = makeCtx(['a', 'b']);
  const g3 = c3.game = createGame('xo', c3, { options: { board: 3, bestOf: 3 } }); g3.start();
  for (const [p, i] of [['a', 0], ['b', 3], ['a', 1], ['b', 4], ['a', 2]]) g3.handle(p, { type: 'place', i });
  assert.equal(c3.result, null);
  assert.equal(g3.phase, 'roundover');
  assert.deepEqual(g3.wins, { a: 1, b: 0 });
  assert.match(g3.handle('b', { type: 'place', i: 0 }), /next round/);
  c3.timerFn(); // pause over, round 2
  assert.equal(g3.round, 2);
  assert.equal(g3.turn, 'b', 'b opens round 2');
  c3.timerFn(); // b runs out of time
  assert.deepEqual(g3.wins, { a: 2, b: 0 });
  assert.equal(c3.result.winner, 'a');
  assert.equal(c3.result.text, 'Won the match 2–0');

  // best of 3 is never more than 3 rounds: draw, draw, then a win takes the match 1-0
  const drawRound = (g, c) => { // cells 0,2,3,7,8 for the opener and 1,4,5,6 for the other: no line
    const opener = g.turn, other = g.other(opener);
    for (const [p, i] of [[opener, 0], [other, 1], [opener, 2], [other, 4], [opener, 3], [other, 5], [opener, 7], [other, 6], [opener, 8]]) {
      if (g.phase !== 'play' || c.result) break; // the round ended early: no winning moves left
      assert.equal(g.handle(p, { type: 'place', i }), null);
    }
  };
  const cd = makeCtx(['a', 'b']);
  const gd = cd.game = createGame('xo', cd, { options: { board: 3, bestOf: 3 } }); gd.start();
  drawRound(gd, cd); assert.equal(gd.phase, 'roundover'); cd.timerFn();
  drawRound(gd, cd); assert.equal(cd.result, null); cd.timerFn();
  assert.equal(gd.round, 3);
  cd.timerFn(); // round 3: the opener runs out of time, the other player wins the round
  assert.equal(cd.result.winner, 'b');
  assert.equal(cd.result.text, 'Won the match 1–0, 2 drawn');
  assert.equal(gd.history[0].how, 'No winning moves left');

  // single game: ends as soon as nobody can win, before the board is full
  const cn = makeCtx(['a', 'b']);
  const gn = cn.game = createGame('xo', cn, { options: { board: 3, bestOf: 1 } }); gn.start();
  for (const [p, i] of [['a', 0], ['b', 1], ['a', 2], ['b', 4], ['a', 3], ['b', 5], ['a', 7]]) assert.equal(gn.handle(p, { type: 'place', i }), null);
  assert.equal(cn.result, null, 'a can still make 0-3-6');
  assert.equal(gn.handle('b', { type: 'place', i: 6 }), null);
  assert.deepEqual(cn.result, { winner: null, text: 'Draw: no winning moves left' });
  assert.equal(gn.board.filter(Boolean).length, 8, 'one square still empty');
  // an open line is not called off too early: a 5x5 opening is still winnable
  const c55 = makeCtx(['a', 'b']);
  const g55 = c55.game = createGame('xo', c55, { options: { board: 5, bestOf: 1 } }); g55.start();
  g55.handle('a', { type: 'place', i: 12 }); g55.handle('b', { type: 'place', i: 0 });
  assert.equal(c55.result, null);
  // three draws: match drawn after exactly 3 rounds
  const ce = makeCtx(['a', 'b']);
  const ge = ce.game = createGame('xo', ce, { options: { board: 3, bestOf: 3 } }); ge.start();
  drawRound(ge, ce); ce.timerFn(); drawRound(ge, ce); ce.timerFn(); drawRound(ge, ce);
  assert.equal(ge.round, 3);
  assert.deepEqual(ce.result, { winner: null, text: 'Match drawn 0–0, 3 drawn' });
  // best of 5: 1-1 after 2, draw, a, b -> 2-2 after 5 rounds = drawn match, never a 6th round
  const cf = makeCtx(['a', 'b']);
  const gf = cf.game = createGame('xo', cf, { options: { board: 3, bestOf: 5 } }); gf.start();
  cf.timerFn(); cf.timerFn(); // a opens round 1 and times out: b 1-0
  cf.timerFn(); cf.timerFn(); // b opens round 2 and times out: 1-1
  drawRound(gf, cf); cf.timerFn();
  cf.timerFn(); cf.timerFn(); // round 4
  cf.timerFn(); // round 5
  assert.equal(gf.round, 5);
  assert.equal(cf.result.winner, null);
  assert.match(cf.result.text, /^Match drawn 2–2/);
  assert.deepEqual(normalizeOptions('xo', 2, { board: 4 }).error, 'Board size must be between 3 and 5 in steps of 2.');
  assert.deepEqual(normalizeOptions('xo', 2, { board: 5, bestOf: 5 }).options, { board: 5, bestOf: 5 });
  console.log('xo ok');
}
// Leaving the screen: only Word Chain knocks you out
{
  const real = globalThis.setTimeout;
  const pending = [];
  globalThis.setTimeout = (fn, ms) => { pending.push(fn); return pending.length; }; // capture timers
  const xo = new RoomCore({ token: 'X', game: 'xo', size: 2, options: {} });
  xo.join('a', 'A'); xo.join('b', 'B');
  xo.away('a', 'switched tabs');
  assert.equal(xo.find('a').away, true, 'shown as Away');
  assert.equal(xo.graces.size, 0, 'no elimination timer outside Word Chain');
  xo.disconnect('b');
  assert.equal(xo.find('b').alive, true, 'closing the page is not elimination either');
  xo.back('a');
  assert.equal(xo.find('a').away, false);
  const wc = new RoomCore({ token: 'W', game: 'wordchain', size: 2, options: {} }, { isWord: () => true });
  wc.join('a', 'A'); wc.join('b', 'B');
  wc.away('b', 'switched tabs');
  assert.equal(wc.graces.size, 1, 'Word Chain starts the 3 s grace');
  pending[pending.length - 1]();
  assert.equal(wc.find('b').alive, false);
  assert.equal(wc.status, 'over');
  globalThis.setTimeout = real;
  xo.stopTimers(); wc.stopTimers();
  console.log('presence ok');
}
// Rematch: everyone votes, same seats and settings play again
{
  const core = new RoomCore({ token: 'T', game: 'xo', size: 2, options: { board: 3, bestOf: 1 } });
  core.join('a', 'A'); core.join('b', 'B');
  assert.equal(core.status, 'playing');
  for (const [p, i] of [['a', 0], ['b', 3], ['a', 1], ['b', 4], ['a', 2]]) core.move(p, { type: 'place', i });
  assert.equal(core.status, 'over');
  assert.equal(core.rematch('a'), null);
  assert.equal(core.status, 'over', 'waits for the other player');
  assert.equal(core.view('b').players[0].rematch, true);
  assert.equal(core.rematch('b'), null);
  assert.equal(core.status, 'playing');
  assert.equal(core.match, 1);
  assert.equal(core.game.turn, 'b', 'the other player opens the rematch');
  // a request can be turned down; it clears for everyone and can be asked again
  for (const [p, i] of [['b', 0], ['a', 3], ['b', 1], ['a', 4], ['b', 2]]) core.move(p, { type: 'place', i });
  assert.equal(core.status, 'over');
  core.rematch('a');
  assert.equal(core.view('b').players.find(p => p.id === 'a').rematch, true, 'b is asked');
  core.declineRematch('b');
  assert.equal(core.status, 'over');
  assert.ok(core.players.every(p => !p.rematch));
  assert.deepEqual(core.view('a').declined, { by: 'b', name: 'B', n: 1 });
  core.rematch('a'); core.rematch('b');
  assert.equal(core.status, 'playing');
  assert.equal(core.match, 2);
  // a vote from someone who then leaves the room doesn't stand
  for (const [p, i] of [['b', 0], ['a', 3], ['b', 1], ['a', 4], ['b', 2]]) core.move(p, { type: 'place', i });
  core.rematch('b');
  core.disconnect('b');
  assert.equal(core.find('b').rematch, false);
  core.join('b', 'B'); // came back
  core.rematch('a'); core.rematch('b');
  assert.equal(core.status, 'playing');
  core.leave('a');
  assert.equal(core.status, 'over');
  core.disconnect('a');
  assert.match(core.rematch('b'), /left the room/);
  core.stopTimers();
  console.log('rematch ok');
}
// Patches: generator always produces a solvable puzzle
for (let t = 0; t < 2000; t++) {
  const p = genPatches(6);
  assert.equal(checkPatches(6, p.clues, p.answer), null);
}
{
  const p = genPatches(6);
  assert.ok(checkPatches(6, p.clues, [{ r: 0, c: 0, h: 6, w: 6 }]));
  assert.ok(checkPatches(6, p.clues, []));
  // shape badges are enforced: a 2x1 'wide' clue can't be satisfied by a tall patch
  const clues = [{ r: 0, c: 0, n: 2, shape: 'wide' }, { r: 1, c: 0, n: null, shape: 'wide' }];
  assert.equal(checkPatches(2, clues, [{ r: 0, c: 0, h: 1, w: 2 }, { r: 1, c: 0, h: 1, w: 2 }]), null);
  assert.match(checkPatches(2, [{ r: 0, c: 0, n: 2, shape: 'tall' }, { r: 1, c: 1, n: 2, shape: 'any' }],
    [{ r: 0, c: 0, h: 1, w: 2 }, { r: 1, c: 0, h: 1, w: 2 }]), /taller/);
  assert.match(checkPatches(2, [{ r: 0, c: 0, n: null, shape: 'square' }], [{ r: 0, c: 0, h: 2, w: 1 }, { r: 0, c: 1, h: 2, w: 1 }]), /clue/);
  for (const q of p.clues) assert.ok(['square', 'wide', 'tall', 'any'].includes(q.shape) && (q.n != null || q.shape !== 'any'));
  console.log('patches ok');
}
// 5 Cards (Least Count), house rules: no Round Joker, 3 printed jokers per deck
{
  const C = (rank, suit) => (rank - 1) * 4 + suit; // suits: 0 ♣, 1 ♦, 2 ♥, 3 ♠
  const S = 3, H = 2, D = 1, CL = 0, JOKER = 52;
  assert.equal(handPoints([C(1, S), C(3, H), C(4, CL), C(10, D), C(12, S)]), 28);
  assert.equal(handPoints([C(1, S), C(3, H), C(5, D), JOKER]), 9);
  assert.equal(handPoints([52, 53, 54]), 0, 'all three jokers are 0');
  assert.equal(handPoints([C(7, H), C(5, D)]), 12, 'number cards are never jokers');
  const ok = cards => !!splitDrop(cards);
  assert.ok(ok([C(5, S), C(5, H)]), 'pair');
  assert.ok(ok([C(8, D), C(9, D), C(10, D)]), 'run');
  assert.ok(!ok([C(5, S), C(5, H), C(13, D)]), 'lone card cannot ride with a set');
  assert.ok(ok([C(1, H), C(2, H), C(3, H)]), 'A-2-3 run');
  assert.ok(ok([C(12, H), C(13, H), C(1, H)]), 'Q-K-A is a run (Ace high)');
  assert.ok(ok([C(11, S), C(12, S), C(13, S), C(1, S)]), 'J-Q-K-A is a run');
  assert.ok(ok([C(12, D), JOKER, C(1, D)]), 'Q-joker-A is a run');
  assert.ok(ok([C(13, CL), C(1, CL), JOKER]), 'K-A + joker is a run (joker plays Q)');
  assert.ok(!ok([C(12, H), C(13, H), C(1, D)]), 'Q-K-A needs one suit');
  assert.ok(!ok([C(13, H), C(1, H), C(2, H)]), 'K-A-2 does not wrap');
  assert.ok(!ok([C(8, CL), JOKER]), '8 + joker is not a pair');
  assert.ok(ok([C(8, CL), C(8, H), JOKER]), '8 8 + joker is three of a kind');
  assert.ok(ok([C(4, S), JOKER, C(6, S)]), 'joker fills a run gap');
  assert.ok(ok([C(4, S), C(5, S), 54]), 'third joker extends a run');
  assert.ok(!ok([C(4, S), JOKER, JOKER + 1, C(7, S)]), 'run takes one joker at most');
  assert.ok(!ok([C(4, H), C(5, CL), C(6, H)]), 'mixed suits are not a run');
  assert.ok(!ok([C(8, CL), C(8, CL) + 55]), 'no two naturals of the same suit (two decks)');
  assert.ok(!ok([C(5, S), C(5, H), C(8, D), C(9, D), C(10, D)]), 'two sets at once are not allowed');
  assert.ok(!ok([C(13, S), C(13, CL), C(4, H), C(4, D)]), 'two pairs at once are not allowed (the bot bug)');
  assert.ok(ok([C(13, D)]), 'single card');
  assert.ok(ok([JOKER]), 'a joker can be dropped alone');
  assert.ok(!ok([C(4, S), C(9, H)]), 'two unrelated cards');

  // everyone sees which card was taken from a drop; a drawn card stays hidden
  {
    const ctx = makeCtx(['a', 'b']);
    const g = ctx.game = createGame('cards', ctx); g.start();
    const p1 = g.turn, p2 = g.other ? null : (p1 === 'a' ? 'b' : 'a');
    assert.equal(g.handle(p1, { type: 'drop', cards: [g.hands[p1][0]] }), null);
    assert.equal(g.handle(p1, { type: 'pick', from: 'draw' }), null);
    assert.deepEqual(g.view(p2).lastPick, { by: p1, from: 'draw', turnNo: g.turnNo - 1 });
    const open = g.openDrop.cards[0];
    assert.equal(g.handle(p2, { type: 'drop', cards: [g.hands[p2][0]] }), null);
    assert.equal(g.handle(p2, { type: 'pick', from: 'drop', card: open }), null);
    const seen = g.view(p1).lastPick;
    assert.equal(seen.by, p2); assert.equal(seen.from, 'drop'); assert.equal(seen.card, open); assert.equal(seen.owner, p1);
    ctx.timerFn = null;
  }

  // Shows: valid (8 vs 14, 11, 21) and wrong (12 vs 15, 12, 20)
  const run = (pts, callerIdx) => {
    const ids = ['a', 'b', 'c', 'd'];
    const ctx = makeCtx(ids);
    const g = ctx.game = createGame('cards', ctx); g.start();
    const make = n => { const h = []; while (n >= 10) { h.push(C(10, h.length % 4)); n -= 10; } if (n) h.push(C(n, 3)); return h; };
    ids.forEach((id, i) => { g.hands[id] = make(pts[i]); });
    g.turn = ids[callerIdx]; g.phase = 'drop';
    assert.equal(g.handle(ids[callerIdx], { type: 'show' }), null);
    return g;
  };
  let g = run([8, 14, 11, 21], 0);
  assert.equal(g.last.good, true);
  assert.deepEqual(g.totals, { a: 0, b: 14, c: 11, d: 21 });
  // calling on 0 points (bug report): good call
  g = run([0, 14, 11, 21], 0);
  assert.equal(g.last.good, true);
  assert.equal(g.phase, 'roundover');
  g = run([12, 15, 12, 20], 0);
  assert.equal(g.last.good, false);
  assert.deepEqual(g.totals, { a: 50, b: 0, c: 0, d: 0 });

  // Turn flow: drop, then pick from previous drop or draw; buried cards; turn passes
  {
    const ctx = makeCtx(['a', 'b']);
    const g = ctx.game = createGame('cards', ctx); g.start();
    assert.equal(g.turn, 'a'); // dealer plays first
    assert.equal(g.hands.a.length, 5);
    assert.equal(g.handle('b', { type: 'show' }), 'It’s not your turn.');
    assert.match(g.handle('a', { type: 'pick', from: 'draw' }), /Drop first/);
    const opening = g.openDrop.cards[0];
    assert.equal(g.handle('a', { type: 'drop', cards: [g.hands.a[0]] }), null);
    assert.match(g.handle('a', { type: 'show' }), /only Show before/);
    assert.equal(g.handle('a', { type: 'pick', from: 'drop', card: opening }), null); // take the opening card
    assert.equal(g.hands.a.length, 5);
    assert.equal(g.turn, 'b');
    const aDrop = g.openDrop.cards[0];
    assert.equal(g.openDrop.by, 'a');
    assert.equal(g.handle('b', { type: 'drop', cards: [g.hands.b[0]] }), null);
    assert.equal(g.handle('b', { type: 'pick', from: 'draw' }), null);
    assert.ok(g.buried.includes(aDrop), 'untaken drop is buried');
    // timeout auto-plays (drop highest + draw)
    ctx.timerFn();
    assert.equal(g.turn, 'b');
    assert.equal(g.hands.a.length, 5);
    // hands stay private
    const v = g.view('b');
    assert.ok(!JSON.stringify(v).includes(JSON.stringify(g.hands.a)));
    assert.equal(v.counts.a, 5);
  }
  // Knockout: wrong calls push a player out at 200
  {
    const ctx = makeCtx(['a', 'b']);
    const g = ctx.game = createGame('cards', ctx); g.start();
    g.totals.a = 160;
    g.hands.a = [C(9, 0)]; g.hands.b = [C(1, 0)]; g.turn = 'a'; g.phase = 'drop';
    g.handle('a', { type: 'show' });
    assert.equal(g.totals.a, 210);
    assert.equal(ctx.result.winner, 'b');
  }
  // Bots: always produce a legal move, drop never invalid
  for (let t = 0; t < 300; t++) {
    const ctx = makeCtx(['a', 'b', 'c']);
    const g = ctx.game = createGame('cards', ctx); g.start();
    for (let k = 0; k < 30 && g.phase !== 'roundover'; k++) {
      const m = botMove(g, g.turn);
      assert.equal(g.handle(g.turn, m), null);
    }
  }
  // 6 players use two decks
  {
    const ctx = makeCtx(['a', 'b', 'c', 'd', 'e', 'f']);
    const g = ctx.game = createGame('cards', ctx); g.start();
    assert.equal(g.decks, 2);
    assert.equal(g.draw.length, 110 - 30 - 1);
    const all = [...g.draw, g.openDrop.cards[0], ...Object.values(g.hands).flat()];
    assert.equal(all.filter(c => isJoker(c)).length, 6, 'two decks = 6 jokers');
  }
  {
    const ctx = makeCtx(['a', 'b']);
    const g = ctx.game = createGame('cards', ctx); g.start();
    assert.equal(g.decks, 1);
    assert.equal(g.draw.length, 55 - 10 - 1, 'one deck = 52 + 3 jokers');
  }
  // Draw pile finished: discards are reshuffled into a new draw pile
  {
    const ctx = makeCtx(['a', 'b']);
    const g = ctx.game = createGame('cards', ctx); g.start();
    g.buried.push(...g.draw.splice(0, g.draw.length - 1)); // leave one card to draw
    const before = g.buried.length;
    assert.equal(g.handle('a', { type: 'drop', cards: [g.hands.a[0]] }), null);
    assert.equal(g.handle('a', { type: 'pick', from: 'draw' }), null);
    assert.equal(g.draw.length, before + 1, 'buried cards + the passed-over opening card became the new draw pile');
    assert.equal(g.buried.length, 0);
    assert.equal(g.openDrop.by, 'a', 'latest drop stays open');
  }
  // Host settings: decks and exit point
  {
    assert.deepEqual(normalizeOptions('cards', 4, {}).options, { decks: 1, exitAt: 200 });
    assert.deepEqual(normalizeOptions('cards', 6, {}).options, { decks: 2, exitAt: 200 });
    assert.deepEqual(normalizeOptions('cards', 3, { decks: 3, exitAt: 100 }).options, { decks: 3, exitAt: 100 });
    assert.ok(normalizeOptions('cards', 3, { decks: 4 }).error);
    assert.ok(normalizeOptions('cards', 3, { exitAt: 125 }).error, 'steps of 50');
    assert.ok(normalizeOptions('cards', 3, { exitAt: 20 }).error);
    const ctx = makeCtx(['a', 'b', 'c']);
    const g = ctx.game = createGame('cards', ctx, { options: { decks: 3, exitAt: 100 } }); g.start();
    assert.equal(g.decks, 3);
    assert.equal(g.draw.length, 165 - 15 - 1);
    g.totals.a = 60; g.hands.a = [(9 - 1) * 4]; g.hands.b = [0]; g.hands.c = [1]; g.turn = 'a'; g.phase = 'drop';
    g.handle('a', { type: 'show' });
    assert.equal(g.totals.a, 110);
    assert.ok(!ctx.alive().includes('a'), 'out at the host’s exit point (100)');
  }
  console.log('5 cards ok');
}

// Sign in with Google: ID token checks and username suggestions
{
  const { googleProfile, usernameBase } = await import('../worker/google.js');
  const tok = c => ['e30', Buffer.from(JSON.stringify(c)).toString('base64url'), 'sig'].join('.');
  const now = Date.now();
  const good = { iss: 'https://accounts.google.com', aud: 'cid', exp: Math.floor(now / 1000) + 60, sub: '42', email: 'A.B@Gmail.com', email_verified: true, name: 'A B' };
  assert.deepEqual(googleProfile(tok(good), 'cid', now), { sub: '42', email: 'a.b@gmail.com', name: 'A B' });
  assert.equal(googleProfile(tok({ ...good, aud: 'someone-else' }), 'cid', now), null, 'token for another app');
  assert.equal(googleProfile(tok({ ...good, iss: 'evil.com' }), 'cid', now), null, 'wrong issuer');
  assert.equal(googleProfile(tok({ ...good, exp: Math.floor(now / 1000) - 1 }), 'cid', now), null, 'expired');
  assert.equal(googleProfile(tok({ ...good, email_verified: false }), 'cid', now), null, 'unverified email');
  assert.equal(googleProfile('garbage', 'cid', now), null);
  assert.equal(usernameBase({ email: 'priya.k@gmail.com' }), 'priyak');
  assert.equal(usernameBase({ email: 'ab@x.com', name: 'Zoë Ng' }), 'ZoeNg');
  assert.equal(usernameBase({ email: '李@x.com', name: '李' }), 'player');
  console.log('google ok');
}
