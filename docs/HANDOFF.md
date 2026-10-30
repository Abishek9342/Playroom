# Handoff: where things stand (Oct 30, 2026)

## 2026-10-30 Code on GitHub: https://github.com/Abishek9342/Playroom (PUBLIC, branch main)
- First commit 41378ce. Repo-local git identity = Abishek9342 <152966001+Abishek9342@users.noreply.github.com>
  (keeps the work email off the public repo). Checked before pushing: no secrets (.dev.vars ignored,
  no tokens), no other players' usernames in docs. docs/screenshots/ stays ignored (`screenshots/`).
- Public repo: never commit .dev.vars, tokens, or real users' data.

## 2026-10-30 Leaving the screen eliminates in Word Chain ONLY (deployed)
- `GAMES.wordchain.strictPresence = true`; `RoomCore.strict()`. Other games: hide/close = Away only
  (no grace timer, no elimination); back/rejoin clears it. Explicit Leave still eliminates in all games.
  Their own turn timers keep games moving (XO timeout, 5 Cards auto-play, Patches is a race).
- Texts updated: lobby note per game, guides (Word Chain strict note, others "you can switch apps").
- Tests: new presence unit test; ui-smoke now expects Patches → Away not out; e2e still shows Word
  Chain eliminating on tab switch / page close and XO not. Deployed; live serves the new bundle.
- User question answered: updates reach installed (PWA) users automatically. Server rules change the
  moment we deploy; the app screens update the next time the app is opened (sw.js is network-first
  for pages, assets are hashed). No reinstall needed.

## 2026-10-30 Google sign-in switched on (live)
- Google Cloud project `playroom-513210` (Google Auth Platform: External; Branding home page +
  privacy link https://playroom.vibezone-games.workers.dev/privacy; authorized domain
  vibezone-games.workers.dev). OAuth client "Web" with the /api/auth/google/callback redirect URI.
- Secrets set with `wrangler secret put` (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET). The user pasted
  the secret into chat; suggested resetting it later in Google → Clients and re-running the put.
- Added public/privacy.html (Cloudflare serves it at /privacy; /privacy.html 307s there) + a
  Privacy link under the landing panel. Deployed.
- Verified: /api/config → google:true; start redirect carries the right client_id + redirect_uri;
  Google answers 302 (no invalid_client / redirect_uri_mismatch). A real Google sign-in by the user
  on the phone is still to be confirmed. If the app is still "Testing", only test users can sign in.

## 2026-10-30 link renamed: https://playroom.vibezone-games.workers.dev
- User changed the account subdomain in the dashboard to `vibezone-games` (old
  abisheksridharan-work link no longer works; older entries below were updated to the new link).
- Re-verified on the new link: full e2e + two-browser XO/rematch pass. Removed only the 7 test
  accounts; the real users who had already signed up were kept.
- Google redirect URI to use: https://playroom.vibezone-games.workers.dev/api/auth/google/callback

## 2026-10-30 DEPLOYED: https://playroom.vibezone-games.workers.dev
- Cloudflare account: abisheksridharan.work@gmail.com (account id e10079a9228e92c552884f01684cfd95),
  wrangler logged in with OAuth on this laptop. workers.dev subdomain = `abisheksridharan-work`
  (auto-created by the dashboard; user wanted a short one but vibe / vibezone / vibes were all
  unavailable; renaming is only possible with the pencil in Compute → Workers & Pages → Subdomain,
  the API refuses once one exists). If renamed, update the Google redirect URI.
- D1 `playroom-db` id 5ceb0c80-70fc-4e86-864d-54fe0beeb667 (APAC), created from schema.sql
  (already has Google columns: do NOT run migrations/0002 on it). wrangler.jsonc now has the real id.
- New workers.dev names need ~1–2 min for the HTTPS certificate (TLS handshake failure until then).
- Verified live: full e2e pass (auth, rooms, WebSockets/Durable Objects, all 4 games, guests, host
  settings, cross-origin 403), two-browser XO + copy + rematch popup in Edge, manifest served.
  Test accounts removed afterwards (live DB: 0 users, 0 sessions).
