import { FiveCards } from './fivecards.js';
import { IMPOSTER_CATEGORIES } from './imposterWords.js';

// Server-side rules for every game. The server is the referee:
// clients only send moves, and every move is checked here.

// strictPresence: leaving the screen (switching apps/tabs or closing the page) for more than
// GRACE_MS knocks you out. Only Word Chain (user's rule, 2026-10-30): in the other games you're
// just shown as Away and can come back; their turn timers keep the game moving meanwhile.
export const GAMES = {
  wordchain: { name: 'Word Chain', min: 2, max: 8, strictPresence: true },
  xo: { name: 'XO', min: 2, max: 2 },
  patches: { name: 'Patches', min: 2, max: 8 },
  cards: { name: '5 Cards', min: 2, max: 8 },
  imposter: { name: 'Imposter', min: 3, max: 10 },
};

// Host-chosen room settings (beyond the player count), per game.
export const OPTIONS = {
  xo: {
    board: { min: 3, max: 5, step: 2, label: 'Board size' },
    bestOf: { min: 1, max: 5, step: 2, label: 'Best of' },
  },
  imposter: {
    imposters: { min: 1, max: 2, step: 1, label: 'Imposters' },
    category: { min: 0, max: IMPOSTER_CATEGORIES.length, step: 1, label: 'Category' }, // 0 = mixed
    hint: { min: 0, max: 1, step: 1, label: 'Imposter hint' },  // 1 = Imposter sees the category
    laps: { min: 1, max: 3, step: 1, label: 'Clue rounds' },
    voteSecs: { min: 30, max: 180, step: 30, label: 'Discussion time' },
  },
  cards: {
    decks: { min: 1, max: 3, step: 1, label: 'Decks' },
    exitAt: { min: 50, max: 1000, step: 50, label: 'Exit point' },
  },
};
export function defaultOptions(game, players) {
  if (game === 'cards') return { decks: players >= 6 ? 2 : 1, exitAt: 200 };
  if (game === 'xo') return { board: 3, bestOf: 1 };
  if (game === 'imposter') return { imposters: 1, category: 0, hint: 1, laps: 2, voteSecs: 90 };
  return {};
}
// Validates host settings. Returns { options } or { error }.
export function normalizeOptions(game, players, input = {}) {
  const spec = OPTIONS[game];
  if (!spec) return { options: {} };
  const out = defaultOptions(game, players);
  for (const [k, r] of Object.entries(spec)) {
    if (input[k] === undefined || input[k] === null) continue;
    const v = Number(input[k]);
    if (!Number.isInteger(v) || v < r.min || v > r.max || (v - r.min) % r.step !== 0)
      return { error: `${r.label} must be between ${r.min} and ${r.max}${r.step > 1 ? ` in steps of ${r.step}` : ''}.` };
    out[k] = v;
  }
  if (game === 'cards' && players * 5 + 1 > out.decks * 55) return { error: 'Not enough cards for that many players. Add a deck.' };
  if (game === 'imposter' && out.imposters > 1 && players < 5) return { error: 'Two Imposters need at least 5 players.' };
  return { options: out };
}

export const TURN_MS = 20000; // time per turn / per card round

// opts.isWord(word) -> boolean: dictionary check for Word Chain.
export function createGame(kind, ctx, opts = {}) {
  switch (kind) {
    case 'wordchain': return new WordChain(ctx, opts.isWord);
    case 'xo': return new XO(ctx, opts.options || {});
    case 'patches': return new Patches(ctx);
    case 'cards': return new FiveCards(ctx, opts.options || {});
    case 'imposter': return new Imposter(ctx, opts.options || {});
  }
  throw new Error('Unknown game: ' + kind);
}

// Next living player after `from`, in seat order.
function nextAlive(ctx, from) {
  const seats = ctx.seats();
  const alive = new Set(ctx.alive());
  const i = seats.indexOf(from);
  for (let k = 1; k <= seats.length; k++) {
    const c = seats[(i + k) % seats.length];
    if (alive.has(c)) return c;
  }
  return null;
}

/* ---------------- Word Chain ---------------- */
// 30 s per turn (running out still knocks you out). Every valid word scores by speed, timed
// on the server from the start of the turn (user's rule, 2026-10-31).
export const WC_TURN_MS = 30000;
export const WC_POINTS = [[5000, 5], [10000, 3], [15000, 2]]; // within ms -> points; later = 1
export const wordPoints = ms => (WC_POINTS.find(([limit]) => ms <= limit) || [0, 1])[1];
// First to WC_TARGET points wins (user's rule, 2026-10-31); last player standing still wins too.
export const WC_TARGET = 250;
// A "set" is one lap of the table: every player still in plays once. Screens show only the current
// set; the no-repeat rule still covers every word of the whole game.

