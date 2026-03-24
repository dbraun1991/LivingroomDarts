// ─────────────────────────────────────────────────────────
// colors.js — palette, color picker popup
// No dependencies on other modules.
// openColorPicker receives the players array and an onPick
// callback instead of closing over setupPlayers directly.
// ─────────────────────────────────────────────────────────

// ── Palette ───────────────────────────────────────────────
// 6 columns: Red · Orange · Green · Cyan · Blue · Purple
// 5 rows: Pastel → Light → Vivid → Dark → Very Dark
// Row 6: neutrals + yellow accent  (near-black removed)

export const PALETTE = [
  // Row 1 — pastel
  '#ffcdd2','#ffe0b2','#c8e6c9','#b2ebf2','#bbdefb','#e1bee7',
  // Row 2 — light
  '#ef9a9a','#ffcc80','#a5d6a7','#80deea','#90caf9','#ce93d8',
  // Row 3 — vivid
  '#ef5350','#ffa726','#66bb6a','#26c6da','#42a5f5','#ab47bc',
  // Row 4 — dark
  '#c62828','#e65100','#2e7d32','#00838f','#1565c0','#6a1b9a',
  // Row 5 — very dark
  '#7f0000','#bf360c','#1b5e20','#006064','#0d47a1','#4a148c',
  // Row 6 — neutrals + yellow accent
  '#ffffff','#e0e0e0','#9e9e9e','#616161','#ffee58',
];

/**
 * Pick a random colour not already used by any player.
 * Falls back to the full palette if all colours are taken.
 * @param {Array<{color: string}>} players
 */
export function pickUnusedColor(players) {
  const used = new Set(players.map(p => p.color));
  const free = PALETTE.filter(c => !used.has(c));
  const pool = free.length > 0 ? free : PALETTE;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Color picker popup (singleton) ───────────────────────

const _popup = document.createElement('div');
_popup.className = 'color-picker-popup hidden';

PALETTE.forEach(hex => {
  const sw = document.createElement('button');
  sw.className = 'cp-swatch';
  sw.style.background = hex;
  sw.dataset.color = hex;
  _popup.appendChild(sw);
});

// ? tile — 36th cell, picks a random unused colour
const _randTile = document.createElement('button');
_randTile.className   = 'cp-swatch cp-random-tile';
_randTile.textContent = '?';
_randTile.title       = 'Pick a random unused colour';
_randTile.style.cssText = 'background:#424242; color:#ffffff; font-family:var(--font-head); font-size:1.1rem;';
_popup.appendChild(_randTile);

document.body.appendChild(_popup);

// Internal state
let _target  = null;   // swatch button being edited
let _index   = -1;     // player index
let _players = null;   // reference to the active players array
let _onPick  = null;   // callback(index, hex)

// ── Public API ────────────────────────────────────────────

/**
 * Open the colour picker anchored below swatchBtn.
 * @param {HTMLElement}            swatchBtn   - the button that was clicked
 * @param {number}                 playerIndex - index into players array
 * @param {Array<{color: string}>} players     - current setup players
 * @param {function(number, string): void} onPick - called with (playerIndex, hex)
 */
export function openColorPicker(swatchBtn, playerIndex, players, onPick) {
  _target  = swatchBtn;
  _index   = playerIndex;
  _players = players;
  _onPick  = onPick;

  // Mark the currently selected swatch
  _popup.querySelectorAll('.cp-swatch').forEach(sw => {
    sw.classList.toggle('selected', sw.dataset.color === players[playerIndex].color);
  });

  // Position below the swatch button, clamped to viewport
  const rect = swatchBtn.getBoundingClientRect();
  _popup.classList.remove('hidden');
  const pw = _popup.offsetWidth  || 174;
  const ph = _popup.offsetHeight || 174;
  let left = rect.left;
  let top  = rect.bottom + 6;
  if (left + pw > window.innerWidth)  left = window.innerWidth  - pw - 8;
  if (top  + ph > window.innerHeight) top  = rect.top - ph - 6;
  _popup.style.left = left + 'px';
  _popup.style.top  = top  + 'px';
}

// ── Internal event listeners ──────────────────────────────

_randTile.addEventListener('click', e => {
  e.stopPropagation();
  if (_index < 0 || !_players) return;
  _pick(pickUnusedColor(_players));
});

_popup.addEventListener('click', e => {
  const sw = e.target.closest('.cp-swatch');
  if (!sw || !sw.dataset.color || _index < 0) return;
  _popup.querySelectorAll('.cp-swatch').forEach(s =>
    s.classList.toggle('selected', s.dataset.color === sw.dataset.color));
  _pick(sw.dataset.color);
});

document.addEventListener('click', e => {
  if (!_popup.classList.contains('hidden')
      && !_popup.contains(e.target)
      && !e.target.classList.contains('color-swatch-btn')) {
    _close();
  }
});

function _pick(hex) {
  if (_onPick) _onPick(_index, hex);
  if (_target) _target.style.background = hex;
  _close();
}

function _close() {
  _popup.classList.add('hidden');
  _target = null; _index = -1; _players = null; _onPick = null;
}
