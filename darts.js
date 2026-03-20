// ─────────────────────────────────────────────────────────
// darts.js  —  ES module
// Auto-detects whether Firebase is configured.
// If not → falls back to localStorage + cross-tab storage events.
// ─────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════
// 🔧 FIREBASE CONFIG  — paste your values here to go live
// ═══════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  databaseURL:       "https://YOUR_PROJECT-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "YOUR_PROJECT",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// ═══════════════════════════════════════════════════════
// STORAGE ABSTRACTION
// Swaps between Firebase and localStorage transparently.
// All game logic below only calls: writeAll, patch, listen.
// ═══════════════════════════════════════════════════════
const USE_FIREBASE = firebaseConfig.apiKey !== "YOUR_API_KEY";
const LS_KEY       = 'darts_game_state';
const CHANGE_EVENT = 'darts-changed';   // custom event for same-tab updates

let _db, _ref, _set, _update;   // Firebase handles, filled if USE_FIREBASE

async function storageInit() {
  if (!USE_FIREBASE) {
    console.info('[Darts] Firebase not configured — using localStorage.');
    return;
  }
  const { initializeApp }                          = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
  const { getDatabase, ref, set, update }          = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
  const app = initializeApp(firebaseConfig);
  _db     = getDatabase(app);
  _ref    = ref;
  _set    = set;
  _update = update;
  console.info('[Darts] Firebase connected.');
}

/** Replace entire game state */
async function writeAll(newState) {
  if (USE_FIREBASE) {
    await _set(_ref(_db, 'darts/'), newState);
  } else {
    localStorage.setItem(LS_KEY, JSON.stringify(newState));
    _notifyChange();
  }
}

/**
 * Apply a flat-path patch object.
 * Keys use Firebase-style paths: 'darts/players/p0/currentScore'
 */
async function patch(updates) {
  if (USE_FIREBASE) {
    await _update(_ref(_db, '/'), updates);
  } else {
    const current = _lsRead();
    for (const [rawPath, value] of Object.entries(updates)) {
      // strip leading 'darts/' prefix, then drill into object
      const parts = rawPath.replace(/^darts\//, '').split('/');
      _setPath(current, parts, value);
    }
    localStorage.setItem(LS_KEY, JSON.stringify(current));
    _notifyChange();
  }
}

/**
 * Listen for state changes and call callback(state).
 * Works across tabs (storage event) and same tab (custom event).
 */
async function listen(callback) {
  if (USE_FIREBASE) {
    const { onValue } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
    onValue(_ref(_db, 'darts/'), snap => {
      const data = snap.val();
      if (data) callback(data);
    });
  } else {
    const fire = () => {
      const data = _lsRead();
      if (data && Object.keys(data).length) callback(data);
    };
    // Cross-tab: browser fires 'storage' when another tab writes localStorage
    window.addEventListener('storage', e => { if (e.key === LS_KEY) fire(); });
    // Same-tab: our custom event
    window.addEventListener(CHANGE_EVENT, fire);
    // Initial load
    fire();
  }
}

// ── localStorage helpers ───────────────────────────────
function _lsRead() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch { return {}; }
}

