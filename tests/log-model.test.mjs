// Unit tests for the new log data model (P15 — the owner cannot read code, so
// these are the safety net for the irreversible parts: the append-only version
// chain, the no-loss migration, and the sheet math).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOUGHS, FOR_DAYS,
  buildSheet, buildLogText,
  createLog, latestVersion, addVersion, restoreVersion,
  migrateOldRecord, migrateOldLogs, sortLogs,
} from '../js/log-model.js';
import { computeTarget, DEFAULT_CONFIG } from '../js/calculator-config.js';

// Recipes are defined inline here (not imported from recipes.js, which reads
// localStorage on import and cannot load under Node — same reason the dough-math
// test inlines its data). These mirror RECIPE_DEFAULTS in js/recipes.js.
const RECIPE_DEFAULTS = {
  focaccia: { flourBlu: 278, flourT65: 278, malt: 3, sugar: 8, salt: 11, yeast: 3.6, oil: 56, water1: 334, water2: 24 },
  brioche: { flour: 3185, yeast: 127.4, water: 1575 },
  sourdough: { flourBlu: 2560, flourT65: 2560, flourWhole: 570, water1: 3800, starter: 1024, malt: 30, salt: 124, water2: 300 },
};
const FOCACCIA = RECIPE_DEFAULTS.focaccia;

function mkVersion(over = {}) {
  return {
    calculatedBy: 'Mario', at: { date: 'Monday 09 June', time: '2:05 PM' },
    kind: 'create', items: [], occasional: [], sheet: null, text: '', ...over,
  };
}

// ── buildSheet ────────────────────────────────────────────────────────────────
test('buildSheet: total = Σ qty×weightG + extra', () => {
  const sheet = buildSheet({
    dough: 'Focaccia', recipe: FOCACCIA, param: 0.65, extraGrams: 100,
    items: [
      { id: 'a', name: 'Pizzas', qty: 2, weightG: 200 },   // 400
      { id: 'b', name: 'Focaccias', qty: 3, weightG: 100 }, // 300
    ],
  });
  assert.equal(sheet.total_g, 800); // 400 + 300 + 100
  assert.equal(sheet.extra_g, 100);
  assert.equal(sheet.dough, 'Focaccia');
  assert.equal(sheet.param.label, 'Yeast %');
});

test('buildSheet: ingredient grams sum exactly to the rounded total', () => {
  const sheet = buildSheet({
    dough: 'Focaccia', recipe: FOCACCIA, param: 0.65,
    items: [{ id: 'a', name: 'X', qty: 10, weightG: 151 }],
  });
  const sum = sheet.ingredients.reduce((s, r) => s + r.grams, 0);
  assert.equal(sum, sheet.total_g);
  assert.equal(sheet.ingredients.length, 9);
});

test('buildSheet: zero total produces zero ingredients, no NaN', () => {
  const sheet = buildSheet({ dough: 'Brioche', recipe: RECIPE_DEFAULTS.brioche, param: 4, items: [] });
  assert.equal(sheet.total_g, 0);
  assert.ok(sheet.ingredients.every(r => r.grams === 0));
});

test('buildSheet: matches the live computeTarget for the same quantities', () => {
  // One Pizzas (201g) × 4 + one Focaccias (181g) × 2 via the config helper.
  const getQty = (id) => ({ 'f-pizze': 4, 'f-focacce': 2 }[id] || 0);
  const target = computeTarget(DEFAULT_CONFIG, 'focaccia', getQty);
  const sheet = buildSheet({
    dough: 'Focaccia', recipe: FOCACCIA, param: 0.65,
    items: [
      { id: 'f-pizze', name: 'Pizzas', qty: 4, weightG: 201 },
      { id: 'f-focacce', name: 'Focaccias', qty: 2, weightG: 181 },
    ],
  });
  assert.equal(sheet.total_g, Math.round(target));
});

test('buildSheet: divisor splits only included lines with a quantity', () => {
  const sheet = buildSheet({
    dough: 'Focaccia', recipe: FOCACCIA, param: 0.65,
    items: [
      { id: 'a', name: 'Ciabatta', qty: 40, weightG: 150 }, // 6000
      { id: 'b', name: 'Pizzas', qty: 1, weightG: 200 },
    ],
    divisor: { includedIds: ['a'], n: 3 },
  });
  assert.deepEqual(sheet.divisor.names, ['Ciabatta']);
  assert.equal(sheet.divisor.total, 6000);
  assert.equal(sheet.divisor.n, 3);
  assert.equal(sheet.divisor.result, 2000);
});

test('buildSheet: crate boxes only for opted-in lines with a quantity', () => {
  const sheet = buildSheet({
    dough: 'Focaccia', recipe: FOCACCIA, param: 0.65,
    items: [
      { id: 'a', name: 'Ciabatta', qty: 40, weightG: 150, crate: { show: true, perBox: 20 } },
      { id: 'b', name: 'Pizzas', qty: 0, weightG: 200, crate: { show: true, perBox: 10 } },
      { id: 'c', name: 'Plain', qty: 5, weightG: 100 },
    ],
  });
  assert.equal(sheet.crates.length, 1);
  assert.equal(sheet.crates[0].name, 'Ciabatta');
  assert.equal(sheet.crates[0].count, 2);       // 40 / 20
  assert.equal(sheet.crates[0].eachBoxG, 3000); // 20 × 150
});

