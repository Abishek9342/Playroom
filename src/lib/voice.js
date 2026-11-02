import { api } from './api.js';

// Voice chat for a room, browser to browser (WebRTC), like the mic in PUBG / Free Fire.
// Audio goes directly between phones. The room's WebSocket only carries the short setup
// messages ("signals"). When two phones can't reach each other directly (some mobile
// networks), Cloudflare's TURN relay carries the audio; the server only hands out relay
// access while this month's relay use is under the cap (see /api/voice/ice).
//
// Each pair connects once: the player with the smaller id makes the offer, the other answers.
// Phones on the relay report how much they received, once a minute, for the monthly cap.

const SPEAKING_LEVEL = 0.045;   // RMS above this = talking
const REPORT_MS = 60000;

export class VoiceMesh {
  constructor({ me, send, onChange }) {
    this.me = me;
    this.send = send;           // (msg) -> room WebSocket
    this.onChange = onChange;   // (snapshot) -> UI
    this.peers = new Map();     // id -> { pc, audio, pending: [], relayRx }
    this.on = false;
    this.micOn = true;
    this.ptt = false;
    this.holding = false;
    this.speakerOff = false;
    this.muted = new Set();
    this.speaking = new Set();
    this.analysers = new Map(); // id -> { an, buf, src }
    this.error = '';
    this.resting = false;
  }

  snapshot() {
    return {
      on: this.on, micOn: this.micOn, ptt: this.ptt, holding: this.holding, speakerOff: this.speakerOff,
      muted: new Set(this.muted), speaking: new Set(this.speaking), error: this.error, resting: this.resting,
      connected: [...this.peers.entries()].filter(([, p]) => p.pc.connectionState === 'connected').map(([id]) => id),
    };
  }
  changed() { this.onChange(this.snapshot()); }

  // Must be called from a tap (mic permission + audio playback need a user gesture).
  async start() {
    if (this.on) return;
    this.error = '';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.RTCPeerConnection) {
      this.error = 'Voice needs a secure (https) link and a recent browser.'; this.changed(); return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch (e) {
      this.error = e && e.name === 'NotAllowedError' ? 'Microphone blocked. Allow it in your browser settings to talk.' : 'Couldn’t start the microphone.';
      this.changed(); return;
    }
    try {
      const r = await api('/api/voice/ice');
      this.iceServers = r.iceServers; this.resting = !!r.resting;
    } catch { this.iceServers = [{ urls: ['stun:stun.cloudflare.com:3478'] }]; }
    this.on = true;
    this.applyMic();
    this.watch(this.me, this.stream);
    this.timer = setInterval(() => this.tick(), 150);
    this.reporter = setInterval(() => this.report(), REPORT_MS);
    this.send({ type: 'voice', on: true });
    this.changed();
  }

  stop(tell = true) {
    if (!this.on && !this.stream) return;
    this.report();
    clearInterval(this.timer); clearInterval(this.reporter);
    for (const id of [...this.peers.keys()]) this.close(id);
    this.stream && this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.analysers.clear();
    this.speaking.clear();
    this.ctx && this.ctx.close().catch(() => {});
    this.ctx = null;
    this.on = false;
    if (tell) this.send({ type: 'voice', on: false });
    this.changed();
  }

  setMic(on) { this.micOn = on; this.applyMic(); this.changed(); }
  setPtt(on) { this.ptt = on; this.holding = false; this.applyMic(); this.changed(); }
  hold(on) { this.holding = on; this.applyMic(); this.changed(); }
  applyMic() {
    const live = this.on && (this.ptt ? this.holding : this.micOn);
    this.stream && this.stream.getAudioTracks().forEach(t => { t.enabled = live; });
  }
  setSpeaker(off) { this.speakerOff = off; this.peers.forEach((p, id) => { p.audio.muted = off || this.muted.has(id); }); this.changed(); }
  toggleMute(id) {
    this.muted.has(id) ? this.muted.delete(id) : this.muted.add(id);
    const p = this.peers.get(id); if (p) p.audio.muted = this.speakerOff || this.muted.has(id);
    this.changed();
  }

  // Room state changed: connect to everyone else with voice on, drop the rest.
  sync(players) {
    const want = new Set(this.on ? players.filter(p => p.id !== this.me && p.voice && p.connected !== false).map(p => p.id) : []);
    for (const id of [...this.peers.keys()]) if (!want.has(id)) this.close(id);
    for (const id of want) if (!this.peers.has(id) && this.me < id) this.connect(id, true);
  }

