# AGENTS.md — LivingRoom Darts: Technical Reference for LLM Agents

This document describes the full architecture, state model, data flow, and every
significant function. Intended for AI assistants, code agents, or automated systems
that need to reason about, modify, or extend this codebase.

---

## 1. Project Overview

| File | Role |
|------|------|
| `darts.html` | DOM structure only |
| `darts.css` | All styles — phone and TV views |
| `darts.js` | Single ES module — all logic and state |

Two views from the same file, determined by `?view=display` URL parameter.

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

**rounds format:** `{ darts: [...], bust }` per player per round — individual dart objects, not totals. `renderBurndown` handles legacy number format via typeof guard.

**liveDarts:** fire-and-forget field written to storage on every `enterDart()`. TV listener reacts immediately to update chips and score without waiting for visit commit. Cleared to `null` on `advancePlayer()`.

---

## 3. Storage Abstraction

### `writeAll(newState)`
Replaces entire state. Used for: game start, undo, End Game.
End Game writes structured reset (`players: {}, rounds: {}, ...`) — never bare `{}`.

### `patch(updates)`
Firebase-path flat map. Null values delete keys.
Used for: scoring, player advance, `liveDarts` writes.

### `listen(callback)`
Persistent listener → `onStateChange(data)`.
Firebase: `onValue()`. localStorage: `storage` event + `darts-changed` CustomEvent.

---

## 4. Colour System

**PALETTE:** 35 hex values, 6×6 grid (35 swatches + 1 `?` tile).
- Columns: Red · Orange · Green · Cyan · Blue · Purple
- Rows: Pastel → Light → Vivid → Dark → Very Dark
- Row 6: greys + bright yellow. Near-black removed (invisible on dark background).

**Colour picker popup:** singleton `<div class="color-picker-popup">` appended to body.
35 `.cp-swatch` buttons + `.cp-random-tile` (dark grey `#424242`, white `?`).
`openColorPicker(btn, playerIndex)` positions below swatch.
`pickUnusedColor()` picks randomly from unassigned colours.

---

## 5. Setup Flow

Local vars (never persisted): `setupPlayers[]`, `selectedStart`, `selectedRule`.

**Start Game:**
1. Map `setupPlayers` → Firebase player shape
2. `writeAll(newState)`, `_lastRoundsKey = null`
3. Hide `#winner-overlay`, call `showGameScreen()`

**End Game:**
1. Preserve names + colours back into `setupPlayers`
2. `writeAll(resetState)` — structured reset
3. Hide `#winner-overlay`, reset `advancing`/`commitHistory`/`_lastRoundsKey`
4. Show setup screen

**📺 Open TV Display:** `window.open(location.pathname + '?view=display', '_blank')`

---

## 6. Dart Entry Pipeline

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
1. `updateDartPreview()` — slots + live score
2. `patch({ liveDarts })` fire-and-forget — TV updates in ~100ms
3. Win check → `setTimeout(commitVisit(false), 900)`
4. Bust check → banner + `setTimeout(commitVisit(true), 1500)`
5. 3rd dart → `setTimeout(commitVisit(false), 900)`

### `updateDartPreview()`

Updates d1/d2/d3 slots and visit total.
Computes live score with bust guard (same condition as enterDart).
Calls `renderScoreStripLive(total, wouldBust)`.

### `renderScoreStripLive(visitTotal, wouldBust)`

Patches DOM directly — no full rebuild:
- Score strip: `.score-row.active-player` → `.sr-score` + `.sr-dart` chips
- TV leaderboard: `.tv-lb-row.throwing` → `.tv-lb-score` + `.tv-lb-dart` chips
- Fresh chips get `color: var(--accent)` inline

Note: only works in same-tab scenario. Cross-tab/device TV updates come via `liveDarts` storage field.

### `commitVisit(bust)`

1. Push `{ state: deepClone, darts: [...dartsThisVisit] }` to `commitHistory`
2. Build `roundEntry = { darts: [...], bust }` — individual dart objects
3. Patch score, dart count, round entry
4. Win: patch `gameOver`+`winner`, `resetDartUI()`
5. Otherwise: `patch()` → `advancePlayer()`
6. `finally`: `advancing = false`, `renderScoreStrip()`, `updateCurrentPlayerHeader()`

### `advancePlayer()`

Patches `currentPlayer`, `currentRound`, `liveDarts: null`, new round key if wrapping.
Calls `resetDartUI()`.

---

## 7. Review Mode

Activated when `goToPreviousPlayer()` restores darts with `length > 0`.

### `enterReviewMode()`
- `reviewMode = true`
- Disables all `.numpad-btn` except `#btn-del`
- Shows `#review-banner` and `#review-action`

### `exitReviewMode()`
- `reviewMode = false`
- Re-enables all `.numpad-btn`
- Hides `#review-banner` and `#review-action`

