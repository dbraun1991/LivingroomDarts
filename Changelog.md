# Changelog

All notable changes to LivingRoom Darts are documented here.
Development was iterative — each entry reflects a discrete change or fix.

---

## [Unreleased] — Active Development

---

## Feature — Checkout suggestions

When the throwing player's remaining score is ≤ 170 and reachable within the darts left
in the current visit, the optimal checkout route is shown live in both views.

### Behaviour

- **Phone:** dart sequence shown in gold in the centre of the current-player-bar, between the
  player name and the remaining score. Label "Checkout" above it.
- **TV:** dart sequence shown in gold below the throwing player's score in the leaderboard.
- Updates **live** after each dart — `dartsLeft` shrinks and the remaining score changes,
  so the suggestion adapts (e.g. 3-dart route on dart 1, 2-dart on dart 2, 1-dart on dart 3).
- Hidden (not just empty) when no checkout exists: impossible scores, score > 170, bust.
- Rule-aware:
  - **Double Out** — routes always end on a double or Bull
  - **Single Out** — prefers 1-dart triples/singles for scores ≤ 60; adds routes for 159, 162, 168

### New module: `checkouts.js`

Pure data module — no DOM, no imports. Exports one function:

```
getCheckout(score, dartsLeft, finishRule) → string[] | null
```

Two lookup tables (`DOUBLE_OUT`, `SINGLE_OUT`) encoding the full PDC/BDO standard
checkout routes. `SINGLE_OUT` extends `DOUBLE_OUT` with overrides.

Tests: `test/checkout.test.js` — 38 tests covering boundary guards, impossible scores,
dartsLeft filtering, single-out unlocks, and table spot-checks.

---

## Feature — Continue playing for placement

After the first player wins, the game no longer ends immediately. Players continue throwing
for 2nd, 3rd place and so on.

### Behaviour

- **Winner overlay** appears as before when a player reaches zero
- Button text changed from "Continue watching" → **"Continue playing"**
- Dismissing the overlay resumes the game — finished players are silently skipped in the rotation
- Subsequent finishes are recorded quietly — no overlay re-shown
- The last remaining player is **automatically assigned last place** the moment everyone else
  has finished — they do not need to reach zero
- **Undo** of a finishing dart reverses the placement and returns the player to the rotation

### TV leaderboard

- Finished players show a **placement medal** (🥇🥈🥉) instead of their row position number
- Score column replaced with **DONE** in muted colour
- The 🥇 position label is highlighted gold (`.top` style) for the actual 1st-place finisher,
  regardless of throw order

### State changes

| Field | Before | After |
|-------|--------|-------|
| `state.winner` | string key of winner | **removed** |
| `state.placements` | — | `{ [playerKey]: number }` — finish position per player |
| `state.gameOver` | true on first win | true only when all-but-one players have finished |

### Known edge case

If a player undoes their winning dart after the winner overlay was already dismissed,
the overlay will not re-appear when they finish again in the same session. The leaderboard
placement is still correctly updated.

---

## Refactor — Phone/TV render decoupling

### Problem
`render-score.js` directly patched TV DOM elements (same-tab fast-path), creating two independent
TV update paths, leaking TV class names into the phone renderer, and causing the `tv-dart-fresh`
pop animation to never fire same-tab.

### Changes

| File | Change |
|------|--------|
| `main.js` | `handleStateChange` always calls `renderDisplayView()` alongside `syncScoreView()` |
| `render-score.js` | Removed "TV leaderboard (same tab only)" block — phone-only now |
| `game.js` | `syncScoreView` replaced `_updateDartPreview()` + `!advancing` guard with `state.liveDarts`-based live header patch; both inline bust expressions replaced with `computeWouldBust` |

### Eliminated

| Problem | Eliminated by |
|---------|---------------|
| TV DOM manipulation in `render-score.js` | Removed TV block |
| `advancing` guard in render path | Replaced with `state.liveDarts` read |
| `tv-dart-fresh` pop animation missing same-tab | `renderDisplayView()` now called same-tab |
| Bust logic computed independently in two styles | Both use `computeWouldBust` |
| Implicit coupling on TV class names from phone renderer | TV block removed |

