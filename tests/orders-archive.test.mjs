// Unit tests for turning a draft into history records (P15 — the owner cannot
// read code, so these tests are the safety net).
//
// What must never break:
//   - marking one supplier as placed must not touch another supplier's rows;
//   - the order is filed under the day it was PLACED, not blindly under today;
//   - a second order to the same supplier on the same day ADDS to the first
//     (replacing it would destroy the first order, because the rows are cleared
//     after archiving and the second payload only carries the forgotten items);
//   - a "stock was full, ordered 0" row must NOT be recorded as an order, or the
//     suggested par level ratchets upward forever;
//   - the one legacy weekly record still parses.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  historyDocId, isLegacyRecord, recordDate, ingredientsOf, supplierHasItems,
  buildSupplierArchive, mergeArchives, groupHistoryByDay,
} from '../js/orders/archive.js';

const SALVO = { id: 'salvo', name: 'Salvo' };
const BAKO = { id: 'bako', name: 'Bako' };

const INGREDIENTS = [
  { id: 'flour', name: 'Flour uniqua blue', supplierId: 'salvo' },
  { id: 'semola', name: 'Semola', supplierId: 'salvo' },
  { id: 'oldbag', name: 'Discontinued bag', supplierId: 'salvo', active: false },
  { id: 'nutella', name: 'Nutella 3kg', supplierId: 'bako' },
];

const NOW = new Date(2026, 6, 13, 9, 0);

test('historyDocId is the day and the supplier', () => {
  assert.equal(historyDocId('2026-07-13', 'salvo'), '2026-07-13_salvo');
});

test('ingredientsOf hides deactivated products by default, but can list them all', () => {
  assert.deepEqual(ingredientsOf('salvo', INGREDIENTS).map(i => i.id), ['flour', 'semola']);
  assert.deepEqual(
    ingredientsOf('salvo', INGREDIENTS, { activeOnly: false }).map(i => i.id),
    ['flour', 'semola', 'oldbag'],
  );
});

test('supplierHasItems is about ORDERED quantities, not stock readings', () => {
  assert.equal(supplierHasItems('salvo', INGREDIENTS, { flour: { qty: 3, stock: 0 } }), true);
  assert.equal(supplierHasItems('salvo', INGREDIENTS, { flour: { qty: 0, stock: 9 } }), false);
  assert.equal(supplierHasItems('salvo', INGREDIENTS, {}), false);
});

test('the archive holds ONLY that supplier\'s products', () => {
  const entries = {
    flour: { qty: 4, stock: 1 },
    nutella: { qty: 7, stock: 2 }, // another supplier — must not leak in
  };
  const record = buildSupplierArchive({ supplier: SALVO, ingredients: INGREDIENTS, entries, date: '2026-07-13', now: NOW });

  assert.deepEqual(record.quantities, { flour: 4 });
  assert.deepEqual(record.stock, { flour: 1 });
  assert.equal(record.supplierId, 'salvo');
  assert.equal(record.supplierName, 'Salvo'); // frozen: survives a rename or a delete
  assert.equal(record.date, '2026-07-13');
  assert.equal(record.createdAt, NOW.toISOString());
});

test('the archive uses the day it is GIVEN, so a forgotten order files under its own day', () => {
  const record = buildSupplierArchive({
    supplier: SALVO, ingredients: INGREDIENTS,
    entries: { flour: { qty: 4, stock: 0 } },
    date: '2026-07-12', // yesterday — the day the operator actually typed it
    now: NOW,           // ...even though it is being saved today
  });
  assert.equal(record.date, '2026-07-12');
});

test('a row with stock but nothing ordered is NOT an order (it would ratchet par upward)', () => {
  const record = buildSupplierArchive({
    supplier: SALVO, ingredients: INGREDIENTS,
    entries: { flour: { qty: 4, stock: 1 }, semola: { qty: 0, stock: 9 } },
    date: '2026-07-13', now: NOW,
  });
  // The stock reading is kept, but semola is absent from quantities, so the
  // suggestion engine (which filters on quantities) never counts it as an order.
  assert.deepEqual(record.quantities, { flour: 4 });
  assert.deepEqual(record.stock, { flour: 1, semola: 9 });
});

test('an empty order is no order at all', () => {
  assert.equal(buildSupplierArchive({
    supplier: SALVO, ingredients: INGREDIENTS, entries: {}, date: '2026-07-13', now: NOW,
  }), null);
  assert.equal(buildSupplierArchive({
    supplier: SALVO, ingredients: INGREDIENTS,
    entries: { flour: { qty: 0, stock: 5 } }, date: '2026-07-13', now: NOW,
  }), null);
});