class WordChain {
  constructor(ctx, isWord) {
    this.ctx = ctx;
    this.isWord = isWord || (() => true);
    this.words = [];          // [{w, by, pts, secs, set}]
    this.set = 1;
    this.setPlays = 0;        // words played in the current set
    this.used = new Set();    // every registered word, lowercase
    this.scores = Object.fromEntries(ctx.seats().map(id => [id, 0]));
    this.turn = null;
    this.turnStart = 0;
    this.deadline = 0;
  }
  start() { this.turn = this.ctx.alive()[0]; this.arm(); }
  arm() {
    const t = this.turn;
    this.turnStart = Date.now();
    this.deadline = this.turnStart + WC_TURN_MS;
    this.ctx.setTimer(WC_TURN_MS, () => this.ctx.eliminate(t, 'ran out of time'));
  }
  need() { return this.words.length ? this.words[this.words.length - 1].w.slice(-1) : null; }
  handle(id, m) {
    if (m.type !== 'word') return 'Unknown move.';
    if (id !== this.turn) return 'It’s not your turn.';
    const w = String(m.word || '').trim().toLowerCase();
    if (!/^[a-z]{2,30}$/.test(w)) return 'Use letters only, at least 2 of them.';
    const need = this.need();
    if (need && w[0] !== need) return `Your word must start with ${need.toUpperCase()}.`;
    if (this.used.has(w)) return `“${w}” was already played. Words can’t repeat.`;
    if (!this.isWord(w)) return `“${w}” isn’t in the dictionary.`;
    this.used.add(w);
    const ms = Date.now() - this.turnStart;
    const pts = wordPoints(ms);
    this.scores[id] = (this.scores[id] || 0) + pts;
    this.words.push({ w, by: id, pts, secs: Math.round(ms / 100) / 10, set: this.set });
    if (this.scores[id] >= WC_TARGET) { this.ctx.finish(id, `Reached ${WC_TARGET} points`); return null; }
    if (++this.setPlays >= this.ctx.alive().length) { this.set++; this.setPlays = 0; }
    this.turn = nextAlive(this.ctx, id);
    this.arm();
    return null;
  }
  onEliminated(id) {
    if (id === this.turn) { this.turn = nextAlive(this.ctx, id); this.arm(); }
  }
  view() {
    const current = this.words.filter(x => x.set === this.set);
    // between sets the list would be empty, so keep the word the next player must follow on from
    const prev = current.length === 0 && this.words.length ? this.words[this.words.length - 1] : null;
    return {
      words: current, prev, set: this.set, total: this.words.length, target: WC_TARGET,
      turn: this.turn, deadline: this.deadline, turnMs: WC_TURN_MS, turnStart: this.turnStart, need: this.need(), scores: this.scores,
    };
  }
}

/* ---------------- XO ---------------- */
// A win is always a full line: 3 in a row on 3x3, all 5 in a row on 5x5 (row, column or diagonal).
// Best of 3 or 5 is exactly that many rounds at most (user's rule): a drawn round still uses
// up a round. The match ends early once the leader can't be caught; after the last round the
// player with more round wins takes it, level = match drawn. The opener alternates every round.
export const XO_ROUND_PAUSE_MS = 3000;
export const xoNeed = n => n;

// Every winning line (k cells in a row) on an n x n board.
export function xoLines(n, k = xoNeed(n)) {
  const out = [];
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) for (const [dr, dc] of dirs) {
    const er = r + dr * (k - 1), ec = c + dc * (k - 1);
    if (er < 0 || er >= n || ec < 0 || ec >= n) continue;
    out.push(Array.from({ length: k }, (_, t) => (r + dr * t) * n + (c + dc * t)));
  }
  return out;
}

