import { RoomCore } from '../../shared/roomCore.js';
import { botMove } from '../../shared/fivecards.js';

const BOT_NAMES = ['Ada', 'Kip', 'Juno', 'Moss', 'Pip', 'Wren', 'Ozzy', 'Lark', 'Nell'];
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// Practice mode: the same room engine as the server, with bots in the other seats.
export class LocalRoom {
  constructor({ game, size, name, words, common, options, onState, onError }) {
    this.me = 'you';
    this.name = name || 'You';
    this.size = size;
    this.onState = onState;
    this.onError = onError;
    this.timeouts = new Set();
    this.scheduled = new Set();
    this.dead = false;
    let isWord;
    if (words) {
      const dict = new Set(words);
      isWord = w => dict.has(w);
      this.byLetter = {};
      // bots answer with everyday words; fall back to the full dictionary for rare letters
      for (const w of common || words) if (w.length >= 3 && w.length <= 7) (this.byLetter[w[0]] ||= []).push(w);
      this.fallback = {};
      for (const w of words) if (w.length >= 3 && w.length <= 8) (this.fallback[w[0]] ||= []).push(w);
    }
    this.core = new RoomCore({ token: 'PRACTICE', game, size, options: options || {} }, { isWord, onChange: () => this.changed() });
  }

  later(ms, fn) {
    const t = setTimeout(() => { this.timeouts.delete(t); if (!this.dead) fn(); }, ms);
    this.timeouts.add(t);
  }

  begin() {
    this.core.join(this.me, this.name);
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    for (let i = 1; i < this.size; i++) {
      this.later(450 * i + 300, () => this.core.join('bot' + i, names[i - 1], { bot: true }));
    }
  }

  send(msg) {
    const c = this.core;
    if (msg.type === 'move') { const err = c.move(this.me, msg.move); if (err) this.onError(err); }
    else if (msg.type === 'hidden') c.away(this.me, 'switched tabs');
    else if (msg.type === 'visible') c.back(this.me);
    else if (msg.type === 'leave') c.leave(this.me);
    else if (msg.type === 'rematch-decline') c.declineRematch(this.me);
    else if (msg.type === 'rematch') {
      // forget last game's pending bot moves before the board resets
      this.timeouts.forEach(clearTimeout); this.timeouts.clear(); this.scheduled.clear();
      const err = c.rematch(this.me); if (err) this.onError(err);
    }
  }

  changed() {
    if (this.dead) return;
    this.onState(this.core.view(this.me));
    this.scheduleBots();
  }

  scheduleBots() {
    const c = this.core;
    if (c.status !== 'playing') return;
    const g = c.game;
    for (const p of c.players) {
      if (!p.bot || !p.alive) continue;
      let key, delay, act;
      if (c.cfg.game === 'wordchain' && g.turn === p.id) {
        key = `w${g.words.length}`; delay = rand(1300, 3800);
        act = () => { const w = this.botWord(g); if (w) c.move(p.id, { type: 'word', word: w }); };
      } else if (c.cfg.game === 'xo' && g.turn === p.id && g.phase === 'play') {
        key = `x${g.round}-${g.board.filter(Boolean).length}`; delay = rand(600, 1400);
        act = () => c.move(p.id, { type: 'place', i: this.botXO(g, p.id) });
      } else if (c.cfg.game === 'cards' && g.turn === p.id && g.phase !== 'roundover') {
        key = `f${g.turnNo}${g.phase}`; delay = g.phase === 'drop' ? rand(1100, 2600) : rand(700, 1500);
        act = () => { if (g.turn === p.id) c.move(p.id, botMove(g, p.id)); };
      } else if (c.cfg.game === 'patches') {
        key = 'solve'; delay = rand(50000, 110000);
        act = () => c.move(p.id, { type: 'solve', rects: g.puzzle.answer });
      } else continue;
      const k = p.id + ':' + key;
      if (this.scheduled.has(k)) continue;
      this.scheduled.add(k);
      this.later(delay, () => { if (c.status === 'playing' && c.find(p.id).alive) act(); });
    }
  }

  botWord(g) {
    const need = g.need();
    const letter = need || pick('abcdefghilmnoprstw');
    const fresh = list => (list || []).filter(w => !g.used.has(w));
    let pool = fresh(this.byLetter[letter]);
    if (!pool.length) pool = fresh(this.fallback[letter]);
    // a small chance to "blank" keeps bots beatable
    if (Math.random() < 0.06) return null;
    return pool.length ? pick(pool) : null;
  }

  botXO(g, id) {
    const me = g.marks[id], them = me === 'X' ? 'O' : 'X';
    const free = g.board.map((v, i) => (v ? -1 : i)).filter(i => i >= 0);
    // a line one mark short of k with its last cell empty
    const finish = mark => {
      for (const l of g.lines) {
        const v = l.map(i => g.board[i]);
        if (v.filter(x => x === mark).length === g.k - 1 && v.includes(null)) return l[v.indexOf(null)];
      }
      return -1;
    };
    if (Math.random() < 0.2) return pick(free); // sometimes just plays
    const win = finish(me); if (win >= 0) return win;
    const block = finish(them); if (block >= 0) return block;
    // otherwise prefer the free cell closest to the centre, with a little randomness
    const mid = (g.n - 1) / 2;
    const score = i => Math.abs(Math.floor(i / g.n) - mid) + Math.abs((i % g.n) - mid) + Math.random() * 1.5;
    return free.sort((a, b) => score(a) - score(b))[0];
  }

  destroy() {
    this.dead = true;
    this.timeouts.forEach(clearTimeout);
    this.core.stopTimers();
  }
}