- Wrangler OAuth login on Windows: the consent page can sit on "Authorizing…" past wrangler's 2-minute
  window; a second `npx wrangler login` right after went straight through. Never start two logins at once.
- NEXT: Google OAuth client (README 3b) with redirect URI
  https://playroom.vibezone-games.workers.dev/api/auth/google/callback, then
  `npx wrangler secret put GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Redeploy = `npm run deploy`.

## 2026-10-30 (pre-deploy sweep) READY TO DEPLOY
- Independent review of all of today's changes: no high-severity bugs. Fixed every finding:
  1. Connect Google now needs the password first (POST /api/link/google → 10-min HMAC `glink`
     cookie bound to the session), and an account already linked can't be silently re-linked
     (#auth-already). Closes a shared-phone account-takeover path.
  2. Google sign-in from an invite link keeps the room (room in the state cookie, validated
     ^[A-Z2-9]{6}$, lands on #auth-<outcome>-<CODE> → #room-CODE).
  3. A rematch vote is dropped when that player leaves; the popup ignores disconnected askers.
  4. /api/me returns resetUntil; the account sheet only hides "current password" while the server
     will accept it, and shows the field if the server says 401.
  5. Google callback wrapped in try/catch → #auth-failed instead of a raw JSON 500.
  6. README: never run migrations/0002 on a DB made from the current schema.sql.
- Also fixed: active seat on the felt was green-on-green in light mode (now gold).
- Checked: npm test, test:ui (0 errors), e2e full pass, 39-step Google flow vs fake Google (incl.
  takeover, stale pass, other-session pass, invite room, reset window), light-mode screenshots,
  production build (worker 760 KB gz), `wrangler deploy --dry-run` clean (3.06 MB / 722 KB gz).
- Not visually checked: the Connect Google password form (needs Google keys to appear); API path tested.
- Known dev-only noise: GameRoom.alarm deleteAll "internal error" after killing workerd locally
  (original code; alarms retry on error in production).

## 2026-10-30 (rematch popup, no Share invite, Google sign-in)
- **Rematch request popup**: when another player taps Rematch, everyone who hasn't answered gets a
  modal "X wants a rematch" (Accept / Not now), shown even if they closed the results. Not now =
  `RoomCore.declineRematch` clears all votes, requester gets a toast; they can ask again. WS message
  `rematch-decline` (DO + practice). Two-browser run: ask → not now → ask → accept → new game.
- **Lobby**: Share invite removed (did the same as Copy link). Copy link (primary) + Copy code.
- **Google sign-in** (`worker/google.js` + `handleGoogle` in worker/index.js, server-side OAuth code
  flow, state cookie for CSRF, no libraries): sign up / sign in, connect Google to a password account,
  forgot password (intent=reset → fresh Google session may set a new password for 15 min without the old
  one), `POST /api/password` (signs out other sessions). `GET /api/config` → {google}; buttons hidden
  when GOOGLE_CLIENT_ID/SECRET aren't set. App lands on `#auth-<outcome>` (messages in Google.jsx).
  New Account sheet (top-bar name) = Google, password, sign out.
- **DB**: users.email, users.google_sub (unique index), sessions.via, sessions.created_at. Fresh DBs:
  schema.sql. Existing: `npm run db:migrate:local|remote` (migrations/0002_google.sql). Local DB migrated.
- Checked: 29-step Google flow against a fake token endpoint (GOOGLE_TOKEN_URL override, test only;
  .dev.vars removed afterwards), unit tests for ID-token checks (found + fixed a username fallback bug),
  e2e full pass, test:ui zero errors, screenshots of sign-in, forgot password, account sheet, popup.
- e2e "cross-origin 500" explained: the local dev server fails the NEXT request when a client leaves a
  response body unread (proved read vs unread: 403 403 403 403 vs 403 500 500 403). e2e now reads bodies.
