import { useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// Six letter tiles backed by one real input (good for paste, autofill and screen readers).
export function TokenInput({ value, onChange, onSubmit }) {
  const ref = useRef(null);
  const chars = value.padEnd(6, ' ').split('');
  return (
    <div className="token-input" onClick={() => ref.current && ref.current.focus()}>
      <input ref={ref} value={value} aria-label="Invite token" autoComplete="off" autoCapitalize="characters" spellCheck="false"
        maxLength={6} inputMode="text"
        onChange={e => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[01OIL]/g, '').slice(0, 6))}
        onKeyDown={e => { if (e.key === 'Enter') onSubmit(); }} />
      {chars.map((c, i) => (
        <span key={i} className={`slot${c.trim() ? ' filled' : ''}${i === value.length ? ' caret' : ''}`} aria-hidden="true">
          <AnimatePresence mode="popLayout">
            {c.trim() && (
              <motion.span key={c + i} initial={{ y: -18, opacity: 0, rotate: -12 }} animate={{ y: 0, opacity: 1, rotate: 0 }}
                exit={{ y: 12, opacity: 0 }} transition={{ type: 'spring', stiffness: 600, damping: 22 }}>{c}</motion.span>
            )}
          </AnimatePresence>
        </span>
      ))}
    </div>
  );
}
