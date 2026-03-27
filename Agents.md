# AGENTS.md — LivingRoom Darts: Technical Reference for LLM Agents

This document describes the full architecture, state model, data flow, and every
significant function. Intended for AI assistants, code agents, or automated systems
that need to reason about, modify, or extend this codebase.

---

## 1. Project Overview

### File tree

```
.
├── dist/                        ← build output — commit this for GitHub Pages
│   └── index.html               ← single self-contained file, works on file://
├── src/
│   ├── index.html               ← HTML template
│   ├── css/
│   │   ├── base.css             ← variables, reset, shared utilities
│   │   ├── setup.css            ← setup screen styles
│   │   ├── game.css             ← phone/score view styles
│   │   └── tv.css               ← TV display styles
│   └── js/
│       ├── main.js              ← entry point, routing, boot
│       ├── state.js             ← shared state object, pure helpers
│       ├── storage.js           ← localStorage abstraction
│       ├── colors.js            ← palette, colour picker popup
│       ├── setup.js             ← setup screen logic
│       ├── game.js              ← dart pipeline, undo, review mode
│       ├── render-score.js      ← phone view DOM renderers
│       └── render-tv.js         ← TV view DOM renderers + chart
├── docs/
│   ├── GameSetup_view.png
│   ├── InGame_view.png
│   ├── TV_ingame.png
│   └── TV_preview.png
├── package.json
├── vite.config.js
├── LICENSE
├── README.md
├── AGENTS.md
└── Changelog.md
```

### Source files

| File | Role |
|------|------|
| `src/index.html` | DOM structure only |
| `src/css/base.css` | Variables, reset, shared utilities |
| `src/css/setup.css` | Setup screen styles |
| `src/css/game.css` | Phone/score view styles |
| `src/css/tv.css` | TV display styles |
| `src/js/main.js` | Entry point — routing, boot, wires onStateChange |
| `src/js/state.js` | Shared state object, pure helpers |
| `src/js/storage.js` | localStorage abstraction |
| `src/js/colors.js` | PALETTE constant, colour picker popup |
| `src/js/setup.js` | Setup screen logic |
| `src/js/game.js` | Dart entry pipeline, undo, review mode |
| `src/js/render-score.js` | Phone view DOM renderers |
| `src/js/render-tv.js` | TV view DOM renderers + Chart.js |

### Build output

| File | Role |
|------|------|
| `dist/index.html` | Single self-contained file — all JS and CSS inlined by Vite. Works on `file://` and GitHub Pages. |

### Tooling

| Tool | Purpose |
|------|---------|
| Vite | Dev server + build |
| vite-plugin-singlefile | Inlines all assets into one HTML file at build time |
| Vitest | Unit tests — `npm test` — config in `vite.config.js` under `test:` block |

**Test files:** `test/bust.test.js` — 21 tests covering `computeWouldBust`, `computeIsBust`, and `onStateChange` key-deletion behaviour.

Two views from the same file, determined by `?view=display` URL parameter.

### Module dependency graph

```
state.js          ← no deps
storage.js        ← no deps
colors.js         ← no deps
render-score.js   ← state, colors
render-tv.js      ← state, colors
game.js           ← state, storage, render-score
setup.js          ← state, storage, colors, game, render-tv
main.js           ← state, storage, setup, game, render-tv
```

No circular dependencies. `render-score` and `render-tv` are purely passive.

---

## 2. State Model

```
state {
  settings: {
    startScore:  number    // 301 | 501 | 701
    finishRule:  string    // 'single' | 'double'
  }

  players: {
    [key: string]: {       // 'p0'–'p9', stable per game
      name:         string
      color:        string  // hex colour
      order:        number  // 0-based throw order
      currentScore: number
      totalDarts:   number
    }
  }

  rounds: {
    [key: string]: {       // 'r0', 'r1', ...
      [playerKey: string]: {
        darts: [{ display: string, value: number }, ...]
        bust:  boolean
      }
    }
  }

  currentPlayer: string
  currentRound:  number
  gameOver:      boolean
  winner:        string | null

  liveDarts: {             // written on every dart entry, null between turns
    player: string
    darts:  [{ display, value }, ...]
  } | null
}
```

**rounds format:** `{ darts: [...], bust }` per player per round — individual dart objects,
not totals. `_renderBurndown` handles legacy number format via typeof guard.

**liveDarts:** fire-and-forget field written to storage on every `enterDart()`. TV listener
reacts immediately to update chips and score without waiting for visit commit.
Cleared to `null` on `_advancePlayer()`.

