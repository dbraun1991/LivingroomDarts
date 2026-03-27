# Refactoring Plan — Phone/TV Render Decoupling

> **Status: Complete.** All 5 chunks implemented. See Changelog.md for the full record.

## Problem Statement

Same-tab live updates (per-dart score and dart chips on the TV leaderboard) were implemented
as a direct DOM patch from inside `render-score.js`. This single workaround causes most of the
entanglement between phone and TV concerns:

- `render-score.js` queries and mutates TV-specific DOM elements and CSS class names
- Two independent update paths exist for the TV (direct DOM patch vs. state→render pipeline)
- `tv-dart-fresh` pop animation never fires same-tab (the direct patch skips the class)
- Bust logic is computed in three separate places
- `syncScoreView` checks `advancing` (a game-logic flag) to control rendering
- `dartsThisVisit` and `state.liveDarts` represent the same data, manually kept in sync,
  with guards and workarounds to manage the window between them

Root cause: `storage` events don't fire in the writing tab, so a direct DOM patch path was
added as a fast-path for same-tab. Everything else follows from that choice.

---

## Target State

The module boundary becomes clean:

- `render-score.js` — owns phone DOM exclusively
- `render-tv.js` — owns TV DOM exclusively
- `main.js` — calls both renderers on every state change
- Neither renderer knows about the other's DOM structure

`state.liveDarts` is the single source of truth for live dart data in both renderers.
`dartsThisVisit` remains in `game.js` for commit logic, undo, and phone dart slot display only.

---

## Steps

### Step 1 — `main.js`: always call both renderers

In `handleStateChange`, call `renderDisplayView()` unconditionally alongside `syncScoreView()`:

```
handleStateChange(data):
  onStateChange(data)
  syncScoreView()        // phone view — unchanged
  renderDisplayView()    // TV view — add this regardless of VIEW
```

`renderDisplayView` already guards against no players. `_renderLeaderboard` rebuilds up to 10
rows — trivial. The burndown chart is fingerprint-guarded and will not redraw per-dart.
`_notifyChange()` dispatches synchronously, so there is no latency difference vs. the current
direct DOM patch.

**Import change:** `main.js` already imports `renderDisplayView` — no new imports needed.

---

### Step 2 — `render-score.js`: remove the TV section from `renderScoreStripLive`

Delete the "TV leaderboard (same tab only)" block (currently lines 95–110):

```js
// Remove entirely:
const throwRow = document.querySelector('#tv-lb-list .tv-lb-row.throwing');
if (throwRow) { ... }
```

`renderScoreStripLive` then only handles:
- `#gs-score` header live countdown
- `.score-row.active-player` score and dart chips in the phone strip

`render-score.js` no longer references any TV class names or element IDs.

---

### Step 3 — `syncScoreView`: derive live header score from `state.liveDarts`

Remove the `_updateDartPreview()` call and its `!advancing` guard.
Compute the live remaining score directly from `state.liveDarts` instead:

```
syncScoreView():
  if !hasGame || gameOver → return
  show game screen
  renderScoreStrip()
  updateCurrentPlayerHeader()    // sets header from committed state
  // patch live score if a visit is in progress:
  if state.liveDarts?.player === state.currentPlayer && state.liveDarts.darts.length > 0:
    liveTotal = sum(state.liveDarts.darts)
    wouldBust = computeWouldBust(liveTotal, cp.currentScore, finishRule)
    gs-score = wouldBust ? cp.currentScore : cp.currentScore - liveTotal
```

After commit, `state.liveDarts = null` — live score naturally reverts to `cp.currentScore`.
The `advancing` flag and the `_updateDartPreview` call in `syncScoreView` are both removed.

---

### Step 4 — `_updateDartPreview`: phone-specific only

`_updateDartPreview` drops any responsibility for the TV. It handles:
- Dart slots d1/d2/d3 (text + filled class)
- Visit total (`#visit-total`)
- `renderScoreStripLive(dartsThisVisit, wouldBust)` for phone strip and header

The TV receives its update via `renderDisplayView` triggered by the `liveDarts` storage patch
that already fires immediately after in `enterDart`.

---

### Step 5 — consolidate bust computation

`_updateDartPreview` currently has its own inline `wouldBust` expression.
Replace it with `computeWouldBust(total, cp.currentScore, finishRule)` from `state.js`.

`enterDart` keeps its own inline bust check (`isBustNow`) for game-logic decisions
(setting `isBust`, showing banner, scheduling commit). This is intentionally separate —
it drives behaviour, not rendering. But the numeric condition can also use `computeWouldBust`.

Result: two call sites, one function — no divergence risk.

---

## What Changes

