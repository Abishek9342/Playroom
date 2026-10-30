import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { onAsk } from '../lib/confirm.js';

export function Confirmer() {
  const [req, setReq] = useState(null);
  const yes = useRef(null);
  useEffect(() => onAsk(r => setReq(r)), []);
  useEffect(() => { if (req && yes.current) yes.current.focus(); }, [req]);
  useEffect(() => {
    if (!req) return;
    const key = e => { if (e.key === 'Escape') done(false); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  const done = v => { if (req) req.resolve(v); setReq(null); };
  return (
    <AnimatePresence>
      {req && (
        <motion.div className="sheet-backdrop confirm-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => done(false)}>
          <motion.div className="confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"
            initial={{ scale: 0.85, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }} onClick={e => e.stopPropagation()}>
            <h2 id="confirm-title">{req.title}</h2>
            {req.body && <p className="muted">{req.body}</p>}
            <div className="row center">
              <button className="btn btn-secondary" onClick={() => done(false)}>{req.cancel}</button>
              <button ref={yes} className={`btn ${req.danger ? 'btn-danger' : 'btn-primary'} confirm-yes`} onClick={() => done(true)}>{req.confirm}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