### Unchanged
- `dartsThisVisit` — still used for commit logic, undo stack, and phone dart slots
- `state.liveDarts` — still the cross-tab communication channel
- All 21 unit tests pass

---

## Bug fixes — Bust indicator correctness

### Root cause: `Object.assign` skips deleted keys
`patch({liveDarts: null})` calls `_setPath` which does `delete obj['liveDarts']` — the key is
removed from the stored JSON entirely. On the receiving end, `Object.assign(state, data)` silently
skips keys absent from `data`, so `state.liveDarts` retained its previous stale value after every
commit. The TV then computed `liveTotal > newScore` against the committed (lower) score → false bust.

### Fixes applied

| Fix | File | Detail |
|-----|------|--------|
| `onStateChange` explicitly nulls `liveDarts` when key absent | `state.js` | `if (!('liveDarts' in data)) state.liveDarts = null` |
| `syncScoreView` skips `_updateDartPreview()` when `advancing` | `game.js` | Prevents same-tab re-render from comparing stale `dartsThisVisit` against newly committed score |
| `liveDarts: null` added to base commit patch | `game.js` | Clears liveDarts atomically with score update for all outcomes (normal, bust, win) |
| `computeWouldBust` / `computeIsBust` extracted as pure functions | `state.js` | Shared by `render-tv.js`; guards `liveTotal === 0` as early return |

### Test coverage added (`test/bust.test.js`, 21 tests)
- `computeWouldBust`: single out and double out, all edge cases including exact win and leaving-1
- `computeIsBust`: null liveDarts, wrong player, empty darts array, real bust
- `onStateChange`: verifies `state.liveDarts` becomes `null` when key is absent in incoming patch

### Scenarios that now behave correctly
- Single out, 1 point remaining after visit → no bust on TV
- Win to exactly 0 → no bust on TV (hidden or otherwise)
- Double out, leaving 1 → bust correctly shown
- Bust mid-visit → bust correctly shown for the 1.5s delay window

---

## UX Pass — Live feedback & TV polish

### Phone view — pre-visit score in header
- Added `#gs-pre-score` element to the left of `#gs-score` in the current-player bar
- Shows the committed score at the start of the visit — frozen until the turn ends
- Same font family and size as the current score, muted colour (`var(--muted)`)
- Set by `updateCurrentPlayerHeader()` on turn start; not updated during the visit

### Phone view — header score counts down live
- `_updateDartPreview()` already patched `#gs-score` live, but `syncScoreView()` (triggered by every `liveDarts` storage event) called `updateCurrentPlayerHeader()` which reset it back to the committed value
- Fixed: `syncScoreView()` now calls `_updateDartPreview()` after `updateCurrentPlayerHeader()` when darts are in progress — restoring the live value immediately
- Header remaining score now truly counts down per dart in real time

### TV — bust indicator on leaderboard
- When a bust is detected mid-visit, the throwing player's leaderboard row turns red (`border-color: var(--red); background: #2a0000`)
- Score column replaced with **BUST!** in red for the duration of the bust delay
- Implemented in both render paths: full rebuild (`_renderLeaderboard()`) and same-tab live patch (`renderScoreStripLive()`)
- `isBust` condition: `isThrow && wouldBust && liveDarts?.player === key && liveDarts.darts.length > 0`

### TV — leaderboard left border widths
- All rows: `border-left-width: 14px` (was inline `4px`)
- Throwing player row: `border-left-width: 21px`
- Border colour stays per-player (inline `border-left-color` only — CSS class controls width)

### TV — standings vertically centred
- Added `justify-content: center` to `.tv-leaderboard` — rows now float in the vertical middle of the sidebar

### Bug fix — TV showed BUST on win
- On a winning dart, `commitVisit()` patched `currentScore → 0` and `gameOver/winner` but did **not** clear `liveDarts` (only `_advancePlayer()` does that, which is skipped on win)
- TV received `p.currentScore = 0` with `liveDarts` still set → `liveTotal > 0` → `wouldBust = true` → incorrectly showed BUST
- Fixed: `'darts/liveDarts': null` added to the win patch in `commitVisit()`, clearing it atomically with the score update

