# AGENTS.md — LivingRoom Darts: Technical Reference for LLM Agents

This document describes the full architecture, state model, data flow, and every
significant function of the darts scoring application. It is intended for AI assistants,
code agents, or any automated system that needs to reason about, modify, or extend
this codebase.

---

## 1. Project Overview

A browser-based darts scoring app in three files:

| File | Role |
|------|------|
| `darts.html` | DOM structure only — no inline JS or CSS |
| `darts.css` | All styles — phone scoring view and TV display view |
| `darts.js` | Single ES module — all logic, state, storage abstraction |

Two views are served from the same `darts.html`. The view is determined at runtime by
the URL parameter `?view=display`. Score view (default) is for a phone. Display view
is for a TV or large monitor.

---

## 2. State Model

All game state lives in one JavaScript object called `state`. It is persisted to either
Firebase Realtime Database or `localStorage` depending on configuration.

```
state {
  settings: {
    startScore:  number    // 301 | 501 | 701
    finishRule:  string    // 'single' | 'double'
  }

  players: {
    [key: string]: {       // keys: 'p0'–'p9', assigned at game start, stable per game
      name:         string
      color:        string  // hex, e.g. '#42a5f5', picked in setup
      order:        number  // 0-based throw order, used for sorting
      currentScore: number  // remaining score, decrements toward 0
      totalDarts:   number  // cumulative darts thrown, used for avg calculation
    }
  }

  rounds: {
    [key: string]: {       // keys: 'r0', 'r1', ... incremented when all players have thrown
      [playerKey: string]: number  // visit total written after each turn (0 on bust)
    }
  }

  currentPlayer: string    // key into players, e.g. 'p0'
  currentRound:  number    // 0-based
  gameOver:      boolean
  winner:        string | null  // player key of winner, null during play
}
```

Player keys (`p0`–`p9`) are assigned sequentially at game start and are stable for the
game's lifetime. **Always sort by `player.order`**, not by key, when display order matters.

---

## 3. Storage Abstraction

All game logic calls only three functions. The underlying transport is swapped transparently.

### Detection

```js
const USE_FIREBASE = firebaseConfig.apiKey !== "YOUR_API_KEY";
```

If `false`, all operations use `localStorage` + custom browser events.

### `writeAll(newState)`

Replaces the **entire** persisted state. Used for:
- Game start — writes the full initial state
- Undo (`goToPreviousPlayer`) — restores a complete snapshot
- End Game — writes a reset state: `{ players: {}, rounds: {}, currentPlayer: null, currentRound: 0, gameOver: false, winner: null, settings: {…} }`

> **Important:** End Game must write a structured reset object, not `{}`. An empty object
> merges with existing state in the listener and fails to clear `players`, leaving the TV
> in an incorrect state.

### `patch(updates)`

Writes a flat map of Firebase-style path strings to values. Null values delete the key.
Path format: `'darts/players/p0/currentScore'`. Used for:
- Scoring (`commitVisit`) — updates score, dart count, round entry
- Player rotation (`advancePlayer`) — updates `currentPlayer`, `currentRound`

### `listen(callback)`

Registers a persistent listener. Calls `callback(data)` on every state change.
- Firebase: `onValue()` WebSocket subscription — fires on any remote write
- localStorage: `window.storage` event (cross-tab) + custom `darts-changed` event (same-tab)

The same-tab custom event is necessary because the browser's `storage` event does not
fire in the tab that performed the write.

Both views share the same `onStateChange(data)` callback, which updates `state` and
dispatches to the correct render path based on `VIEW`.

---

## 4. Routing

```js
const VIEW = new URLSearchParams(location.search).get('view') === 'display'
  ? 'display' : 'score';
```

`VIEW` is a constant for the page lifetime. `routeView()` adds class `active` to either
`#view-score` or `#view-display`. Both containers exist in the DOM at all times.

---

## 5. Colour System

### Palette