- OPEN / NEXT: deploy (user's `wrangler login`, `wrangler d1 create`, paste id, db:remote, deploy) and
  create the Google OAuth client (README 3b) with the deployed callback URL, then `wrangler secret put`.

## 2026-10-30 (XO early draw)
- XO ends a round as a draw as soon as nobody can complete a line (`XO.canStillWin()`: a line is open
  for a mark if it has no opponent marks and its empty cells fit that player's remaining moves).
  Message "No winning moves left" in the round banner; single game result "Draw: no winning moves left".
- Tests: 3×3 game ends with one square empty; 5×5 opening not called off early; series tests adapted.
  npm test + test:ui pass; seen on screen (5×5 round ended with 5 squares empty).

## 2026-10-30 (5 Cards fixes + hosting question)
- **One set per drop** (user's rule): a drop is exactly one card or exactly one valid set; two sets
  at once (the bot dropped K K 4 4) is rejected. `validDrop()` in shared/fivecards.js is used by the
  server, the bot and the UI; `splitDrop` is kept but unused. Guide, hint and REQUIREMENTS updated.
- **Public pick**: `g.lastPick` = {by, from:'drop', card, owner} or {by, from:'draw'}; a note on the
  felt shows "Pip took 10 of hearts from your drop" / "Pip drew from the pile" (drawn card hidden).
- Checked: npm test (new: two pairs rejected, lastPick visibility), test:ui zero errors, played
  practice games upright + sideways in Edge and read the notes.
- **Hosting**: user's friend suggested backend on Render free + frontend on Cloudflare. Advised
  against: the backend is a Cloudflare Worker + Durable Objects + D1, so it would need a rewrite for
  Render, and Render free sleeps after 15 min idle (cold start, live rooms lost on restart) and its free
  Postgres is deleted after 30 days + 14 days grace. Everything already fits Cloudflare's free plan with
  `npm run deploy`. OPEN: user to decide; deploy needs their `wrangler login` + `wrangler d1 create`.

## 2026-10-30 (latest): XO series rules corrected by the user
- Best of 3/5 = exactly that many rounds at most. Drawn rounds count as a round (no replays).
  Ends early only when the lead can't be caught; after the last round most wins takes it,
  level = "Match drawn". Text like "Won the match 1–0, 2 drawn".
- 5×5 now needs all five in a row (row, column or diagonal); 4 no longer wins.
- Updated: shared/games.js XO, XO.jsx labels ("Round 2 of 3"), settings sheet, guide, tests
  (draw-draw-win, three draws, best of 5 ending 2–2 after 5). npm test + test:ui pass; checked on screen.

## 2026-10-30 (later): user's 4 requests (XO rematch/board/best-of, Q-K-A, landscape cards, copy, Patches + guides)
What changed:
- **XO**: host settings `board` 3|5 (5×5 = four in a row) and `bestOf` 1|3|5 (`OPTIONS.xo` in
  shared/games.js). Series: drawn rounds replayed, starter alternates each round, 3 s pause between
  rounds, timeout = lose the round in a series (single game still eliminates). Safety cap: after
  bestOf*2+1 rounds the leader wins. `xoLines(n,k)` exported; practice bot generalised.
- **Rematch (all games)**: `RoomCore.rematch(id)`; everyone still in the room votes, bots auto-agree,
  then same seats + settings restart (`match` counter; XO's opener alternates per rematch). Blocked if a
  human left the room. DO handles `{type:'rematch'}` and resets the 3 h alarm. Results dialog shows
  Rematch / "Waiting for X…" / "X is in"; "New room" kept for remote rooms.
- **5 Cards**: Ace high allowed (Q-K-A, J-Q-K-A, Q-joker-A); still no wrap (K-A-2). REQUIREMENTS §7 updated.
  Phones in portrait get a "Turn your phone sideways" screen (Play full screen = Fullscreen API +
  `screen.orientation.lock`, works on Android Chrome; iOS just rotates) with "Keep playing upright"
  (remembered per session). Landscape phone (`orientation: landscape and max-height: 520px`) = full
  table: oval felt with seats + card-count backs, hand along the bottom, status/points/Drop/Show in a
  right column. Room gets `room-<game>` + `in-game` classes for this.
- **Copy**: `src/lib/clipboard.js` falls back to textarea + execCommand. Root cause: on
  `http://192.168…` (not a secure context) `navigator.clipboard` is undefined, so copying always failed
  on the phone. Code tiles are now one tap-to-copy button, plus Copy link, plus a code pill in the room
  bar during the game.
- **Patches** (LinkedIn style): every clue has a shape badge `square|wide|tall|any`, about 17% show only
  the shape (n = null); patch takes its clue's colour; `checkPatches` enforces shape. Generator tuned:
  about 9 patches of 2–9 squares instead of about 18 twos.
- **Guides**: `src/components/Guide.jsx`, one per game (real cards, shape badges, mini boards). Opened
  from "How to play" in each game's settings sheet and from the ? button in every room bar.
- Bug found and fixed while testing: opening the guide from the settings sheet reset the settings.

Checked: `npm test` (new XO/rematch/Patches/Q-K-A cases), `test:ui` zero errors, `test:e2e` full pass
on a fresh server, real two-browser run over the LAN URL (host creates XO room, copy code/tap/link all
copy, guest joins by link, plays, both Rematch, new game starts with the guest opening), phone
screenshots portrait + 844×390 landscape in Edge.

Known: the local Windows dev runtime (miniflare) drops roughly one random request per e2e run
("fetch failed" in the Vite log; it also happened before these changes). Restart `vite dev` if it
piles up. Not tested on a real phone yet (orientation lock, touch drag on Patches).
Open: deploy is still not done; the user hasn't seen these changes on their phone yet.

## 2026-10-30: first run on the user's Windows laptop
- Extracted `playroom-handoff.zip` into `Personal/Games/playroom`, `npm install`, `npm run db:local`.
- **Port 5173 is taken on this laptop** (another uvicorn app listens on `[::1]:5173`, so
  `localhost:5173` hits that instead). Run Playroom with
  `npx vite dev --host --port 5180 --strictPort` and open http://localhost:5180 (phone on same
  Wi-Fi: http://192.168.86.121:5180). For e2e: `BASE=http://localhost:5180 npm run test:e2e`.
- Checked: `npm test` all 4 games ok; `test:e2e` full run passes against 5180; phone-size
  (390px) screenshots in Edge headless of landing + practice 5 Cards, no page errors (only the
  expected 401 from `/api/me` before sign-in).
- Not deployed. Still open: everything under "NOT verified" below (real phone touch, deploy, PWA install).

## Status

All four games, auth (accounts + guest join), invite tokens/links, host settings, the
dictionary, eliminations, practice-vs-bots, the PWA and the professional redesign are built
and tested **locally in a sandbox**, including real headless Chrome. Nothing has been
deployed yet. The user has only seen the bots-only preview, on their phone.

### Verified
- `npm test`: rules for all games, including every example from the 5 Cards rules page; 2,000 generated Patches puzzles all solvable; 300 bot-played 5 Cards games make only legal moves.
- `npm run test:e2e` against `vite dev`:
  - signup, duplicate username (409), bad login (401), `/api/me`, unauthenticated (401), cross-origin block (403)
  - 3-player Word Chain: room full, join-after-start rejected, wrong start letter, **non-dictionary word rejected**
  - tab switch eliminated after the grace period; page close eliminated; last player wins
  - XO: hidden then visible within grace is NOT eliminated; win detection
  - 5 Cards: hands private, out-of-turn blocked, invalid drop blocked, drop→pick flow, take from previous drop, Call scoring
  - Patches: wrong solution rejected, answer not leaked
- `npm run test:ui`: preview build plays every game in jsdom with **zero runtime errors**.
- A request through a Codespaces-style host passes Vite's host check and the origin check.

- `npm run test:browser` (real Chrome, two browsers): host signs up → 5 Cards room with
  2 decks / exit 150 → guest opens invite link (code pre-filled), joins with a name → game
  starts with those settings → turns → Show → next round with scores → guest leaves → host wins.
  No page errors. Screenshots reviewed in light and dark at 390px.

### NOT verified (do these first)
1. Real touch devices (Patches drag, card selection) and the real Manrope font (the sandbox
   had no internet, so screenshots used a fallback font).
2. **Real deploy** (`npm run deploy`): D1 remote, Durable Object migration on free plan,
   Worker size (~754 KB gz expected), WebSockets in production.
3. **PWA install** on Android Chrome and iOS Safari (needs HTTPS, so the deployed URL).
4. **`npm run share`** (cloudflared) end to end with a second device.
5. Two real browsers playing each game, including the 20 s turn timers.

## Suggested next steps (ask the user to prioritize)
- 5 Cards: League format + configurable threshold (see REQUIREMENTS §6); smarter bots
  (track the previous drop, avoid feeding the next player); show other players' card counts
  on avatars; drag-to-select sets on touch.
- Deploy and get the user a permanent URL; walk them through it step by step.
- Ask what they meant by the cobuildx.ai reference (APK? store listing?).
- Bot word choice: bots pick random 3–6 letter dictionary words, some obscure ("ensear").
  Add a small common-words list for bots.
- Login/signup rate limiting (Cloudflare rate-limiting rule or a D1/DO counter).
- Rematch inside the same room (currently "New room" creates a new token).
- Spectator link for people who arrive after a game started (currently rejected).
- Optional: profiles/stats/leaderboards (D1), sound effects, haptics (`navigator.vibrate`).
- Optional: Patches difficulty (grid size by player count), Word Chain minimum length or
  banned letter variants.

## Decisions and why
| Decision | Why |
|---|---|
| One Worker with static assets instead of a Pages project | Pages can't define Durable Objects; one deploy is simpler |
| Durable Object per room | Holds live WebSockets, a single referee, no race conditions |
| Shared `RoomCore` | Practice mode and server behave identically |
| React + Vite, not Next.js | No SSR needed; Next on Cloudflare needs an adapter |
| Motion (motion/react) | Springs, layout animations, AnimatePresence, reduced-motion support |
| Dictionary bundled in Worker | Vite dev doesn't serve public files to the Worker; fits the free limit |
| Hash routing | Works with static hosting, PWA and the artifact preview without server routes |
| 3 s grace before elimination | Phone notifications or quick app switches shouldn't instantly eliminate |
| 20 s turn timer (Word Chain, XO, card rounds) | Prevents stalling; card rounds auto-play your lowest card |

## History (versions)
1. **v0**: claude.ai artifact, Word Chain only (`artifacts/word-chain-v0-claude-artifact.html`).
2. **v1**: vanilla HTML/JS + Worker + DO + D1, all four games. Replaced by v2 (same rules and API).
3. **v2 (this repo)**: React/Vite/Motion UI, shared engine, dictionary, practice bots, PWA, tests.
4. **v3.0**: host settings (players/decks/exit point), guest join with name + code, invite
   links, full professional redesign (real cards, SVG icons, new design system), bots play
   everyday words, real-Chrome browser tests + screenshot script.
5. **v2.3**: user's house rules for 5 Cards: Show instead of Call, no Round Joker, 3 jokers per deck.
6. **v2.2**: user bug report from the phone preview: Call did nothing (browser confirm() blocked
   in the sandboxed preview → in-app dialog), 5♥ 5♦ with fives wild was rejected as a pair (now
   allowed), dark-mode pile labels unreadable, bots could call at the very start of a round.
7. **v2.1**: 5-Card Battle replaced by real 5 Cards (Least Count) per the user's rules link.