---

## Refactor — Split into modules (v2.0)

### Motivation
`darts.js` had grown to ~970 lines handling five distinct concerns simultaneously:
storage, state, colours, game logic, and two separate view renderers.
The refactor separates these into focused modules and introduces a build step
to preserve the single-file distribution format required for `file://` use.

### Tooling added
- **Vite** — dev server with hot reload (`npm run dev`) and optimised build (`npm run build`)
- **vite-plugin-singlefile** — inlines all JS and CSS into `dist/index.html` at build time,
  producing a single self-contained file that works on `file://` and GitHub Pages

### JavaScript — split from `darts.js` into 8 modules

| Module | Lines | Responsibility |
|--------|-------|---------------|
| `storage.js` | ~68 | localStorage read/write/listen |
| `state.js` | ~67 | Shared state object, `playersSorted`, `calcAvg`, `lastDarts`, `createResetState` |
| `colors.js` | ~117 | `PALETTE`, `pickUnusedColor`, colour picker popup |
| `render-score.js` | ~94 | `renderScoreStrip`, `renderScoreStripLive`, `updateCurrentPlayerHeader` |
| `render-tv.js` | ~181 | `renderDisplayView`, `renderLeaderboard`, `renderBurndown`, `showWinner`, `resetChart` |
| `game.js` | ~262 | Dart entry pipeline, undo stack, review mode, numpad listeners |
| `setup.js` | ~145 | Setup screen, start/end game handlers, player list |
| `main.js` | ~30 | View routing, boot, wires `onStateChange` to correct renderer |

### CSS — split from `darts.css` into 4 files

| File | Responsibility |
|------|---------------|
| `base.css` | `:root` variables, reset, shared utilities, scrollbars |
| `setup.css` | Setup screen, player rows, colour picker popup, start/TV buttons |
| `game.css` | Game screen, numpad, dart preview, banners, score strip |
| `tv.css` | TV header, burndown chart, leaderboard, waiting/winner overlays |

### Firebase removed
- Firebase was an early-stage idea, never used in production
- All Firebase imports, config block, `USE_FIREBASE` flag, and `storageInit()` removed
- `storage.js` is now ~68 lines of pure localStorage code with no dead branches
- `listen()` is now synchronous — no async boot sequence required

### Behavioural changes
- None. All game logic, rendering, and state management is functionally identical
  to the previous version

---

## Bug fixes applied during refactor

| Issue | Fix |
|-------|-----|
| `#winner-overlay` CSS selector missing — properties were dangling after `#view-display { position: relative; }` | Restored in `tv.css` |
| `burnChart` Y-axis max not resetting when `startScore` changes between games | `resetChart()` now calls `_burnChart.destroy()` before nulling; called on both start and end game |
| Duplicate `.tv-title`, `.tv-now-label`, `.tv-now-name` CSS rules | Deduplicated in `tv.css` — single authoritative declaration each |
| Unused `.tv-lb-avg` CSS rule | Removed |
| `state = newState` in start/end game replaced with `Object.assign(state, newState)` | Keeps shared module reference intact across all importers |

---

## Architecture

### Initial build
- Single `darts.html` file with all HTML, CSS, and JS inline
- Firebase Realtime Database for real-time sync between phone and TV
- Two views: `?view=score` (phone) and `?view=display` (TV)
- URL parameter routing — `VIEW` constant set once at page load

### Split into three files
- Extracted CSS into `darts.css`
- Extracted JS into `darts.js` as a proper ES module (no more `window._db` globals)
- Firebase imported directly inside `darts.js` via dynamic `import()`
- HTML reduced to structure only — zero inline scripts or styles

### LocalStorage fallback
- Added `USE_FIREBASE` detection: if `firebaseConfig.apiKey === "YOUR_API_KEY"` → use localStorage
- Storage abstracted into three functions: `writeAll()`, `patch()`, `listen()`
- Cross-tab sync via `window.storage` event; same-tab sync via custom `darts-changed` event
- All game logic calls only the abstraction — never Firebase or localStorage directly

