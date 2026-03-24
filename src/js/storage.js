// ─────────────────────────────────────────────────────────
// storage.js — localStorage abstraction
// All game logic calls only: writeAll, patch, listen
// ─────────────────────────────────────────────────────────

const LS_KEY       = 'darts_game_state';
const CHANGE_EVENT = 'darts-changed';   // same-tab sync

// ── Public API ────────────────────────────────────────────

/** Replace entire game state atomically */
export async function writeAll(newState) {
  localStorage.setItem(LS_KEY, JSON.stringify(newState));
  _notifyChange();
}

/**
 * Apply a flat-path patch object.
 * Keys use Firebase-style paths: 'darts/players/p0/currentScore'
 * Pass null as a value to delete that key.
 */
export async function patch(updates) {
  const current = _read();
  for (const [rawPath, value] of Object.entries(updates)) {
    const parts = rawPath.replace(/^darts\//, '').split('/');
    _setPath(current, parts, value);
  }
  localStorage.setItem(LS_KEY, JSON.stringify(current));
  _notifyChange();
}

/**
 * Register a persistent state-change listener.
 * Fires immediately with the current state (if any), then on every change.
 * Works across tabs (storage event) and within the same tab (custom event).
 */
export function listen(callback) {
  const fire = () => {
    const data = _read();
    if (data && Object.keys(data).length) callback(data);
  };
  // Cross-tab: browser fires 'storage' when another tab writes
  window.addEventListener('storage', e => { if (e.key === LS_KEY) fire(); });
  // Same-tab: fired by _notifyChange() after every write
  window.addEventListener(CHANGE_EVENT, fire);
  // Initial load
  fire();
}

// ── Private helpers ───────────────────────────────────────

function _read() {
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
