# CLAUDE.md: Playroom

Multiplayer web games app (Word Chain, XO, Patches, 5 Cards / Least Count) with accounts,
invite tokens, live play, practice-vs-bots and an installable PWA.
React + Vite + Motion front end; one Cloudflare Worker (D1 + Durable Objects) back end.
Must stay deployable on Cloudflare's **free** plan.

**Live:** https://playroom.vibezone-games.workers.dev (Cloudflare account abisheksridharan.work@gmail.com;
D1 playroom-db 5ceb0c80-70fc-4e86-864d-54fe0beeb667). Redeploy with `npm run deploy`.

Read `docs/HANDOFF.md` first for current status and next steps, and
`docs/REQUIREMENTS.md` for what the user asked for (in their words).

## Commands

```bash
npm install
npm run db:local        # create local D1 tables (no Cloudflare account needed)
npm run dev             # http://localhost:5173 : React app + Worker + DO + D1, hot reload
npm test                # game-rule unit tests (shared/games.js)
npm run test:e2e        # needs `npm run dev` running; prints results of a full multiplayer run
npm run test:ui         # builds the bots-only preview and plays every game in jsdom
npm run test:browser    # REAL Chrome, two browsers: host + guest via invite link (needs `npm run dev`)
npm run screens         # phone-size screenshots of every screen, light + dark -> screenshots/
                        # (browser tests need `npm i -D puppeteer` once; see test/browser/launch.mjs)
npm run build           # production build -> dist/client (assets) + dist/playroom (worker)
npm run build:demo      # single-file preview -> dist-demo/index.html (practice mode only)
npm run share           # temporary public link to the dev server (cloudflared quick tunnel)
npm run deploy          # build + wrangler deploy (needs `wrangler login` and a real D1 id)
npm run words           # regenerate public/words.txt from an-array-of-english-words
```

Before deploying for the first time: `npx wrangler d1 create playroom-db`, paste the id into
`wrangler.jsonc` (currently the placeholder `REPLACE_WITH_YOUR_DATABASE_ID`, which works
for local dev), then `npm run db:remote`.

## Layout

```
shared/games.js      Rules for Word Chain, XO, Patches + game registry. Pure JS, no I/O.
shared/fivecards.js  5 Cards (Least Count): card ids, validators (validSet/splitDrop), game,
                     and botMove. Rules spec is in the file header and docs/REQUIREMENTS.md.
shared/roomCore.js   Room engine: seats, auto-start when full, moves, away/grace/elimination,
                     results, per-player views. Networking-free.
worker/index.js      Worker entry: auth API (signup/login/logout/me), room create/info,
                     WebSocket upgrade -> Durable Object. Origin check (CSRF/WS hijack).
worker/room.js       GameRoom Durable Object: wraps RoomCore with WebSockets, persists cfg,
                     alarm-based cleanup.
worker/dictionary.js Bundles public/words.txt (?raw import) into the Worker; Set built lazily.
src/App.jsx          Hash router: #room-CODE, #join-CODE (invite link), #practice (bots home),
                     #practice-<game>-<n>[-d<decks>][-e<exit>][-<nonce>]. Auth gate, top bar.
src/screens/         Landing (join with name + code / sign in / create account), Home (join by
                     code, game list, settings sheet), Room (lobby, game shell, results dialog).
src/games/           WordChain, XO, Patches, Cards boards.
src/components/      Icon (SVG icon set + Logo), PlayingCard (real card faces/backs), Avatar
                     (initials, timer ring, host crown, score), Sheet, Controls (Stepper,
                     Segmented, Field), GameArt (thumbnails), Confirmer, Toaster, TokenInput,
                     Confetti, InstallButton.
src/lib/             api, useRoom (remote WS + local practice hooks), localRoom (bots),
                     words (dictionary loader), install (PWA prompt), meta (game metadata,
                     colors), toast, useNow.
public/              manifest.webmanifest, sw.js, icons/, words.txt (~275k words, 2.8 MB)
schema.sql           D1: users, sessions
artifacts/           Earlier claude.ai artifacts (reference only, not part of the build)
test/                games.test.js, e2e.mjs, ui-smoke.mjs
```