function _notifyChange() {
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function _setPath(obj, parts, value) {
  const last = parts.pop();
  let cur = obj;
  for (const part of parts) {
    if (cur[part] === undefined || cur[part] === null || typeof cur[part] !== 'object')
      cur[part] = {};
    cur = cur[part];
  }
  if (value === null) delete cur[last];
  else cur[last] = value;
}

// ═══════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════
const PALETTE = [
  // ── 6 columns: Red · Orange · Green · Cyan · Blue · Purple ──
  // Row 1 — pastel
  '#ffcdd2','#ffe0b2','#c8e6c9','#b2ebf2','#bbdefb','#e1bee7',
  // Row 2 — light
  '#ef9a9a','#ffcc80','#a5d6a7','#80deea','#90caf9','#ce93d8',
  // Row 3 — vivid / mid
  '#ef5350','#ffa726','#66bb6a','#26c6da','#42a5f5','#ab47bc',
  // Row 4 — dark
  '#c62828','#e65100','#2e7d32','#00838f','#1565c0','#6a1b9a',
  // Row 5 — very dark
  '#7f0000','#bf360c','#1b5e20','#006064','#0d47a1','#4a148c',
  // Row 6 — neutrals + yellow accent
  '#ffffff','#e0e0e0','#9e9e9e','#616161','#ffee58',
];

// Keep PLAYER_COLORS for any fallback referencing old variable
const PLAYER_COLORS = PALETTE;

// ── Color picker popup (shared singleton) ───────────────
const colorPickerEl = document.createElement('div');
colorPickerEl.className = 'color-picker-popup hidden';
PALETTE.forEach(hex => {
  const sw = document.createElement('button');
  sw.className = 'cp-swatch';
  sw.style.background = hex;
  sw.dataset.color = hex;
  colorPickerEl.appendChild(sw);
});

// ? tile — 36th cell, sits in the lower-right golden position
const randTile = document.createElement('button');
randTile.className = 'cp-swatch cp-random-tile';
randTile.textContent = '?';
randTile.title = 'Pick a random unused colour';
randTile.style.background = '#ffee58';
randTile.style.color = '#1a1a00';
randTile.style.fontFamily = 'var(--font-head)';
randTile.style.fontSize = '1.1rem';
randTile.addEventListener('click', e => {
  e.stopPropagation();
  if (_cpIndex < 0) return;
  const hex = pickUnusedColor();
  setupPlayers[_cpIndex].color = hex;
  if (_cpTarget) _cpTarget.style.background = hex;
  colorPickerEl.classList.add('hidden');
  _cpTarget = null; _cpIndex = -1;
});
colorPickerEl.appendChild(randTile);
document.body.appendChild(colorPickerEl);

let _cpTarget = null;   // current swatch button being edited
let _cpIndex  = -1;     // player index

function openColorPicker(swatchBtn, playerIndex) {
  _cpTarget = swatchBtn;
  _cpIndex  = playerIndex;
  // mark selected
  colorPickerEl.querySelectorAll('.cp-swatch').forEach(sw => {
    sw.classList.toggle('selected', sw.dataset.color === setupPlayers[playerIndex].color);
  });
  // position below the swatch button
  const rect = swatchBtn.getBoundingClientRect();
  colorPickerEl.classList.remove('hidden');
  const pw = colorPickerEl.offsetWidth  || 174;
  const ph = colorPickerEl.offsetHeight || 174;
  let left = rect.left;
  let top  = rect.bottom + 6;
  if (left + pw > window.innerWidth)  left = window.innerWidth  - pw - 8;
  if (top  + ph > window.innerHeight) top  = rect.top - ph - 6;
  colorPickerEl.style.left = left + 'px';
  colorPickerEl.style.top  = top  + 'px';
}

colorPickerEl.addEventListener('click', e => {
  const sw = e.target.closest('.cp-swatch');
  if (!sw || _cpIndex < 0) return;
  const hex = sw.dataset.color;
  setupPlayers[_cpIndex].color = hex;
  if (_cpTarget) _cpTarget.style.background = hex;
  colorPickerEl.querySelectorAll('.cp-swatch').forEach(s =>
    s.classList.toggle('selected', s.dataset.color === hex));
  colorPickerEl.classList.add('hidden');
  _cpTarget = null; _cpIndex = -1;
});

document.addEventListener('click', e => {
  if (!colorPickerEl.classList.contains('hidden')
      && !colorPickerEl.contains(e.target)
      && !e.target.classList.contains('color-swatch-btn')) {
    colorPickerEl.classList.add('hidden');
  }
});
const AUTO_ADVANCE_DELAY = 900;
const BUST_ADVANCE_DELAY = 1500;

// ═══════════════════════════════════════════════════════
// ROUTING
// ═══════════════════════════════════════════════════════
const VIEW = new URLSearchParams(location.search).get('view') === 'display'
  ? 'display' : 'score';

function routeView() {
  document.getElementById(VIEW === 'display' ? 'view-display' : 'view-score')
    .classList.add('active');
}

// ═══════════════════════════════════════════════════════
// SHARED GAME STATE
// ═══════════════════════════════════════════════════════
let state = {
  settings:      { startScore: 301 },
  players:       {},
  rounds:        {},
  currentPlayer: null,
  currentRound:  0,
  gameOver:      false,
  winner:        null
};

function playersSorted() {
  return Object.entries(state.players || {})
    .sort((a, b) => a[1].order - b[1].order);
}

function calcAvg(p) {
  if (!p.totalDarts) return '—';
  return ((state.settings.startScore - p.currentScore) / p.totalDarts * 3).toFixed(1);
}

/** Returns last N individual dart display strings across all rounds, padded with '—' */
function lastDarts(playerKey, count = 3) {
  const rounds    = state.rounds || {};
  const roundKeys = Object.keys(rounds)
    .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
  // Flatten all individual darts for this player
  const allDarts = [];
  roundKeys.forEach(rk => {
    const entry = rounds[rk]?.[playerKey];
    if (entry?.darts) allDarts.push(...entry.darts);
  });
  const last = allDarts.slice(-count);
  while (last.length < count) last.unshift(null);
  return last.map(d => d === null ? '—' : d.display);
}

// ═══════════════════════════════════════════════════════
// STATE LISTENER  (drives both views)
// ═══════════════════════════════════════════════════════
function onStateChange(data) {
  state = { ...state, ...data };
  if (VIEW === 'display') renderDisplayView();
  else                    syncScoreView();
}

// ═══════════════════════════════════════════════════════
// ── SETUP  (score view only) ────────────────────────
// ═══════════════════════════════════════════════════════
function pickUnusedColor() {
  const used = new Set(setupPlayers.map(p => p.color));
  const free = PALETTE.filter(c => !used.has(c));
  const pool = free.length > 0 ? free : PALETTE;
  return pool[Math.floor(Math.random() * pool.length)];
}

let setupPlayers  = [{ name: '', color: PALETTE[Math.floor(Math.random() * PALETTE.length)] }];
let selectedStart = 301;
let selectedRule  = 'single';   // 'single' | 'double'

function renderSetup() {
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
      openColorPicker(e.currentTarget, i);
    });
    row.querySelector('.remove-btn')?.addEventListener('click', () => {
      setupPlayers.splice(i, 1);
      renderSetup();
    });
    list.appendChild(row);
  });
  document.getElementById('add-player-btn').style.display =
    setupPlayers.length >= 10 ? 'none' : 'flex';
}

