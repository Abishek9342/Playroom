import { RoomCore } from '../shared/roomCore.js';
import { getDictionary } from './dictionary.js';
import { xpForGame, nextStreak, dayKey } from '../shared/xp.js';

const ROOM_TTL_MS = 3 * 3600e3;   // unused rooms are wiped after 3 hours
const AFTER_GAME_MS = 15 * 60e3;  // finished rooms are wiped after 15 minutes
const AWAKE_MS = 30e3;            // a running game keeps a timer so the room never hibernates mid-game

// One instance per invite token: holds every player's WebSocket and is
// the referee for that game.
//
// WebSocket Hibernation API (2026-11-17): an idle lobby or results screen costs nothing, because the
// object is evicted from memory while the sockets stay open. Cloudflare bills a room for the whole time
// a standard (accept()) socket is open, so before this an idle lobby used up the free plan's daily time.
// Memory is wiped on hibernation, so lobby/results state is saved after every change ('snap') and
// restored when the room wakes. Each socket carries its player in its attachment ({ uid }).
export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.core = null;
    this.awake = null;
    state.blockConcurrencyWhile(async () => {
      const cfg = await state.storage.get('cfg');
      if (!cfg) return;
      await this.boot(cfg);
      const snap = await state.storage.get('snap');
      if (snap) this.core.restore(snap);
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
      onChange: () => { this.save(); this.broadcast(); },
      onFinish: summary => {
        this.state.storage.setAlarm(Date.now() + AFTER_GAME_MS).catch(() => {});
        this.state.waitUntil ? this.state.waitUntil(this.record(summary)) : this.record(summary);
      },
      onRestart: () => this.state.storage.setAlarm(Date.now() + ROOM_TTL_MS).catch(() => {}),
    });
  }

  // Lobby/results: save them so a hibernated room comes back as it was. Playing: drop the save (a
  // stale lobby must not come back after an eviction mid-game) and hold a timer so it stays awake.
  save() {
    const snap = this.core.snapshot();
    if (snap) this.state.storage.put('snap', snap).catch(e => console.error('snap', e));
    else this.state.storage.delete('snap').catch(() => {});
    if (this.core.status === 'playing' && !this.awake) this.awake = setInterval(() => {}, AWAKE_MS);
    if (this.core.status !== 'playing' && this.awake) { clearInterval(this.awake); this.awake = null; }
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

  // [socket, userId] for every open connection (survives hibernation, unlike a Map in memory).
  conns() {
    return this.state.getWebSockets().map(ws => [ws, (ws.deserializeAttachment() || {}).uid]).filter(([, uid]) => uid);
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
      this.save();
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
      this.state.acceptWebSocket(server);
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
    // The host's seat is reserved: they must be the first to sit down.
    if (this.core.players.length === 0 && this.cfg.host && uid !== this.cfg.host && this.core.status === 'waiting') {
      return fail('The host hasn’t opened this room yet. Try again in a moment.');
    }
    ws.serializeAttachment({ uid });
    const err = this.core.join(uid, uname, { guest });
    if (err) { ws.serializeAttachment(null); return fail(err); }
  }

  webSocketMessage(ws, raw) {
    const uid = (ws.deserializeAttachment() || {}).uid;
    const c = this.core;
    if (!uid || !c) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
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
      case 'pause': case 'resume': {
        const err = msg.type === 'pause' ? c.pause(uid) : c.resume(uid);
        if (err) try { ws.send(JSON.stringify({ type: 'error', message: err })); } catch {}
        break;
      }
      case 'voice': c.setVoice(uid, !!msg.on); break;
      case 'rtc': {
        // WebRTC setup (offer/answer/ICE) for voice chat, only between players in this room
        if (typeof msg.to !== 'string' || !c.find(msg.to) || !c.find(uid)) break;
        const out = JSON.stringify({ type: 'rtc', from: uid, data: msg.data });
        if (out.length > 20000) break;
        for (const [sock, id] of this.conns()) if (id === msg.to) { try { sock.send(out); } catch {} }
        break;
      }
      case 'move': {
        const err = c.move(uid, msg.move);
        if (err) try { ws.send(JSON.stringify({ type: 'error', message: err })); } catch {}
        break;
      }
    }
  }

  webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch {} // compatibility date < 2026-04-07: reply ourselves
    this.onClose(ws);
  }

  webSocketError(ws) { this.onClose(ws); }

  onClose(ws) {
    const uid = (ws.deserializeAttachment() || {}).uid;
    if (!uid) return;
    try { ws.serializeAttachment(null); } catch {} // close and error can both arrive; handle it once
    if (this.conns().some(([s, id]) => s !== ws && id === uid)) return; // still open in another tab
    this.core && this.core.disconnect(uid);
  }

  broadcast() {
    if (!this.core) return;
    for (const [ws, uid] of this.conns()) {
      try { ws.send(JSON.stringify(this.core.view(uid))); } catch {}
    }
  }

  async alarm() {
    for (const ws of this.state.getWebSockets()) { try { ws.close(1000, 'room closed'); } catch {} }
    if (this.awake) { clearInterval(this.awake); this.awake = null; }
    if (this.core) this.core.stopTimers();
    this.core = null;
    await this.state.storage.deleteAll();
  }
}