`PALETTE` is an array of 36 hex strings arranged as a 6×6 grid:
- **Columns (left → right):** Red · Orange · Green · Cyan · Blue · Purple
- **Rows (top → bottom):** Pastel · Light · Vivid/Mid · Dark · Very Dark
- **Row 6 (bottom):** White · Light grey · Mid grey · Dark grey · Near-black · Bright yellow

`PLAYER_COLORS` is an alias for `PALETTE` (legacy compatibility — do not remove).

### Colour assignment

New players receive a colour from `pickUnusedColor()`:
```js
function pickUnusedColor() {
  const used = new Set(setupPlayers.map(p => p.color));
  const free = PALETTE.filter(c => !used.has(c));
  const pool = free.length > 0 ? free : PALETTE;
  return pool[Math.floor(Math.random() * pool.length)];
}
```
This applies on first player creation and every subsequent "Add Player". If all 36
colours are already assigned it falls back to the full palette.

### Colour picker popup

A singleton `<div class="color-picker-popup">` is appended to `<body>` at module load.
It contains one `.cp-swatch` button per palette colour plus one `.cp-random` button.

`openColorPicker(swatchBtn, playerIndex)` positions the popup below the swatch, marks
the currently selected colour with a white ring, and stores the target in `_cpTarget`/`_cpIndex`.

Clicking a swatch: updates `setupPlayers[i].color`, updates the swatch button background,
closes the popup.

Clicking `.cp-random`: calls `pickUnusedColor()`, applies it, closes the popup.

Clicking outside: closes the popup via a `document` click listener.

### Colour usage at runtime

| Location | Source |
|----------|--------|
| Score view header — player name | `cp.color` |
| Score view header — divider bar (`#player-color-bar`) | `cp.color` |
| Score view strip — active player border + arrow | `cp.color` |
| TV header — Now Throwing name | `cp.color` |
| TV leaderboard — left border | `p.color` |
| TV leaderboard — score text | `p.color` |
| TV leaderboard — name when throwing | `p.color` |
| TV burndown — line colour | `p.color` |
| TV winner overlay — winner name | `w.color` |

---

## 6. Setup Flow

Local variables (never persisted to Firebase/localStorage):
- `setupPlayers[]` — `{ name, color }` per player, mirrors the UI list
- `selectedStart` — 301 | 501 | 701
- `selectedRule` — 'single' | 'double'

These survive the End Game round-trip so the next game can start immediately.

### On START GAME
1. Map `setupPlayers` → Firebase player shape, assign `order` by index
2. `writeAll(newState)` — pushes full state to storage, triggers both views
3. Hide `#winner-overlay` (clears any leftover from previous game)
4. `showGameScreen()` — swap setup screen for game screen

### On End Game
1. Preserve player names + colours back into `setupPlayers`
2. `writeAll(resetState)` — writes structured reset (not `{}`) to trigger TV waiting overlay
3. Hide `#winner-overlay` on score view
4. Reset local state variables: `state`, `advancing`, `commitHistory`
5. Show setup screen with remembered players, restored button states

---

## 7. Dart Entry and Commit Pipeline

### Local UI state (score view only, never persisted)

| Variable | Type | Description |
|----------|------|-------------|
| `modifier` | `null \| 'D' \| 'T'` | Active multiplier toggle |
| `dartsThisVisit` | `{display, value}[]` | Darts entered this turn, max 3 |
| `isBust` | `boolean` | Visit is a bust — awaiting auto-advance |
| `advancing` | `boolean` | Lock during async write — blocks numpad input |
| `commitHistory` | `state[]` | Full deep-clone snapshots, one per committed visit |

### `enterDart(baseValue, label?)`

Guards: returns immediately if `dartsThisVisit.length >= 3 || isBust || advancing`.

Calculates `value`:
- `label` provided → use `baseValue` as-is (used for Bull 50)
- `modifier === 'D'` → `baseValue * 2`
- `modifier === 'T'` → `baseValue * 3`
- otherwise → `baseValue`

