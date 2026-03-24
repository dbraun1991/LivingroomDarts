// ─────────────────────────────────────────────────────────
// setup.js — setup screen: player list, start/end game,
//            score/rule selectors, randomize order
// ─────────────────────────────────────────────────────────

import { state, createResetState, playersSorted } from './state.js';
import { writeAll }                               from './storage.js';
import { PALETTE, pickUnusedColor, openColorPicker } from './colors.js';
import { showGameScreen, resetGame }              from './game.js';
import { resetChart }                             from './render-tv.js';

// ── Local setup state (never persisted) ──────────────────

let setupPlayers  = [{ name: '', color: pickUnusedColor([]) }];
let selectedStart = 301;
let selectedRule  = 'single';   // 'single' | 'double'

// ── Public API ────────────────────────────────────────────

/** Initial render of the setup screen — called once on boot from main.js */
export function renderSetup() {
  _renderPlayerList();
  _syncScoreButtons();
  _syncRuleButtons();
}

// ── Player list ───────────────────────────────────────────

function _renderPlayerList() {
  const list = document.getElementById('players-list');
  list.innerHTML = '';

  setupPlayers.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'player-row';
    row.innerHTML = `
      <span>${i + 1}</span>
      <button class="color-swatch-btn" style="background:${p.color}" title="Pick colour"></button>
      <input type="text" placeholder="Player ${i + 1}" value="${p.name}" maxlength="16">
      ${setupPlayers.length > 1 ? '<button class="remove-btn">✕</button>' : ''}
    `;

    row.querySelector('input[type="text"]').addEventListener('input', e => {
      setupPlayers[i].name = e.target.value;
    });

    row.querySelector('.color-swatch-btn').addEventListener('click', e => {
      e.stopPropagation();
      openColorPicker(e.currentTarget, i, setupPlayers, (idx, hex) => {
        setupPlayers[idx].color = hex;
        _renderPlayerList();
      });
    });

    row.querySelector('.remove-btn')?.addEventListener('click', () => {
      setupPlayers.splice(i, 1);
      _renderPlayerList();
    });

    list.appendChild(row);
  });

  document.getElementById('add-player-btn').style.display =
    setupPlayers.length >= 10 ? 'none' : 'flex';
}

// ── Setup button helpers ──────────────────────────────────

function _syncScoreButtons() {
  document.querySelectorAll('.start-score-btn[data-score]').forEach(b => {
    b.classList.toggle('selected', parseInt(b.dataset.score) === selectedStart);
  });
}

function _syncRuleButtons() {
  document.querySelectorAll('.start-score-btn[data-rule]').forEach(b => {
    b.classList.toggle('selected', b.dataset.rule === selectedRule);
  });
}

// ── Event listeners ───────────────────────────────────────

document.getElementById('add-player-btn').addEventListener('click', () => {
  if (setupPlayers.length < 10) {
    setupPlayers.push({ name: '', color: pickUnusedColor(setupPlayers) });
    _renderPlayerList();
  }
});

document.getElementById('randomize-btn').addEventListener('click', () => {
  for (let i = setupPlayers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [setupPlayers[i], setupPlayers[j]] = [setupPlayers[j], setupPlayers[i]];
  }
  _renderPlayerList();
});

document.querySelectorAll('.start-score-btn[data-score]').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedStart = parseInt(btn.dataset.score);
    _syncScoreButtons();
  });
});

document.querySelectorAll('.start-score-btn[data-rule]').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedRule = btn.dataset.rule;
    _syncRuleButtons();
  });
});

document.getElementById('start-game-btn').addEventListener('click', async () => {
  const players = {};
  setupPlayers.forEach((p, i) => {
    players[`p${i}`] = {
      name:         p.name.trim() || `Player ${i + 1}`,
      color:        p.color || PALETTE[i % PALETTE.length],
      order:        i,
      currentScore: selectedStart,
      totalDarts:   0,
    };
  });

  const newState = {
    settings:      { startScore: selectedStart, finishRule: selectedRule },
    players,
    rounds:        { r0: {} },
    currentPlayer: 'p0',
    currentRound:  0,
    gameOver:      false,
    winner:        null,
    liveDarts:     null,
  };

  resetChart();
  await writeAll(newState);
  Object.assign(state, newState);

  document.getElementById('winner-overlay').classList.add('hidden');
  showGameScreen();
});

document.getElementById('end-game-btn').addEventListener('click', async () => {
  // Remember player names and colours for the next game
  const current = playersSorted();
  if (current.length) {
    setupPlayers = current.map(([, p]) => ({
      name:  p.name,
      color: p.color || PALETTE[p.order % PALETTE.length],
    }));
  }

  const resetState = createResetState(selectedStart, selectedRule);
  resetChart();
  await writeAll(resetState);
  Object.assign(state, resetState);

  document.getElementById('winner-overlay').classList.add('hidden');
  resetGame();

  document.getElementById('game-screen').style.display  = 'none';
  document.getElementById('setup-screen').style.display = 'flex';

  _renderPlayerList();
  _syncScoreButtons();
  _syncRuleButtons();
});
