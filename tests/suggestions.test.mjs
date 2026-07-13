// Unit tests for the Orders suggestion engine (P15 — the owner cannot read code,
// so these tests are the safety net). The rule (per Federico):
//   par        = average, over the recent ORDERS of that ingredient, of
//                (stock on hand + quantity ordered)
//   suggestion = round(par − current stock), floored at 0
// Hidden until 4 orders exist for that ingredient; the average uses at most the 8
// most recent. A bug here would suggest the wrong amount to order.
//
// The window counts ORDERS, not weeks: an order is one day and one supplier, and
// Caterite is ordered almost daily while Salvo is ordered on Mondays. Records
// written by the old weekly model (no `date`, only `weekStart`, every supplier
// merged) still count as one order each.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSuggestion } from '../js/orders/suggestions.js';

// One order of `id`: ordered `qty`, had `stock` on hand, placed on `date`.
const order = (date, id, qty, stock) => ({
  date,
  supplierId: 'salvo',
  quantities: { [id]: qty },
  stock: { [id]: stock },
});

// A record from the old weekly model: no date, no supplierId.
const legacyWeek = (weekStart, id, qty, stock) => ({
  weekStart,
  quantities: { [id]: qty },
  stock: { [id]: stock },
});

test('stays inactive with fewer than 4 orders, counting down', () => {
  const history = [
    order('2026-07-06', 'flour', 10, 2),
    order('2026-07-07', 'flour', 10, 2),
    order('2026-07-08', 'flour', 10, 2),
  ];
  assert.deepEqual(computeSuggestion('flour', 5, history), { active: false, ordersRemaining: 1 });
});

test('with no history at all it needs the full 4 orders', () => {
  assert.deepEqual(computeSuggestion('flour', 5, []), { active: false, ordersRemaining: 4 });
  assert.deepEqual(computeSuggestion('flour', 5, null), { active: false, ordersRemaining: 4 });
});

test('par is the average of (stock + ordered); suggestion tops up to par', () => {
  // Four orders, each level = 10 ordered + 2 stock = 12 → par 12.
  const history = [
    order('2026-07-06', 'flour', 10, 2),
    order('2026-07-13', 'flour', 10, 2),
    order('2026-07-20', 'flour', 10, 2),
    order('2026-07-27', 'flour', 10, 2),
  ];
  // Current stock 5 → order round(12 − 5) = 7.
  assert.deepEqual(computeSuggestion('flour', 5, history), { active: true, suggestion: 7, par: 12 });
});

test('the average uses only the 8 most recent orders', () => {
  const history = [];
  // The oldest order is a huge outlier that must be ignored once 8 newer ones exist.
  history.push(order('2026-05-01', 'flour', 1000, 0));
  for (let d = 1; d <= 8; d++) {
    history.push(order(`2026-07-${String(d).padStart(2, '0')}`, 'flour', 10, 0));
  }
  assert.deepEqual(computeSuggestion('flour', 0, history), { active: true, suggestion: 10, par: 10 });
});

test('orders that did not include this ingredient are not counted toward the minimum', () => {
  const history = [
    order('2026-07-06', 'flour', 10, 0),
    order('2026-07-07', 'flour', 10, 0),
    order('2026-07-08', 'flour', 10, 0),
    // An order for a different ingredient — invisible to "flour".
    order('2026-07-09', 'yeast', 5, 1),
  ];
  assert.deepEqual(computeSuggestion('flour', 0, history), { active: false, ordersRemaining: 1 });
});

test('a stock reading with nothing ordered does NOT count as an order', () => {
  // The guard rail against the par ratchet: a day the shelf was full records the
  // stock but no quantity, so `quantities` has no entry for it. Counting it would
  // feed back a level of (high stock + 0) with no downward pull, and par would
  // climb every slow week, for ever. See archive.js buildSupplierArchive.
  const history = [
    order('2026-07-06', 'flour', 10, 0),
    order('2026-07-07', 'flour', 10, 0),
    order('2026-07-08', 'flour', 10, 0),
    { date: '2026-07-09', supplierId: 'salvo', quantities: {}, stock: { flour: 40 } },
  ];
  assert.deepEqual(computeSuggestion('flour', 0, history), { active: false, ordersRemaining: 1 });
});

test('suggestion never goes negative: plenty of stock means order nothing', () => {
  const history = [
    order('2026-07-06', 'flour', 10, 2),
    order('2026-07-13', 'flour', 10, 2),
    order('2026-07-20', 'flour', 10, 2),
    order('2026-07-27', 'flour', 10, 2),
  ];
  // par 12 but 100 already in stock → order 0, not −88.
  assert.deepEqual(computeSuggestion('flour', 100, history), { active: true, suggestion: 0, par: 12 });
});

test('a junk current-stock value is treated as zero, never NaN', () => {
  const history = [
    order('2026-07-06', 'flour', 10, 0),
    order('2026-07-13', 'flour', 10, 0),
    order('2026-07-20', 'flour', 10, 0),
    order('2026-07-27', 'flour', 10, 0),
  ];
  const result = computeSuggestion('flour', 'abc', history);
  assert.equal(result.active, true);
  assert.equal(result.suggestion, 10); // round(par 10 − 0)
  assert.ok(Number.isFinite(result.suggestion));
});

test('a missing stock map defaults an order to ordered-only', () => {
  const history = [
    { date: '2026-07-06', supplierId: 's', quantities: { flour: 8 } },
    { date: '2026-07-13', supplierId: 's', quantities: { flour: 8 } },
    { date: '2026-07-20', supplierId: 's', quantities: { flour: 8 } },
    { date: '2026-07-27', supplierId: 's', quantities: { flour: 8 } },
  ];
  assert.deepEqual(computeSuggestion('flour', 0, history), { active: true, suggestion: 8, par: 8 });
});

test('old weekly records and new daily ones mix, and sort together correctly', () => {
  // The real production data: one legacy weekly record from before the change,
  // then daily per-supplier ones. The legacy record is the OLDEST here, so once 8
  // newer orders exist it drops out of the window — but until then it counts.
  const history = [
    legacyWeek('2026-07-06', 'flour', 20, 0),   // legacy: level 20
    order('2026-07-13', 'flour', 10, 0),
    order('2026-07-20', 'flour', 10, 0),
    order('2026-07-27', 'flour', 10, 0),
  ];
  // par = (20 + 10 + 10 + 10) / 4 = 12.5 → 13 after rounding the suggestion.
  assert.deepEqual(computeSuggestion('flour', 0, history), { active: true, suggestion: 13, par: 13 });
});
