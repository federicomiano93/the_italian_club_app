// Unit tests for the Orders suggestion engine (P15 — the owner cannot read code,
// so these tests are the safety net). The rule (per Federico):
//   par        = average over recent weeks of (stock on hand + quantity ordered)
//   suggestion = round(par − current stock), floored at 0
// Hidden until 4 weeks of history exist; the average uses at most the 8 most
// recent weeks. A bug here would suggest the wrong amount to order.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSuggestion } from '../js/orders/suggestions.js';

// Build a history week for one ingredient: ordered `qty`, had `stock` on hand.
const week = (weekStart, id, qty, stock) => ({
  weekStart,
  quantities: { [id]: qty },
  stock: { [id]: stock },
});

test('stays inactive with fewer than 4 weeks of history, counting down', () => {
  const history = [
    week('2026-W01', 'flour', 10, 2),
    week('2026-W02', 'flour', 10, 2),
    week('2026-W03', 'flour', 10, 2),
  ];
  assert.deepEqual(computeSuggestion('flour', 5, history), { active: false, weeksRemaining: 1 });
});

test('with no history at all it needs the full 4 weeks', () => {
  assert.deepEqual(computeSuggestion('flour', 5, []), { active: false, weeksRemaining: 4 });
  assert.deepEqual(computeSuggestion('flour', 5, null), { active: false, weeksRemaining: 4 });
});

test('par is the average of (stock + ordered); suggestion tops up to par', () => {
  // Four weeks, each level = 10 ordered + 2 stock = 12 → par 12.
  const history = [
    week('2026-W01', 'flour', 10, 2),
    week('2026-W02', 'flour', 10, 2),
    week('2026-W03', 'flour', 10, 2),
    week('2026-W04', 'flour', 10, 2),
  ];
  // Current stock 5 → order round(12 − 5) = 7.
  assert.deepEqual(computeSuggestion('flour', 5, history), { active: true, suggestion: 7, par: 12 });
});

test('the average uses only the 8 most recent weeks', () => {
  const history = [];
  // Oldest week (W01) is a huge outlier that must be ignored once 8 newer weeks exist.
  history.push(week('2026-W01', 'flour', 1000, 0));
  for (let w = 2; w <= 9; w++) {
    history.push(week('2026-W' + String(w).padStart(2, '0'), 'flour', 10, 0));
  }
  // Recent 8 weeks (W02..W09) all level 10 → par 10; the W01 outlier is dropped.
  assert.deepEqual(computeSuggestion('flour', 0, history), { active: true, suggestion: 10, par: 10 });
});

test('weeks without this ingredient are not counted toward the 4-week minimum', () => {
  const history = [
    week('2026-W01', 'flour', 10, 0),
    week('2026-W02', 'flour', 10, 0),
    week('2026-W03', 'flour', 10, 0),
    // A week that only ordered a different ingredient — invisible to "flour".
    { weekStart: '2026-W04', quantities: { yeast: 5 }, stock: { yeast: 1 } },
  ];
  // Only 3 weeks actually mention flour → still counting down, not active.
  assert.deepEqual(computeSuggestion('flour', 0, history), { active: false, weeksRemaining: 1 });
});

test('suggestion never goes negative: plenty of stock means order nothing', () => {
  const history = [
    week('2026-W01', 'flour', 10, 2),
    week('2026-W02', 'flour', 10, 2),
    week('2026-W03', 'flour', 10, 2),
    week('2026-W04', 'flour', 10, 2),
  ];
  // par 12 but 100 already in stock → order 0, not −88.
  assert.deepEqual(computeSuggestion('flour', 100, history), { active: true, suggestion: 0, par: 12 });
});

test('a junk current-stock value is treated as zero, never NaN', () => {
  const history = [
    week('2026-W01', 'flour', 10, 0),
    week('2026-W02', 'flour', 10, 0),
    week('2026-W03', 'flour', 10, 0),
    week('2026-W04', 'flour', 10, 0),
  ];
  const result = computeSuggestion('flour', 'abc', history);
  assert.equal(result.active, true);
  assert.equal(result.suggestion, 10); // round(par 10 − 0)
  assert.ok(Number.isFinite(result.suggestion));
});

test('a missing stock map defaults each week to ordered-only', () => {
  const history = [
    { weekStart: '2026-W01', quantities: { flour: 8 } },
    { weekStart: '2026-W02', quantities: { flour: 8 } },
    { weekStart: '2026-W03', quantities: { flour: 8 } },
    { weekStart: '2026-W04', quantities: { flour: 8 } },
  ];
  // No stock recorded → level = ordered = 8 → par 8.
  assert.deepEqual(computeSuggestion('flour', 0, history), { active: true, suggestion: 8, par: 8 });
});
