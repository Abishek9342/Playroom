import { motion } from 'motion/react';
import { info } from '../../shared/fivecards.js';

const RANK = r => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[r] || String(r);
const SUIT = ['♣', '♦', '♥', '♠'];
const SUIT_NAME = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANK_NAME = r => ({ 1: 'Ace', 11: 'Jack', 12: 'Queen', 13: 'King' })[r] || String(r);

// Standard pip positions (x%, y%) inside the pip area. Pips below the middle are inverted.
const PIPS = {
  2: [[50, 10], [50, 90]],
  3: [[50, 10], [50, 50], [50, 90]],
  4: [[28, 10], [72, 10], [28, 90], [72, 90]],
  5: [[28, 10], [72, 10], [50, 50], [28, 90], [72, 90]],
  6: [[28, 10], [72, 10], [28, 50], [72, 50], [28, 90], [72, 90]],
  7: [[28, 10], [72, 10], [50, 30], [28, 50], [72, 50], [28, 90], [72, 90]],
  8: [[28, 10], [72, 10], [50, 30], [28, 50], [72, 50], [50, 70], [28, 90], [72, 90]],
  9: [[28, 10], [72, 10], [28, 37], [72, 37], [50, 50], [28, 63], [72, 63], [28, 90], [72, 90]],
  10: [[28, 10], [72, 10], [50, 23], [28, 37], [72, 37], [28, 63], [72, 63], [50, 77], [28, 90], [72, 90]],
};

export function cardLabel(c) {
  const k = info(c);
  return k.printed ? 'Joker' : `${RANK_NAME(k.rank)} of ${SUIT_NAME[k.suit]}`;
}

// size: 'lg' (hand), 'md' (table), 'sm' (results)
export function PlayingCard({ c, size = 'md', className = '', ...rest }) {
  const k = info(c);
  if (k.printed) return (
    <motion.div className={`pc pc-${size} pc-joker ${className}`} role="img" aria-label="Joker, 0 points" {...rest}>
      <span className="pc-corner"><b>J</b><i>★</i></span>
      <span className="pc-joker-word" aria-hidden="true">JOKER</span>
      <span className="pc-joker-star" aria-hidden="true">★</span>
      <span className="pc-corner pc-corner-b"><b>J</b><i>★</i></span>
    </motion.div>
  );
  const red = k.suit === 1 || k.suit === 2;
  const s = SUIT[k.suit];
  let center;
  if (size === 'sm') center = <span className="pc-big">{s}</span>;
  else if (k.rank === 1) center = <span className="pc-ace">{s}</span>;
  else if (k.rank > 10) center = (
    <span className="pc-face"><b>{RANK(k.rank)}</b><i>{s}</i></span>
  );
  else center = (
    <span className="pc-pips">
      {PIPS[k.rank].map(([x, y], i) => (
        <i key={i} style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -50%)${y > 50 ? ' rotate(180deg)' : ''}` }}>{s}</i>
      ))}
    </span>
  );
  return (
    <motion.div className={`pc pc-${size}${red ? ' red' : ''} ${className}`} role="img" aria-label={cardLabel(c)} {...rest}>
      <span className="pc-corner"><b>{RANK(k.rank)}</b><i>{s}</i></span>
      {center}
      <span className="pc-corner pc-corner-b"><b>{RANK(k.rank)}</b><i>{s}</i></span>
    </motion.div>
  );
}

export function CardBack({ size = 'md', className = '', ...rest }) {
  return <motion.div className={`pc pc-${size} pc-back ${className}`} aria-hidden="true" {...rest}><span /></motion.div>;
}
