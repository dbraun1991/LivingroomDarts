// ─────────────────────────────────────────────────────────
// render-score.js — phone/score view DOM renderers
// Passive: reads state, writes DOM only. Never writes storage.
// ─────────────────────────────────────────────────────────

import { state, playersSorted, calcAvg, lastDarts } from './state.js';
import { PALETTE } from './colors.js';

// ── Full rebuilds ─────────────────────────────────────────

/** Rebuild the current-player header bar (name, score, colour strip) */
export function updateCurrentPlayerHeader() {
  const cp = state.players?.[state.currentPlayer];
  if (!cp) return;
  const color = cp.color || PALETTE[cp.order % PALETTE.length];

  const nameEl = document.getElementById('gs-name');
  nameEl.textContent = cp.name;
  nameEl.style.color = color;

  document.getElementById('gs-score').textContent             = cp.currentScore;
  document.getElementById('gs-pre-score').textContent         = cp.currentScore;
  document.getElementById('player-color-bar').style.background = color;
}

/** Rebuild the full player score strip */
export function renderScoreStrip() {
  const strip = document.getElementById('score-strip');
  strip.innerHTML = '';

  playersSorted().forEach(([key, p]) => {
    const isActive = key === state.currentPlayer;
    const color    = p.color || PALETTE[p.order % PALETTE.length];
    const visits   = lastDarts(key, 3);
    const avg      = calcAvg(p);

    const row = document.createElement('div');
    row.className = 'score-row' + (isActive ? ' active-player' : '');
    if (isActive) row.style.borderColor = color;

    row.innerHTML = `
      <div class="sr-col-name">
        <span class="sr-arrow" style="color:${color}">▶</span>
        <span class="sr-name" style="${isActive ? `color:${color}` : ''}">${p.name}</span>
      </div>
      <div class="sr-col-darts">
        <span class="sr-dart">${visits[0]}</span>
        <span class="sr-dart">${visits[1]}</span>
        <span class="sr-dart">${visits[2]}</span>
        <span class="sr-avg-inline">⌀${avg}</span>
      </div>
      <div class="sr-col-score">
        <span class="sr-score">${p.currentScore}</span>
      </div>
    `;
    strip.appendChild(row);
  });
}

// ── Live patch (per-dart, no full rebuild) ────────────────

/**
 * Patch the active player's score and dart chips in the phone score strip.
 * TV updates for same-tab are handled by renderDisplayView() in main.js.
 *
 * @param {Array<{display: string, value: number}>} dartsThisVisit
 * @param {boolean} wouldBust
 */
export function renderScoreStripLive(dartsThisVisit, wouldBust) {
  const cp = state.players?.[state.currentPlayer];
  if (!cp) return;

  const visitTotal = dartsThisVisit.reduce((s, d) => s + d.value, 0);
  const live       = wouldBust ? cp.currentScore : Math.max(0, cp.currentScore - visitTotal);
  const pads       = [0, 1, 2].map(i => dartsThisVisit[i]?.display ?? '—');

  // ── Current player header ──
  const headerScore = document.getElementById('gs-score');
  if (headerScore) headerScore.textContent = wouldBust ? cp.currentScore : live;

  // ── Score strip ──
  const activeRow = document.querySelector('#score-strip .score-row.active-player');
  if (activeRow) {
    const scoreEl = activeRow.querySelector('.sr-score');
    if (scoreEl) scoreEl.textContent = live;

    activeRow.querySelectorAll('.sr-dart').forEach((el, i) => {
      el.textContent = pads[i];
      el.style.color = dartsThisVisit[i] ? 'var(--accent)' : '';
    });
  }
}
