import { motion } from 'motion/react';
import { levelTitle } from '../../shared/xp.js';

// "Level up" celebration, shown once when a game or the daily puzzle takes you to a new level.
export function LevelUp({ level, onDone }) {
  return (
    <motion.div className="levelup" role="status" aria-live="assertive" onClick={onDone}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="levelup-card" initial={{ scale: 0.6, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 16 }}>
        <span className="kicker">Level up</span>
        <b className="levelup-num">LV {level}</b>
        <span className="levelup-title">{levelTitle(level)}</span>
        <button className="btn btn-primary" onClick={onDone}>Let’s go</button>
      </motion.div>
    </motion.div>
  );
}