Pushes `{ display, value }` to `dartsThisVisit`, clears `modifier`, calls `updateDartPreview()`.

Then checks in order:

1. **Win:** `total === cp.currentScore` → `advancing = true`, `setTimeout(commitVisit(false), 900)`
2. **Bust:** `total > cp.currentScore` OR (`finishRule === 'double'` AND `cp.currentScore - total === 1`) → `isBust = true`, show bust banner, `setTimeout(commitVisit(true), 1500)`
3. **3rd dart:** `dartsThisVisit.length === 3` → `setTimeout(commitVisit(false), 900)`

The delay lets the scorer see the result before the screen transitions.

### `commitVisit(bust)`

1. Deep-clone current state onto `commitHistory` stack
2. Calculate `total` (0 if bust), `newScore`, `newDarts`
3. Build `updates` map for score, dart count, round entry
4. If `newScore === 0`: add `gameOver: true`, `winner: cpKey` to updates, `patch()`, `resetDartUI()`, return
5. Otherwise: `patch(updates)` → `advancePlayer()`
6. `finally`: always sets `advancing = false`, calls `renderScoreStrip()` + `updateCurrentPlayerHeader()`

The `finally` block is critical — it ensures the UI unlocks even if the storage write throws.

### `advancePlayer()`

1. Sort players by `order`, find current index
2. `nextIdx = (idx + 1) % keys.length`
3. If `nextIdx === 0`: increment `currentRound`, create new round key
4. `patch({ currentPlayer: nextKey, currentRound: newRound, [optional new round] })`
5. `resetDartUI()`

### `advanceLocalOnly()`

Fallback when `patch()` throws. Mutates `state` directly, updates header and strip.
**Also pushes to `commitHistory`** so undo still works on the local fallback path.

### `goToPreviousPlayer()` (Undo)

Called by `handleDelete()` when `dartsThisVisit` is empty.

1. If `commitHistory` is empty: no-op (nothing to undo)
2. `snapshot = commitHistory.pop()`
3. `writeAll(snapshot)` — restores complete state atomically to both views
4. On failure: restores `state` locally as fallback
5. `resetDartUI()`, `renderScoreStrip()`, `updateCurrentPlayerHeader()`

Unlimited depth — every committed visit is snapshotted. Undo history is cleared on End Game.

### `handleDelete()`

- `dartsThisVisit.length > 0` → pop last dart, clear `isBust`, update preview
- empty → call `goToPreviousPlayer()`
- `advancing` → no-op

---

## 8. Score View Render Functions

### `syncScoreView()`

Entry point from `onStateChange()`. If game is active: shows game screen, calls
`renderScoreStrip()` and `updateCurrentPlayerHeader()`.

### `updateCurrentPlayerHeader()`

Updates three elements simultaneously:
- `#gs-name` — player name, coloured with `cp.color`
- `#gs-score` — remaining score as plain number
- `#player-color-bar` — background colour set to `cp.color` (the 4px divider strip)

### `renderScoreStrip()`

Rebuilds `#score-strip` entirely. Each row is a single flex line:

```
▶  Name  [v1] [v2] [v3] ⌀avg  ···spacer···  score
```

- Active player: coloured border, coloured arrow visible, name in player colour
- Visits from `lastVisits(key, 3)` — left-pads with `'—'` if fewer than 3 rounds played
- Average from `calcAvg(p)`
- Visits + avg are centred in a `.sr-middle` flex container between name and score

---

## 9. TV Display Render Functions

Entry point: `renderDisplayView()`, called from `onStateChange()`.

### `renderDisplayView()`

```
hasPlayers = Object.keys(state.players).length > 0

if !hasPlayers  → show #waiting-overlay, return
else            → hide #waiting-overlay
                  updateTVHeader()
                  renderLeaderboard()
                  renderBurndown()
                  if gameOver && winner → showWinner()
                  else                 → hide #winner-overlay
```

