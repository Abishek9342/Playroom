import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PATCH_COLORS } from '../lib/meta.js';
import { useNow } from '../lib/useNow.js';
import { shapeOk } from '../../shared/games.js';

// The clue badge: a coloured shape (square, wide, tall, or a circle for "any") with the
// patch size on it. Clues can show only the shape (n === null).
const BADGE = { square: [8, 8, 24, 24], wide: [3, 10, 34, 20], tall: [10, 3, 20, 34] };
export function ShapeBadge({ shape, n, color = 0 }) {
  const fill = PATCH_COLORS[color % PATCH_COLORS.length];
  const b = BADGE[shape];
  return (
    <svg className="badge-svg" viewBox="0 0 40 40" aria-hidden="true">
      {b ? <rect x={b[0]} y={b[1]} width={b[2]} height={b[3]} rx="5" fill={fill} stroke="rgba(29,36,51,.55)" strokeWidth="1.6" />
        : <circle cx="20" cy="20" r="14" fill={fill} stroke="rgba(29,36,51,.55)" strokeWidth="1.6" strokeDasharray="3.5 2.5" />}
      {n != null && <text x="20" y="21" textAnchor="middle" dominantBaseline="central">{n}</text>}
    </svg>
  );
}
const SHAPE_NAME = { square: 'square', wide: 'wide', tall: 'tall', any: 'any shape' };

const norm = d => ({ r: Math.min(d.a[0], d.b[0]), c: Math.min(d.a[1], d.b[1]), h: Math.abs(d.a[0] - d.b[0]) + 1, w: Math.abs(d.a[1] - d.b[1]) + 1 });
const overlaps = (x, q) => !(x.r + x.h <= q.r || q.r + q.h <= x.r || x.c + x.w <= q.c || q.c + q.w <= x.c);

export function Patches({ state, send }) {
  const g = state.g, n = g.n;
  const me = state.players.find(p => p.id === state.you);
  const can = state.status === 'playing' && me && me.alive;
  const [rects, setRects] = useState([]); // [{r,c,h,w,id,color}]
  const [drag, setDrag] = useState(null);
  const grid = useRef(null);
  const seq = useRef(0);
  const now = useNow(0, 1000);

  const cellAt = e => {
    const b = grid.current.getBoundingClientRect();
    const c = Math.floor(((e.clientX - b.left) / b.width) * n), r = Math.floor(((e.clientY - b.top) / b.height) * n);
    return [Math.max(0, Math.min(n - 1, r)), Math.max(0, Math.min(n - 1, c))];
  };
  const down = e => { if (!can) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); const p = cellAt(e); setDrag({ a: p, b: p }); };
  const moveP = e => { if (!drag) return; const p = cellAt(e); if (p[0] !== drag.b[0] || p[1] !== drag.b[1]) setDrag({ ...drag, b: p }); };
  const up = () => {
    if (!drag) return;
    const q = norm(drag);
    setDrag(null);
    const hit = rects.find(x => overlaps(x, q));
    if (q.h === 1 && q.w === 1 && hit) { setRects(rects.filter(x => x !== hit)); return; } // tap removes
    const id = ++seq.current;
    setRects([...rects.filter(x => !overlaps(x, q)), { ...q, id }]);
  };

  const covered = rects.reduce((s, x) => s + x.h * x.w, 0);
  const pct = v => `${(v / n) * 100}%`;
  const sel = drag && norm(drag);
  const secs = g.started ? Math.max(0, Math.floor((now - g.started) / 1000)) : 0;
  const clueIn = (q) => g.clues.filter(k => k.r >= q.r && k.r < q.r + q.h && k.c >= q.c && k.c < q.c + q.w);
  const fits = q => { const k = clueIn(q); return k.length === 1 && (k[0].n == null || k[0].n === q.h * q.w) && shapeOk(k[0].shape, q.h, q.w); };
  // a patch is painted in its clue's colour; grey while it holds no clue or several
  const colorOf = q => { const k = clueIn(q); return k.length === 1 ? PATCH_COLORS[(k[0].color ?? 0) % PATCH_COLORS.length] : 'var(--patch-empty)'; };

  return (
    <div className="patches">
      <div className="patch-head">
        <div><span className="kicker">{state.status === 'playing' ? 'Race to solve' : 'Final grid'}</span>
          <p className="muted">Drag corner to corner to draw a patch. Tap one to remove it.</p></div>
        <span className="timer-pill">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>
      </div>
      <div className="quilt" ref={grid} style={{ '--n': n }} onPointerDown={down} onPointerMove={moveP} onPointerUp={up}
        onPointerCancel={() => setDrag(null)} role="application" aria-label={`${n} by ${n} puzzle grid`}>
        {Array.from({ length: n * n }, (_, k) => <span key={k} className="quilt-cell" />)}
        <AnimatePresence>
          {rects.map(q => (
            <motion.span key={q.id} className={`patch${fits(q) ? ' fits' : ''}`}
              style={{ top: pct(q.r), left: pct(q.c), width: pct(q.w), height: pct(q.h), '--patch': colorOf(q) }}
              initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0, rotate: 8 }}
              transition={{ type: 'spring', stiffness: 520, damping: 26 }} />
          ))}
        </AnimatePresence>
        {sel && <span className="patch-draft" style={{ top: pct(sel.r), left: pct(sel.c), width: pct(sel.w), height: pct(sel.h) }}><b>{sel.h * sel.w}</b></span>}
        {g.clues.map((k, i) => (
          <span key={i} className="clue" style={{ top: pct(k.r), left: pct(k.c), width: pct(1), height: pct(1) }}
            aria-label={`${k.n != null ? k.n + ' squares, ' : ''}${SHAPE_NAME[k.shape || 'any']}`}>
            <ShapeBadge shape={k.shape || 'any'} n={k.n} color={k.color ?? i} />
          </span>
        ))}
      </div>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={n * n} aria-valuenow={covered} aria-label={`${covered} of ${n * n} squares covered`}>
        <motion.span animate={{ width: `${(covered / (n * n)) * 100}%` }} transition={{ type: 'spring', stiffness: 200, damping: 30 }} />
      </div>
      {can && (
        <div className="row">
          <motion.button className="btn btn-primary" whileTap={{ scale: 0.95 }} disabled={covered !== n * n}
            onClick={() => send({ type: 'move', move: { type: 'solve', rects: rects.map(({ r, c, h, w }) => ({ r, c, h, w })) } })}>
            Submit solution
          </motion.button>
          <button className="btn btn-secondary" onClick={() => setRects([])} disabled={!rects.length}>Clear</button>
        </div>
      )}
    </div>
  );
}