document.getElementById('add-player-btn').addEventListener('click', () => {
  if (setupPlayers.length < 10) {
    setupPlayers.push({ name: '', color: pickUnusedColor() });
    renderSetup();
  }
});

document.getElementById('randomize-btn').addEventListener('click', () => {
  for (let i = setupPlayers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [setupPlayers[i], setupPlayers[j]] = [setupPlayers[j], setupPlayers[i]];
  }
  renderSetup();
});

document.querySelectorAll('.start-score-btn[data-score]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.start-score-btn[data-score]').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedStart = parseInt(btn.dataset.score);
  });
});

document.querySelectorAll('.start-score-btn[data-rule]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.start-score-btn[data-rule]').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedRule = btn.dataset.rule;
  });
});

document.getElementById('end-game-btn').addEventListener('click', async () => {
  // Remember player names and settings for next game
  const currentPlayers = playersSorted();
  if (currentPlayers.length) {
    setupPlayers = currentPlayers.map(([, p]) => ({ name: p.name, color: p.color || PLAYER_COLORS[p.order % PLAYER_COLORS.length] }));
  }
  // Keep selectedStart and selectedRule as they were

  // Clear game state from storage
  await writeAll({ players: {}, rounds: {}, currentPlayer: null,
                   currentRound: 0, gameOver: false, winner: null,
                   settings: { startScore: selectedStart, finishRule: selectedRule } });

  document.getElementById('winner-overlay').classList.add('hidden');

  // Reset local state
  state      = { settings: { startScore: selectedStart, finishRule: selectedRule },
                 players: {}, rounds: {}, currentPlayer: null,
                 currentRound: 0, gameOver: false, winner: null };
  advancing      = false;
  commitHistory  = [];
  resetDartUI();

  // Go back to setup screen
  document.getElementById('game-screen').style.display  = 'none';
  document.getElementById('setup-screen').style.display = 'flex';

  // Re-render setup with remembered players and restored button states
  renderSetup();

  document.querySelectorAll('.start-score-btn[data-score]').forEach(b => {
    b.classList.toggle('selected', parseInt(b.dataset.score) === selectedStart);
  });
  document.querySelectorAll('.start-score-btn[data-rule]').forEach(b => {
    b.classList.toggle('selected', b.dataset.rule === selectedRule);
  });
});

