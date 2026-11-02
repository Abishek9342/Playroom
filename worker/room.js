import { RoomCore } from '../shared/roomCore.js';
import { getDictionary } from './dictionary.js';
import { xpForGame, nextStreak, dayKey } from '../shared/xp.js';

const ROOM_TTL_MS = 3 * 3600e3;   // unused rooms are wiped after 3 hours
const AFTER_GAME_MS = 15 * 60e3;  // finished rooms are wiped after 15 minutes

// One instance per invite token: holds every player's WebSocket and is
// the referee for that game.
export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.conns = new Map(); // WebSocket -> userId
    this.core = null;
    state.blockConcurrencyWhile(async () => {
      const cfg = await state.storage.get('cfg');
      if (cfg) await this.boot(cfg);
    });
  }

  async boot(cfg) {
    this.cfg = cfg;
    let isWord;
    if (cfg.game === 'wordchain') {
      const dict = getDictionary();
      isWord = w => dict.has(w);
    }
    this.core = new RoomCore(cfg, {
      isWord,
      onChange: () => this.broadcast(),
      onFinish: summary => {
        this.state.storage.setAlarm(Date.now() + AFTER_GAME_MS).catch(() => {});
        this.state.waitUntil ? this.state.waitUntil(this.record(summary)) : this.record(summary);
      },
      onRestart: () => this.state.storage.setAlarm(Date.now() + ROOM_TTL_MS).catch(() => {}),
    });
  }

  // One row per finished game, one per player in it (playtime, moves, won). Stats only, so a
  // failure here never affects the game.
  async record(s) {
    if (!s || !this.env.DB || !s.players.length) return;
    try {
      const id = crypto.randomUUID();
      await this.env.DB.batch([
        this.env.DB.prepare('INSERT INTO plays (id, game, room, started_at, ended_at, players, outcome) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(id, s.game, s.room, s.startedAt, s.endedAt, s.players.length, s.outcome.slice(0, 80)),
        ...s.players.map(p => this.env.DB.prepare('INSERT INTO play_players (play_id, user_id, ms, moves, won) VALUES (?, ?, ?, ?, ?)')
          .bind(id, p.id, p.ms, p.moves, p.won ? 1 : 0)),
      ]);
      // XP and streaks for everyone who played
      const today = dayKey(s.endedAt);
      for (const p of s.players) {
        const u = await this.env.DB.prepare('SELECT streak, best_streak, streak_day FROM users WHERE id = ?').bind(p.id).first();
        if (!u) continue;
        const st = nextStreak({ streak: u.streak, best: u.best_streak, day: u.streak_day }, today);
        await this.env.DB.prepare('UPDATE users SET xp = xp + ?, streak = ?, best_streak = ?, streak_day = ? WHERE id = ?')
          .bind(xpForGame(p), st.streak, st.best, st.day, p.id).run();
      }
    } catch (e) { console.error('stats', e); }
  }

  async fetch(req) {
    const url = new URL(req.url);
    const uid = req.headers.get('x-user-id');
    const uname = req.headers.get('x-user-name');
    const guest = req.headers.get('x-user-guest') === '1';

    if (url.pathname === '/init' && req.method === 'POST') {
      if (this.core) return new Response('exists', { status: 409 });
      const { token, game, size, options } = await req.json();
      const cfg = { token, game, size, options: options || {}, host: req.headers.get('x-user-id') };
      await this.boot(cfg);
      await this.state.storage.put('cfg', cfg);
      await this.state.storage.setAlarm(Date.now() + ROOM_TTL_MS);
      return new Response('created', { status: 201 });
    }

    if (url.pathname === '/info') {
      const c = this.core;
      if (!c) return Response.json({ exists: false });
      return Response.json({
        exists: true, game: c.cfg.game, size: c.cfg.size, options: c.cfg.options, joined: c.players.length,
        status: c.status, member: !!c.find(uid),
      });
    }

    if (url.pathname === '/ws') {
      const [client, server] = Object.values(new WebSocketPair());
      server.accept();
      this.attach(server, uid, uname, guest);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('Not found', { status: 404 });
  }

  attach(ws, uid, uname, guest) {
    const fail = message => {
      try { ws.send(JSON.stringify({ type: 'error', fatal: true, message })); ws.close(4000, 'rejected'); } catch {}
    };
    if (!this.core) return fail('This room doesn’t exist or has expired.');
    this.conns.set(ws, uid);
    ws.addEventListener('message', e => this.onMessage(ws, e.data));
    const closed = () => this.onClose(ws);
    ws.addEventListener('close', closed);
    ws.addEventListener('error', closed);
    // The host's seat is reserved: they must be the first to sit down.
    if (this.core.players.length === 0 && this.cfg.host && uid !== this.cfg.host && this.core.status === 'waiting') {
      this.conns.delete(ws);
      return fail('The host hasn’t opened this room yet. Try again in a moment.');
    }
    const err = this.core.join(uid, uname, { guest });
    if (err) { this.conns.delete(ws); return fail(err); }
  }

  onMessage(ws, raw) {
    const uid = this.conns.get(ws);
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const c = this.core;
    switch (msg.type) {
      case 'hidden': c.away(uid, 'switched tabs'); break;
      case 'visible': c.back(uid); break;
      case 'leave': c.leave(uid); break;
      case 'rematch': {
        const err = c.rematch(uid);
        if (err) try { ws.send(JSON.stringify({ type: 'error', message: err })); } catch {}
        break;
      }
      case 'rematch-decline': c.declineRematch(uid); break;
      case 'voice': c.setVoice(uid, !!msg.on); break;
      case 'react': {
        const r = Number(msg.r);
        if (!Number.isInteger(r) || r < 0 || r > 7 || !c.find(uid)) break;
        this.lastReact = this.lastReact || new Map();
        if (Date.now() - (this.lastReact.get(uid) || 0) < 1200) break;
        this.lastReact.set(uid, Date.now());
        const out = JSON.stringify({ type: 'react', from: uid, r });
        for (const sock of this.conns.keys()) { try { sock.send(out); } catch {} }
        break;
      }
      case 'rtc': {
        // WebRTC setup (offer/answer/ICE) for voice chat, only between players in this room
        if (typeof msg.to !== 'string' || !c.find(msg.to) || !c.find(uid)) break;
        const out = JSON.stringify({ type: 'rtc', from: uid, data: msg.data });
        if (out.length > 20000) break;
        for (const [sock, id] of this.conns) if (id === msg.to) { try { sock.send(out); } catch {} }
        break;
      }
      case 'move': {
        const err = c.move(uid, msg.move);
        if (err) try { ws.send(JSON.stringify({ type: 'error', message: err })); } catch {}
        break;
      }
    }
  }

  onClose(ws) {
    if (!this.conns.has(ws)) return;
    const uid = this.conns.get(ws);
    this.conns.delete(ws);
    if ([...this.conns.values()].includes(uid)) return; // still open in another tab
    this.core && this.core.disconnect(uid);
  }

  broadcast() {
    if (!this.core) return;
    for (const [ws, uid] of this.conns) {
      try { ws.send(JSON.stringify(this.core.view(uid))); } catch {}
    }
  }

  async alarm() {
    for (const ws of this.conns.keys()) { try { ws.close(1000, 'room closed'); } catch {} }
    this.conns.clear();
    if (this.core) this.core.stopTimers();
    this.core = null;
    await this.state.storage.deleteAll();
  }
}