  connect(id, offerer) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const audio = new Audio();
    audio.autoplay = true; audio.playsInline = true; audio.muted = this.speakerOff || this.muted.has(id);
    audio.style.display = 'none';
    document.body.appendChild(audio);
    const peer = { pc, audio, pending: [], relayRx: 0, offerer };
    this.peers.set(id, peer);
    this.stream.getTracks().forEach(t => pc.addTrack(t, this.stream));
    pc.onicecandidate = e => { if (e.candidate) this.signal(id, { kind: 'ice', c: e.candidate.toJSON() }); };
    pc.ontrack = e => {
      const s = e.streams[0] || new MediaStream([e.track]);
      audio.srcObject = s;
      audio.play().catch(() => {});
      this.watch(id, s);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && offerer && this.on) { this.close(id); setTimeout(() => this.on && this.connect(id, true), 1500); }
      this.changed();
    };
    if (offerer) {
      pc.createOffer().then(o => pc.setLocalDescription(o)).then(() => this.signal(id, { kind: 'offer', sdp: pc.localDescription.toJSON() })).catch(() => {});
    }
    return peer;
  }

  signal(to, data) { this.send({ type: 'rtc', to, data }); }

  async onSignal(from, data) {
    if (!this.on || !data) return;
    try {
      if (data.kind === 'offer') {
        if (this.peers.has(from)) this.close(from); // a fresh offer replaces a stuck connection
        const peer = this.connect(from, false);
        await peer.pc.setRemoteDescription(data.sdp);
        const ans = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(ans);
        this.signal(from, { kind: 'answer', sdp: peer.pc.localDescription.toJSON() });
        this.flush(peer);
      } else if (data.kind === 'answer') {
        const peer = this.peers.get(from);
        if (peer && peer.pc.signalingState === 'have-local-offer') { await peer.pc.setRemoteDescription(data.sdp); this.flush(peer); }
      } else if (data.kind === 'ice') {
        const peer = this.peers.get(from);
        if (!peer) return;
        if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.c).catch(() => {});
        else peer.pending.push(data.c);
      }
    } catch { /* a bad signal just leaves that pair unconnected; the next offer retries */ }
  }
  flush(peer) { const list = peer.pending.splice(0); list.forEach(c => peer.pc.addIceCandidate(c).catch(() => {})); }

  close(id) {
    const p = this.peers.get(id);
    if (!p) return;
    try { p.pc.close(); } catch {}
    p.audio.srcObject = null; p.audio.remove();
    this.peers.delete(id);
    this.analysers.delete(id);
    this.speaking.delete(id);
  }

  // Who's talking: a level meter per stream, checked a few times a second.
  watch(id, stream) {
    if (!this.ctx) return;
    try {
      const src = this.ctx.createMediaStreamSource(stream);
      const an = this.ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      this.analysers.set(id, { an, buf: new Uint8Array(an.fftSize), src });
    } catch {}
  }
  tick() {
    let diff = false;
    for (const [id, { an, buf }] of this.analysers) {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const loud = Math.sqrt(sum / buf.length) > SPEAKING_LEVEL;
      const talking = loud && (id === this.me ? this.stream && this.stream.getAudioTracks().some(t => t.enabled) : !(this.speakerOff || this.muted.has(id)));
      if (talking !== this.speaking.has(id)) { talking ? this.speaking.add(id) : this.speaking.delete(id); diff = true; }
    }
    if (diff) this.changed();
  }

  // Bytes received through the relay since the last report (only relay traffic counts).
  async report() {
    let total = 0;
    for (const p of this.peers.values()) {
      try {
        const stats = await p.pc.getStats();
        let pair = null;
        stats.forEach(r => { if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId); });
        if (!pair) stats.forEach(r => { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r; });
        if (!pair) continue;
        const local = stats.get(pair.localCandidateId);
        if (!local || local.candidateType !== 'relay') continue;
        const now = pair.bytesReceived || 0;
        total += Math.max(0, now - p.relayRx);
        p.relayRx = now;
      } catch {}
    }
    if (total > 0) api('/api/voice/usage', { bytes: total }).catch(() => {});
  }
}
