// 5 Cards (Least Count), the user's house rules:
// - 2–6 players. Up to 5: one deck; 6: two decks. Each deck is 52 cards + 3 printed jokers.
//   No number card is ever a joker (no Round Joker).
// - Points: A=1, 2–10 face value, J/Q/K=10, jokers 0.
// - Deal 5 each; one card face up opens the pile; the rest is the draw pile. Dealer plays
//   first; the deal moves round the table each round.
// - Turn: DROP one card, or ONE set, never two sets at once (user's rule, 2026-10-30): a pair,
//   3 or 4 of a kind, or a run of 3+ in one suit (Ace low or high: A-2-3 and Q-K-A, no wrap
//   K-A-2). Runs take at most one joker. Same-rank sets need 2+ natural cards and no two naturals of the same suit.
//   Then PICK exactly one: top of the draw pile, or any one card of the previous player's
//   latest drop (the rest of that drop is buried).
// - Instead of dropping, SHOW: round ends, all hands shown. Shower strictly lowest (valid
//   show): shower +0, everyone else + their hand. If anyone has equal or fewer points
//   (invalid show): shower +50, others +0.
// - Draw pile finished: the discarded (buried) cards are reshuffled into a new draw pile.
// - Knockout: total >= exit point (host setting, default 200) is out; last standing wins.
// - Host settings: decks (1–3, default 1, or 2 for 6+ players), exit point (50–1000).
//
// Cards are integer ids: id % 55 -> 0..51 = rank (A..K) * 4 + suit, 52..54 = jokers.
// With two decks, ids 55..109 are the second deck.

export const DECK_SIZE = 55;
export const THRESHOLD = 200;
export const WRONG_CALL = 50;
export const FC_TURN_MS = 30000;
export const ROUND_PAUSE_MS = 8000;

const rnd = n => Math.floor(Math.random() * n);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function info(id) {
  const i = id % DECK_SIZE;
  if (i >= 52) return { printed: true, rank: 0, suit: -1 };
  return { printed: false, rank: Math.floor(i / 4) + 1, suit: i % 4 };
}
export const isJoker = id => info(id).printed;
export const points = id => (isJoker(id) ? 0 : Math.min(10, info(id).rank));
export const handPoints = hand => hand.reduce((s, c) => s + points(c), 0);

// Is `cards` (2+ cards) a single valid set: n-of-a-kind or a run?
export function validSet(cards) {
  return cards.length >= 2 && checkSet(cards, isJoker);
}

function checkSet(cards, isJ) {
  const nat = cards.filter(c => !isJ(c));
  const jokers = cards.length - nat.length;
  if (nat.length < 2) return false;
  const ranks = nat.map(c => info(c).rank);
  const suits = nat.map(c => info(c).suit);
  // same rank: pair, three or four of a kind (needs 2+ naturals, no two naturals of one suit)
  if (cards.length <= 4 && ranks.every(r => r === ranks[0]) && new Set(suits).size === suits.length) return true;
  // run: 3+ cards, one suit, at most one joker. Ace is low (A-2-3) or high (Q-K-A), no wrap (K-A-2).
  if (cards.length >= 3 && jokers <= 1 && suits.every(x => x === suits[0])) {
    if (runFits(ranks, jokers)) return true;
    if (ranks.includes(1) && runFits(ranks.map(r => (r === 1 ? 14 : r)), jokers)) return true;
  }
  return false;
}

// ranks (1..14) form one straight once `jokers` fill gaps or extend an end
function runFits(ranks, jokers) {
  const rs = [...ranks].sort((a, b) => a - b);
  if (new Set(rs).size !== rs.length) return false;
  const gaps = rs[rs.length - 1] - rs[0] + 1 - rs.length;
  if (gaps > jokers) return false;
  if (jokers - gaps === 1 && rs[0] === 1 && rs[rs.length - 1] === 14) return false; // nowhere to extend
  return true;
}

// A legal drop: exactly one card, or exactly one valid set. Two sets at once are not allowed.
export function validDrop(cards) {
  if (!Array.isArray(cards) || cards.length === 0 || new Set(cards).size !== cards.length) return false;
  return cards.length === 1 || validSet(cards);
}