## Architecture rules (keep these)

- **The server is the referee.** Every move is validated in `shared/games.js` inside the
  Durable Object. Clients send intents only. Never trust client state.
- **One rules engine.** Practice mode (`src/lib/localRoom.js`) runs the same `RoomCore` +
  `games.js` as the server. Change rules in `shared/` only, then run `npm test`.
- **5 Cards uses the user's HOUSE RULES** (docs/REQUIREMENTS.md §7), which override the
  Vanikar page: no Round Joker, 3 printed jokers per deck (0 points), the action is called
  **Show** (not Call). Move type is `show` (`call` accepted as an alias).
- **5 Cards turn = DROP then PICK** (or SHOW instead of dropping). You pick from the
  *previous* player's drop, never your own. Timeout auto-drops your highest card and draws
  (no elimination for timeouts in this game). 30 s turns, 8 s pause between rounds.
- **Game views hide secrets.** `view(forId)` must never leak other players' hands or the
  Patches answer (`puzzle.answer`). The e2e test checks both.
- **Elimination (Word Chain only, `strictPresence` in shared/games.js):** client sends
  `hidden`/`visible` on `visibilitychange`; WebSocket close also counts. Server waits `GRACE_MS`
  (3 s) before eliminating. Last player alive wins. Other games: leaving only marks you Away.
- **Rooms:** one Durable Object per 6-char invite token (alphabet excludes 0/O/1/I/L).
  Room auto-starts when seats == chosen size. New joins rejected once started.
- **Hosts need an account; friends join with name + code only.** `POST /api/guest {name}`
  creates a guest user (is_guest=1, no password) with a session. Guests can join rooms and
  practice but `POST /api/rooms` returns 403 for them. The host (room creator) must take the
  first seat; others get "The host hasn’t opened this room yet" until they do.
- **Host settings** live in `shared/games.js` (`OPTIONS`, `defaultOptions`, `normalizeOptions`),
  validated on the server, stored in room cfg, passed to the game. 5 Cards: decks 1–3
  (default 1, or 2 for 6+ players), exitAt 50–1000 step 50 (default 200). Players 2–8.
  XO: board 3|5 (a win = a FULL line: 3 on 3×3, all 5 on 5×5), bestOf 1|3|5 = at most that many
  rounds; draws use up a round, early finish only when the lead can't be caught. Practice: -b / -o.
- **Rematch** is generic: `RoomCore.rematch(id)`, all humans still in the room vote, bots agree.
- **Patches = LinkedIn rules**: clue `{r,c,n|null,shape,color}`, shape square|wide|tall|any.
- **Every game has a guide** in `src/components/Guide.jsx`. New game or rule change = update it.
- **5 Cards on phones is landscape-first** (rotate prompt in portrait; landscape CSS block at the
  end of styles.css). Copy always goes through `src/lib/clipboard.js` (LAN http has no Clipboard API).
- Dev on this laptop: port 5173 is taken by another app; use `npx vite dev --host --port 5180`.
- **Google sign-in** lives in worker/google.js + handleGoogle (worker/index.js); secrets
  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (.dev.vars locally, `wrangler secret put` live). Never
  commit .dev.vars. Schema changes need a file in migrations/ plus the matching schema.sql change.
- Test HTTP clients must read every response body: the local dev server fails the next request otherwise.
- **Auth:** PBKDF2-SHA256 100k iterations (Workers max), per-user salt; session token is
  random 32 bytes, only its SHA-256 is stored; HttpOnly SameSite=Lax cookie; `Secure` only
  when the request is HTTPS (so dev tunnels over HTTP still work).