class XO {
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    const s = ctx.seats();
    this.n = options.board === 5 ? 5 : 3;
    this.k = xoNeed(this.n);
    this.lines = xoLines(this.n, this.k);
    this.bestOf = [1, 3, 5].includes(options.bestOf) ? options.bestOf : 1;
    this.marks = { [s[0]]: 'X', [s[1]]: 'O' };
    this.wins = { [s[0]]: 0, [s[1]]: 0 };
    this.round = 0;
    // rematches in the same room alternate who opens the match
    this.starter = s[(ctx.match ? ctx.match() : 0) % 2];
    this.history = []; // [{winner, how}] per finished round
    this.deadline = 0;
  }
  start() { this.newRound(); }
  newRound() {
    this.round++;
    if (this.round > 1) this.starter = this.other(this.starter);
    this.board = Array(this.n * this.n).fill(null);
    this.turn = this.starter;
    this.line = null;
    this.phase = 'play';
    this.arm();
  }
  other(id) { return Object.keys(this.marks).find(x => x !== id); }
  arm() {
    const t = this.turn;
    this.deadline = Date.now() + TURN_MS;
    this.ctx.setTimer(TURN_MS, () => {
      // single game: running out of time knocks you out; in a series you lose the round
      if (this.bestOf === 1) this.ctx.eliminate(t, 'ran out of time');
      else this.endRound(this.other(t), 'Opponent ran out of time');
    });
  }
  handle(id, m) {
    if (m.type !== 'place') return 'Unknown move.';
    if (this.phase !== 'play') return 'The next round is about to start.';
    if (id !== this.turn) return 'It’s not your turn.';
    const i = m.i;
    if (!Number.isInteger(i) || i < 0 || i >= this.board.length || this.board[i]) return 'Pick an empty square.';
    const mark = this.marks[id];
    this.board[i] = mark;
    const win = this.lines.find(l => l.every(j => this.board[j] === mark));
    if (win) { this.line = win; this.endRound(id, this.k === 3 ? 'Three in a row' : 'Five in a row'); return null; }
    if (this.board.every(Boolean)) { this.endRound(null, 'The board is full'); return null; }
    this.turn = nextAlive(this.ctx, id);
    // stop early when nobody can complete a line any more (user's request)
    if (!this.canStillWin()) { this.endRound(null, 'No winning moves left'); return null; }
    this.arm();
    return null;
  }
  // Can anyone still finish a line? A line is open for a player when it holds none of the
  // opponent's marks and its empty cells fit in that player's remaining moves (the player to
  // move gets the odd one out).
  canStillWin() {
    const empty = this.board.filter(v => !v).length;
    const next = this.marks[this.turn];
    const movesLeft = mark => (mark === next ? Math.ceil(empty / 2) : Math.floor(empty / 2));
    return this.lines.some(l => ['X', 'O'].some(mark => {
      const cells = l.map(j => this.board[j]);
      if (cells.some(v => v && v !== mark)) return false;
      return cells.filter(v => !v).length <= movesLeft(mark);
    }));
  }
  endRound(winner, how) {
    if (winner) this.wins[winner]++;
    this.history.push({ winner, how });
    const [a, b] = Object.keys(this.wins);
    const score = `${Math.max(this.wins[a], this.wins[b])}–${Math.min(this.wins[a], this.wins[b])}`;
    if (this.bestOf === 1) {
      if (winner) this.ctx.finish(winner, how);
      else this.ctx.finish(null, `Draw: ${how.charAt(0).toLowerCase()}${how.slice(1)}`);
      return;
    }
    // never more rounds than the format: stop at the last round, or once the lead can't be caught
    const left = this.bestOf - this.round;
    if (left === 0 || Math.abs(this.wins[a] - this.wins[b]) > left) {
      const lead = this.wins[a] === this.wins[b] ? null : this.wins[a] > this.wins[b] ? a : b;
      const draws = this.history.filter(h => !h.winner).length;
      const tail = draws ? `, ${draws} drawn` : '';
      this.ctx.finish(lead, lead ? `Won the match ${score}${tail}` : `Match drawn ${score}${tail}`);
      return;
    }
    this.phase = 'roundover';
    this.turn = null;
    this.deadline = Date.now() + XO_ROUND_PAUSE_MS;
    this.ctx.setTimer(XO_ROUND_PAUSE_MS, () => this.newRound());
  }
  onEliminated() {} // with 2 players, an elimination ends the game
  view() {
    return {
      n: this.n, k: this.k, board: this.board, marks: this.marks, turn: this.turn, deadline: this.deadline,
      turnMs: this.phase === 'roundover' ? XO_ROUND_PAUSE_MS : TURN_MS, line: this.line,
      bestOf: this.bestOf, wins: this.wins, round: this.round, phase: this.phase, history: this.history,
    };
  }
}

