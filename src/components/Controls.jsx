import { motion, AnimatePresence } from 'motion/react';
import { Icon } from './Icon.jsx';

export function Stepper({ value, min, max, step = 1, onChange, label, format = v => v }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="icon-btn" onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min} aria-label={`Decrease ${label}`}><Icon name="minus" size={18} /></button>
      <span className="stepper-val" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={value} initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }} transition={{ duration: 0.15 }}>{format(value)}</motion.span>
        </AnimatePresence>
      </span>
      <button type="button" className="icon-btn" onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max} aria-label={`Increase ${label}`}><Icon name="plus" size={18} /></button>
    </div>
  );
}

export function Segmented({ options, value, onChange, label, id }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className="seg-btn" onClick={() => onChange(o.value)}>
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
