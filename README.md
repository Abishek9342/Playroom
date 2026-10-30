# Playroom

> Continuing with Claude Code? Start with `CLAUDE.md` and `docs/HANDOFF.md`.

Four multiplayer games with accounts, invite tokens, live play and an installable app.
React + Vite + Motion on the front, a Cloudflare Worker (D1 + Durable Objects) on the back.
Everything runs on Cloudflare's free plan.

| Game | Players | Rules |
|---|---|---|
| Word Chain | 2–8 | Each word starts with the last letter of the previous one. Must be a real English word (~275k-word dictionary). No repeats. 20 s per turn. |
| XO | 2 | Noughts and crosses. 20 s per move. |
| Patches | 2–8 | Shikaku race: split the grid into rectangles, one number each, number = area. First valid quilt wins. |
| 5 Cards (Least Count) | 2–8 (host picks 1–3 decks and the exit point) | Keep your hand's points low. Each turn drop a card or sets (pairs, kinds, runs), then draw or take from the previous drop. Show when you think you're lowest: valid Show = others add their hands; invalid Show (anyone equal or lower) = you +50. 3 jokers per deck, worth 0. Out at 200. |

**Every game:** the host (signed in) picks the settings — players, and for 5 Cards the number of decks and the exit point — and gets a 6-character room code plus an invite link. Friends join with just their name and the code; no account needed. The game starts when every seat is filled. In Word Chain, switching tabs or leaving the page for more than 3 seconds eliminates you (last player standing wins); in the other games you're just shown as Away until you come back.

**Practice with bots:** every game also has an offline practice mode with the same rules, which works in the installed app without a connection.

## 1. Run it on your computer (localhost)

You need Node.js 20+ and a free Cloudflare account.

```bash
npm install
npx wrangler login
npx wrangler d1 create playroom-db      # paste the printed database_id into wrangler.jsonc
npm run db:local                         # create tables in the local database
npm run dev                              # open http://localhost:5173
```

`npm run dev` runs the React app and the Worker together, with hot reload. To play against yourself, open a normal window and a private window side by side and sign up as two users. Don't use two tabs in the same window, because switching tabs counts as leaving.

## 2. Let a friend test it before you deploy

Keep `npm run dev` running, then in a second terminal:

```bash
npm run share
```

This starts a free, temporary Cloudflare Tunnel and prints a link like `https://random-words.trycloudflare.com`. Send it to your friend; it works from any network. The link stops working when you stop the command. No Cloudflare account is needed for this step.

## 3. Deploy

```bash
npm run db:remote     # create tables in the live database (first time only)
npm run deploy        # prints your URL, e.g. https://playroom.<you>.workers.dev
```

## 3b. Google sign-in (optional, also powers "Forgot password")

Without these keys the app works as before and simply hides the Google buttons.

1. Open https://console.cloud.google.com, create a project (e.g. "Playroom").
2. **APIs & Services → OAuth consent screen**: External, app name "Playroom", your email. Publish it.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.**
   Authorized redirect URIs (add both):
   - `https://playroom.<you>.workers.dev/api/auth/google/callback` (your deployed URL)
   - `http://localhost:5180/api/auth/google/callback` (local testing; Google only allows plain http for localhost)
4. Live site: `npx wrangler secret put GOOGLE_CLIENT_ID`, then `npx wrangler secret put GOOGLE_CLIENT_SECRET` (paste each when asked).
5. Local: copy `.dev.vars.example` to `.dev.vars` and fill in the same two values, then restart `npm run dev`.

Databases created before Google sign-in need `npm run db:migrate:local` / `npm run db:migrate:remote` once.
Don't run the migration on a database made from the current `schema.sql` (it already has the columns,
so it fails with "duplicate column"). The first deploy only needs `npm run db:remote`.

Connecting Google to an existing password account asks for the password first (10-minute pass).

How it works: "Continue with Google" creates an account the first time (username from the email).
Password accounts can connect Google from **Your account**. Forgot password = Continue with Google,
then set a new password (allowed without the old one for 15 minutes after a Google sign-in).

## 4. Install as a mobile app

Playroom is a Progressive Web App. On the deployed site:

- **Android / Chrome / Edge:** tap **Install app** in the top bar.
- **iPhone / iPad:** tap **Install app** for instructions (Safari: Share → Add to Home Screen).

It then opens full screen from the home screen with its own icon. Installing needs HTTPS, so it works on the deployed site and through `npm run share`, but not on plain `http://localhost` from your phone.

Want it in the Play Store / App Store later? Wrap the deployed URL with Capacitor or PWABuilder (pwabuilder.com); no code changes needed.

## Other commands

| Command | What it does |
|---|---|
| `npm test` | Checks the game rules |
| `npm run test:e2e` | Full multiplayer run against `npm run dev` |
| `npm run test:ui` | Plays every game in the preview build (jsdom) |
| `npm run test:browser` | Real Chrome, host + guest playing 5 Cards (run `npm i -D puppeteer` once) |
| `npm run screens` | Phone-size screenshots of every screen, light and dark |
| `npm run build:demo` | Builds `dist-demo/index.html`: a single-file, bots-only preview |
| `npm run words` | Rebuilds `public/words.txt` from the word list package |

## How it's built

```
src/            React app (screens, game boards, animations)
src/lib/        API calls, live-room hook, practice room + bots, PWA install
shared/         Game rules + room engine, used by both the server and practice mode
worker/         Cloudflare Worker: auth API, rooms, dictionary
public/         Icons, manifest, service worker, words.txt
schema.sql      D1 tables (users, sessions)
```

- **Auth:** usernames + passwords hashed with PBKDF2 (100k iterations, per-user salt). Sessions are HttpOnly cookies; only a hash of each token is stored. Requests from other websites are rejected.
- **Rooms:** one Durable Object per invite token holds every player's WebSocket and enforces the rules, so players can't cheat by editing the page.
- **Dictionary:** bundled into the Worker (~730 KB compressed, under the 3 MB free-plan limit).

## Good to know

- Tab-switch detection uses the browser's `visibilitychange` event, which a modified browser could suppress. Leaving the page is detected on the server and can't be faked.
- Rooms clean themselves up 15 minutes after a game ends, or 3 hours after creation.
- There's no login rate limiting. Before a public launch, add Cloudflare's free rate-limiting rule for `/api/login` and `/api/signup` in the dashboard.
