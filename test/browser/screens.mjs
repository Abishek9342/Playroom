// Screenshots of every screen in the bots-only preview, at phone size (390×844 @2x).
// Usage: npm run build:demo && node test/browser/screens.mjs light|dark  → screenshots/
import { launch } from './launch.mjs';
import { mkdirSync } from 'node:fs';
const OUT = new URL('../../screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const b = await launch();
const url = new URL('../../dist-demo/index.html', import.meta.url).href;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const scheme = process.argv[2] || 'light';
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const shot = async name => { await p.screenshot({ path: `${OUT}${scheme}-${name}.png` }); };
await p.goto(url); await sleep(1500); await shot('1-home');
await p.evaluate(() => [...document.querySelectorAll('.game-card')].find(b => b.textContent.includes('5 Cards')).click()); await sleep(700); await shot('2-sheet');
await p.evaluate(() => { location.hash = 'practice-cards-3'; }); await sleep(900);
await p.evaluate(() => { location.hash = 'practice-cards-3-d1-e200-1'; }); await sleep(3000); await shot('3-cards');
// select a card if it's my turn
await p.evaluate(() => { const c = document.querySelector('.hand-card:not([disabled])'); if (c) c.click(); }); await sleep(500); await shot('4-cards-selected');
await p.evaluate(() => { location.hash = 'practice-wordchain-3'; }); await sleep(3500);
await p.evaluate(() => { const i = document.querySelector('#wc-input'); if (i) { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(i, 'garden'); i.dispatchEvent(new Event('input', { bubbles: true })); i.form.requestSubmit(); } });
await sleep(6000); await shot('5-wordchain');
await p.evaluate(() => { location.hash = 'practice-xo-2'; }); await sleep(2500);
await p.evaluate(() => { const b = [...document.querySelectorAll('.xo-hit button')].find(b => !b.disabled); if (b) b.click(); }); await sleep(2500); await shot('6-xo');
await p.evaluate(() => { location.hash = 'practice-patches-2'; }); await sleep(2500); await shot('7-patches');
console.log(scheme, 'errors:', errs.length ? errs.slice(0, 5) : 'none');
await b.close();