/* ---------------- Patches (Shikaku) ---------------- */
// Everyone gets the same grid (LinkedIn Patches rules). Split it into rectangles so each
// holds exactly one clue: the number (when shown) is its area, the badge is its shape.
// First valid solution wins (any valid solution counts).
const rnd = n => Math.floor(Math.random() * n);

export function genPatches(n) {
  const rects = [];
  const stack = [{ r: 0, c: 0, h: n, w: n }];
  while (stack.length) {
    const x = stack.pop();
    const a = x.h * x.w;
    // LinkedIn-like mix: mostly 3-9 squares, the odd 2 or single
    const split = a > 9 || (a >= 6 && Math.random() < 0.5) || (a >= 4 && Math.random() < 0.15);
    if (!split || (x.h < 2 && x.w < 2)) { rects.push(x); continue; }
    let horiz = x.h >= 2 && x.w >= 2 ? (x.h === x.w ? Math.random() < 0.5 : x.h > x.w) : x.h >= 2;
    const len = horiz ? x.h : x.w;
    // prefer cuts that don't leave 1-wide slivers
    const k = len >= 4 ? 2 + rnd(len - 3) : 1 + rnd(len - 1);
    if (horiz) stack.push({ r: x.r, c: x.c, h: k, w: x.w }, { r: x.r + k, c: x.c, h: x.h - k, w: x.w });
    else stack.push({ r: x.r, c: x.c, h: x.h, w: k }, { r: x.r, c: x.c + k, h: x.h, w: x.w - k });
  }
  // LinkedIn-style clues: every clue has a shape badge (square, wide, tall or any). Some
  // show only the shape, no number. A clue's colour index paints the patch drawn around it.
  const clues = rects.map((x, i) => {
    let shape = x.h === x.w ? 'square' : x.w > x.h ? 'wide' : 'tall';
    let num = x.h * x.w;
    const roll = Math.random();
    if (roll < 0.28) shape = 'any';
    else if (roll < 0.45 && num > 1) num = null; // shape only
    return { r: x.r + rnd(x.h), c: x.c + rnd(x.w), n: num, shape, color: i };
  });
  return { n, clues, answer: rects };
}

export const shapeOk = (shape, h, w) =>
  shape === 'square' ? h === w : shape === 'wide' ? w > h : shape === 'tall' ? h > w : true;
const SHAPE_WORD = { square: 'a square', wide: 'wider than it is tall', tall: 'taller than it is wide' };

export function checkPatches(n, clues, rects) {
  if (!Array.isArray(rects) || rects.length === 0 || rects.length > n * n) return 'Draw your rectangles first.';
  const grid = new Array(n * n).fill(-1);
  for (let i = 0; i < rects.length; i++) {
    const { r, c, h, w } = rects[i] || {};
    if (![r, c, h, w].every(Number.isInteger) || h < 1 || w < 1 || r < 0 || c < 0 || r + h > n || c + w > n)
      return 'One of your rectangles is outside the grid.';
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) {
      if (grid[y * n + x] !== -1) return 'Two rectangles overlap.';
      grid[y * n + x] = i;
    }
  }
  if (grid.includes(-1)) return 'Some squares aren’t covered yet.';
  for (let i = 0; i < rects.length; i++) {
    const { r, c, h, w } = rects[i];
    const inside = clues.filter(q => q.r >= r && q.r < r + h && q.c >= c && q.c < c + w);
    if (inside.length !== 1) return 'Each patch needs exactly one clue.';
    const q = inside[0];
    if (q.n != null && q.n !== h * w) return `The patch around the ${q.n} has the wrong size.`;
    if (!shapeOk(q.shape, h, w)) return `A patch must be ${SHAPE_WORD[q.shape]} to match its clue.`;
  }
  return null;
}

class Patches {
  constructor(ctx) { this.ctx = ctx; this.puzzle = genPatches(6); this.started = 0; }
  start() { this.started = Date.now(); }
  handle(id, m) {
    if (m.type !== 'solve') return 'Unknown move.';
    const err = checkPatches(this.puzzle.n, this.puzzle.clues, m.rects);
    if (err) return 'Not quite: ' + err;
    const secs = Math.round((Date.now() - this.started) / 1000);
    this.ctx.finish(id, `Solved the grid first, in ${secs}s`);
    return null;
  }
  onEliminated() {}
  view() { return { n: this.puzzle.n, clues: this.puzzle.clues, started: this.started }; }
}