---

## 3. Storage (`storage.js`)

localStorage-only. Firebase has been removed.

### `writeAll(newState)`
Replaces entire state. Used for: game start, undo, End Game.
End Game writes structured reset via `createResetState()` — never bare `{}`.

### `patch(updates)`
Flat-path map. Null values delete keys.
Path format: `'darts/players/p0/currentScore'` (leading `darts/` prefix stripped internally).
Used for: scoring, player advance, `liveDarts` writes.

### `listen(callback)`
Synchronous — no async init required. Registers cross-tab (`storage` event) and
same-tab (`darts-changed` CustomEvent) listeners. Fires immediately with current state.

---

## 4. State helpers (`state.js`)

### `state` (exported object)
Single mutable object. All modules import the same reference. `onStateChange` calls
`Object.assign(state, data)` to update in-place — no module ever holds a stale copy.

### `onStateChange(data)`
Called by `main.js` on every storage event. Merges incoming data into `state`.
**Key deletion guard:** `patch({liveDarts: null})` removes the key from stored JSON entirely.
`Object.assign` silently skips absent keys, so `state.liveDarts` is explicitly set to `null`
when `'liveDarts'` is not present in `data` — preventing stale values from persisting.

### `createResetState(startScore, finishRule)`
Factory for the structured reset object used by both start-game and end-game.
Single source of truth — never inline the reset shape elsewhere.

### `playersSorted()`
`Object.entries(state.players).sort((a,b) => a[1].order - b[1].order)`
Always use — never rely on key insertion order.

### `computeWouldBust(liveTotal, currentScore, finishRule)` → boolean
Pure function. Returns `false` immediately when `liveTotal === 0`.
Otherwise: `liveTotal > currentScore` OR (double out AND `currentScore - liveTotal === 1`).

### `computeIsBust(isThrow, liveTotal, currentScore, finishRule, liveDarts, playerKey)` → boolean
Pure function. Returns `false` if: not throwing player, `liveDarts` is null, player mismatch,
or `liveDarts.darts` is empty. Delegates to `computeWouldBust` for the numeric check.
Used by `render-tv.js` for the bust indicator; also covered by `test/bust.test.js`.

### `calcAvg(p)`
`(startScore - currentScore) / totalDarts * 3`. Returns `'—'` if no darts.

### `lastDarts(playerKey, count = 3)`
Flattens individual dart objects across all rounds for a player.
Returns last `count` `.display` strings, left-padded with `'—'`.

---

## 5. Colour System (`colors.js`)

**PALETTE:** 35 hex values, 6×6 grid (35 swatches + 1 `?` tile).
- Columns: Red · Orange · Green · Cyan · Blue · Purple
- Rows: Pastel → Light → Vivid → Dark → Very Dark
- Row 6: greys + bright yellow. Near-black removed (invisible on dark background).

### `pickUnusedColor(players)`
Takes the players array as argument — no implicit coupling to setup state.
Picks randomly from colours not yet assigned. Falls back to full palette if all taken.

### `openColorPicker(swatchBtn, playerIndex, players, onPick)`
Positions popup below `swatchBtn`. Calls `onPick(playerIndex, hex)` on selection.
Decoupled from `setup.js` via callback — `colors.js` has no knowledge of `setupPlayers`.

**Colour picker popup:** singleton `<div class="color-picker-popup">` appended to body.
35 `.cp-swatch` buttons + `.cp-random-tile` (dark grey `#424242`, white `?`).

---

## 6. Setup Flow (`setup.js`)

Local vars (never persisted): `setupPlayers[]`, `selectedStart`, `selectedRule`.

**`renderSetup()`** — public export, called once from `main.js` on boot.
Calls `_renderPlayerList()`, `_syncScoreButtons()`, `_syncRuleButtons()`.

**Start Game:**
1. Map `setupPlayers` → player shape
2. `resetChart()` — destroys existing Chart.js instance before new game
3. `writeAll(newState)`, `Object.assign(state, newState)`
4. Hide `#winner-overlay`, call `showGameScreen()`

**End Game:**
1. Preserve names + colours back into `setupPlayers`
2. `resetChart()`, `writeAll(createResetState(...))`, `Object.assign(state, resetState)`
3. Hide `#winner-overlay`, call `resetGame()`
4. Show setup screen, sync button states

**📺 Open TV Display:** `window.open(location.pathname + '?view=display', '_blank')`

---

## 7. Dart Entry Pipeline (`game.js`)

### Public exports

