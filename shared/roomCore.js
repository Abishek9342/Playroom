import { createGame, GAMES } from './games.js';

export const GRACE_MS = 3000; // away longer than this = eliminated

// Everything about one room except networking: seats, start, moves,
// away/elimination, results and per-player views. The Durable Object wraps
// it with WebSockets; practice mode wraps it with bots.
export class RoomCore {
  constructor({ token, game, size, options = {} }, { onChange = () => {}, onFinish = () => {}, onRestart = () => {}, isWord } = {}) {
    this.cfg = { token, game, size, options };
    this.onChange = onChange;
    this.onFinish = onFinish;
    this.onRestart = onRestart;
    this.match = 0;           // rematches played in this room
    this.isWord = isWord;
    this.players = [];        // seat order: {id, name, alive, connected, away, reason, bot, guest}; seat 0 = host
    this.status = 'waiting';  // waiting | playing | over
    this.game = null;
    this.timer = null;
    this.graces = new Map();
    this.result = null;
    this.events = [];
  }

  find(id) { return this.players.find(p => p.id === id); }

  // Does leaving the screen knock you out in this game? (Word Chain only.)
  strict() { return !!(GAMES[this.cfg.game] && GAMES[this.cfg.game].strictPresence); }

  // Returns an error message, or null when the player is seated.
  join(id, name, extra = {}) {
    let p = this.find(id);
    if (!p) {
      if (this.status !== 'waiting') return 'This game has already started.';
      if (this.players.length >= this.cfg.size) return 'This room is full.';
      p = { id, name, alive: true, connected: true, away: false, reason: null, ...extra };
      this.players.push(p);
      this.log(`${name} joined`);
    }
    p.connected = true;
    this.back(id);
    if (this.status === 'waiting' && this.players.length === this.cfg.size) this.start();
    else this.onChange();
    return null;
  }

  disconnect(id) {
    const p = this.find(id);
    if (!p) return;
    p.connected = false;
    if (this.status === 'waiting') {
      this.players = this.players.filter(x => x.id !== id);
      this.log(`${p.name} left`);
      this.onChange();
    } else if (this.status === 'playing' && p.alive) this.away(id, 'left the page');
    else {
      if (this.status === 'over') p.rematch = false; // a vote from someone who left doesn't stand
      this.onChange();
    }
  }

  // Player hid the tab / closed the page. Word Chain: eliminated unless back within GRACE_MS.
  // Other games: just marked Away until they return (no elimination).
  away(id, reason) {
    const p = this.find(id);
    if (!p || !p.alive || this.status !== 'playing' || this.graces.has(id)) return;
    if (!this.strict()) { if (!p.away) { p.away = true; this.onChange(); } return; }
    p.away = true;
    this.graces.set(id, setTimeout(() => { this.graces.delete(id); this.eliminate(id, reason); }, GRACE_MS));
    this.onChange();
  }

  back(id) {
    const t = this.graces.get(id);
    if (t) { clearTimeout(t); this.graces.delete(id); }
    const p = this.find(id);
    if (p && p.away) { p.away = false; this.onChange(); }
  }

  // Returns an error message for the mover, or null.
  move(id, m) {
    const p = this.find(id);
    if (!p) return 'You’re not in this room.';
    if (this.status !== 'playing') return 'The game isn’t running.';
    if (!p.alive) return 'You’re out of this game.';
    const err = this.game.handle(id, m || {});
    if (!err) this.onChange();
    return err;
  }

  leave(id) { this.eliminate(id, 'left the game'); }

  ctx() {
    return {
      seats: () => this.players.map(p => p.id),
      alive: () => this.players.filter(p => p.alive).map(p => p.id),
      setTimer: (ms, fn) => {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.timer = null;
          if (this.status === 'playing') { fn(); this.onChange(); }
        }, ms);
      },
      eliminate: (id, reason) => this.eliminate(id, reason),
      match: () => this.match,
      finish: (winner, text) => this.finish(winner, text),
    };
  }

  start() {
    this.status = 'playing';
    this.game = createGame(this.cfg.game, this.ctx(), { isWord: this.isWord, options: this.cfg.options });
    this.log('Game started');
    this.game.start();
    this.onChange();
  }

  eliminate(id, reason) {
    const p = this.find(id);
    if (!p || !p.alive || this.status !== 'playing') return;
    p.alive = false;
    p.reason = reason;
    p.away = false;
    const t = this.graces.get(id);
    if (t) { clearTimeout(t); this.graces.delete(id); }
    this.log(`${p.name} was eliminated (${reason})`);
    const alive = this.players.filter(x => x.alive);
    if (alive.length <= 1) return this.finish(alive[0] ? alive[0].id : null, 'Last player standing');
    this.game.onEliminated(id);
    this.onChange();
  }

  finish(winner, text) {
    if (this.status === 'over') return;
    this.status = 'over';
    this.result = { winner, text };
    this.stopTimers();
    for (const p of this.players) p.away = false;
    const w = this.find(winner);
    this.log(w ? `${w.name} won` : 'Game over');
    this.onChange();
    this.onFinish();
  }

  // After a game ends, everyone still in the room votes; when all have, the same seats play
  // again with the same settings. Bots always agree. Returns an error message or null.
  rematch(id) {
    const p = this.find(id);
    if (!p) return 'You’re not in this room.';
    if (this.status !== 'over') return 'The game is still running.';
    const gone = this.players.find(x => !x.connected && !x.bot);
    if (gone) return `${gone.name} left the room, so a rematch isn’t possible. Start a new room instead.`;
    if (p.rematch) return null;
    p.rematch = true;
    if (this.players.every(x => x.rematch || x.bot)) {
      for (const x of this.players) Object.assign(x, { alive: true, reason: null, away: false, rematch: false });
      this.match++;
      this.result = null;
      this.log('Rematch');
      this.onRestart();
      this.start();
    } else {
      this.log(`${p.name} wants a rematch`);
      this.onChange();
    }
    return null;
  }

  // Someone said "not now": the request is cancelled for everyone; they can ask again.
  declineRematch(id) {
    const p = this.find(id);
    if (!p || this.status !== 'over' || !this.players.some(x => x.rematch)) return null;
    for (const x of this.players) x.rematch = false;
    this.declined = { by: id, name: p.name, n: (this.declined ? this.declined.n : 0) + 1 };
    this.log(`${p.name} said not now to a rematch`);
    this.onChange();
    return null;
  }

  stopTimers() {
    clearTimeout(this.timer);
    for (const t of this.graces.values()) clearTimeout(t);
    this.graces.clear();
  }

  log(text) { this.events.push({ t: Date.now(), text }); if (this.events.length > 30) this.events.shift(); }

  view(uid) {
    return {
      type: 'state', you: uid, token: this.cfg.token, game: this.cfg.game, size: this.cfg.size, options: this.cfg.options,
      status: this.status, result: this.result, serverNow: Date.now(),
      match: this.match, declined: this.declined || null,
      players: this.players.map(({ id, name, alive, connected, away, reason, bot, guest, rematch }) => ({ id, name, alive, connected, away, reason, bot: !!bot, guest: !!guest, rematch: !!rematch })),
      events: this.events.slice(-6),
      g: this.game ? this.game.view(uid) : null,
    };
  }
}