document.getElementById('start-game-btn').addEventListener('click', async () => {
  const players = {};
  setupPlayers.forEach((p, i) => {
    players[`p${i}`] = {
      name: p.name.trim() || `Player ${i + 1}`,
      color: p.color || PLAYER_COLORS[i % PLAYER_COLORS.length],
      order: i, currentScore: selectedStart, totalDarts: 0
    };
  });
  const newState = {
    settings: { startScore: selectedStart, finishRule: selectedRule }, players,
    rounds: { r0: {} }, currentPlayer: 'p0',
    currentRound: 0, gameOver: false, winner: null
  };
  await writeAll(newState);
  state = newState;
  document.getElementById('winner-overlay').classList.add('hidden');
  showGameScreen();
});

// ═══════════════════════════════════════════════════════
// ── GAME SCREEN  (score view) ───────────────────────
// ═══════════════════════════════════════════════════════
let modifier       = null;
let dartsThisVisit = [];
let isBust         = false;
let advancing      = false;
let commitHistory  = [];   // stack — every visit pushed, ⌫ pops

function showGameScreen() {
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('game-screen').style.display  = 'flex';
  resetDartUI();
  renderScoreStrip();
  updateCurrentPlayerHeader();
}

function syncScoreView() {
  const hasGame = state.players && Object.keys(state.players).length > 0;
  if (!hasGame || state.gameOver) return;
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('game-screen').style.display  = 'flex';
  renderScoreStrip();
  updateCurrentPlayerHeader();
}

function updateCurrentPlayerHeader() {
  const cp = state.players?.[state.currentPlayer];
  if (!cp) return;
  const color = cp.color || PALETTE[cp.order % PALETTE.length];
  const nameEl = document.getElementById('gs-name');
  nameEl.textContent = cp.name;
  nameEl.style.color  = color;
  document.getElementById('gs-score').textContent    = cp.currentScore;
  document.getElementById('player-color-bar').style.background = color;
}