| Export | Called by | Purpose |
|--------|-----------|---------|
| `showGameScreen()` | `setup.js` | Switches to game screen, initialises UI |
| `syncScoreView()` | `main.js` | Syncs screen state from storage on change; re-applies `_updateDartPreview()` if darts are in progress to prevent storage events from resetting the live score |
| `resetGame()` | `setup.js` | Clears `advancing`, `commitHistory`, calls `resetDartUI()` |

### Local UI state

| Variable | Type | Description |
|----------|------|-------------|
| `modifier` | `null\|'D'\|'T'` | Active multiplier toggle |
| `dartsThisVisit` | `{display,value}[]` | Current visit, max 3 |
| `isBust` | `boolean` | Bust detected |
| `advancing` | `boolean` | Async lock — blocks all input |
| `reviewMode` | `boolean` | Post-undo lock — numpad disabled |
| `commitHistory` | `{state,darts}[]` | Undo snapshot stack |

### `enterDart(baseValue, label?)`

Guards: `dartsThisVisit.length >= 3 || isBust || advancing`.

After pushing dart:
1. `_updateDartPreview()` — slots + live score
2. `patch({ liveDarts })` fire-and-forget — TV updates in ~100ms
3. Win check → `setTimeout(commitVisit(false), 900)`
4. Bust check → banner + `setTimeout(commitVisit(true), 1500)`
5. 3rd dart → `setTimeout(commitVisit(false), 900)`

### `_updateDartPreview()`

Updates d1/d2/d3 slots and visit total.
Computes `wouldBust` independently (same condition as `enterDart`).
Calls `renderScoreStripLive(dartsThisVisit, wouldBust)` — passes array as argument.

### `commitVisit(bust)`

1. Push `{ state: deepClone, darts: [...dartsThisVisit] }` to `commitHistory`
2. Build `roundEntry = { darts: [...], bust }` — individual dart objects
3. Patch score, dart count, round entry
4. Win: patch `gameOver`+`winner`, `resetDartUI()`
5. Otherwise: `patch()` → `_advancePlayer()`
6. `finally`: `advancing = false`, `renderScoreStrip()`, `updateCurrentPlayerHeader()`

### `_advancePlayer()`

Patches `currentPlayer`, `currentRound`, `liveDarts: null`, new round key if wrapping.
Calls `resetDartUI()`.

---

## 8. Review Mode (`game.js`)

Activated when `_goToPreviousPlayer()` restores darts with `length > 0`.

### `enterReviewMode()`
- `reviewMode = true`
- Disables all `.numpad-btn` except `#btn-del`
- Shows `#review-banner` and `#review-action`

### `exitReviewMode()`
- `reviewMode = false`
- Re-enables all `.numpad-btn`
- Hides `#review-banner` and `#review-action`

### `_goToPreviousPlayer()`
1. Pop `{ state: snapshot, darts }` from `commitHistory`
2. `writeAll(snapshot)` — atomic full state restore
3. `dartsThisVisit = darts`, clear bust/modifier/banner
4. `_updateDartPreview()`, `renderScoreStrip()`, `updateCurrentPlayerHeader()`
5. If darts exist → `enterReviewMode()`

### `_handleDelete()` in review mode
1. Pop last dart, call `exitReviewMode()`
2. Inspect removed dart display:
   - Starts with `D` (not just `D`) → `modifier = 'D'`, activate D button
   - Starts with `T` → `modifier = 'T'`, activate T button
3. Normal entry resumes

### `#confirm-visit-btn`
`exitReviewMode()` → `advancing = true` → `commitVisit(false)` immediately.

### `resetDartUI()`
Always calls `exitReviewMode()` — review mode cannot persist across advances.

---

## 9. Score View Renderers (`render-score.js`)

Passive — reads `state`, writes DOM only. Never writes storage.

### `renderScoreStrip()`
Full rebuild. Three-column flex per row:
- `.sr-col-name`: arrow + name (coloured if active)
- `.sr-col-darts`: 3× `.sr-dart` + avg — centred
- `.sr-col-score`: remaining score — right

### `updateCurrentPlayerHeader()`
Updates `#gs-name` (coloured), `#gs-score`, `#gs-pre-score`, `#player-color-bar` background.
- `#gs-pre-score` — committed score at turn start; frozen during the visit (muted colour)
- `#gs-score` — live remaining score; counts down per dart

### `renderScoreStripLive(dartsThisVisit, wouldBust)`
Patches DOM directly — no full rebuild. Receives `dartsThisVisit` array as argument.
Updates:
- `#gs-score` in the current-player header (live countdown)
- Score strip active row score and dart chips
- TV leaderboard throwing row: score, dart chips, `bust` class (same-tab only)