### `goToPreviousPlayer()`
1. Pop `{ state: snapshot, darts }` from `commitHistory`
2. `writeAll(snapshot)` — atomic full state restore
3. `dartsThisVisit = darts`, clear bust/modifier/banner
4. `updateDartPreview()`, `renderScoreStrip()`, `updateCurrentPlayerHeader()`
5. If darts exist → `enterReviewMode()`

### `handleDelete()` in review mode
1. Pop last dart, call `exitReviewMode()`
2. Inspect removed dart display:
   - Starts with `D` (not just `D`) → `modifier = 'D'`, activate D button
   - Starts with `T` → `modifier = 'T'`, activate T button
   - Otherwise → no modifier
3. Normal entry resumes

### `#confirm-visit-btn`
`exitReviewMode()` → `advancing = true` → `commitVisit(false)` immediately.

### `resetDartUI()`
Always calls `exitReviewMode()` — review mode cannot persist across advances.

---

## 8. Score View Render Functions

### `renderScoreStrip()`
Three-column flex per row:
- `.sr-col-name`: arrow + name (coloured if active)
- `.sr-col-darts`: 3× `.sr-dart` + avg — centred
- `.sr-col-score`: remaining score — right

Dart chips from `lastDarts(key, 3)`. Live updates via `renderScoreStripLive()`.

### `updateCurrentPlayerHeader()`
Updates `#gs-name` (coloured), `#gs-score`, `#player-color-bar` background.

---

## 9. TV Display Render Functions

### `renderDisplayView()`
```
hasPlayers → toggle #waiting-overlay
if !hasPlayers → return
updateTVHeader()
renderLeaderboard()
if _lastRoundsKey changed → renderBurndown(); _lastRoundsKey = roundsKey
if gameOver && winner → showWinner()
else → hide #winner-overlay
```

### Chart update guard
`_lastRoundsKey = JSON.stringify(state.rounds)` compared on every render.
`renderBurndown()` skipped if rounds unchanged (e.g. only `liveDarts` changed).
Reset to `null` on game start and End Game.

### `renderLeaderboard()`
Three-column layout. For throwing player:
- Uses `state.liveDarts` if `player` matches → live dart chips + `.tv-dart-fresh` class
- `.tv-dart-fresh` → accent colour + `dartPop` scale animation
- Live score from `liveDarts.darts` sum, frozen on bust

### `renderBurndown()`
Chart.js line chart. Reads `rounds[rk][key]` as `{ darts, bust }`, sums dart values.
Created once, updated with `.update()`.

---

## 10. Helper Functions

### `playersSorted()`
`Object.entries(state.players).sort((a,b) => a[1].order - b[1].order)`
Always use — never rely on key insertion order.

### `calcAvg(p)`
`(startScore - currentScore) / totalDarts * 3`. Returns `'—'` if no darts.

### `lastDarts(playerKey, count = 3)`
Flattens individual dart objects across all rounds for a player.
Returns last `count` `.display` strings, left-padded with `'—'`.

### `pickUnusedColor()`
Filters PALETTE against `setupPlayers` colours. Random from free pool.

---

## 11. Reset Behaviour Summary

| Trigger | Score view | TV view |
|---------|-----------|---------|
| Start Game | Game screen, hide winner, `_lastRoundsKey = null` | Hide waiting overlay |
| End Game | Setup screen, hide winner, clear history | Show waiting overlay |
| Undo (⌫ empty) | Restore state + darts, enter review mode | Full re-render |
| ⌫ in review | Remove dart, exit review, restore modifier | Live chip update |
| ✓ Confirm Visit | Exit review, commit immediately | Full re-render |
| Win | Commit, resetDartUI | Show winner overlay |
| New game | Same as Start Game | Same as Start Game |

---

## 12. Known Constraints

- **liveDarts errors silently ignored** (`.catch(() => {})`). TV falls back to last committed darts.
- **burnChart singleton**: Y-axis max not reset between games if `startScore` changes. Fix: `burnChart.destroy(); burnChart = null;` before `writeAll(newState)`.
- **Undo history is session-only**: page reload clears `commitHistory`.
- **Review mode is score-view only**: TV never enters review mode.
- **Same-tab sync**: `storage` event doesn't fire in writing tab — `darts-changed` CustomEvent covers same-tab.

---

## 13. Extension Points

| Feature | Where to add |
|---------|-------------|
| Checkout suggestions | New `checkouts.js` lookup; read in `updateDartPreview()` + `renderLeaderboard()` based on remaining score and darts left |
| Double-out per-dart validation | `enterDart()` win check — verify last dart display starts with `D` |
| Sound effects | `commitVisit()`, `showWinner()`, `enterReviewMode()` |
| Stats screen | `?view=stats`, reads `state.rounds` via `lastDarts()` |
| Multiple legs | Add `legs` to `state.settings`, track per-player win counts |
