// Win card: a 1080x1350 image (Instagram portrait) of a result, drawn on a canvas, then shared
// through the phone's share sheet (WhatsApp, Instagram…) or downloaded where sharing files
// isn't supported.

const W = 1080, H = 1350;

async function fonts() {
  try {
    await Promise.all([
      document.fonts.load('400 200px "Lilita One"'),
      document.fonts.load('800 40px "Manrope"'),
    ]);
  } catch {}
}

// Board-game box look, same as the app: sunny table, ink outlines, hard offset shadows.
const INK = '#1E1B3A', SUN = '#FFD84D', PAPER = '#FFFFFF', CREAM = '#FFF3C4', RED = '#F0473A', BLUE = '#2449E0', MUTED = '#6E6890';
const DISPLAY = '"Lilita One", "Arial Rounded MT Bold", system-ui, sans-serif', SANS = '"Manrope", system-ui, sans-serif';

function box(x, px, py, w, h, r, fill, shadow = 14, line = 7) {
  x.beginPath(); x.roundRect(px + shadow, py + shadow, w, h, r); x.fillStyle = INK; x.fill();
  x.beginPath(); x.roundRect(px, py, w, h, r); x.fillStyle = fill; x.fill();
  x.lineWidth = line; x.strokeStyle = INK; x.stroke();
}
function outlined(x, text, px, py, fill, stroke = 10, drop = 10) {
  x.lineJoin = 'round';
  x.fillStyle = INK; x.fillText(text, px + drop, py + drop);
  x.lineWidth = stroke; x.strokeStyle = INK; x.strokeText(text, px, py);
  x.fillStyle = fill; x.fillText(text, px, py);
}

// { title: 'Victory', game: 'Imposter', line: 'You caught the Imposter', players: [{name, note, win}], site }
export async function drawWinCard({ title, game, line, players = [], site }) {
  await fonts();
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');

  // the table: yellow with a dot print
  x.fillStyle = SUN; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(30, 27, 58, .09)';
  for (let yy = 18; yy < H; yy += 36) for (let xx = 18; xx < W; xx += 36) { x.beginPath(); x.arc(xx, yy, 3, 0, Math.PI * 2); x.fill(); }

  // brand capsule + game sticker
  box(x, 70, 64, 330, 92, 46, PAPER, 8, 6);
  x.fillStyle = INK; x.font = `400 52px ${DISPLAY}`; x.textBaseline = 'middle';
  x.fillText('Playroom', 112, 112);
  x.font = `800 34px ${SANS}`;
  const gw = x.measureText(game).width + 64;
  x.save(); x.translate(W - 80 - gw / 2, 110); x.rotate(0.05);
  box(x, -gw / 2, -42, gw, 84, 42, RED, 8, 6);
  x.fillStyle = PAPER; x.textAlign = 'center'; x.fillText(game, 0, 2); x.textAlign = 'left';
  x.restore();

  // the headline, printed like a box lid
  x.textBaseline = 'alphabetic';
  let size = 200; x.font = `400 ${size}px ${DISPLAY}`;
  while (x.measureText(title.toUpperCase()).width > W - 180 && size > 110) { size -= 10; x.font = `400 ${size}px ${DISPLAY}`; }
  x.save(); x.translate(W / 2, 200 + size * 0.85); x.rotate(-0.04); x.textAlign = 'center';
  outlined(x, title.toUpperCase(), 0, 0, PAPER, 14, 12);
  x.restore();

  // the line, wrapped
  x.fillStyle = INK; x.font = `800 46px ${SANS}`;
  const words = line.split(' '); let row = '', y = 200 + size * 0.85 + 110;
  for (const w of words) {
    const t = row ? row + ' ' + w : w;
    if (x.measureText(t).width > W - 180) { x.fillText(row, 90, y); row = w; y += 58; } else row = t;
  }
  if (row) x.fillText(row, 90, y);

  // standings: one white card, the winner's row on the yellow
  const list = players.slice(0, 5);
  const top = Math.max(y + 60, 640), rowH = 104;
  box(x, 70, top, W - 154, list.length * rowH + 40, 34, PAPER);
  list.forEach((p, i) => {
    const ry = top + 20 + i * rowH;
    if (p.win) { x.beginPath(); x.roundRect(92, ry + 6, W - 198, rowH - 12, 22); x.fillStyle = CREAM; x.fill(); x.lineWidth = 4; x.strokeStyle = INK; x.stroke(); }
    // seat number disc
    x.beginPath(); x.arc(150, ry + rowH / 2, 30, 0, Math.PI * 2); x.fillStyle = p.win ? RED : BLUE; x.fill(); x.lineWidth = 4; x.strokeStyle = INK; x.stroke();
    x.fillStyle = PAPER; x.font = `400 34px ${DISPLAY}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(i + 1), 150, ry + rowH / 2 + 2);
    x.textAlign = 'left';
    x.fillStyle = INK; x.font = `800 42px ${SANS}`;
    x.fillText(p.name.length > 18 ? p.name.slice(0, 17) + '…' : p.name, 204, ry + rowH / 2);
    if (p.note) { x.fillStyle = p.win ? INK : MUTED; x.font = `800 32px ${SANS}`; x.textAlign = 'right'; x.fillText(p.note, W - 124, ry + rowH / 2); x.textAlign = 'left'; }
    x.textBaseline = 'alphabetic';
  });

  // footer: date and where to play
  x.fillStyle = INK; x.textAlign = 'center';
  x.font = `400 46px ${DISPLAY}`; x.fillText(site, W / 2, H - 110);
  x.font = `800 28px ${SANS}`;
  x.fillText(new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }), W / 2, H - 60);
  x.textAlign = 'left';

  return new Promise(res => c.toBlob(res, 'image/png'));
}

// Share the card (or download it). Returns 'shared' | 'downloaded' | 'cancelled'.
export async function shareWinCard(blob, text, url) {
  const file = new File([blob], 'playroom-win.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text: `${text} ${url}` }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'playroom-win.png';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'downloaded';
}
