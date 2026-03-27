// ─────────────────────────────────────────────────────────
// render-tv.js — TV/display view DOM renderers
// Passive: reads state, writes DOM only. Never writes storage.
// ─────────────────────────────────────────────────────────

import { state, playersSorted, calcAvg, lastDarts, computeWouldBust, computeIsBust } from './state.js';
import { PALETTE } from './colors.js';

// ── Module-level singletons ───────────────────────────────

let _burnChart     = null;   // Chart.js instance, created once
let _lastRoundsKey = null;   // fingerprint — skips redraw if rounds unchanged

/** Reset chart state between games (called by setup.js on start/end game) */
export function resetChart() {
  if (_burnChart) {
    _burnChart.destroy();
    _burnChart = null;
  }
  _lastRoundsKey = null;
}

// ── Entry point ───────────────────────────────────────────

/** Full TV render — driven by onStateChange */
export function renderDisplayView() {
  if (!state.players) return;
  const hasPlayers = Object.keys(state.players).length > 0;

  document.getElementById('waiting-overlay').classList.toggle('hidden', hasPlayers);
  if (!hasPlayers) return;

  _updateHeader();
  _renderLeaderboard();

  // Only rebuild the chart when rounds data actually changed
  const roundsKey = JSON.stringify(state.rounds);
  if (roundsKey !== _lastRoundsKey) {
    _lastRoundsKey = roundsKey;
    _renderBurndown();
  }

  if (state.gameOver && state.winner) {
    _showWinner();
  } else {
    document.getElementById('winner-overlay').classList.add('hidden');
  }
}

// ── Private renderers ─────────────────────────────────────

function _updateHeader() {
  const cp    = state.players?.[state.currentPlayer];
  const color = cp?.color || PALETTE[cp?.order % PALETTE.length] || 'var(--gold)';
  const rule  = state.settings?.finishRule === 'double' ? 'DOUBLE OUT' : 'SINGLE OUT';

  const nameEl = document.getElementById('tv-now-name');
  nameEl.textContent = cp ? cp.name : '—';
  nameEl.style.color = cp ? color   : 'var(--gold)';

  document.getElementById('tv-round').textContent      = `ROUND ${(state.currentRound || 0) + 1}`;
  document.getElementById('tv-rule-badge').textContent = rule;
}

function _renderLeaderboard() {
  const list      = document.getElementById('tv-lb-list');
  const liveDarts = state.liveDarts || null;
  list.innerHTML  = '';

  playersSorted().forEach(([key, p], i) => {
    const color   = p.color || PALETTE[p.order % PALETTE.length];
    const isThrow = key === state.currentPlayer;
    const avg     = calcAvg(p);

    // Active player: show live darts if available, else last committed
    let dartDisplay;
    if (isThrow && liveDarts?.player === key && liveDarts.darts?.length) {
      dartDisplay = [0, 1, 2].map(j => ({
        text:  liveDarts.darts[j]?.display ?? '—',
        fresh: !!liveDarts.darts[j],
      }));
    } else {
      dartDisplay = lastDarts(key, 3).map(d => ({ text: d, fresh: false }));
    }

    // Live score for the throwing player, frozen on bust
    const liveTotal    = (isThrow && liveDarts?.player === key)
      ? (liveDarts.darts || []).reduce((s, d) => s + d.value, 0)
      : 0;
    const finishRule   = state.settings?.finishRule;
    const wouldBust    = computeWouldBust(liveTotal, p.currentScore, finishRule);
    const displayScore = (isThrow && liveTotal > 0 && !wouldBust)
      ? Math.max(0, p.currentScore - liveTotal)
      : p.currentScore;

    const isBust = computeIsBust(isThrow, liveTotal, p.currentScore, finishRule, liveDarts, key);

    const row = document.createElement('div');
    row.className  = 'tv-lb-row' + (isThrow ? ' throwing' : '') + (isBust ? ' bust' : '');
    row.style.cssText = `border-left-color: ${color};`;
    row.innerHTML = `
      <div class="tv-lb-col-name">
        <span class="tv-lb-pos ${i === 0 ? 'top' : ''}">${i + 1}</span>
        <span class="tv-lb-name" style="color:${isThrow ? color : ''}">${p.name}</span>
      </div>
      <div class="tv-lb-col-darts">
        <span class="tv-lb-dart${dartDisplay[0].fresh ? ' tv-dart-fresh' : ''}">${dartDisplay[0].text}</span>
        <span class="tv-lb-dart${dartDisplay[1].fresh ? ' tv-dart-fresh' : ''}">${dartDisplay[1].text}</span>
        <span class="tv-lb-dart${dartDisplay[2].fresh ? ' tv-dart-fresh' : ''}">${dartDisplay[2].text}</span>
        <span class="tv-lb-avg-inline">⌀ ${avg}</span>
      </div>
      <div class="tv-lb-col-score">
        <span class="tv-lb-score" style="color:${isBust ? 'var(--red)' : color}">${isBust ? 'BUST!' : displayScore}</span>
      </div>
    `;
    list.appendChild(row);
  });
}