### State model — rounds format change
- `rounds[rKey][pKey]` changed from plain `number` to `{ darts: [{display, value}], bust: boolean }`
- Burndown chart reads `entry.darts.reduce(sum)` with legacy number fallback
- Enables per-dart display, per-dart undo restore, and live chip updates

### Split into modules (v2.0)
- See top of this file

---

## Setup Screen

### Player management
- Default: 1 player on load, **Add Player** button adds up to 10
- **Remove** button per player (hidden when only 1 player remains)
- Player names remembered across End Game

### Starting score selector
- 301 / 501 / 701 buttons with visual selected state
- Default: 301

### Finish rule selector
- Single Out / Double Out toggle added to setup screen
- Stored in `state.settings.finishRule`
- Remembered across End Game

### Colour picker
- Initial implementation: native `<input type="color">`
- Replaced with custom popup — 5×5 grid (25 colours)
- Upgraded to 6×6 grid (36 colours) with structured layout:
  - 6 columns: Red · Orange · Green · Cyan · Blue · Purple
  - Rows: Pastel → Light → Vivid → Dark → Very Dark → Neutrals
- Removed `#212121` (near-black) — invisible against dark chart background
- **?** button added below grid as a full-width strip → replaced with inline tile in lower-right cell
- `?` tile: dark grey background (`#424242`), white text, calls `pickUnusedColor()`
- `pickUnusedColor()` picks randomly from colours not yet assigned to any player

### Random colour on add
- First player and every subsequent **Add Player** call uses `pickUnusedColor()`
- No two players start with the same colour

### Randomize order
- **🔀 Randomize Order** button added next to Players section label
- Fisher-Yates shuffle on `setupPlayers[]`

### TV Display shortcut
- **📺 Open TV Display** button added below START GAME
- Opens `?view=display` in a new tab using `location.pathname` — works on any host

---

## Scoring View (Phone)

### Numpad
- Layout mirrors the dartboard: 1–20 in rows of 5, then O / 25 / D / T / ⌫
- D and T act as toggles — tap again to deactivate
- D + 25 = Bullseye (50 pts); 25 alone = Single Bull (25 pts)

### Auto-advance (no Confirm/Next buttons)
- After 3rd dart: auto-commit with 0.9s delay
- On bust: auto-commit with 1.5s delay (score unchanged)
- Win on dart 1 or 2: immediate commit on exact zero

### Bust detection
- Single Out: `total > currentScore`
- Double Out: `total > currentScore` OR `currentScore - total === 1`
- Bust condition evaluated independently in `_updateDartPreview()` to freeze live score before `isBust` is set

### ⌫ Delete and undo
- ⌫ with darts in slots: removes last dart
- ⌫ on empty: triggers undo (`_goToPreviousPlayer()`)
- Initial implementation: single-level undo (`lastCommit`)
- Upgraded to unlimited undo stack (`commitHistory[]`)
- Each snapshot: `{ state: deepClone, darts: [...dartsThisVisit] }` — darts restored into slots on undo

### Review Mode
- Entered automatically after any undo that restores darts
- Entire numpad disabled except ⌫
- Blue `REVIEW — EDIT OR CONFIRM` banner shown
- **✓ CONFIRM VISIT** button appears — re-commits visit as-is
- ⌫ in review mode: removes last slot, exits review mode, re-enables numpad
- **D/T modifier auto-restored** when deleted dart had a Double or Triple prefix
- `resetDartUI()` always calls `exitReviewMode()` — cannot persist past an advance

### Live score countdown
- `_updateDartPreview()` patches `#gs-score` live per dart
- Freezes at `currentScore` if visit would bust
- `renderScoreStripLive(dartsThisVisit, wouldBust)` patches score and dart chips in both views (same-tab only)
- Cross-tab/device live updates handled via `liveDarts` in storage

### liveDarts field
- Patched to storage (fire-and-forget) on every dart entry
- TV reads this for per-dart chip updates without waiting for commit
- Cleared to `null` in `_advancePlayer()`