// Split a drop into groups (kept for reference; drops now use validDrop): one lone card, or every card inside a valid set. Null if invalid.
export function splitDrop(cards) {
  if (cards.length === 1) return [[cards[0]]];
  if (cards.length < 2 || new Set(cards).size !== cards.length) return null;
  const go = rest => {
    if (rest.length === 0) return [];
    const [first, ...others] = rest;
    const n = others.length;
    for (let mask = 1; mask < 1 << n; mask++) {
      const group = [first, ...others.filter((_, i) => mask & (1 << i))];
      if (!validSet(group)) continue;
      const tail = go(others.filter((_, i) => !(mask & (1 << i))));
      if (tail) return [group, ...tail];
    }
    return null;
  };
  return go(cards);
}

function nextAlive(ctx, from) {
  const seats = ctx.seats(), alive = new Set(ctx.alive());
  const i = seats.indexOf(from);
  for (let k = 1; k <= seats.length; k++) { const c = seats[(i + k) % seats.length]; if (alive.has(c)) return c; }
  return null;
}

export class FiveCards {
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    this.decks = options.decks || (ctx.seats().length >= 6 ? 2 : 1);
    this.threshold = options.exitAt || THRESHOLD;
    this.totals = Object.fromEntries(ctx.seats().map(id => [id, 0]));
    this.round = 0;
    this.dealer = null;
    this.turnNo = 0;
    this.last = null;
  }

  start() { this.newRound(); }

  newRound() {
    const alive = this.ctx.alive();
    this.dealer = this.dealer === null ? alive[0] : nextAlive(this.ctx, this.dealer);
    this.round++;
    const deck = shuffle(Array.from({ length: DECK_SIZE * this.decks }, (_, i) => i));
    this.hands = {};
    for (const id of alive) this.hands[id] = deck.splice(0, 5);
    this.openDrop = { by: null, cards: [deck.pop()] }; // the opening face-up card is takeable
    this.draw = deck;
    this.buried = [];
    this.pending = null; // cards the current player dropped this turn
    this.lastPick = null; // what the previous player picked up, shown to everyone
    this.phase = 'drop';
    this.turn = this.dealer;
    this.roundTurns = 0;
    this.armTurn();
  }

  armTurn() {
    this.turnNo++;
    this.roundTurns++;
    this.deadline = Date.now() + FC_TURN_MS;
    this.ctx.setTimer(FC_TURN_MS, () => this.autoPlay());
  }

  // Out of time: drop the highest single card, then draw.
  autoPlay() {
    if (this.phase === 'drop') {
      const hand = this.hands[this.turn];
      const best = [...hand].sort((a, b) => points(b) - points(a))[0];
      this.doDrop(this.turn, [best]);
    }
    if (this.phase === 'pick') this.doPick(this.turn, 'draw');
  }

  handle(id, m) {
    if (this.phase === 'roundover') return 'The next round is about to start.';
    if (id !== this.turn) return 'It’s not your turn.';
    if (m.type === 'show' || m.type === 'call') {
      if (this.phase !== 'drop') return 'You can only Show before you drop.';
      this.show(id);
      return null;
    }
    if (m.type === 'drop') {
      if (this.phase !== 'drop') return 'You already dropped. Now pick a card.';
      return this.doDrop(id, m.cards);
    }
    if (m.type === 'pick') {
      if (this.phase !== 'pick') return 'Drop first, then pick.';
      return this.doPick(id, m.from, m.card);
    }
    return 'Unknown move.';
  }

  doDrop(id, cards) {
    const hand = this.hands[id];
    if (!Array.isArray(cards) || cards.length === 0) return 'Pick the cards to drop.';
    if (!cards.every(c => hand.includes(c))) return 'Those cards aren’t in your hand.';
    if (!validDrop(cards)) return 'That isn’t a valid drop. Drop one card, or one set: a pair, 3 or 4 of a kind, or a run.';
    this.hands[id] = hand.filter(c => !cards.includes(c));
    this.pending = [...cards];
    this.phase = 'pick';
    return null;
  }

  doPick(id, from, card) {
    if (from === 'drop') {
      if (!this.openDrop.cards.includes(card)) return 'You can only take a card from the previous drop.';
      this.hands[id].push(card);
      this.buried.push(...this.openDrop.cards.filter(c => c !== card));
      // public: everyone saw that card face up, so everyone sees who took it
      this.lastPick = { by: id, from: 'drop', card, owner: this.openDrop.by, turnNo: this.turnNo };
    } else {
      if (this.draw.length === 0) { this.draw = shuffle(this.buried); this.buried = []; }
      if (this.draw.length === 0) {
        if (!this.openDrop.cards.length) return this.endTurn(id); // nothing left anywhere
        return 'The draw pile is empty. Take a card from the drop.';
      }
      this.hands[id].push(this.draw.pop());
      this.buried.push(...this.openDrop.cards);
      this.lastPick = { by: id, from: 'draw', turnNo: this.turnNo }; // the drawn card stays secret
    }
    return this.endTurn(id);
  }

  endTurn(id) {
    this.openDrop = { by: id, cards: this.pending || [] };
    this.pending = null;
    if (this.draw.length === 0) { this.draw = shuffle(this.buried); this.buried = []; }
    this.turn = nextAlive(this.ctx, id);
    this.phase = 'drop';
    this.armTurn();
    return null;
  }

  show(caller) {
    const alive = this.ctx.alive();
    const pts = Object.fromEntries(alive.map(id => [id, handPoints(this.hands[id])]));
    const good = alive.every(id => id === caller || pts[id] > pts[caller]);
    const added = {};
    for (const id of alive) added[id] = good ? (id === caller ? 0 : pts[id]) : (id === caller ? WRONG_CALL : 0);
    for (const id of alive) this.totals[id] += added[id];
    this.last = {
      round: this.round, caller, good,
      hands: Object.fromEntries(alive.map(id => [id, [...this.hands[id]]])),
      points: pts, added, totals: { ...this.totals },
    };
    this.phase = 'roundover';
    this.turn = null;
    this.deadline = Date.now() + ROUND_PAUSE_MS;
    this.ctx.setTimer(ROUND_PAUSE_MS, () => this.newRound());
    for (const id of alive) if (this.totals[id] >= this.threshold) this.ctx.eliminate(id, `reached ${this.threshold} points`);
  }

  onEliminated(id) {
    if (this.phase === 'roundover') return;
    if (this.turn === id) {
      if (this.phase === 'pick') { this.buried.push(...this.openDrop.cards); this.openDrop = { by: id, cards: this.pending || [] }; this.pending = null; }
      this.turn = nextAlive(this.ctx, id);
      this.phase = 'drop';
      this.armTurn();
    }
    if (this.dealer === id && this.ctx.alive().length) { /* next round moves on from the seat anyway */ }
    delete this.hands[id];
  }

  view(forId) {
    const hand = this.hands[forId] || [];
    return {
      round: this.round, decks: this.decks, threshold: this.threshold, turn: this.turn, phase: this.phase,
      deadline: this.deadline, turnMs: this.phase === 'roundover' ? ROUND_PAUSE_MS : FC_TURN_MS, dealer: this.dealer,
      hand, myPoints: handPoints(hand),
      counts: Object.fromEntries(Object.entries(this.hands).map(([id, h]) => [id, h.length])),
      openDrop: this.openDrop, pending: this.pending, drawCount: this.draw.length, lastPick: this.lastPick,
      totals: this.totals, last: this.last,
    };
  }
}

// Practice-mode bot: returns the next move for the player whose turn it is.
export function botMove(g, id) {
  const hand = g.hands[id];
  if (g.phase === 'drop') {
    const pts = handPoints(hand);
    // bots wait at least one full lap of the table each round before calling
    const lapDone = g.roundTurns > Object.keys(g.hands).length;
    if (lapDone && (pts <= 4 || (pts <= 7 && Math.random() < 0.35))) return { type: 'show' };
    let best = null, bestVal = -1;
    for (let mask = 1; mask < 1 << hand.length; mask++) {
      const cards = hand.filter((_, i) => mask & (1 << i));
      if (!validDrop(cards)) continue;
      const val = handPoints(cards) * 10 + cards.length;
      if (val > bestVal) { bestVal = val; best = cards; }
    }
    return { type: 'drop', cards: best };
  }
  const options = g.openDrop.cards.map(c => [c, points(c)]).sort((a, b) => a[1] - b[1]);
  if (options.length && options[0][1] <= 3) return { type: 'pick', from: 'drop', card: options[0][0] };
  return { type: 'pick', from: 'draw' };
}
