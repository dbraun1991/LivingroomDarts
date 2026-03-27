// ─────────────────────────────────────────────────────────
// checkouts.js — checkout suggestion lookup
// Pure data + one exported function. No DOM, no imports.
// ─────────────────────────────────────────────────────────

// Double-out checkout routes.
// Key = remaining score, value = dart sequence (string[]).
// Absent keys = impossible scores for this rule.
const DOUBLE_OUT = {
  // ── 3-dart finishes (101–170) ─────────────────────────
  170: ['T20', 'T20', 'Bull'],
  167: ['T20', 'T19', 'Bull'],
  164: ['T20', 'T18', 'Bull'],
  161: ['T20', 'T17', 'Bull'],
  160: ['T20', 'T20', 'D20'],
  158: ['T20', 'T20', 'D19'],
  157: ['T20', 'T19', 'D20'],
  156: ['T20', 'T20', 'D18'],
  155: ['T20', 'T19', 'D19'],
  154: ['T20', 'T18', 'D20'],
  153: ['T20', 'T19', 'D18'],
  152: ['T20', 'T20', 'D16'],
  151: ['T20', 'T17', 'D20'],
  150: ['T20', 'T18', 'D18'],
  149: ['T20', 'T19', 'D16'],
  148: ['T20', 'T16', 'D20'],
  147: ['T20', 'T17', 'D18'],
  146: ['T20', 'T18', 'D16'],
  145: ['T20', 'T15', 'D20'],
  144: ['T20', 'T20', 'D12'],
  143: ['T20', 'T17', 'D16'],
  142: ['T20', 'T14', 'D20'],
  141: ['T20', 'T19', 'D12'],
  140: ['T20', 'T16', 'D16'],
  139: ['T20', 'T13', 'D20'],
  138: ['T20', 'T18', 'D12'],
  137: ['T20', 'T15', 'D16'],
  136: ['T20', 'T20', 'D8'],
  135: ['T20', 'T17', 'D12'],
  134: ['T20', 'T14', 'D16'],
  133: ['T20', 'T19', 'D8'],
  132: ['T20', 'T16', 'D12'],
  131: ['T20', 'T13', 'D16'],
  130: ['T20', 'T18', 'D8'],
  129: ['T19', 'T16', 'D12'],
  128: ['T18', 'T14', 'D16'],
  127: ['T20', 'T17', 'D8'],
  126: ['T19', 'T19', 'D6'],
  125: ['T20', 'T15', 'D10'],
  124: ['T20', 'T16', 'D8'],
  123: ['T19', 'T16', 'D9'],
  122: ['T18', 'T16', 'D8'],
  121: ['T20', 'T11', 'D14'],
  120: ['T20', 'S20', 'D20'],
  119: ['T19', 'T12', 'D13'],
  118: ['T20', 'S18', 'D20'],
  117: ['T20', 'S17', 'D20'],
  116: ['T20', 'S16', 'D20'],
  115: ['T20', 'S15', 'D20'],
  114: ['T20', 'S14', 'D20'],
  113: ['T20', 'S13', 'D20'],
  112: ['T20', 'S12', 'D20'],
  111: ['T20', 'S11', 'D20'],
  110: ['T20', 'S10', 'D20'],
  109: ['T20', 'S9',  'D20'],
  108: ['T20', 'S8',  'D20'],
  107: ['T19', 'S10', 'D20'],
  106: ['T20', 'S6',  'D20'],
  105: ['T20', 'S5',  'D20'],
  104: ['T18', 'S10', 'D20'],
  103: ['T19', 'S6',  'D20'],
  102: ['T20', 'S2',  'D20'],
  101: ['T17', 'S10', 'D20'],

  // ── 2-dart finishes (62–100) ──────────────────────────
  100: ['T20', 'D20'],
   99: ['T19', 'S10', 'D16'],  // 3 darts — no 2-dart route exists
   98: ['T20', 'D19'],
   97: ['T19', 'D20'],
   96: ['T20', 'D18'],
   95: ['T19', 'D19'],
   94: ['T18', 'D20'],
   93: ['T19', 'D18'],
   92: ['T20', 'D16'],
   91: ['T17', 'D20'],
   90: ['T18', 'D18'],
   89: ['T19', 'D16'],
   88: ['T20', 'D14'],
   87: ['T17', 'D18'],
   86: ['T18', 'D16'],
   85: ['T15', 'D20'],
   84: ['T20', 'D12'],
   83: ['T17', 'D16'],
   82: ['T14', 'D20'],
   81: ['T19', 'D12'],
   80: ['T20', 'D10'],
   79: ['T13', 'D20'],
   78: ['T18', 'D12'],
   77: ['T15', 'D16'],
   76: ['T20', 'D8'],
   75: ['T17', 'D12'],
   74: ['T14', 'D16'],
   73: ['T19', 'D8'],
   72: ['T16', 'D12'],
   71: ['T13', 'D16'],
   70: ['T18', 'D8'],
   69: ['T19', 'D6'],
   68: ['T20', 'D4'],
   67: ['T17', 'D8'],
   66: ['T10', 'D18'],
   65: ['T19', 'D4'],
   64: ['T16', 'D8'],
   63: ['T13', 'D12'],
   62: ['T10', 'D16'],

  // ── 2-dart finishes (41–61, single + double) ─────────
   61: ['T15', 'D8'],
   60: ['S20', 'D20'],
   59: ['S19', 'D20'],
   58: ['S18', 'D20'],
   57: ['S17', 'D20'],
   56: ['T16', 'D4'],
   55: ['S15', 'D20'],
   54: ['S14', 'D20'],
   53: ['S13', 'D20'],
   52: ['S12', 'D20'],
   51: ['S11', 'D20'],
   49: ['S9',  'D20'],
   48: ['S8',  'D20'],
   47: ['S7',  'D20'],
   46: ['S6',  'D20'],
   45: ['S5',  'D20'],
   44: ['S4',  'D20'],
   43: ['S3',  'D20'],
   42: ['S2',  'D20'],
   41: ['S1',  'D20'],

  // ── 1-dart finishes (doubles + bull) ─────────────────
   50: ['Bull'],
   40: ['D20'],
   38: ['D19'],
   36: ['D18'],
   34: ['D17'],
   32: ['D16'],
   30: ['D15'],
   28: ['D14'],
   26: ['D13'],
   24: ['D12'],
   22: ['D11'],
   20: ['D10'],
   18: ['D9'],
   16: ['D8'],
   14: ['D7'],
   12: ['D6'],
   10: ['D5'],
    8: ['D4'],
    6: ['D3'],
    4: ['D2'],
    2: ['D1'],

  // ── 2-dart finishes (odd numbers, single → double) ───
   39: ['S7', 'D16'],
   37: ['S5', 'D16'],
   35: ['S3', 'D16'],
   33: ['S1', 'D16'],
   31: ['S7', 'D12'],
   29: ['S1', 'D14'],
   27: ['S3', 'D12'],
   25: ['S1', 'D12'],
   23: ['S7', 'D8'],
   21: ['S1', 'D10'],
   19: ['S3', 'D8'],
   17: ['S1', 'D8'],
   15: ['S7', 'D4'],
   13: ['S1', 'D6'],
   11: ['S3', 'D4'],
    9: ['S1', 'D4'],
    7: ['S3', 'D2'],
    5: ['S1', 'D2'],
    3: ['S1', 'D1'],
};