- **Origin check** accepts the request's URL host, `Host`, or `X-Forwarded-Host`
  (needed behind cloudflared / Codespaces port forwarding).

## Gotchas learned the hard way

- Free plan needs **SQLite-backed** Durable Objects: `new_sqlite_classes` in migrations.
- `@cloudflare/vite-plugin` dev server does NOT serve `public/` files to the Worker via
  `env.ASSETS`, which is why the dictionary is bundled with `?raw` instead of fetched.
  Worker bundle is ~754 KB gzipped (free limit 3 MB).
- `import.meta.env.VITE_DEMO` is defined as `''` in `vite.config.js` and `'1'` in
  `vite.demo.config.js`. Check it **directly** (`if (import.meta.env.VITE_DEMO)`) where a
  branch must be dropped from prod. Going through the `DEMO` constant kept the 2.8 MB words
  chunk in the prod bundle.
- `vite.config.js` `server.allowedHosts` must include tunnel domains
  (`.trycloudflare.com`, `.app.github.dev`) or Vite blocks the request.
- Patches drag on touch: don't re-render the grid element mid-drag (implicit pointer
  capture is lost). Current React version captures on the container and computes cells
  from coordinates.
- **Never use `window.confirm`/`prompt`/`alert`.** They're silently blocked in sandboxed
  frames (the claude.ai preview) — this broke the Call button once. Use `ask()` from
  `src/lib/confirm.js` (rendered by `<Confirmer/>`). `test/ui-smoke.mjs` throws if they're called.
- `motion` `layoutId` inside the settings Sheet didn't render the selected pill; Segmented uses
  plain CSS for the selected state now.
- jsdom lacks `Element.scrollTo`/`window.scrollTo` (Motion layout uses the latter); guard calls
  and stub them in tests. Real Chrome tests live in `test/browser/`.
- jsdom can't run module scripts. `test/ui-smoke.mjs` rewrites the bundle into a classic
  script; that's test-only.
- Pin exact dependency versions, at least 2 weeks old (supply-chain hygiene). Current
  pins are in package.json.

## Design system (keep consistent)

The user rejected the first, playful design as looking "AI generated". The current design aims
for a real, professional card-game app. Keep it that way:
- Neutral app chrome (`--bg`, `--surface`, `--border`, `--text*` tokens in `src/styles.css`),
  ONE brand colour (emerald `--brand`) and a gold `--accent`. Green felt only on the card table.
  Light by default, dark via `prefers-color-scheme` (+ `[data-theme]` overrides).
- Font: Manrope (Google Fonts) with system fallbacks. Tabular numbers for scores/timers.
- Real icons from `components/Icon.jsx`. **No emoji in the UI.**
- Real playing cards from `components/PlayingCard.jsx`: corner indices, pip layouts, framed
  J/Q/K, joker card, patterned back. Use it for every card.
- Standard components: `.btn-primary/secondary/quiet/danger`, `.card`, `.chip`, `.badge`,
  `Sheet` (bottom sheet on phones), `ask()` dialogs. Subtle shadows, 10–14px radii.
- Motion: purposeful and quick (deal, flip, select, page fade). No bouncy cartoon effects.
- Copy: sentence case, plain verbs, curly apostrophes/quotes in UI text.
- Mobile first (390px wide). Every grid/flex child that holds wide content needs
  `min-width: 0` (Word Chain once overflowed the screen). Check with `npm run screens`.

## Working with this user

- They're building this as a product and test mainly on their phone; they're moving to a
  laptop with Claude Code now.
- They write casually ("buddy", "okay ahh") and like ambitious, polished UI.
- Give step-by-step instructions in plain words when they need to do something
  themselves. They got confused by dense instructions before.
- Verify changes by running the tests (`npm test`, `npm run test:e2e`, `npm run test:ui`,
  `npm run test:browser`) and LOOK at screenshots (`npm run screens`) before reporting done.
  The user notices visual quality.
