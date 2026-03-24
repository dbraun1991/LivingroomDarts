// ─────────────────────────────────────────────────────────
// main.js — entry point
// Handles view routing, boots storage listener, wires
// onStateChange to the correct view renderer.
// ─────────────────────────────────────────────────────────

import { onStateChange }      from './state.js';
import { listen }             from './storage.js';
import { renderSetup }        from './setup.js';
import { syncScoreView }      from './game.js';
import { renderDisplayView }  from './render-tv.js';

// ── View routing ──────────────────────────────────────────

const VIEW = new URLSearchParams(location.search).get('view') === 'display'
  ? 'display' : 'score';

document.getElementById(VIEW === 'display' ? 'view-display' : 'view-score')
  .classList.add('active');

// ── State change handler ──────────────────────────────────

function handleStateChange(data) {
  onStateChange(data);
  if (VIEW === 'display') renderDisplayView();
  else                    syncScoreView();
}

// ── Boot ──────────────────────────────────────────────────

if (VIEW === 'display') {
  document.getElementById('waiting-overlay').classList.remove('hidden');
}

renderSetup();
listen(handleStateChange);