Cross-tab/device TV updates come via `liveDarts` storage field.

---

## 10. TV Display Renderers (`render-tv.js`)

Passive — reads `state`, writes DOM only. Never writes storage.

### Public exports

| Export | Called by | Purpose |
|--------|-----------|---------|
| `renderDisplayView()` | `main.js` | Full TV render, driven by `onStateChange` |
| `resetChart()` | `setup.js` | Destroys Chart.js instance, resets `_lastRoundsKey` |

### `renderDisplayView()`
```
hasPlayers → toggle #waiting-overlay
if !hasPlayers → return
_updateHeader()
_renderLeaderboard()
if _lastRoundsKey changed → _renderBurndown(); update _lastRoundsKey
if gameOver && winner → _showWinner()
else → hide #winner-overlay
```

### Chart update guard
`_lastRoundsKey = JSON.stringify(state.rounds)` compared on every render.
`_renderBurndown()` skipped if rounds unchanged (e.g. only `liveDarts` changed).
Reset to `null` via `resetChart()` on game start and End Game.

### `resetChart()`
Calls `_burnChart.destroy()` before nulling — fixes Y-axis max not resetting
when `startScore` changes between games (was a known bug in the previous version).

### `_renderLeaderboard()`
Three-column layout. For throwing player:
- Uses `state.liveDarts` if `player` matches → live dart chips + `.tv-dart-fresh` class
- `.tv-dart-fresh` → accent colour + `dartPop` scale animation
- Live score from `liveDarts.darts` sum, frozen on bust
- **Bust indicator:** `isBust = isThrow && wouldBust && liveDarts?.player === key && liveDarts.darts.length > 0`
  - Row gets `.bust` class → red border + dark red background
  - Score element shows `BUST!` in red instead of the numeric score
- **Border widths:** all rows `border-left-width: 14px`; throwing row `border-left-width: 21px` (colour from inline style, width from CSS class)
- **Vertical alignment:** leaderboard uses `justify-content: center` — rows float in the vertical middle

### `_renderBurndown()`
Chart.js line chart. Reads `rounds[rk][key]` as `{ darts, bust }`, sums dart values.
Created once on first call, updated with `.update()` on subsequent renders.

---

## 11. Reset Behaviour Summary

| Trigger | Score view | TV view |
|---------|-----------|---------|
| Start Game | Game screen, hide winner | Hide waiting overlay |
| End Game | Setup screen, hide winner, clear history | Show waiting overlay |
| Undo (⌫ empty) | Restore state + darts, enter review mode | Full re-render |
| ⌫ in review | Remove dart, exit review, restore modifier | Live chip update |
| ✓ Confirm Visit | Exit review, commit immediately | Full re-render |
| Win | Commit, resetDartUI, liveDarts cleared | Show winner overlay |
| New game | Same as Start Game | Same as Start Game |

---

## 12. Known Constraints

- **liveDarts errors silently ignored** (`.catch(() => {})`). TV falls back to last committed darts.
- **Undo history is session-only**: page reload clears `commitHistory`.
- **Review mode is score-view only**: TV never enters review mode.
- **Same-tab sync**: `storage` event doesn't fire in writing tab — `darts-changed` CustomEvent covers same-tab.
- **Google Fonts and Chart.js require network**: loaded via CDN. The built `dist/index.html` works on `file://` but fonts and chart will not render without an internet connection.
- **`patch(null)` deletes keys, not sets them**: `Object.assign` skips absent keys — `onStateChange` has an explicit guard for `liveDarts` to handle this. Any future nullable fields added to state need the same treatment.
- **`advancing` flag gates same-tab `_updateDartPreview`**: `syncScoreView` skips `_updateDartPreview()` when `advancing === true` to prevent stale `dartsThisVisit` from being compared against a newly committed score.

---

## 13. Extension Points

| Feature | Where to add |
|---------|-------------|
| Checkout suggestions | `checkouts.js` (lookup table drafted in `checkout-suggestions.md`); render in `_updateDartPreview()` + `_renderLeaderboard()` using remaining score and `dartsLeft = 3 - dartsThisVisit.length` |
| Double-out per-dart validation | `enterDart()` win check — verify last dart display starts with `D` |
| Sound effects | `commitVisit()`, `_showWinner()`, `enterReviewMode()` |
| Stats screen | `?view=stats`, reads `state.rounds` via `lastDarts()` |
| Multiple legs | Add `legs` to `state.settings`, track per-player win counts |
