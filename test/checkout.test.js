import { describe, it, expect } from 'vitest';
import { getCheckout } from '../src/js/checkouts.js';

// ─────────────────────────────────────────────────────────
// Boundary / guard cases
// ─────────────────────────────────────────────────────────

describe('getCheckout — boundary guards', () => {
  it('score 0 → null', () =>
    expect(getCheckout(0, 3, 'double')).toBeNull());

  it('score > 170 → null', () =>
    expect(getCheckout(171, 3, 'double')).toBeNull());

  it('dartsLeft 0 → null (no room)', () =>
    expect(getCheckout(40, 0, 'double')).toBeNull());
});

// ─────────────────────────────────────────────────────────
// Impossible scores — double out
// ─────────────────────────────────────────────────────────

describe('getCheckout — impossible scores (double out)', () => {
  it('169 → null', () => expect(getCheckout(169, 3, 'double')).toBeNull());
  it('168 → null', () => expect(getCheckout(168, 3, 'double')).toBeNull());
  it('166 → null', () => expect(getCheckout(166, 3, 'double')).toBeNull());
  it('165 → null', () => expect(getCheckout(165, 3, 'double')).toBeNull());
  it('163 → null', () => expect(getCheckout(163, 3, 'double')).toBeNull());
  it('162 → null', () => expect(getCheckout(162, 3, 'double')).toBeNull());
  it('159 → null', () => expect(getCheckout(159, 3, 'double')).toBeNull());
  it('1   → null', () => expect(getCheckout(1,   3, 'double')).toBeNull());
});

// ─────────────────────────────────────────────────────────
// Scores newly possible in single out
// ─────────────────────────────────────────────────────────

describe('getCheckout — single-out unlocks', () => {
  it('168 single → T20 T20 T16', () =>
    expect(getCheckout(168, 3, 'single')).toEqual(['T20', 'T20', 'T16']));

  it('162 single → T20 T18 T16', () =>
    expect(getCheckout(162, 3, 'single')).toEqual(['T20', 'T18', 'T16']));

  it('159 single → T20 T19 T14', () =>
    expect(getCheckout(159, 3, 'single')).toEqual(['T20', 'T19', 'T14']));

  it('169 single → null (still impossible)', () =>
    expect(getCheckout(169, 3, 'single')).toBeNull());

  it('1 single → S1 (1 dart)', () =>
    expect(getCheckout(1, 1, 'single')).toEqual(['S1']));

  it('1 single — needs 1 dart, dartsLeft 0 → null', () =>
    expect(getCheckout(1, 0, 'single')).toBeNull());
});

// ─────────────────────────────────────────────────────────
// dartsLeft filtering
// ─────────────────────────────────────────────────────────

describe('getCheckout — dartsLeft filtering', () => {
  it('170 with 3 darts → route returned', () =>
    expect(getCheckout(170, 3, 'double')).toEqual(['T20', 'T20', 'Bull']));

  it('170 with 2 darts → null (needs 3)', () =>
    expect(getCheckout(170, 2, 'double')).toBeNull());

  it('99 with 3 darts → T19 S10 D16', () =>
    expect(getCheckout(99, 3, 'double')).toEqual(['T19', 'S10', 'D16']));

  it('99 with 2 darts → null (needs 3)', () =>
    expect(getCheckout(99, 2, 'double')).toBeNull());

  it('40 with 1 dart → D20', () =>
    expect(getCheckout(40, 1, 'double')).toEqual(['D20']));

  it('60 with 2 darts double → S20 D20', () =>
    expect(getCheckout(60, 2, 'double')).toEqual(['S20', 'D20']));

  it('60 with 1 dart double → null (needs 2)', () =>
    expect(getCheckout(60, 1, 'double')).toBeNull());

  it('60 with 1 dart single → T20 (1-dart override)', () =>
    expect(getCheckout(60, 1, 'single')).toEqual(['T20']));
});

// ─────────────────────────────────────────────────────────
// Single-out 1-dart overrides
// ─────────────────────────────────────────────────────────

describe('getCheckout — single-out 1-dart finishes', () => {
  it('21 double (2 darts) → S1 D10', () =>
    expect(getCheckout(21, 2, 'double')).toEqual(['S1', 'D10']));

  it('21 single (1 dart) → T7', () =>
    expect(getCheckout(21, 1, 'single')).toEqual(['T7']));

  it('25 double → S1 D12 (2 darts)', () =>
    expect(getCheckout(25, 2, 'double')).toEqual(['S1', 'D12']));

  it('25 double with 1 dart → null', () =>
    expect(getCheckout(25, 1, 'double')).toBeNull());

  it('25 single (1 dart) → OB', () =>
    expect(getCheckout(25, 1, 'single')).toEqual(['OB']));

  it('20 double → D10 (1 dart)', () =>
    expect(getCheckout(20, 1, 'double')).toEqual(['D10']));

  it('20 single → S20 (1 dart)', () =>
    expect(getCheckout(20, 1, 'single')).toEqual(['S20']));

  it('50 single → Bull (unchanged from double)', () =>
    expect(getCheckout(50, 1, 'single')).toEqual(['Bull']));
});

// ─────────────────────────────────────────────────────────
// Spot-checks from the full table
// ─────────────────────────────────────────────────────────

describe('getCheckout — table spot-checks', () => {
  it('167 double → T20 T19 Bull', () =>
    expect(getCheckout(167, 3, 'double')).toEqual(['T20', 'T19', 'Bull']));

  it('100 double → T20 D20', () =>
    expect(getCheckout(100, 2, 'double')).toEqual(['T20', 'D20']));

  it('2 double → D1', () =>
    expect(getCheckout(2, 1, 'double')).toEqual(['D1']));

  it('3 double → S1 D1', () =>
    expect(getCheckout(3, 2, 'double')).toEqual(['S1', 'D1']));

  it('40 single → D20 (inherits double-out route)', () =>
    expect(getCheckout(40, 1, 'single')).toEqual(['D20']));
});
