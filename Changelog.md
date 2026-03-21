# Changelog

All notable changes to LivingRoom Darts are documented here.  
Development was iterative — each entry reflects a discrete change or fix.

---

## [Unreleased] — Active Development

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
- Bust condition evaluated independently in `updateDartPreview()` to freeze live score before `isBust` is set

### ⌫ Delete and undo
- ⌫ with darts in slots: removes last dart
- ⌫ on empty: triggers undo (`goToPreviousPlayer()`)
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
- `updateDartPreview()` patches `#gs-score` live per dart
- Freezes at `currentScore` if visit would bust
- `renderScoreStripLive()` patches score and dart chips in both views (same-tab only)
- Cross-tab/device live updates handled via `liveDarts` in storage

### liveDarts field
- Patched to storage (fire-and-forget) on every dart entry
- TV reads this for per-dart chip updates without waiting for commit
- Cleared to `null` in `advancePlayer()` patch

### Player strip (score strip)
- Rebuilt to 3-column flex layout: name (left) · darts + avg (centre) · score (right)
- Shows last 3 **individual dart** display strings — not visit totals
- `'—'` padding when fewer than 3 darts recorded
- Active player: coloured border, arrow, name in `cp.color`
- Live dart chips update with accent colour on filled slots

### Active player header
- Name coloured with `cp.color`
- Remaining score shown and updated live
- `#player-color-bar` — 4px coloured divider strip between header and dart slots

### End Game button
- **⏹ End Game** at bottom of game screen
- Writes structured reset state (not `{}`) so TV correctly detects cleared game
- Hides `#winner-overlay` on score view
- Preserves player names, colours, start score, and finish rule

---

## TV Display View

### Waiting overlay
- Full-screen overlay with animated 🎯 icon
- Shown on page load and after End Game
- Hidden when a game with players is active
- Fixed: `writeAll({})` was replaced with structured reset so overlay correctly reappears

### Header
- Left: 🎯 DARTS title
- Centre: Round badge + Finish Rule badge (SINGLE OUT / DOUBLE OUT)
- Right: Now Throwing — player name in their chosen colour

### Leaderboard sidebar
- Initial: fixed 240px width
- Upgraded to flex-based golden ratio split with chart
- Current split: chart `flex: 3` (75%) · leaderboard `flex: 1` (25%)
- Restructured to 3-column layout per row: name (left) · darts + avg (centre) · score (right)
- Left border and score text in player colour
- Throwing player highlighted with gold border + dark background
- Last 3 **individual dart** scores with `tv-dart-fresh` pop animation on live updates
- Live score countdown per dart using `state.liveDarts`
- Live bust guard: freezes score display if visit would bust

### Burndown chart
- Chart.js line chart, one dataset per player
- Uses `p.color` per player
- X axis: round number; Y axis: remaining score (startScore → 0)
- Created once, updated with `.update()` on subsequent renders
- **Chart fingerprinting:** only redraws when `state.rounds` actually changes
  - `_lastRoundsKey = JSON.stringify(state.rounds)` compared each render
  - Prevents unnecessary redraws on `liveDarts` patches
  - `_lastRoundsKey` reset on game start and End Game
- Line thickness and point size tuned over several iterations: current `borderWidth: 3`, `pointRadius: 5`
- Axis and legend font sizes scaled for 4K: ticks 14px, titles 16px, legend 18px

### Winner overlay
- Appears when `state.gameOver && state.winner`
- Winner name shown in `w.color`
- Fixed: overlay was not cleared between games
  - `renderDisplayView()` now explicitly hides overlay when `gameOver` is false
  - Start Game and End Game both hide overlay directly on score view

---

## Bug Fixes

| Issue | Fix |
|-------|-----|
| `advancing` flag permanently stuck on Firebase error | Wrapped in `try/catch/finally` — `advancing = false` always runs |
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
| Syntax errors from `str_replace` eating function declarations | Restored `function showGameScreen()` declaration twice |
| Near-black `#212121` invisible on dark chart | Removed from palette |
| Colour picker `?` button as separate strip below grid | Replaced with inline tile as 36th grid cell |
| Live score flashing wrong value on bust | `updateDartPreview()` checks `wouldBust` independently before `isBust` is set |

---

## Removed Features

- **Confirm Visit** button — replaced by auto-advance after 3rd dart
- **Next Player** button — replaced by auto-advance
- Native `<input type="color">` — replaced by custom popup grid
