# Requirements (from the user, in order)

Quotes are the user's own words, lightly trimmed. Status: ✅ done, ⚠️ partial, ⏳ not yet.

## 1. Word game
> "do you know word building game" … "Word chain"

✅ Word Chain: each word starts with the last letter of the previous word.

## 2. First app idea (claude.ai artifact)
> "build a web app for this game with player invites, per session memory, game memory for the single game session"

✅ Built as a claude.ai artifact (`artifacts/word-chain-v0-claude-artifact.html`). Superseded by
the standalone app below; kept for reference only.

## 3. Standalone app: the real requirements
> "it's a web app we need to build a auth but we have free deployment options like cloudflare, netlify"

✅ Username/password auth (D1 + PBKDF2 + session cookies). Cloudflare free plan.
User chose **Cloudflare (Pages + Workers + D1)**. Implemented as one Worker with static
assets, which is Cloudflare's current approach when Durable Objects are needed.

> "we have to choose it's 2,3,4 or N number of players and once we choose this a invite token will be generated and the opponents enter that token they can enter the game"

✅ Player-count stepper per game (min..max), 6-char invite token, join by token or link.
Game auto-starts when all seats are filled.

> "once the words is registered the word can't be repeated"

✅ Server tracks used words per game.

> "if the opponents switches the tab or exits the web page they will be eliminated"

✅ visibilitychange + WebSocket close, 3 s grace period, server-enforced.
⚠️ Tab-switch detection is client-reported (a modified browser could suppress it); page
exit is server-detected.

> "the home page has to contain 4 games like word chain, xo, patches like LinkedIn and then 5 cards in cards deck"

✅ Four games. Clarified with the user:
- "Patches" = **Shikaku-style grid** (split the board into rectangles; each has one number = its area). Multiplayer race, first valid solution wins.
- "5 cards" was first built as a quick high-card battle, then **replaced** per section 6.

## 4. UI overhaul, dictionary, mobile app, preview
> "Cook the UI part it has to be spectacular one with lot of innovation, animation, transitions use react vite, css, html, nextJS and bring out a best web app"

✅ React + Vite + Motion. Tabletop design system with heavy (reduced-motion-aware) animation.
Next.js was **not** used: on Cloudflare it needs the OpenNext adapter and adds nothing for
this SPA + WebSocket app. The user didn't object; revisit only if they ask.

> "add the dictionary also"

✅ ~275k-word dictionary (an-array-of-english-words, MIT) validated server-side.

> "the user can download the web app as mobile application too for reference see cobuildx.ai website"

✅ PWA: manifest, icons, service worker, "Install app" button (Android/desktop prompt;
iOS instructions). Practice mode works offline.
⏳ Claude couldn't browse cobuildx.ai. **Ask the user what exactly that site does** in case
they expect something beyond a PWA (e.g., a downloadable APK). Options: PWABuilder or
Capacitor to produce store/APK builds from the deployed URL.

> "I wanna see a preview like a localhost" / "I have shared it with my friend before deploying is it possible to test it now"

✅ Bots-only preview published as a claude.ai artifact (`artifacts/playroom-preview.html`).
✅ `npm run share` (cloudflared quick tunnel) for friend testing before deploy.
✅ GitHub Codespaces instructions given (user only had a phone).
⏳ User hasn't run the real multiplayer version yet.

## 6. 5 Cards must follow Vanikar's "5 Cards" (Least Count) rules
> "https://vanikar.games/cardgames/five-cards/#game-rules — This is how we have to play 5 cards"

✅ Implemented in `shared/fivecards.js`, UI in `src/games/Cards.jsx`. Rules as given:
- 2–6 players. Up to 5: one deck + its 2 jokers; 6: two decks.
- Each round a random rank A–K is the Round Joker: all 4 suits of it count 0, plus printed jokers.
- 5 cards each; one card face up opens the pile; rest is the draw pile. Dealer plays first; deal rotates.
- Points: A=1, 2–10 face value, J/Q/K=10, jokers 0.
- Turn: DROP one card, or ONE set (2026-10-30: never two sets at once): pair, 3 or 4 of a kind, or a run of 3+ in one suit.
  Everyone sees which card the next player takes from a drop (drawn cards stay hidden).
  Ace low or high (A-2-3 yes, Q-K-A yes since 2026-10-30 per user, K-A-2 no wrap). A run takes at most one joker (gap or end).
  A same-rank set needs 2+ natural cards and no two naturals of the same suit. A lone card can't
  ride along with a set. Then PICK exactly one: top of the draw pile, or any one card of the
  previous player's latest drop (the rest is buried; earlier drops are out of reach).
- CALL instead of dropping: round ends, all hands shown. Caller strictly lowest → caller +0,
  others add their hand points. Otherwise (a tie counts) → caller +50, others +0.
- Empty draw pile → buried cards shuffled into a new draw pile; the latest drop stays open.
- Knockout (default): total ≥ 200 is out; last player standing wins.
⏳ Not built: **League** format (fixed number of rounds, default 10, lowest total wins, ties
shared) and choosing the threshold. Ask the user if they want these options.
Our own additions (not in the rules): 30 s turn timer with auto-play (drop highest card, draw),
8 s results screen between rounds, tab-switch elimination like every other game.

## 7. House rules for 5 Cards (override §6 where they differ)
> "When we feel we have least points we can make a show and if the opponents have equal or lesser points than us it's an invalid show … no number can be a joker; for each deck of cards we have 3 dummy jokers … once the rest of pile is finished we can reshuffle the discarded cards and remake the drawing pile"

✅ **Show** (not "Call"): valid only if the shower is strictly lowest; anyone equal or lower = invalid show.
✅ **No Round Joker.** Number cards are always face value.
✅ **3 printed jokers per deck** (55 cards per deck; 6 players = 2 decks = 6 jokers). Jokers = 0 points.
✅ Draw pile finished → discarded cards reshuffled into a new draw pile (latest drop stays open).
⏳ Not confirmed by the user, kept from §6: invalid show penalty **+50**, valid show = everyone
else adds their hand points, knockout at **200**, sets/runs rules, pick from previous drop.

## 8. Host settings, token-only join, professional look
> "the first one who's entering the game can set how many players, how many deck of cards u gonna use and then what's the pool exit point"

✅ Settings sheet when creating a room. 5 Cards: players 2–8, decks 1–3, exit point 50–1000
(step 50). Other games: player count. Settings shown in lobby and room header.

> "it's purely looks like AI generated … doesn't look like a professional and a real one"

✅ Full redesign (see CLAUDE.md → Design system): neutral chrome, emerald brand, real cards,
SVG icons, no emoji, proper lobby/settings/results, light + dark. Verified with real-Chrome
screenshots at phone size.

> "as usual the one who starts the game will get a token, they will send it to their friends and they can login to the game via that token alone"

✅ Host signs in and creates the room. Friends open the invite link (`/#join-CODE`, code
pre-filled) or tap Join a game, type their name + code. No account needed (guest session).
⏳ Interpretation to confirm: hosts still need an account. Ask the user if guests should host too.

## 5. Handoff
> "Tomorrow we can transfer this entire thing to claude code in my laptop and we can continue there"

✅ This package.
