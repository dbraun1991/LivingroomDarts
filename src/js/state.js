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
  winner:        null,
  liveDarts:     null,
};

/** Called by the storage listener — merges incoming data in-place */
export function onStateChange(data) {
  Object.assign(state, data);
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
    winner:        null,
    liveDarts:     null,
  };
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
