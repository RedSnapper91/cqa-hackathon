// node tests/scoring.test.js — checks the checklist arithmetic from page 2 of the PDF.
import assert from 'node:assert/strict';
import { computeScore, normalizeAnswer } from '../lib/scoring.js';
import { DEFAULT_CHECKLIST } from '../lib/default-checklist.js';

const cl = DEFAULT_CHECKLIST;
const all = (over) => ({ c01: 'yes', c02: 'yes', c03: 'yes', c04: 20, c05: 'yes', c06: 10, c07: 'yes', c08: 'no', ...over });

// Perfect dialog → 100
assert.equal(computeScore(cl, all()).total, 100);

// Scale points proportional to weight: c04 = 15/20 → 15 of 20 points; c06 = 7/10 → 10.5 of 15
assert.equal(computeScore(cl, all({ c04: 15 })).total, 95);
assert.equal(computeScore(cl, all({ c06: 7 })).total, 95.5);

// N/A redistribution: c03 (20) N/A → remaining 80 scaled to 100; a "No" on c01 (10) costs 10/80*100 = 12.5
const r = computeScore(cl, all({ c03: 'na', c01: 'no' }));
assert.equal(r.total, 87.5);
assert.equal(r.rows.find((x) => x.criterion_id === 'c02').effective_weight, 18.75);

// Gross error is reported separately and does not change the points
const g = computeScore(cl, all({ c08: 'yes' }));
assert.equal(g.total, 100);
assert.equal(g.gross_error, true);

// Nothing applicable → no total
const none = { criteria: [{ id: 'a', type: 'binary', weight: 10, allow_na: true }], sections: [] };
assert.equal(computeScore(none, { a: 'na' }).total, null);

// Rounding to 2 decimals: c02 N/A, c06 = 7 → (85 - 4.5) / 85 * 100 = 94.705… → 94.71
assert.equal(computeScore(cl, all({ c02: 'na', c06: 7 })).total, 94.71);

// Answers snap to legal values; N/A only where allowed
const c04 = cl.criteria.find((c) => c.id === 'c04');
const c01 = cl.criteria.find((c) => c.id === 'c01');
assert.equal(normalizeAnswer(c04, 13), 15);
assert.equal(normalizeAnswer(c01, 'na'), null);
assert.equal(normalizeAnswer(c04, 'N/A'), 'na');

console.log('scoring: all checks passed');
