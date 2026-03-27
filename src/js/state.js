// ─────────────────────────────────────────────────────────
// state.js — shared game state + pure state helpers
// Single mutable object imported by all modules.
// onStateChange updates it in-place so all importers
// automatically see the latest values (ES module singleton).
// ─────────────────────────────────────────────────────────

export const state = {
  settings:      { startScore: 301, finishRule: 'single' },
  players:       {},
  rounds:        {},
  currentPlayer: null,
  currentRound:  0,
  gameOver:      false,
  placements:    {},
  liveDarts:     null,
};

/** Called by the storage listener — merges incoming data in-place */
export function onStateChange(data) {
  Object.assign(state, data);
  // `patch({liveDarts: null})` deletes the key from storage entirely.
  // Object.assign skips missing keys, so we must explicitly null it out.
  if (!('liveDarts' in data)) state.liveDarts = null;
}

/** Factory — full structured reset (safe for writeAll, won't confuse TV overlay) */
export function createResetState(startScore, finishRule) {
  return {
    settings:      { startScore, finishRule },
    players:       {},
    rounds:        {},
    currentPlayer: null,
    currentRound:  0,
    gameOver:      false,
    placements:    {},
    liveDarts:     null,
  };
}

// ── Pure game helpers (no DOM, no storage — fully testable) ──

/**
 * Whether a live visit total would bust for the given remaining score and rule.
 * Safe to call with liveTotal=0 (no liveDarts) — always returns false.
 */
export function computeWouldBust(liveTotal, currentScore, finishRule) {
  if (liveTotal === 0) return false;
  return liveTotal > currentScore
    || (finishRule === 'double' && currentScore - liveTotal === 1);
}

/**
 * Whether the TV should show the bust indicator for a specific player.
 * Returns false whenever liveDarts is null/empty — guards against stale data.
 */
export function computeIsBust(isThrow, liveTotal, currentScore, finishRule, liveDarts, playerKey) {
  if (!isThrow) return false;
  if (!liveDarts || liveDarts.player !== playerKey || !(liveDarts.darts?.length > 0)) return false;
  return computeWouldBust(liveTotal, currentScore, finishRule);
}

// ── Pure state helpers ────────────────────────────────────

/** Players sorted by throw order. Always use this — never rely on key insertion order. */
export function playersSorted() {
  return Object.entries(state.players || {})
    .sort((a, b) => a[1].order - b[1].order);
}

/** Three-dart average for a player, or '—' if no darts thrown yet */
export function calcAvg(p) {
  if (!p.totalDarts) return '—';
  return ((state.settings.startScore - p.currentScore) / p.totalDarts * 3).toFixed(1);
}

/**
 * Returns the last N individual dart display strings for a player,
 * left-padded with '—' when fewer than N darts have been recorded.
 */
export function lastDarts(playerKey, count = 3) {
  const rounds    = state.rounds || {};
  const roundKeys = Object.keys(rounds)
    .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));

  const allDarts = [];
  roundKeys.forEach(rk => {
    const entry = rounds[rk]?.[playerKey];
    if (entry?.darts) allDarts.push(...entry.darts);
  });

  const last = allDarts.slice(-count);
  while (last.length < count) last.unshift(null);
  return last.map(d => d === null ? '—' : d.display);
}