| File | Change |
|------|--------|
| `main.js` | Add `renderDisplayView()` call in `handleStateChange` regardless of VIEW |
| `render-score.js` | Remove TV DOM block from `renderScoreStripLive` |
| `game.js` | Remove `_updateDartPreview()` call and `!advancing` guard from `syncScoreView`; add `state.liveDarts`-based live score patch; use `computeWouldBust` in `_updateDartPreview` |
| `state.js` | No changes |
| `render-tv.js` | No changes |
| `storage.js` | No changes |

---

## What Is Eliminated

| Problem | Eliminated by |
|---------|--------------|
| TV DOM manipulation in `render-score.js` | Step 2 |
| `advancing` guard in render path | Step 3 |
| `tv-dart-fresh` animation missing same-tab | Step 1 |
| Bust logic computed independently in two styles | Step 5 |
| `dartsThisVisit` vs `state.liveDarts` desync workarounds | Step 3 |
| Implicit coupling on TV class names from phone renderer | Step 2 |

---

## What Is Unchanged

- `dartsThisVisit` remains in `game.js` for commit logic, undo stack, and phone dart slots
- `state.liveDarts` remains as the cross-tab communication channel
- `liveDarts: null` in commit patch — still required for cross-tab TV correctness
- `onStateChange` key-deletion guard — still required
- All test coverage in `test/bust.test.js` remains valid

---

## Implementation Chunks — Ordered

### Chunk 1 — Consolidate bust into `computeWouldBust` (game.js)
**Files:** `game.js` only
**Type:** Pure refactor — zero behavioural change

Replace the two inline bust expressions with `computeWouldBust` from `state.js`:
- `_updateDartPreview`: replace its `wouldBust` inline expression
- `enterDart`: replace `isBustNow` inline expression

Add `computeWouldBust` to the `game.js` import from `state.js`.
All 21 tests must still pass after this chunk. No manual verification needed.

---

### Chunk 2 — Call `renderDisplayView` in score view (main.js)
**Files:** `main.js` only
**Type:** Additive — no existing code removed

Add `renderDisplayView()` call in `handleStateChange` when `VIEW === 'score'`.
At this point the TV is updated by **both** paths simultaneously (direct DOM patch + pipeline).
This duplication is intentional and safe — both produce the same result.

**Verify manually:**
- Live dart chips update on TV same-tab ✓
- `tv-dart-fresh` pop animation now fires same-tab ✓
- Waiting overlay and winner overlay behave correctly when `#view-display` is hidden ✓

---

### Chunk 3 — Remove TV block from `renderScoreStripLive` (render-score.js)
**Files:** `render-score.js` only
**Type:** Deletion — only safe after Chunk 2 is in place

Delete the "TV leaderboard (same tab only)" block. `render-score.js` becomes phone-only.
TV now updated exclusively via `renderDisplayView`.

**Verify manually:**
- Bust indicator on TV works same-tab ✓
- Live score countdown on TV works same-tab ✓
- Dart chips update on TV same-tab ✓
- `render-score.js` contains zero references to `tv-lb-*` class names ✓

---

### Chunk 4 — Replace `_updateDartPreview` in `syncScoreView` with `state.liveDarts` read (game.js)
**Files:** `game.js` only
**Type:** Behavioural change — only safe after Chunk 3 (TV no longer depends on `renderScoreStripLive`)

In `syncScoreView`:
- Remove `if (dartsThisVisit.length > 0 && !advancing) _updateDartPreview()`
- Add live header score patch reading `state.liveDarts`

Add `computeWouldBust` and `state` to imports in `game.js` if not already present.
`advancing` flag is no longer read by any render function.

**Verify manually:**
- Phone header score counts down live during a visit ✓
- Header resets to committed score at turn start ✓
- Bust freezes header score correctly ✓
- No false bust on TV after commit (single player, score → 1) ✓

---

### Chunk 5 — Run full test suite and verify
**Files:** `test/bust.test.js` (review only, no expected changes)
**Type:** Verification

Run `npm test` — all 21 tests must pass.
Confirm the `advancing` flag no longer appears in any render-related code path.
Confirm `render-score.js` imports list contains no TV references.

---

### Dependency graph

```
Chunk 1  →  independent (do first, lowest risk)
Chunk 2  →  independent of Chunk 1, but must precede Chunk 3
Chunk 3  →  requires Chunk 2
Chunk 4  →  requires Chunk 3
Chunk 5  →  requires Chunk 4
```

---

## Risk Notes

- `renderDisplayView` will now run in score view on every dart entry and every storage event.
  Verify that `_showWinner()` and the waiting overlay behave correctly when called from score view
  (the overlay elements exist in the DOM but are inside `#view-display` which is hidden).
- `syncScoreView` reading `state.liveDarts` for the live header score introduces a dependency
  on `state.liveDarts` in the phone renderer. This is acceptable — it is the canonical source.
- Step 1 must land before Step 2. If Step 2 is applied first, same-tab TV goes dark until
  Step 1 is in place.
