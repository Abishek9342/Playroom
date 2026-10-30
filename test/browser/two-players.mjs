// Real two-browser test against `npm run dev`: host signs up, creates a 5 Cards room
// (2 decks, exit 150), a guest joins from the invite link with only a name, they play,
// host Shows, next round, guest leaves, host wins. Saves screenshots to screenshots/.
// Usage: npm run dev (other terminal), then node test/browser/two-players.mjs light|dark
import { launch } from './launch.mjs';
import { mkdirSync } from 'node:fs';
const OUT = new URL('../../screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const B = 'http://localhost:5173';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const scheme = process.argv[2] || 'light';
const browser = await launch();
const mk = async () => {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  return p;
};
const shot = (p, n) => p.screenshot({ path: `${OUT}two-players-${scheme}-${n}.png` });
const clickText = (p, sel, text) => p.evaluate((sel, text) => { const el = [...document.querySelectorAll(sel)].find(e => e.textContent.trim().includes(text)); if (!el) return false; el.click(); return true; }, sel, text);
const type = async (p, sel, v) => { await p.click(sel, { clickCount: 3 }); await p.type(sel, v); };

const host = await mk();
await host.goto(B); await sleep(1500); await shot(host, '01-landing');
await clickText(host, '.seg-btn', 'Create account'); await sleep(400);
const uname = 'host' + Math.floor(Math.random() * 1e5);
await type(host, 'input[autocomplete="username"]', uname);
await type(host, 'input[type="password"]', 'password123');
await clickText(host, 'button', 'Create account'); await sleep(400);
await clickText(host, '.form button', 'Create account'); await sleep(1500);
await shot(host, '02-home');
await clickText(host, '.game-card', '5 Cards'); await sleep(600);
await clickText(host, '.sheet .seg-btn', '2'); await sleep(100);
await host.click('.sheet button[aria-label="Decrease exit point"]'); await sleep(150);
await shot(host, '03-settings');
await clickText(host, '.sheet button', 'Create room'); await sleep(2000);
await shot(host, '04-lobby');
const token = await host.evaluate(() => location.hash.replace('#room-', ''));
console.log('room', token, 'lobby text:', (await host.evaluate(() => document.querySelector('.lobby').innerText)).replace(/\n+/g, ' | ').slice(0, 220));

const guest = await mk();
await guest.goto(`${B}/#join-${token}`); await sleep(1500);
await shot(guest, '05-guest-landing');
console.log('guest sees code prefilled:', await guest.evaluate(() => document.querySelector('.token-input input').value));
await type(guest, 'input[autocomplete="nickname"]', 'Priya');
await clickText(guest, '.form button', 'Join game'); await sleep(2500);
await shot(guest, '06-guest-game'); await shot(host, '07-host-game');
console.log('started:', await host.evaluate(() => document.querySelector('.fc-meta') ? document.querySelector('.fc-meta').innerText.replace(/\n/g, ' ') : 'not started'));

// play: whoever's turn drops their first card then draws, for 4 turns, then host Shows on their turn
const act = async (p, name) => p.evaluate(() => {
  const deck = document.querySelector('.deck.live'); if (deck) { deck.click(); return 'picked'; }
  const c = document.querySelector('.hand-card:not([disabled])'); if (!c) return 'wait';
  c.click(); return 'selected';
});
let turns = 0;
for (let i = 0; i < 30 && turns < 4; i++) {
  for (const p of [host, guest]) {
    const r = await act(p);
    if (r === 'selected') { await sleep(250); await p.evaluate(() => document.querySelector('.action-bar .btn-primary').click()); turns++; await sleep(500); await act(p); }
  }
  await sleep(600);
}
console.log('turns played:', turns);
// host waits for their turn then shows
for (let i = 0; i < 20; i++) { if (await host.evaluate(() => !!document.querySelector('.action-bar .btn-danger'))) break; await act(guest); await sleep(300); const r = await act(guest); if (r === 'selected') { await guest.evaluate(() => document.querySelector('.action-bar .btn-primary').click()); await sleep(400); await act(guest); } await sleep(500); }
await shot(host, '08-host-turn');
await host.evaluate(() => document.querySelector('.action-bar .btn-danger').click()); await sleep(500);
await shot(host, '09-show-dialog');
await host.evaluate(() => document.querySelector('.confirm-yes').click()); await sleep(1500);
await shot(host, '10-round-result'); await shot(guest, '11-guest-result');
console.log('result:', await host.evaluate(() => document.querySelector('.round-result') ? document.querySelector('.round-result').innerText.replace(/\n+/g, ' | ').slice(0, 200) : 'none'));
await sleep(8500);
console.log('next round:', await guest.evaluate(() => document.querySelector('.fc-meta') && document.querySelector('.fc-meta').innerText.replace(/\n/g, ' ')), '| scores:', await guest.evaluate(() => [...document.querySelectorAll('.av-score')].map(e => e.textContent).join(',')));
// guest leaves -> host wins
await guest.evaluate(() => [...document.querySelectorAll('.room-bar button')].find(b => b.textContent === 'Leave').click()); await sleep(400);
await guest.evaluate(() => document.querySelector('.confirm-yes').click()); await sleep(1500);
await shot(host, '12-host-wins');
console.log('final:', await host.evaluate(() => document.querySelector('.result') ? document.querySelector('.result').innerText.replace(/\n+/g, ' | ').slice(0, 200) : 'none'));
console.log('page errors:', host.errs, guest.errs);
await browser.close();
