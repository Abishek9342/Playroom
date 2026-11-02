import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { VoiceMesh } from '../lib/voice.js';
import { Sheet } from './Sheet.jsx';
import { Icon } from './Icon.jsx';
import { REACTIONS } from '../../shared/reactions.js';

// Live reactions per player: { [id]: { text, n } }, each shown for a few seconds.
export function useReactions(subscribeReact) {
  const [map, setMap] = useState({});
  useEffect(() => {
    if (!subscribeReact) return;
    let n = 0;
    return subscribeReact((from, r) => {
      const key = ++n;
      setMap(m => ({ ...m, [from]: { text: REACTIONS[r], n: key } }));
      setTimeout(() => setMap(m => (m[from] && m[from].n === key ? (({ [from]: _, ...rest }) => rest)(m) : m)), 2800);
    });
  }, [subscribeReact]);
  return map;
}

export function ReactButton({ send }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="react-wrap">
      <AnimatePresence>
        {open && (
          <motion.div className="react-pop" role="menu" aria-label="Send a reaction" initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}>
            {REACTIONS.map((t, i) => (
              <button key={t} type="button" role="menuitem" className="react-opt" onClick={() => { send({ type: 'react', r: i }); setOpen(false); }}>{t}</button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <button type="button" className="vd-btn vd-react" aria-expanded={open} aria-label="Send a reaction" onClick={() => setOpen(o => !o)}>GG</button>
    </div>
  );
}

// Who's talking, for avatars anywhere in the room.
export const VoiceContext = createContext({ speaking: new Set(), reactions: {} });
export const useSpeaking = id => useContext(VoiceContext).speaking.has(id);
export const useReaction = id => (useContext(VoiceContext).reactions || {})[id] || null;

const EMPTY = { on: false, micOn: true, ptt: false, holding: false, speakerOff: false, muted: new Set(), speaking: new Set(), error: '', resting: false, connected: [] };

// Hook: one voice mesh per room, kept in step with the room's players.
export function useVoice(state, send, subscribeRtc) {
  const [snap, setSnap] = useState(EMPTY);
  const mesh = useRef(null);
  const me = state && state.you;
  useEffect(() => {
    if (!me || !subscribeRtc) return;
    mesh.current = new VoiceMesh({ me, send, onChange: setSnap });
    setSnap(mesh.current.snapshot()); // render the dock now, not on the next room update
    const off = subscribeRtc((from, data) => mesh.current && mesh.current.onSignal(from, data));
    return () => { off(); mesh.current && mesh.current.stop(false); mesh.current = null; };
  }, [me, send, subscribeRtc]);
  useEffect(() => { if (mesh.current && state) mesh.current.sync(state.players); }, [state]);
  return { snap, mesh };
}

export function VoiceDock({ state, snap, mesh, send }) {
  const [open, setOpen] = useState(false);
  const m = mesh.current;
  if (!m || !state) return null;
  const others = state.players.filter(p => p.id !== state.you && !p.bot);
  const inVoice = others.filter(p => p.voice);
  const talking = snap.speaking.has(state.you);

  const micLabel = !snap.on ? 'Turn on voice' : snap.ptt ? 'Hold to talk' : snap.micOn ? 'Mute your mic' : 'Unmute your mic';
  const onMic = () => { if (!snap.on) m.start(); else if (!snap.ptt) m.setMic(!snap.micOn); };
  const hold = v => () => { if (snap.on && snap.ptt) m.hold(v); };

  return (
    <>
      <div className={`voice-dock${snap.on ? ' on' : ''}`} role="group" aria-label="Voice chat">
        <motion.button type="button" className={`vd-mic${snap.on && (snap.ptt ? snap.holding : snap.micOn) ? ' live' : ''}${talking ? ' talking' : ''}`}
          aria-label={micLabel} aria-pressed={snap.on && (snap.ptt ? snap.holding : snap.micOn)} whileTap={{ scale: 0.92 }}
          onClick={onMic} onPointerDown={hold(true)} onPointerUp={hold(false)} onPointerLeave={hold(false)} onPointerCancel={hold(false)}
          onContextMenu={e => e.preventDefault()}>
          <Icon name={snap.on && (snap.ptt ? snap.holding : snap.micOn) ? 'mic' : 'mic-off'} size={22} />
          {snap.on && snap.ptt && <small>Hold</small>}
        </motion.button>
        {snap.on && (
          <button type="button" className="vd-btn" onClick={() => m.setSpeaker(!snap.speakerOff)} aria-label={snap.speakerOff ? 'Turn sound on' : 'Mute everyone'} aria-pressed={snap.speakerOff}>
            <Icon name={snap.speakerOff ? 'speaker-off' : 'speaker'} size={19} />
          </button>
        )}
        <ReactButton send={send} />
        <button type="button" className="vd-btn vd-more" onClick={() => setOpen(true)} aria-label="Voice settings">
          <Icon name="users" size={17} /><span>{inVoice.length + (snap.on ? 1 : 0)}</span>
        </button>
      </div>
      <AnimatePresence>
        {snap.error && <motion.p className="vd-error" role="alert" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{snap.error}</motion.p>}
      </AnimatePresence>

      <Sheet open={open} onClose={() => setOpen(false)} title="Voice chat">
        <div className="vd-sheet">
          {!snap.on ? (
            <>
              <p className="muted">Talk to everyone in this room, like the mic in PUBG. Your voice goes straight to the other players.</p>
              <button className="btn btn-primary btn-block" onClick={() => { m.start(); }}><Icon name="mic" size={18} /> Turn on voice</button>
            </>
          ) : (
            <>
              <div className="setting-row">
                <div className="setting-label"><b>Hold to talk</b><span>Only send your voice while you hold the mic</span></div>
                <button type="button" role="switch" aria-checked={snap.ptt} className={`switch${snap.ptt ? ' on' : ''}`} onClick={() => m.setPtt(!snap.ptt)}><span /></button>
              </div>
              {snap.resting && <p className="note"><Icon name="info" size={16} /> Voice relay is resting until next month. Most players can still hear each other directly.</p>}
              <ul className="vd-people">
                {others.map(p => {
                  const muted = snap.muted.has(p.id);
                  const linked = snap.connected.includes(p.id);
                  return (
                    <li key={p.id}>
                      <span className={`vd-dot${snap.speaking.has(p.id) ? ' talking' : ''}${p.voice ? '' : ' off'}`} aria-hidden="true" />
                      <span className="vd-name">{p.name}<small>{!p.voice ? 'Voice off' : linked ? (muted ? 'Muted by you' : 'Connected') : 'Connecting…'}</small></span>
                      {p.voice && <button type="button" className="btn btn-secondary btn-sm" onClick={() => m.toggleMute(p.id)}>{muted ? 'Unmute' : 'Mute'}</button>}
                    </li>
                  );
                })}
                {others.length === 0 && <li className="muted">Nobody else here yet.</li>}
              </ul>
              <button className="btn btn-quiet btn-block" onClick={() => { m.stop(); setOpen(false); }}>Leave voice</button>
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
