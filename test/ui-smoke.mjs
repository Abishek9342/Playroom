// UI smoke test: runs the single-file preview build (bots only) in jsdom and plays
// every game: home render, Word Chain move + bot reply, XO to a result, 5 card rounds,
// Patches render + tab-hide elimination. Prints what it sees plus any runtime errors.
// Usage: npm run test:ui   (builds dist-demo first)
// jsdom can't run module scripts, so the bundle is moved to a classic <script> at the
// end of <body> and import.meta is stubbed. Real browsers don't need any of that.
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
let html = readFileSync(new URL('../dist-demo/index.html', import.meta.url), 'utf8').replace(/import\.meta/g, '({url:location.href})');
{ const m = html.match(/<script type="module" crossorigin>([\s\S]*?)<\/script>/); html = html.replace(m[0], () => '').replace('</body>', () => '<script>' + m[1] + '</script></body>'); }
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.message || e)));
vc.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ').slice(0, 300)));
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://preview.local/', virtualConsole: vc,
  beforeParse(w) {
    w.matchMedia = q => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
    w.Element.prototype.scrollIntoView = () => {};
    w.scrollTo = () => {}; // used by Motion layout animations; not implemented in jsdom
    w.Element.prototype.scrollTo = () => {};
    w.Element.prototype.setPointerCapture = () => {};
  } });
const w = dom.window, d = w.document;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = () => d.getElementById('root').textContent.replace(/\s+/g, ' ');
await sleep(1500);
console.log('HOME:', text().slice(0, 200));
// open a game's settings sheet and start practice from it (5 Cards: 3 players, 2 decks, exit at 100)
[...d.querySelectorAll('.game-card')].find(b => b.textContent.includes('5 Cards')).click();
await sleep(500);
console.log('SHEET:', d.querySelector('.sheet') ? d.querySelector('.sheet').textContent.slice(0, 160) : 'none');
d.querySelector('.sheet .stepper button[aria-label="Increase players"]').click();
await sleep(100);
[...d.querySelectorAll('.sheet .seg-btn')].find(b => b.textContent === '2').click();
for (let i = 0; i < 2; i++) { d.querySelector('.sheet button[aria-label="Decrease exit point"]').click(); await sleep(60); }
await sleep(200);
console.log('SHEET values:', [...d.querySelectorAll('.sheet .stepper-val')].map(e => e.textContent).join(' / '));
[...d.querySelectorAll('.sheet button')].find(b => b.textContent.includes('Practice with bots')).click();
await sleep(2500);
console.log('PRACTICE route:', w.location.hash, '| chips:', [...d.querySelectorAll('.fc-meta .chip')].map(e => e.textContent).join(' / '), '| room bar:', d.querySelector('.room-bar-title') && d.querySelector('.room-bar-title').textContent);
const games = [['wordchain', 3], ['xo', 2], ['cards', 3], ['patches', 2]];
// no confirm() stub on purpose: the app must use its own dialog (browser popups are blocked in sandboxed frames)
w.confirm = () => { throw new Error('window.confirm was called'); };
w.prompt = () => { throw new Error('window.prompt was called'); };
const confirmDialog = async () => { await sleep(400); const y = d.querySelector('.confirm-yes'); if (!y) return false; y.click(); await sleep(300); return true; };
for (const [g, n] of games) {
  w.location.hash = `practice-${g}-${n}`;
  await sleep(g === 'wordchain' ? 4000 : 2500);
  console.log(`\n${g.toUpperCase()} start:`, text().slice(0, 220));
  if (g === 'wordchain') {
    const inp = d.querySelector('.composer input');
    if (inp) {
      const set = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set;
      set.call(inp, 'apple'); inp.dispatchEvent(new w.Event('input', { bubbles: true }));
      await sleep(100);
      d.querySelector('.composer').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
      await sleep(6000);
      console.log('chain tiles:', d.querySelectorAll('.wc-row').length, '| words:', [...d.querySelectorAll('.wc-tiles')].map(e => e.textContent).join(' > '));
    } else console.log('no composer (not my turn?)');
  }
  if (g === 'xo') {
    for (let k = 0; k < 5; k++) {
      const b = [...d.querySelectorAll('.xo-hit button')].find(b => !b.disabled);
      if (b) b.click();
      await sleep(1700);
    }
    console.log('xo marks:', d.querySelectorAll('.xo-x, .xo-o').length, '|', text().slice(-160));
  }
  if (g === 'cards') {
    let turns = 0, called = false;
    for (let k = 0; k < 40 && !d.querySelector('.round-result') && !d.querySelector('.result'); k++) {
      const stack = d.querySelector('.deck.live');
      const card = d.querySelector('.hand-card:not([disabled])');
      if (stack) { stack.click(); turns++; }
      else if (card && turns >= 3 && !called) {
        d.querySelector('.action-bar .btn-danger').click();
        await sleep(300);
        console.log('5 cards: show dialog shown?', !!d.querySelector('.confirm'), '|', d.querySelector('.confirm h2') && d.querySelector('.confirm h2').textContent);
        called = await confirmDialog();
      }
      else if (card) { card.click(); await sleep(150); d.querySelector('.action-bar .btn-primary').click(); }
      await sleep(1600);
    }
    console.log('5 cards: my turns', turns, '| info:', [...d.querySelectorAll('.fc-meta .chip')].map(e => e.textContent).join(' / '));
    const res = d.querySelector('.round-result');
    console.log('5 cards round end:', res ? res.querySelector('.verdict').textContent + ' | rows ' + res.querySelectorAll('.rr-row:not(.rr-head)').length : 'none');
    await sleep(9000);
    console.log('5 cards next round:', [...d.querySelectorAll('.fc-meta .chip')].map(e => e.textContent).join(' / '), '| scores:', [...d.querySelectorAll('.av-score')].map(e => e.textContent).join(','));
    [...d.querySelectorAll('.room-bar button')].find(b => b.textContent === 'Leave').click();
    const left = await confirmDialog();
    await sleep(400);
    console.log('5 cards leave via dialog:', left, '| me out:', !!d.querySelector('.av.is-out'), '| banner:', d.querySelector('.banner-danger') ? d.querySelector('.banner-danger').textContent : 'none');
  }
  if (g === 'patches') {
    console.log('quilt cells:', d.querySelectorAll('.quilt-cell').length, 'clues:', d.querySelectorAll('.clue').length);
    // tab switch outside Word Chain -> shown as Away, NOT eliminated (only Word Chain is strict)
    Object.defineProperty(d, 'hidden', { configurable: true, get: () => true });
    d.dispatchEvent(new w.Event('visibilitychange'));
    await sleep(3600);
    console.log('after hiding tab (expect away, not out):', 'away', d.querySelectorAll('.av.is-away').length, '| out', d.querySelectorAll('.av.is-out').length, '| result', d.querySelector('.result') ? 'shown' : 'none');
    Object.defineProperty(d, 'hidden', { configurable: true, get: () => false });
    d.dispatchEvent(new w.Event('visibilitychange'));
    await sleep(200);
    console.log('back on the tab: away', d.querySelectorAll('.av.is-away').length);
  }
}
console.log('\nERRORS:', errors.length ? errors.slice(0, 8) : 'none');
process.exit(0);