/* ---------------- Imposter ---------------- */
// Social deduction (like imposter.app), one round per game; Rematch deals a new word.
// Everyone but the Imposter(s) gets the same secret word. Players take turns typing one-word
// clues (laps = clue rounds), then discuss in a chat and vote. Catch an Imposter and they get
// one last guess at the word; guess right and the Imposters still win. An Imposter may also try
// to guess the word at any time: right wins, wrong loses. Tied or missed vote = Imposters win.
// Secrets never leave the server: the word isn't in an Imposter's view, and who the Imposters
// are isn't in a crew member's view, until the game is over.
export const IMP_REVEAL_MS = 20000;  // look at your card
export const IMP_CLUE_MS = 30000;    // per clue
export const IMP_GUESS_MS = 25000;   // caught Imposter's last guess
const letters = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const shuffleArr = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function pickSecret(category = 0) {
  const cats = category ? [IMPOSTER_CATEGORIES[category - 1]] : IMPOSTER_CATEGORIES;
  const cat = cats[rnd(cats.length)];
  return { category: cat.name, word: cat.words[rnd(cat.words.length)] };
}

class Imposter {
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    const seats = ctx.seats();
    this.opts = {
      imposters: options.imposters || 1, category: options.category || 0,
      hint: options.hint === undefined ? 1 : options.hint, laps: options.laps || 2, voteSecs: options.voteSecs || 90,
    };
    Object.assign(this, pickSecret(this.opts.category));
    this.imposters = shuffleArr([...seats]).slice(0, this.opts.imposters);
    const start = rnd(seats.length);
    this.order = [...seats.slice(start), ...seats.slice(0, start)]; // clue order, random first player
    this.pos = 0;
    this.lap = 1;
    this.turn = null;
    this.clues = [];      // [{by, text|null (skipped), lap}]
    this.messages = [];   // discussion chat during the vote
    this.ready = new Set();
    this.votes = {};      // voter -> suspect
    this.votedOut = null;
    this.guess = null;    // { by, text, right }
    this.outcome = null;  // { team: 'crew'|'imposters', reason }
    this.phase = 'reveal';
    this.deadline = 0;
    this.phaseMs = IMP_REVEAL_MS;
  }
  alive() { return this.ctx.alive(); }
  isImp(id) { return this.imposters.includes(id); }
  timer(ms, fn) { this.phaseMs = ms; this.deadline = Date.now() + ms; this.ctx.setTimer(ms, fn); }

  start() { this.timer(IMP_REVEAL_MS, () => this.startClues()); }

  startClues() {
    this.phase = 'clues';
    this.pos = -1;
    this.lap = 1;
    this.nextClue();
  }
  // move to the next living player in clue order; after the last lap, go to the vote
  nextClue() {
    const alive = new Set(this.alive());
    for (let k = 0; k < this.order.length * 2; k++) {
      this.pos++;
      if (this.pos >= this.order.length) { this.pos = 0; this.lap++; }
      if (this.lap > this.opts.laps) return this.startVote();
      if (alive.has(this.order[this.pos])) break;
    }
    this.turn = this.order[this.pos];
    const t = this.turn;
    this.timer(IMP_CLUE_MS, () => { this.clues.push({ by: t, text: null, lap: this.lap }); this.nextClue(); });
  }

  startVote() {
    this.phase = 'vote';
    this.turn = null;
    this.votes = {};
    this.timer(this.opts.voteSecs * 1000, () => this.resolve());
  }

  resolve() {
    const alive = new Set(this.alive());
    const tally = {};
    for (const [voter, who] of Object.entries(this.votes)) if (alive.has(voter) && alive.has(who)) tally[who] = (tally[who] || 0) + 1;
    this.tally = tally;
    const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (!ranked.length) return this.win('imposters', 'Nobody voted');
    if (ranked[1] && ranked[1][1] === ranked[0][1]) return this.win('imposters', 'The vote was tied');
    this.votedOut = ranked[0][0];
    if (!this.isImp(this.votedOut)) return this.win('imposters', 'The vote caught the wrong player');
    // caught: one last chance to name the word
    this.phase = 'lastchance';
    this.turn = this.votedOut;
    this.timer(IMP_GUESS_MS, () => this.win('crew', 'Caught the Imposter'));
  }

  win(team, reason) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.turn = null;
    this.outcome = { team, reason };
    const winners = this.ctx.seats().filter(id => (team === 'crew') !== this.isImp(id));
    const title = team === 'crew' ? 'The crew wins' : this.imposters.length > 1 ? 'The Imposters win' : 'The Imposter wins';
    this.ctx.finish(null, reason, { winners, title });
  }

  handle(id, m) {
    const p = this.phase;
    if (p === 'over') return 'The round is over.';
    if (m.type === 'ready') {
      if (p !== 'reveal') return null;
      this.ready.add(id);
      if (this.alive().every(x => this.ready.has(x))) this.startClues();
      return null;
    }
    if (m.type === 'clue') {
      if (p !== 'clues') return 'It’s not time for clues.';
      if (id !== this.turn) return 'It’s not your turn.';
      const text = String(m.text || '').trim();
      if (!/^[A-Za-z][A-Za-z'-]{0,19}$/.test(text)) return 'One word only: letters, up to 20.';
      const secretParts = this.word.toLowerCase().split(/\s+/).map(letters);
      if (letters(text) === letters(this.word) || secretParts.includes(letters(text))) return 'That gives the word away. Try a different clue.';
      if (this.clues.some(c => c.text && letters(c.text) === letters(text))) return 'Someone already said that.';
      this.clues.push({ by: id, text, lap: this.lap });
      this.nextClue();
      return null;
    }
    if (m.type === 'chat') {
      if (p !== 'vote' && p !== 'lastchance') return 'You can chat once the clues are in.';
      const text = String(m.text || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      if (!text) return null;
      this.messages.push({ by: id, text, t: Date.now() });
      if (this.messages.length > 60) this.messages.shift();
      return null;
    }
    if (m.type === 'vote') {
      if (p !== 'vote') return 'Voting hasn’t started.';
      if (m.who === id) return 'You can’t vote for yourself.';
      if (!this.alive().includes(m.who)) return 'Pick a player who’s still in.';
      this.votes[id] = m.who;
      if (this.alive().every(x => this.votes[x])) this.resolve();
      return null;
    }
    if (m.type === 'guess') {
      if (!this.isImp(id)) return 'Only an Imposter can guess the word.';
      if (p === 'lastchance' && id !== this.votedOut) return 'Only the caught Imposter can guess now.';
      if (p === 'reveal') return 'Wait for the clues to start.';
      const text = String(m.text || '').trim().slice(0, 30);
      if (!letters(text)) return 'Type the word you think it is.';
      const right = letters(text) === letters(this.word);
      this.guess = { by: id, text, right };
      if (right) this.win('imposters', p === 'lastchance' ? 'Caught, but guessed the word' : 'Guessed the secret word');
      else this.win('crew', p === 'lastchance' ? 'Caught the Imposter' : 'The Imposter guessed wrong');
      return null;
    }
    return 'Unknown move.';
  }

  onEliminated(id) {
    const alive = this.alive();
    const imps = alive.filter(x => this.isImp(x));
    if (!imps.length) return this.win('crew', 'The Imposter left');
    if (alive.length - imps.length <= imps.length) return this.win('imposters', 'Not enough crew left');
    if (this.phase === 'reveal' && alive.every(x => this.ready.has(x))) return this.startClues();
    if (this.phase === 'clues' && this.turn === id) return this.nextClue();
    if (this.phase === 'vote') {
      delete this.votes[id];
      for (const [v, who] of Object.entries(this.votes)) if (who === id) delete this.votes[v];
      if (alive.every(x => this.votes[x])) this.resolve();
    }
  }

  view(forId) {
    const over = this.phase === 'over';
    const imp = this.isImp(forId);
    const seated = this.ctx.seats().includes(forId);
    return {
      phase: this.phase, deadline: this.deadline, turnMs: this.phaseMs, turn: this.turn,
      lap: Math.min(this.lap, this.opts.laps), laps: this.opts.laps, order: this.order, options: this.opts,
      role: seated ? (imp ? 'imposter' : 'crew') : null,
      word: !imp || over ? this.word : null,
      category: !imp || this.opts.hint || over ? this.category : null,
      imposters: imp || over ? this.imposters : null, // Imposters know each other
      impostersCount: this.imposters.length,
      clues: this.clues,
      messages: this.phase === 'vote' || this.phase === 'lastchance' || over ? this.messages : [],
      ready: [...this.ready],
      voted: Object.keys(this.votes),
      myVote: this.votes[forId] || null,
      tally: over || this.phase === 'lastchance' ? this.tally || null : null,
      votedOut: this.votedOut,
      guess: this.guess,
      outcome: this.outcome,
    };
  }
}

/* 5 Cards (Least Count) lives in ./fivecards.js */