function _renderBurndown() {
  const rounds     = state.rounds || {};
  const startScore = state.settings?.startScore || 501;
  const roundKeys  = Object.keys(rounds)
    .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));

  const datasets = playersSorted().map(([key, p]) => {
    const color = p.color || PALETTE[p.order % PALETTE.length];
    let score   = startScore;
    const data  = [{ x: 0, y: startScore }];

    roundKeys.forEach((rk, ri) => {
      const entry = rounds[rk]?.[key];
      if (entry !== undefined) {
        // New format: { darts, bust } / legacy: number
        const pts = typeof entry === 'object'
          ? (entry.bust ? 0 : (entry.darts || []).reduce((s, d) => s + d.value, 0))
          : entry;
        score = Math.max(0, score - pts);
        data.push({ x: ri + 1, y: score });
      }
    });

    return {
      label: p.name, data,
      borderColor: color, backgroundColor: color + '22',
      pointBackgroundColor: color, tension: 0.3, pointRadius: 5, borderWidth: 3,
    };
  });

  const maxRound  = Math.max(roundKeys.length + 1, 5);
  const gridColor = '#2e352e';
  const tickColor = '#7a8a7a';

  if (!_burnChart) {
    _burnChart = new Chart(
      document.getElementById('burndown-chart').getContext('2d'),
      {
        type: 'line', data: { datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          animation: { duration: 600 },
          layout: { padding: { bottom: 10 } },
          scales: {
            x: {
              type: 'linear', min: 0, max: maxRound,
              title: { display: true, text: 'Round', color: tickColor, font: { size: 16 } },
              ticks: { color: tickColor, stepSize: 1, font: { size: 14 } },
              grid:  { color: gridColor },
            },
            y: {
              min: 0, max: startScore,
              title: { display: true, text: 'Score', color: tickColor, font: { size: 16 } },
              ticks: { color: tickColor, font: { size: 14 } },
              grid:  { color: gridColor },
            },
          },
          plugins: {
            legend: {
              labels: {
                color: '#e8ede8',
                font: { family: 'Barlow Condensed', size: 18 },
                boxWidth: 24, padding: 20,
              },
            },
          },
        },
      }
    );
  } else {
    _burnChart.data.datasets        = datasets;
    _burnChart.options.scales.x.max = maxRound;
    _burnChart.update();
  }
}

function _showWinner() {
  const w = state.players?.[state.winner];
  if (!w) return;
  const color  = w.color || PALETTE[w.order % PALETTE.length];
  const nameEl = document.getElementById('winner-name-txt');
  nameEl.textContent = w.name;
  nameEl.style.color = color;
  document.getElementById('winner-overlay').classList.remove('hidden');
}