### Player strip (score strip)
- Rebuilt to 3-column flex layout: name (left) · darts + avg (centre) · score (right)
- Shows last 3 **individual dart** display strings — not visit totals
- `'—'` padding when fewer than 3 darts recorded
- Active player: coloured border, arrow, name in player colour
- Live dart chips update with accent colour on filled slots

### Active player header
- Name coloured with player colour
- Remaining score shown and updated live
- `#player-color-bar` — 4px coloured divider strip between header and dart slots

### End Game button
- **⏹ End Game** at bottom of game screen
- Writes structured reset state via `createResetState()` so TV correctly detects cleared game
- Hides `#winner-overlay` on score view
- Preserves player names, colours, start score, and finish rule

---

## TV Display View

### Waiting overlay
- Full-screen overlay with animated 🎯 icon
- Shown on page load and after End Game
- Hidden when a game with players is active

### Header
- Left: 🎯 DARTS title
- Centre: Round badge + Finish Rule badge (SINGLE OUT / DOUBLE OUT)
- Right: Now Throwing — player name in their chosen colour

### Leaderboard sidebar
- Flex-based golden ratio split with chart: chart `flex: 3` · leaderboard `flex: 1`
- Three-column layout per row: name (left) · darts + avg (centre) · score (right)
- Left border and score text in player colour
- Throwing player highlighted with gold border + dark background
- Last 3 **individual dart** scores with `tv-dart-fresh` pop animation on live updates
- Live score countdown per dart using `state.liveDarts`
- Live bust guard: freezes score display if visit would bust

### Burndown chart
- Chart.js line chart, one dataset per player
- X axis: round number; Y axis: remaining score (startScore → 0)
- Created once via `_renderBurndown()`, updated with `.update()` on subsequent renders
- **Chart fingerprinting:** only redraws when `state.rounds` actually changes
  - `_lastRoundsKey = JSON.stringify(state.rounds)` compared each render
  - Prevents unnecessary redraws on `liveDarts` patches
  - `_lastRoundsKey` reset via `resetChart()` on game start and End Game
- `resetChart()` destroys the Chart.js instance before nulling — fixes Y-axis max
  not resetting when `startScore` changes between games

### Winner overlay
- Appears when `state.gameOver && state.winner`
- Winner name shown in player colour
- `renderDisplayView()` explicitly hides overlay when `gameOver` is false

---

## Bug Fixes (pre-refactor)

| Issue | Fix |
|-------|-----|
| `advancing` flag permanently stuck on storage error | Wrapped in `try/catch/finally` — `advancing = false` always runs |
| Player strip not updating after advance | Removed `if (!advancing)` guard from `syncScoreView()` |
| Win on dart 1 or 2 not detected | Added win check before 3-dart check in `enterDart()` |
| Undo only one level deep | Replaced single `lastCommit` with `commitHistory[]` stack |
| Undo not restoring scores correctly | Changed to full deep-clone snapshot — `writeAll(snapshot)` instead of partial diff |
| TV winner overlay not shown | `renderDisplayView()` early-returned when `gameOver` was true — separated `hasPlayers` from `gameOver` check |
| TV waiting overlay not returning after End Game | `writeAll({})` merged into old state — replaced with structured reset object |
| TV winner overlay persisting into new game | `renderDisplayView()` now hides overlay on every non-winning render |
| Chart redrawing on every dart | Added rounds fingerprint — chart only redraws when rounds data changes |
| `isActive` dead variable in `renderDisplayView` | Removed |
| `advanceLocalOnly()` not pushing to `commitHistory` | Fixed — snapshot pushed on fallback path too |
| `showWinner()` not using player colour | Added `nameEl.style.color = w.color` |
| Near-black `#212121` invisible on dark chart | Removed from palette |
| Colour picker `?` button as separate strip below grid | Replaced with inline tile as 36th grid cell |
| Live score flashing wrong value on bust | `_updateDartPreview()` checks `wouldBust` independently before `isBust` is set |

---

## Removed Features

- **Confirm Visit** button — replaced by auto-advance after 3rd dart
- **Next Player** button — replaced by auto-advance
- Native `<input type="color">` — replaced by custom popup grid
- **Firebase** — removed entirely; localStorage is the only storage backend