The winner overlay is explicitly hidden on every non-winning render to ensure it clears
after End Game + New Game without requiring a page reload.

### `updateTVHeader()`

- `#tv-now-name` — active player name, coloured with `cp.color`
- `#tv-round` — "ROUND N" (1-based)
- `#tv-rule-badge` — "SINGLE OUT" or "DOUBLE OUT"

### `renderLeaderboard()`

Rebuilds `#tv-lb-list`. Players sorted by `order`. Each row:
- Position number (gold for rank 1)
- Player name (in `p.color` if currently throwing, otherwise default)
- Last 3 visit chips + average (⌀)
- Remaining score in `p.color`
- Left border in `p.color` (4px)
- `.throwing` class applied if `key === state.currentPlayer`

### `renderBurndown()`

Chart.js line chart, created once and updated on subsequent calls.
- One dataset per player, colour from `p.color`
- X axis: round number (linear, min 0, max = rounds played + 1, at least 5)
- Y axis: remaining score (0 → startScore)
- `borderWidth: 4`, `pointRadius: 6` (scaled for 4K)
- Chart occupies `flex: 1.618` of `.tv-body`; leaderboard occupies `flex: 1` (golden ratio)

### `showWinner()`

- Looks up winner via `state.players[state.winner]`
- Sets `#winner-name-txt` text and colour to `w.color`
- Removes `.hidden` from `#winner-overlay`

---

## 10. Helper Functions

### `playersSorted()`
`Object.entries(state.players).sort((a,b) => a[1].order - b[1].order)`
Always use this for ordered iteration — never rely on object key insertion order.

### `calcAvg(p)`
`(startScore - currentScore) / totalDarts * 3` — average score per 3-dart visit.
Returns `'—'` if `totalDarts === 0`.

### `lastVisits(playerKey, count = 3)`
Reads `state.rounds` in key order (`r0`, `r1`, …), extracts the given player's visit
total per round, takes the last `count` values, left-pads with `null` → `'—'`.

---

## 11. Reset Behaviour Summary

| Trigger | Score view | TV view |
|---------|-----------|---------|
| Start Game | Shows game screen, hides winner overlay | Hides waiting overlay, shows chart |
| End Game | Shows setup screen, hides winner overlay | Shows waiting overlay |
| New game start (after End Game) | Same as Start Game | Same as Start Game |
| Undo (⌫ on empty) | Restores previous player and scores | Updates chart + leaderboard |
| Win detected | Shows winner overlay (score view has none) | Shows winner overlay |

---

## 12. Known Constraints and Edge Cases

- **Same-tab sync:** The browser `storage` event does not fire in the writing tab. The custom `darts-changed` CustomEvent handles same-tab updates (e.g. score view and display view open in two tabs of the same browser on the same laptop).
- **Undo history is session-only:** `commitHistory` lives in JS memory. A page reload clears it. The current game state in localStorage/Firebase is unaffected.
- **burnChart singleton:** Created once, updated thereafter. If `startScore` differs between games, the Y-axis maximum is not currently reset. A future fix: `burnChart.destroy(); burnChart = null;` before writing the new game state, so it recreates on the next `renderBurndown()` call.
- **Round keys accumulate:** `state.rounds` is never pruned. This is fine for expected game lengths (< 200 rounds per player).
- **Firebase cold start:** First connection after idle can take 2–5 seconds. Open the display view before starting the game to pre-warm the WebSocket.

---

## 13. Extension Points

| Feature | Where to add |
|---------|-------------|
| Require double to finish (per-dart) | `enterDart()` — on win check, verify last dart has `display` starting with `D` |
| Sound effects | `commitVisit()` (score sound), `showWinner()` (fanfare) |
| Per-player stats screen | New view via `?view=stats`, reads `state.rounds` |
| Multiple legs / sets | Add `legs`/`sets` to `state.settings`; track wins per player |
| Tournament bracket | Separate state subtree; hook into `gameOver` |
| Spectator mode | Already works — display view never writes to storage |
