// ─────────────────────────────────────────────────────────
// game.js — dart entry pipeline, undo stack, review mode,
//           numpad event listeners
// ─────────────────────────────────────────────────────────

import { state, playersSorted, computeWouldBust } from './state.js';
import { writeAll, patch }                   from './storage.js';
import { renderScoreStrip,
         renderScoreStripLive,
         updateCurrentPlayerHeader }         from './render-score.js';

// ── Constants ─────────────────────────────────────────────

const AUTO_ADVANCE_DELAY = 900;
const BUST_ADVANCE_DELAY = 1500;

// ── Local UI state ────────────────────────────────────────

let modifier       = null;    // 'D' | 'T' | null
let dartsThisVisit = [];      // {display, value}[]  max 3
let isBust         = false;
let advancing      = false;   // async lock — blocks all input
let reviewMode     = false;   // numpad locked after undo
let commitHistory  = [];      // undo stack: {state, darts}[]

// ── Public API ────────────────────────────────────────────

/** Show game screen and initialise UI — called by setup.js on start game */
export function showGameScreen() {
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('game-screen').style.display  = 'flex';
  resetDartUI();
  renderScoreStrip();
  updateCurrentPlayerHeader();
}

/**
 * Sync score view from storage — called by main.js onStateChange
 * when VIEW === 'score'.
 */
export function syncScoreView() {
  const hasGame = state.players && Object.keys(state.players).length > 0;
  if (!hasGame || state.gameOver) return;
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('game-screen').style.display  = 'flex';
  renderScoreStrip();
  updateCurrentPlayerHeader();
  // Patch live header score from state.liveDarts (single source of truth)
  const ld = state.liveDarts;
  if (ld?.player === state.currentPlayer && ld.darts?.length > 0) {
    const cp        = state.players?.[state.currentPlayer];
    const liveTotal = ld.darts.reduce((s, d) => s + d.value, 0);
    const wouldBust = computeWouldBust(liveTotal, cp.currentScore, state.settings?.finishRule);
    document.getElementById('gs-score').textContent =
      wouldBust ? cp.currentScore : cp.currentScore - liveTotal;
  }
}

/** Reset all local dart/game UI state — called by setup.js on end game */
export function resetGame() {
  advancing     = false;
  commitHistory = [];
  resetDartUI();
}

// ── Review mode ───────────────────────────────────────────

function enterReviewMode() {
  reviewMode = true;
  document.querySelectorAll('.numpad-btn:not(#btn-del)').forEach(b => b.disabled = true);
  document.getElementById('review-banner').classList.remove('hidden');
  document.getElementById('review-action').classList.remove('hidden');
}

function exitReviewMode() {
  reviewMode = false;
  document.querySelectorAll('.numpad-btn').forEach(b => b.disabled = false);
  document.getElementById('review-banner').classList.add('hidden');
  document.getElementById('review-action').classList.add('hidden');
}

// ── Dart UI helpers ───────────────────────────────────────

function resetDartUI() {
  dartsThisVisit = [];
  modifier       = null;
  isBust         = false;
  exitReviewMode();
  _clearModBtns();
  document.getElementById('bust-banner').classList.add('hidden');
  _updateDartPreview();
}

function _clearModBtns() {
  document.getElementById('btn-dbl').classList.remove('mod-active');
  document.getElementById('btn-trpl').classList.remove('mod-active');
}

function _updateDartPreview() {
  ['d1', 'd2', 'd3'].forEach((id, i) => {
    const slot = document.getElementById(id);
    const dart = dartsThisVisit[i];
    slot.textContent = dart ? dart.display : '—';
    slot.classList.toggle('filled', !!dart);
  });

  const total = dartsThisVisit.reduce((s, d) => s + d.value, 0);
  document.getElementById('visit-total').textContent = total;

  // Live score — freeze at current value if visit would bust
  const cp = state.players?.[state.currentPlayer];
  if (!cp) return;

  const wouldBust = computeWouldBust(total, cp.currentScore, state.settings?.finishRule);
  const live      = wouldBust ? cp.currentScore : Math.max(0, cp.currentScore - total);

  document.getElementById('gs-score').textContent = live;
  renderScoreStripLive(dartsThisVisit, wouldBust);
}

