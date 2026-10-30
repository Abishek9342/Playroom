import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { onToast } from '../lib/toast.js';

export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => onToast(t => {
    setItems(list => [...list.slice(-2), t]);
    setTimeout(() => setItems(list => list.filter(x => x.id !== t.id)), 2800);
  }), []);
  return (
    <div className="toaster" role="status" aria-live="polite">
      <AnimatePresence>
        {items.map(t => (
          <motion.div key={t.id} className="toast" layout
            initial={{ y: 40, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.95 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
