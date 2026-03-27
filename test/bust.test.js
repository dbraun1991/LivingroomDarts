import { describe, it, expect, beforeEach } from 'vitest';
import { computeWouldBust, computeIsBust, onStateChange, state } from '../src/js/state.js';

// ─────────────────────────────────────────────────────────
// computeWouldBust
// ─────────────────────────────────────────────────────────

describe('computeWouldBust — single out', () => {
  it('normal dart mid-visit', () =>
    expect(computeWouldBust(60, 301, 'single')).toBe(false));

  it('exact win — NOT a bust', () =>
    expect(computeWouldBust(32, 32, 'single')).toBe(false));

  it('leaving 1 remaining — NOT a bust in single out', () =>
    expect(computeWouldBust(20, 21, 'single')).toBe(false));

  it('exceeds score — bust', () =>
    expect(computeWouldBust(22, 21, 'single')).toBe(true));

  it('no darts (liveTotal 0) — never bust', () =>
    expect(computeWouldBust(0, 1, 'single')).toBe(false));

  it('no darts against score 0 — never bust', () =>
    expect(computeWouldBust(0, 0, 'single')).toBe(false));
});

describe('computeWouldBust — double out', () => {
  it('exact win on double — NOT a bust', () =>
    expect(computeWouldBust(32, 32, 'double')).toBe(false));

  it('leaving 1 remaining — IS a bust in double out', () =>
    expect(computeWouldBust(20, 21, 'double')).toBe(true));

  it('exceeds score — bust', () =>
    expect(computeWouldBust(22, 21, 'double')).toBe(true));

  it('no darts (liveTotal 0) — never bust', () =>
    expect(computeWouldBust(0, 1, 'double')).toBe(false));
});

// ─────────────────────────────────────────────────────────
// computeIsBust — guards against stale liveDarts
// ─────────────────────────────────────────────────────────

describe('computeIsBust', () => {
  const liveDarts = (value) => ({ player: 'p0', darts: [{ value }] });

  it('real bust mid-visit', () =>
    expect(computeIsBust(true, 22, 21, 'single', liveDarts(22), 'p0')).toBe(true));

  it('liveDarts null — no bust even if score is now lower (post-commit race)', () =>
    expect(computeIsBust(true, 0, 1, 'single', null, 'p0')).toBe(false));

  it('liveDarts null after win commit — no bust', () =>
    expect(computeIsBust(true, 0, 0, 'single', null, 'p0')).toBe(false));

  it('liveDarts for a different player — no bust', () => {
    const ld = { player: 'p1', darts: [{ value: 22 }] };
    expect(computeIsBust(true, 22, 21, 'single', ld, 'p0')).toBe(false);
  });

  it('liveDarts empty darts array — no bust', () => {
    const ld = { player: 'p0', darts: [] };
    expect(computeIsBust(true, 0, 1, 'single', ld, 'p0')).toBe(false);
  });

  it('not the throwing player — no bust', () =>
    expect(computeIsBust(false, 22, 21, 'single', liveDarts(22), 'p0')).toBe(false));

  // The two specific bugs reported
  it('BUG: single out, score=1 after commit, stale liveDarts=20 — must not show bust', () =>
    expect(computeIsBust(true, 0, 1, 'single', null, 'p0')).toBe(false));

  it('BUG: win, score=0 after commit, stale liveDarts=32 — must not show bust', () =>
    expect(computeIsBust(true, 0, 0, 'single', null, 'p0')).toBe(false));
});

// ─────────────────────────────────────────────────────────
// onStateChange — deleted keys must not leave stale liveDarts
// ─────────────────────────────────────────────────────────

describe('onStateChange — liveDarts cleared when key absent', () => {
  beforeEach(() => {
    // Seed state with live darts as if a dart was just thrown
    onStateChange({
      liveDarts: { player: 'p0', darts: [{ display: '20', value: 20 }] },
    });
  });

  it('state.liveDarts is set after dart patch', () => {
    expect(state.liveDarts).not.toBeNull();
  });

  it('state.liveDarts becomes null when key is absent in next patch (simulates delete)', () => {
    // patch({liveDarts: null}) deletes the key — data arrives without liveDarts
    onStateChange({ currentPlayer: 'p0' });
    expect(state.liveDarts).toBeNull();
  });

  it('state.liveDarts stays null on subsequent patches without the key', () => {
    onStateChange({ currentPlayer: 'p0' });
    onStateChange({ currentRound: 1 });
    expect(state.liveDarts).toBeNull();
  });
});