// ── Core dart logic ───────────────────────────────────────

function enterDart(baseValue, label) {
  if (dartsThisVisit.length >= 3 || isBust || advancing) return;

  let value, display;
  if (label !== undefined) {
    value = baseValue; display = label;
  } else if (modifier === 'D') {
    value = baseValue * 2; display = `D${baseValue}`;
  } else if (modifier === 'T') {
    value = baseValue * 3; display = `T${baseValue}`;
  } else {
    value = baseValue; display = baseValue === 0 ? 'O' : String(baseValue);
  }
  modifier = null;
  _clearModBtns();
  dartsThisVisit.push({ display, value });
  _updateDartPreview();

  // Fire-and-forget: TV tab updates live without waiting for commit
  patch({
    'darts/liveDarts': {
      player: state.currentPlayer,
      darts:  dartsThisVisit.map(d => ({ display: d.display, value: d.value })),
    }
  }).catch(() => {});

  const cp = state.players?.[state.currentPlayer];
  if (!cp) return;

  const total = dartsThisVisit.reduce((s, d) => s + d.value, 0);

  // Win
  if (total === cp.currentScore) {
    advancing = true;
    setTimeout(() => commitVisit(false), AUTO_ADVANCE_DELAY);
    return;
  }

  // Bust
  const isBustNow = computeWouldBust(total, cp.currentScore, state.settings?.finishRule);

  if (isBustNow) {
    isBust = true;
    document.getElementById('bust-banner').classList.remove('hidden');
    advancing = true;
    setTimeout(() => commitVisit(true), BUST_ADVANCE_DELAY);
    return;
  }

  // Auto-advance after 3rd dart
  if (dartsThisVisit.length === 3) {
    advancing = true;
    setTimeout(() => commitVisit(false), AUTO_ADVANCE_DELAY);
  }
}

async function commitVisit(bust) {
  const cpKey    = state.currentPlayer;
  const cp       = state.players[cpKey];
  const dartsCnt = dartsThisVisit.length;
  const total    = bust ? 0 : dartsThisVisit.reduce((s, d) => s + d.value, 0);
  const newScore = cp.currentScore - total;
  const newDarts = cp.totalDarts + dartsCnt;
  const roundKey = `r${state.currentRound}`;

  // Snapshot for undo
  commitHistory.push({
    state: JSON.parse(JSON.stringify(state)),
    darts: [...dartsThisVisit],
  });

  const roundEntry = {
    darts: dartsThisVisit.map(d => ({ display: d.display, value: d.value })),
    bust,
  };

  const updates = {
    [`darts/players/${cpKey}/currentScore`]: newScore,
    [`darts/players/${cpKey}/totalDarts`]:   newDarts,
    [`darts/rounds/${roundKey}/${cpKey}`]:   roundEntry,
    'darts/liveDarts':                       null,
  };

  try {
    if (newScore === 0) {
      updates['darts/gameOver'] = true;
      updates['darts/winner']   = cpKey;
      await patch(updates);
      resetDartUI();
      return;
    }
    await patch(updates);
    await _advancePlayer();
  } catch (err) {
    console.error('Write failed, advancing locally:', err);
    _advanceLocalOnly();
  } finally {
    advancing = false;
    renderScoreStrip();
    updateCurrentPlayerHeader();
  }
}