// ── buildLogText ──────────────────────────────────────────────────────────────
test('buildLogText: groups by client, adds occasional and extra', () => {
  const text = buildLogText(
    [
      { name: 'Pizzas', clientName: 'Bakery', qty: 2, kind: 'number' },
      { name: 'Focaccias', clientName: 'Bakery', qty: 0, kind: 'number' }, // skipped (0)
      { name: 'Ciabatta', clientName: 'Client 1', qty: 40, kind: 'dropdown' },
    ],
    [{ name: 'Walk-in', products: [{ name: 'Special', qty: 3, unit: 'pz' }] }],
    { grams: 1000, value: 1, unit: 'kg' },
  );
  assert.ok(text.includes('Bakery:'));
  assert.ok(text.includes('  Pizzas: 2 pz'));
  assert.ok(!text.includes('Focaccias')); // zero qty omitted
  assert.ok(text.includes('Client 1:'));
  assert.ok(text.includes('  Ciabatta: 40 pz'));
  assert.ok(text.includes('Walk-in:'));
  assert.ok(text.includes('  Special: 3 pz'));
  assert.ok(text.includes('Extra dough: 1 kg'));
});

// ── lifecycle / append-only ───────────────────────────────────────────────────
test('createLog: one version, sane defaults, bad input clamped', () => {
  const log = createLog({ id: 'L1', dough: 'Nope', forDay: 'whenever', version: mkVersion(), createdAtMs: 5 });
  assert.equal(log.dough, 'Focaccia');   // invalid dough → default
  assert.equal(log.forDay, 'today');     // invalid forDay → default
  assert.equal(log.bakery, 'main');
  assert.equal(log.versions.length, 1);
  assert.equal(latestVersion(log).calculatedBy, 'Mario');
});

test('addVersion: append-only, previous versions preserved, original not mutated', () => {
  const log = createLog({ id: 'L1', dough: 'Focaccia', forDay: 'today', version: mkVersion({ text: 'v1' }), createdAtMs: 1 });
  const log2 = addVersion(log, mkVersion({ text: 'v2', kind: 'edit' }));
  assert.equal(log.versions.length, 1);          // original unchanged
  assert.equal(log2.versions.length, 2);
  assert.equal(log2.versions[0].text, 'v1');     // history preserved
  assert.equal(latestVersion(log2).text, 'v2');
  // mutating the returned log must not affect the source version object
  log2.versions[0].text = 'HACKED';
  assert.equal(log.versions[0].text, 'v1');
});

test('restoreVersion: appends a copy on top, never truncates history', () => {
  let log = createLog({ id: 'L1', dough: 'Focaccia', forDay: 'today', version: mkVersion({ text: 'v1' }), createdAtMs: 1 });
  log = addVersion(log, mkVersion({ text: 'v2', kind: 'edit' }));
  log = addVersion(log, mkVersion({ text: 'v3', kind: 'edit' }));
  // restore the FIRST version (index 0)
  const restored = restoreVersion(log, 0, { calculatedBy: 'Restorer', at: { date: 'Tue', time: '9:00 AM' } });
  assert.equal(restored.versions.length, 4);              // nothing removed
  assert.equal(latestVersion(restored).text, 'v1');       // content of v1 on top
  assert.equal(latestVersion(restored).kind, 'restore');
  assert.equal(latestVersion(restored).restoredFrom, 0);
  assert.equal(latestVersion(restored).calculatedBy, 'Restorer');
  assert.deepEqual(restored.versions.map(v => v.text), ['v1', 'v2', 'v3', 'v1']);
});

test('restoreVersion: out-of-range index is a no-op (clone returned)', () => {
  const log = createLog({ id: 'L1', dough: 'Focaccia', forDay: 'today', version: mkVersion(), createdAtMs: 1 });
  const r = restoreVersion(log, 9, { calculatedBy: 'x', at: {} });
  assert.equal(r.versions.length, 1);
});

// ── migration (no loss) ───────────────────────────────────────────────────────
test('migrateOldRecord: preserves text, marks legacy, keeps timestamp', () => {
  const rec = { dough: 'Brioche', date: 'Monday 09 June', time: '2:05 PM', text: 'Bakery:\n  Buns: 10 pz' };
  const log = migrateOldRecord(rec, { id: 'm1', createdAtMs: 42 });
  assert.equal(log.dough, 'Brioche');
  assert.equal(log.versions.length, 1);
  const v = latestVersion(log);
  assert.equal(v.legacy, true);
  assert.equal(v.text, 'Bakery:\n  Buns: 10 pz');
  assert.equal(v.at.date, 'Monday 09 June');
});

test('migrateOldLogs: every old record becomes exactly one log (no loss)', () => {
  const recs = [
    { dough: 'Focaccia', date: 'd1', time: 't1', text: 'a' },
    { dough: 'Brioche', date: 'd2', time: 't2', text: 'b' },
    { dough: 'Sourdough', date: 'd3', time: 't3', text: 'c' },
  ];
  const logs = migrateOldLogs(recs, (r, i) => 'mig-' + i, 1000);
  assert.equal(logs.length, 3);
  assert.deepEqual(logs.map(l => l.dough), ['Focaccia', 'Brioche', 'Sourdough']);
  assert.deepEqual(logs.map(l => latestVersion(l).text), ['a', 'b', 'c']);
  assert.ok(logs.every(l => latestVersion(l).legacy === true));
});

test('sortLogs: newest first by createdAtMs', () => {
  const mk = (id, ms) => createLog({ id, dough: 'Focaccia', forDay: 'today', version: mkVersion(), createdAtMs: ms });
  const sorted = sortLogs([mk('a', 1), mk('c', 3), mk('b', 2)]);
  assert.deepEqual(sorted.map(l => l.id), ['c', 'b', 'a']);
});

test('exports: dough and day constants', () => {
  assert.deepEqual(DOUGHS, ['Focaccia', 'Brioche', 'Sourdough']);
  assert.deepEqual(FOR_DAYS, ['today', 'tomorrow']);
});
