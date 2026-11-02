import { motion } from 'motion/react';
import { colorFor } from '../lib/meta.js';
import { Icon } from './Icon.jsx';
import { useSpeaking, useReaction } from './VoiceDock.jsx';
import { AnimatePresence } from 'motion/react';

const R = 26, C = 2 * Math.PI * R;
const initials = n => (n || '?').trim().split(/\s+/).map(w => [...w][0]).join('').slice(0, 2).toUpperCase();

// Player token: initials, optional countdown ring, score badge and status line.
export function Avatar({ player, you, host, progress = null, size = 48, score, compact = false }) {
  const talking = useSpeaking(player.id);
  const reaction = useReaction(player.id);
  const out = !player.alive;
  const urgent = progress !== null && progress < 0.25;
  return (
    <motion.div layout className={`av${out ? ' is-out' : ''}${player.away ? ' is-away' : ''}${progress !== null ? ' is-turn' : ''}${talking ? ' is-talking' : ''}`}
      style={{ '--size': size + 'px', '--tone': colorFor(player.id) }}
      initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 26 }}>
      <div className="av-disc">
        {player.bot ? <Icon name="bot" size={Math.round(size * 0.46)} /> : <span>{initials(player.name)}</span>}
        {progress !== null && !out && (
          <svg className="av-ring" viewBox="0 0 60 60" aria-hidden="true">
            <circle cx="30" cy="30" r={R} className="av-ring-track" />
            <circle cx="30" cy="30" r={R} className={`av-ring-bar${urgent ? ' urgent' : ''}`} strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
          </svg>
        )}
        {host && <span className="av-host" title="Host"><Icon name="crown" size={11} /></span>}
        {player.voice && <span className="av-voice" title="Voice on"><Icon name="mic" size={10} /></span>}
        <AnimatePresence>
          {reaction && (
            <motion.span key={reaction.n} className="av-react" role="status" initial={{ opacity: 0, x: '-50%', y: '-50%', scale: 0.4, rotate: -8 }} animate={{ opacity: 1, x: '-50%', y: '-50%', scale: 1, rotate: -4 }}
              exit={{ opacity: 0, x: '-50%', y: '-120%', scale: 0.9 }} transition={{ type: 'spring', stiffness: 420, damping: 18 }}>{reaction.text}</motion.span>
          )}
        </AnimatePresence>
        {score !== undefined && <motion.span key={score} className="av-score" initial={{ scale: 1.5 }} animate={{ scale: 1 }}>{score}</motion.span>}
      </div>
      {!compact && (
        <div className="av-meta">
          <span className="av-name">{you ? 'You' : player.name}</span>
          <span className="av-status">{out ? 'Out' : player.away ? 'Away' : player.bot ? 'Bot' : player.connected === false ? 'Offline' : '\u00a0'}</span>
        </div>
      )}
    </motion.div>
  );
}