async function _advancePlayer() {
  const keys     = playersSorted().map(([k]) => k);
  const idx      = keys.indexOf(state.currentPlayer);
  const nextIdx  = (idx + 1) % keys.length;
  const nextKey  = keys[nextIdx];
  const newRound = nextIdx === 0 ? state.currentRound + 1 : state.currentRound;

  const updates = {
    'darts/currentPlayer': nextKey,
    'darts/currentRound':  newRound,
    'darts/liveDarts':     null,
  };
  if (nextIdx === 0) updates[`darts/rounds/r${newRound}`] = {};

  await patch(updates);
  resetDartUI();
}

function _advanceLocalOnly() {
  // Fallback path — keeps undo stack consistent even on write failure
  commitHistory.push({
    state: JSON.parse(JSON.stringify(state)),
    darts: [...dartsThisVisit],
  });
  const keys    = playersSorted().map(([k]) => k);
  const idx     = keys.indexOf(state.currentPlayer);
  const nextIdx = (idx + 1) % keys.length;
  state.currentPlayer = keys[nextIdx];
  if (nextIdx === 0) state.currentRound += 1;
  updateCurrentPlayerHeader();
  renderScoreStrip();
  resetDartUI();
}

async function _goToPreviousPlayer() {
  if (commitHistory.length === 0) return;
  const { state: snapshot, darts } = commitHistory.pop();

  try {
    await writeAll(snapshot);
  } catch (err) {
    console.error('Undo write failed:', err);
    Object.assign(state, snapshot);
  }

  dartsThisVisit = darts || [];
  isBust         = false;
  modifier       = null;
  _clearModBtns();
  document.getElementById('bust-banner').classList.add('hidden');
  _updateDartPreview();
  renderScoreStrip();
  updateCurrentPlayerHeader();

  if (dartsThisVisit.length > 0) enterReviewMode();
}

function _handleDelete() {
  if (advancing) return;

  if (dartsThisVisit.length > 0) {
    const removed = dartsThisVisit.pop();
    isBust = false;
    document.getElementById('bust-banner').classList.add('hidden');
    _updateDartPreview();

    if (reviewMode) {
      exitReviewMode();
      // Pre-activate modifier if the removed dart used D or T
      if (removed?.display?.startsWith('D') && removed.display !== 'D') {
        modifier = 'D';
        document.getElementById('btn-dbl').classList.add('mod-active');
      } else if (removed?.display?.startsWith('T')) {
        modifier = 'T';
        document.getElementById('btn-trpl').classList.add('mod-active');
      }
    }
  } else {
    exitReviewMode();
    _goToPreviousPlayer();
  }
}

// ── Numpad event listeners ────────────────────────────────

document.querySelectorAll('.numpad-btn[data-n]').forEach(btn => {
  btn.addEventListener('click', () => enterDart(parseInt(btn.dataset.n)));
});

document.getElementById('btn-miss').addEventListener('click', () => {
  modifier = null; _clearModBtns(); enterDart(0);
});

document.getElementById('btn-bull').addEventListener('click', () => {
  const pts = modifier === 'D' ? 50 : 25;
  const lbl = modifier === 'D' ? 'Bull 50' : '25';
  modifier = null; _clearModBtns();
  enterDart(pts, lbl);
});

document.getElementById('btn-dbl').addEventListener('click', () => {
  modifier = modifier === 'D' ? null : 'D';
  document.getElementById('btn-dbl').classList.toggle('mod-active', modifier === 'D');
  document.getElementById('btn-trpl').classList.remove('mod-active');
});

document.getElementById('btn-trpl').addEventListener('click', () => {
  modifier = modifier === 'T' ? null : 'T';
  document.getElementById('btn-trpl').classList.toggle('mod-active', modifier === 'T');
  document.getElementById('btn-dbl').classList.remove('mod-active');
});

document.getElementById('btn-del').addEventListener('click', _handleDelete);

document.getElementById('confirm-visit-btn').addEventListener('click', () => {
  if (!reviewMode || advancing) return;
  exitReviewMode();
  advancing = true;
  commitVisit(false);
});