// Single-out inherits all double-out routes (hitting a double to finish is still legal),
// with overrides where single-out has a shorter or simpler route.
const SINGLE_OUT = {
  ...DOUBLE_OUT,

  // Scores newly reachable in single-out (impossible in double-out)
  168: ['T20', 'T20', 'T16'],
  162: ['T20', 'T18', 'T16'],
  159: ['T20', 'T19', 'T14'],

  // 1-dart triple finishes for multiples of 3 (21–60)
  // Saves a dart vs the double-out single+double routes
   60: ['T20'],
   57: ['T19'],
   54: ['T18'],
   51: ['T17'],
   48: ['T16'],
   45: ['T15'],
   42: ['T14'],
   39: ['T13'],
   36: ['T12'],
   33: ['T11'],
   30: ['T10'],
   27: ['T9'],
   24: ['T8'],
   21: ['T7'],

  // 1-dart single finishes for 1–20
   20: ['S20'],
   19: ['S19'],
   18: ['S18'],
   17: ['S17'],
   16: ['S16'],
   15: ['S15'],
   14: ['S14'],
   13: ['S13'],
   12: ['S12'],
   11: ['S11'],
   10: ['S10'],
    9: ['S9'],
    8: ['S8'],
    7: ['S7'],
    6: ['S6'],
    5: ['S5'],
    4: ['S4'],
    3: ['S3'],
    2: ['S2'],
    1: ['S1'],

  // Outer Bull — 1-dart finish for 25 (vs 2-dart S1+D12 in double-out)
   25: ['OB'],
};

/**
 * Returns the checkout dart sequence for the given remaining score,
 * darts left in the visit, and finish rule.
 *
 * @param {number} score       - Current remaining score (after any darts thrown this visit)
 * @param {number} dartsLeft   - Darts remaining this visit (1–3)
 * @param {string} finishRule  - 'single' | 'double'
 * @returns {string[] | null}  - e.g. ['T20', 'D20'], or null if no checkout possible
 */
export function getCheckout(score, dartsLeft, finishRule) {
  if (score <= 0 || score > 170) return null;
  const table = finishRule === 'double' ? DOUBLE_OUT : SINGLE_OUT;
  const route = table[score];
  if (!route) return null;                    // impossible score for this rule
  if (route.length > dartsLeft) return null;  // checkout needs more darts than remain
  return route;
}