test('junk quantities are clamped, never NaN or negative', () => {
  const record = buildSupplierArchive({
    supplier: SALVO, ingredients: INGREDIENTS,
    entries: { flour: { qty: '4.6', stock: -3 }, semola: { qty: 'abc', stock: 'x' } },
    date: '2026-07-13', now: NOW,
  });
  assert.deepEqual(record.quantities, { flour: 5 });
  assert.deepEqual(record.stock, { flour: 0 });
});

test('a second order the same day ADDS to the first — nothing is ever lost', () => {
  const first = buildSupplierArchive({
    supplier: SALVO, ingredients: INGREDIENTS,
    entries: { flour: { qty: 4, stock: 1 } }, date: '2026-07-13', now: NOW,
  });
  // "I forgot the semola" — and one more bag of flour.
  const second = buildSupplierArchive({
    supplier: SALVO, ingredients: INGREDIENTS,
    entries: { flour: { qty: 1, stock: 0 }, semola: { qty: 2, stock: 0 } },
    date: '2026-07-13', now: new Date(2026, 6, 13, 15, 0),
  });

  const merged = mergeArchives(first, second);
  assert.deepEqual(merged.quantities, { flour: 5, semola: 2 }); // 4 + 1
  assert.equal(merged.stock.semola, 0);
  assert.equal(merged.createdAt, first.createdAt);              // when the order started
  assert.equal(merged.updatedAt, second.updatedAt);             // when it was last touched
});

test('merging into nothing is just the new order', () => {
  const incoming = buildSupplierArchive({
    supplier: SALVO, ingredients: INGREDIENTS,
    entries: { flour: { qty: 4, stock: 1 } }, date: '2026-07-13', now: NOW,
  });
  assert.deepEqual(mergeArchives(null, incoming), incoming);
});

test('the newer stock reading wins — a measurement is not a total', () => {
  const existing = { quantities: { flour: 4 }, stock: { flour: 1 } };
  const incoming = { quantities: { flour: 1 }, stock: { flour: 6 } };
  assert.deepEqual(mergeArchives(existing, incoming).stock, { flour: 6 });
});

// ── legacy weekly records ─────────────────────────────────────────────────────

const LEGACY = {
  id: '2026-W28',
  weekStart: '2026-07-06',
  quantities: { flour: 6, nutella: 1 },
  stock: { flour: 4, nutella: 1 },
};

test('the old weekly record is recognised and still has a date', () => {
  assert.equal(isLegacyRecord(LEGACY), true);
  assert.equal(recordDate(LEGACY), '2026-07-06');
  assert.equal(isLegacyRecord({ supplierId: 'salvo', date: '2026-07-13' }), false);
  assert.equal(recordDate({ supplierId: 'salvo', date: '2026-07-13' }), '2026-07-13');
});

test('history groups by day, newest day first, suppliers by name inside a day', () => {
  const groups = groupHistoryByDay([
    { id: '2026-07-13_salvo', date: '2026-07-13', supplierId: 'salvo', supplierName: 'Salvo', quantities: { flour: 1 } },
    LEGACY,
    { id: '2026-07-13_bako', date: '2026-07-13', supplierId: 'bako', supplierName: 'Bako', quantities: { nutella: 1 } },
  ]);

  assert.deepEqual(groups.map(g => g.date), ['2026-07-13', '2026-07-06']);
  assert.deepEqual(groups[0].records.map(r => r.supplierName), ['Bako', 'Salvo']);
  assert.equal(groups[1].records.length, 1);
  assert.equal(isLegacyRecord(groups[1].records[0]), true);
});

test('a record with no date at all is dropped rather than grouped under ""', () => {
  assert.deepEqual(groupHistoryByDay([{ id: 'junk', quantities: { flour: 1 } }]), []);
  assert.deepEqual(groupHistoryByDay(null), []);
});

test('the legacy record sorts as the newest record of its own year, and no further', () => {
  // History is read with orderBy(documentId(), 'desc').limit(200) — cheap, and it
  // stays cheap as records pile up. Where the legacy id lands in that ordering is
  // not obvious, and it decides whether the record shows up at all:
  //   - against a 2026 date it wins, because the ids differ at index 5, where
  //     'W' (0x57) beats any digit. So it reads as the newest record of 2026...
  assert.ok('2026-W28' > '2026-12-31_salvo');
  assert.ok('2026-W28' > '2026-07-13_salvo');
  //   - ...but a later YEAR beats it outright (they differ at index 3 first).
  assert.ok('2027-01-05_salvo' > '2026-W28');
  // Which is why History cannot rely on the window alone to keep old records
  // reachable: it also loads older pages on demand (loadOlderHistory).
});