function renderScoreStrip() {
  const strip = document.getElementById('score-strip');
  strip.innerHTML = '';
  playersSorted().forEach(([key, p]) => {
    const isActive = key === state.currentPlayer;
    const color    = p.color || PLAYER_COLORS[p.order % PLAYER_COLORS.length];
    const visits   = lastDarts(key, 3);
    const avg      = calcAvg(p);
    const row      = document.createElement('div');
    row.className  = 'score-row' + (isActive ? ' active-player' : '');
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

// ── Numpad events ──────────────────────────────────────
document.querySelectorAll('.numpad-btn[data-n]').forEach(btn => {
  btn.addEventListener('click', () => enterDart(parseInt(btn.dataset.n)));
});
document.getElementById('btn-miss').addEventListener('click', () => {
  modifier = null; clearModBtns(); enterDart(0);
});
document.getElementById('btn-bull').addEventListener('click', () => {
  const pts = modifier === 'D' ? 50 : 25;
  const lbl = modifier === 'D' ? 'Bull 50' : '25';
  modifier = null; clearModBtns();
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
document.getElementById('btn-del').addEventListener('click', handleDelete);

function clearModBtns() {
  document.getElementById('btn-dbl').classList.remove('mod-active');
  document.getElementById('btn-trpl').classList.remove('mod-active');
}

// ── Core dart logic ────────────────────────────────────
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
  clearModBtns();
  dartsThisVisit.push({ display, value });
  updateDartPreview();

  const cp    = state.players?.[state.currentPlayer];
  if (!cp) return;
  const total = dartsThisVisit.reduce((s, d) => s + d.value, 0);

  // Win on this dart
  if (total === cp.currentScore) {
    advancing = true;
    setTimeout(() => commitVisit(false), AUTO_ADVANCE_DELAY);
    return;
  }

  // Bust check — single out: only over; double out: also can't leave 1
  const isDoubleOut = state.settings?.finishRule === 'double';
  const isBustNow   = total > cp.currentScore
    || (isDoubleOut && cp.currentScore - total === 1);

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

  // Snapshot: full state + the darts being committed (for undo slot restore)
  commitHistory.push({
    state: JSON.parse(JSON.stringify(state)),
    darts: [...dartsThisVisit]
  });

  // Store individual dart objects in the round entry
  const roundEntry = { darts: dartsThisVisit.map(d => ({ display: d.display, value: d.value })), bust };

  const updates = {
    [`darts/players/${cpKey}/currentScore`]: newScore,
    [`darts/players/${cpKey}/totalDarts`]:   newDarts,
    [`darts/rounds/${roundKey}/${cpKey}`]:   roundEntry
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
    await advancePlayer();
  } catch (err) {
    console.error('Write failed, advancing locally:', err);
    advanceLocalOnly();
  } finally {
    advancing = false;
    renderScoreStrip();
    updateCurrentPlayerHeader();
  }
}

async function advancePlayer() {
  const keys    = playersSorted().map(([k]) => k);
  const idx     = keys.indexOf(state.currentPlayer);
  const nextIdx = (idx + 1) % keys.length;
  const nextKey = keys[nextIdx];
  const newRound = nextIdx === 0 ? state.currentRound + 1 : state.currentRound;

  const updates = { 'darts/currentPlayer': nextKey, 'darts/currentRound': newRound };
  if (nextIdx === 0) updates[`darts/rounds/r${newRound}`] = {};

  await patch(updates);
  resetDartUI();
}

function advanceLocalOnly() {
  // Push snapshot so undo still works even on the fallback path
  commitHistory.push({ state: JSON.parse(JSON.stringify(state)), darts: [...dartsThisVisit] });
  const keys    = playersSorted().map(([k]) => k);
  const idx     = keys.indexOf(state.currentPlayer);
  const nextIdx = (idx + 1) % keys.length;
  state.currentPlayer = keys[nextIdx];
  if (nextIdx === 0) state.currentRound += 1;
  updateCurrentPlayerHeader();
  renderScoreStrip();
  resetDartUI();
}

async function goToPreviousPlayer() {
  if (commitHistory.length === 0) return;
  const { state: snapshot, darts } = commitHistory.pop();

  try {
    await writeAll(snapshot);
  } catch (err) {
    console.error('Undo write failed:', err);
    state = snapshot;
  }
  // Restore the darts that were committed so the scorer can correct them
  dartsThisVisit = darts || [];
  isBust         = false;
  modifier       = null;
  clearModBtns();
  document.getElementById('bust-banner').classList.add('hidden');
  updateDartPreview();
  renderScoreStrip();
  updateCurrentPlayerHeader();
}

function handleDelete() {
  if (advancing) return;
  if (dartsThisVisit.length > 0) {
    dartsThisVisit.pop();
    isBust = false;
    document.getElementById('bust-banner').classList.add('hidden');
    updateDartPreview();
  } else {
    goToPreviousPlayer();
  }
}

function updateDartPreview() {
  ['d1','d2','d3'].forEach((id, i) => {
    const slot = document.getElementById(id);
    const dart = dartsThisVisit[i];
    slot.textContent = dart ? dart.display : '—';
    slot.classList.toggle('filled', !!dart);
  });
  const total = dartsThisVisit.reduce((s, d) => s + d.value, 0);
  document.getElementById('visit-total').textContent = total;

  // Live score — freeze at current value if this visit would bust
  const cp = state.players?.[state.currentPlayer];
  if (cp) {
    const isDoubleOut = state.settings?.finishRule === 'double';
    const wouldBust   = total > cp.currentScore
      || (isDoubleOut && cp.currentScore - total === 1);
    const live = wouldBust ? cp.currentScore : Math.max(0, cp.currentScore - total);
    document.getElementById('gs-score').textContent = live;
    renderScoreStripLive(total, wouldBust);
  }
}

/** Patch active player's live score and dart chips in both views — no full rebuild */
function renderScoreStripLive(visitTotal, wouldBust) {
  const cp   = state.players?.[state.currentPlayer];
  if (!cp) return;
  const live = wouldBust ? cp.currentScore : Math.max(0, cp.currentScore - visitTotal);

  // Build padded dart display array (3 slots)
  const pads = [0, 1, 2].map(i => dartsThisVisit[i]?.display ?? '—');

  // ── Score strip ──
  const activeRow = document.querySelector('#score-strip .score-row.active-player');
  if (activeRow) {
    const scoreEl = activeRow.querySelector('.sr-score');
    if (scoreEl) scoreEl.textContent = live;
    const chips = activeRow.querySelectorAll('.sr-dart');
    chips.forEach((el, i) => {
      el.textContent = pads[i];
      el.style.color = dartsThisVisit[i] ? 'var(--accent)' : '';
    });
  }

  // ── TV leaderboard ──
  const throwRow = document.querySelector('#tv-lb-list .tv-lb-row.throwing');
  if (throwRow) {
    const scoreEl = throwRow.querySelector('.tv-lb-score');
    if (scoreEl) scoreEl.textContent = live;
    const chips = throwRow.querySelectorAll('.tv-lb-dart');
    chips.forEach((el, i) => {
      el.textContent = pads[i];
      el.style.color = dartsThisVisit[i] ? 'var(--accent)' : '';
    });
  }
}

function resetDartUI() {
  dartsThisVisit = [];
  modifier       = null;
  isBust         = false;
  clearModBtns();
  document.getElementById('bust-banner').classList.add('hidden');
  updateDartPreview();
}

// ═══════════════════════════════════════════════════════
// ── DISPLAY VIEW  (TV) ──────────────────────────────
// ═══════════════════════════════════════════════════════
let burnChart = null;

function renderDisplayView() {
  if (!state.players) return;
  const hasPlayers = Object.keys(state.players).length > 0;

  // Waiting overlay — only show when no game has been started yet
  document.getElementById('waiting-overlay').classList.toggle('hidden', hasPlayers);

  if (!hasPlayers) return;

  updateTVHeader();
  renderLeaderboard();
  renderBurndown();

  if (state.gameOver && state.winner) {
    showWinner();
  } else {
    document.getElementById('winner-overlay').classList.add('hidden');
  }
}

function updateTVHeader() {
  const cp    = state.players?.[state.currentPlayer];
  const color = cp?.color || PALETTE[cp?.order % PALETTE.length] || 'var(--gold)';
  const rule  = state.settings?.finishRule === 'double' ? 'DOUBLE OUT' : 'SINGLE OUT';
  const nameEl = document.getElementById('tv-now-name');
  nameEl.textContent  = cp ? cp.name : '—';
  nameEl.style.color  = cp ? color : 'var(--gold)';
  document.getElementById('tv-round').textContent      = `ROUND ${(state.currentRound || 0) + 1}`;
  document.getElementById('tv-rule-badge').textContent = rule;
}

function renderLeaderboard() {
  const list = document.getElementById('tv-lb-list');
  list.innerHTML = '';
  playersSorted().forEach(([key, p], i) => {
    const color   = p.color || PLAYER_COLORS[p.order % PLAYER_COLORS.length];
    const visits  = lastDarts(key, 3);
    const avg     = calcAvg(p);
    const isThrow = key === state.currentPlayer;
    const row     = document.createElement('div');
    row.className = 'tv-lb-row' + (isThrow ? ' throwing' : '');
    row.style.cssText = `border-left: 4px solid ${color};`;
    row.innerHTML = `
      <div class="tv-lb-col-name">
        <span class="tv-lb-pos ${i === 0 ? 'top' : ''}">${i + 1}</span>
        <span class="tv-lb-name" style="color:${isThrow ? color : ''}">${p.name}</span>
      </div>
      <div class="tv-lb-col-darts">
        <span class="tv-lb-dart">${visits[0]}</span>
        <span class="tv-lb-dart">${visits[1]}</span>
        <span class="tv-lb-dart">${visits[2]}</span>
        <span class="tv-lb-avg-inline">⌀ ${avg}</span>
      </div>
      <div class="tv-lb-col-score">
        <span class="tv-lb-score" style="color:${color}">${p.currentScore}</span>
      </div>
    `;
    list.appendChild(row);
  });
}

function renderBurndown() {
  const rounds     = state.rounds || {};
  const startScore = state.settings?.startScore || 501;
  const roundKeys  = Object.keys(rounds)
    .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));

  const datasets = playersSorted().map(([key, p]) => {
    const color = p.color || PLAYER_COLORS[p.order % PLAYER_COLORS.length];
    let score   = startScore;
    const data  = [{ x: 0, y: startScore }];
    roundKeys.forEach((rk, ri) => {
      const entry = rounds[rk]?.[key];
      if (entry !== undefined) {
        // New format: { darts: [...], bust: bool }  /  legacy: number
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
      pointBackgroundColor: color, tension: 0.3, pointRadius: 5, borderWidth: 3
    };
  });

  const maxRound  = Math.max(roundKeys.length + 1, 5);
  const gridColor = '#2e352e';
  const tickColor = '#7a8a7a';

  if (!burnChart) {
    burnChart = new Chart(
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
              grid:  { color: gridColor }
            },
            y: {
              min: 0, max: startScore,
              title: { display: true, text: 'Score', color: tickColor, font: { size: 16 } },
              ticks: { color: tickColor, font: { size: 14 } },
              grid:  { color: gridColor }
            }
          },
          plugins: {
            legend: { labels: { color: '#e8ede8', font: { family: 'Barlow Condensed', size: 18 }, boxWidth: 24, padding: 20 } }
          }
        }
      }
    );
  } else {
    burnChart.data.datasets        = datasets;
    burnChart.options.scales.x.max = maxRound;
    burnChart.update();
  }
}

function showWinner() {
  const w = state.players?.[state.winner];
  if (!w) return;
  const color = w.color || PALETTE[w.order % PALETTE.length];
  const nameEl = document.getElementById('winner-name-txt');
  nameEl.textContent = w.name;
  nameEl.style.color = color;
  document.getElementById('winner-overlay').classList.remove('hidden');
}

// ═══════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════
routeView();
renderSetup();
// Display view starts in waiting state until game data arrives
if (VIEW === 'display') {
  const wo = document.getElementById('waiting-overlay');
  if (wo) wo.classList.remove('hidden');
}
await storageInit();
await listen(onStateChange);