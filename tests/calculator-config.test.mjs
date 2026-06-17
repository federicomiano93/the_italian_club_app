// Unit tests for the dough-math foundation (P15 — the owner cannot read code, so
// these tests are the safety net). They lock in the rule that the new, fully
// configurable weight sum produces EXACTLY the same raw grams as the old
// hardcoded formulas in calc.js. If a future change breaks the math, these fail.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  computeTarget,
  clampWeight,
  getTabProducts,
  normalizeConfig,
  WEIGHT_MIN,
  WEIGHT_MAX,
} from '../js/calculator-config.js';

// Helper: build a getQty(id) function from a plain { id: qty } map.
const qtyFrom = (map) => (id) => map[id] || 0;

test('focaccia target matches the legacy hardcoded formula', () => {
  const q = { 'f-pizze': 10, 'f-focacce': 5, 'f-ciabatta': 40, 'f-trayfocaccia': 3, 'f-panini': 24, 'f-kg': 2 };
  // Legacy: pizze*201 + focacce*181 + ciabatta*151 + tray*1800 + panini*131 + kg*1000
  const legacy = 10 * 201 + 5 * 181 + 40 * 151 + 3 * 1800 + 24 * 131 + 2 * 1000;
  assert.equal(computeTarget(DEFAULT_CONFIG, 'focaccia', qtyFrom(q)), legacy);
});

test('brioche target matches the legacy hardcoded formula', () => {
  const q = { 'b-burgerbuns': 50, 'b-subrolls': 30, 'b-bun': 20, 'b-rolls': 15, 'b-kg': 1.5 };
  // Legacy: burgerbuns*81 + subrolls*121 + bun*71 + rolls*71 + kg*1000
  const legacy = 50 * 81 + 30 * 121 + 20 * 71 + 15 * 71 + 1.5 * 1000;
  assert.equal(computeTarget(DEFAULT_CONFIG, 'brioche', qtyFrom(q)), legacy);
});

test('sourdough target matches loaves × default loaf weight (905 g)', () => {
  const q = { 's-loaf': 12 };
  assert.equal(computeTarget(DEFAULT_CONFIG, 'sourdough', qtyFrom(q)), 12 * 905);
});

test('empty quantities give zero dough', () => {
  assert.equal(computeTarget(DEFAULT_CONFIG, 'focaccia', () => 0), 0);
  assert.equal(computeTarget(DEFAULT_CONFIG, 'brioche', () => 0), 0);
  assert.equal(computeTarget(DEFAULT_CONFIG, 'sourdough', () => 0), 0);
});

test('per-client weights: same product name, different weight per client', () => {
  // The headline feature: Panini 130 g for one client, 150 g for another.
  const config = {
    focaccia: { clients: [
      { id: 'c1', name: 'Client A', products: [{ id: 'p1', name: 'Panini', weight: 130, kind: 'number' }] },
      { id: 'c2', name: 'Client B', products: [{ id: 'p2', name: 'Panini', weight: 150, kind: 'number' }] },
    ] },
  };
  const q = { p1: 10, p2: 10 };
  assert.equal(computeTarget(config, 'focaccia', qtyFrom(q)), 10 * 130 + 10 * 150);
});

test('clampWeight blocks absurd typos and non-numbers', () => {
  assert.equal(clampWeight(150), 150);
  assert.equal(clampWeight(99999), WEIGHT_MAX); // 150 -> 99999 typo is capped
  assert.equal(clampWeight(0), WEIGHT_MIN);
  assert.equal(clampWeight(-5), WEIGHT_MIN);
  assert.equal(clampWeight('abc'), WEIGHT_MIN); // never returns NaN
  assert.equal(clampWeight(undefined), WEIGHT_MIN);
});

test('computeTarget never produces NaN even with a corrupt weight', () => {
  const config = { focaccia: { clients: [
    { id: 'c1', name: 'X', products: [{ id: 'p1', name: 'Bad', weight: 'oops', kind: 'number' }] },
  ] } };
  const result = computeTarget(config, 'focaccia', () => 5);
  assert.ok(Number.isFinite(result));
});

test('getTabProducts flattens clients and tags each product with its client', () => {
  const products = getTabProducts(DEFAULT_CONFIG, 'focaccia');
  assert.equal(products.length, 6); // 2 + 1 + 1 + 1 + 1
  const ciabatta = products.find((p) => p.id === 'f-ciabatta');
  assert.equal(ciabatta.clientName, 'Client 1');
  assert.equal(ciabatta.kind, 'ciabatta');
});

test('getTabProducts tolerates a missing or malformed tab', () => {
  assert.deepEqual(getTabProducts({}, 'focaccia'), []);
  assert.deepEqual(getTabProducts({ focaccia: {} }, 'focaccia'), []);
  assert.deepEqual(getTabProducts(null, 'focaccia'), []);
});

test('normalizeConfig clamps weights and repairs malformed input', () => {
  const raw = {
    focaccia: { clients: [
      { id: 'c1', name: 'X', products: [
        { id: 'p1', name: 'Big', weight: 99999, kind: 'number' }, // capped
        { id: 'p2', name: 'Bad', weight: 'oops', kind: 'weird' },  // weight->MIN, kind->number
        { notAnId: true },                                          // dropped
      ] },
    ] },
  };
  const norm = normalizeConfig(raw);
  const products = getTabProducts(norm, 'focaccia');
  assert.equal(products.length, 2);
  assert.equal(products[0].weight, WEIGHT_MAX);
  assert.equal(products[1].weight, WEIGHT_MIN);
  assert.equal(products[1].kind, 'number');
});

test('normalizeConfig falls back to defaults for a missing tab', () => {
  const norm = normalizeConfig({ focaccia: { clients: [] } });
  // brioche/sourdough absent -> defaults restored
  assert.ok(getTabProducts(norm, 'brioche').length > 0);
  assert.ok(getTabProducts(norm, 'sourdough').length > 0);
});

test('normalizeConfig migrates the legacy single-order market into a list', () => {
  // Old Firestore shape: { title, clients }. Must become { lists: [ {title, clients} ] }
  // with the data preserved, so existing orders are not lost.
  const raw = { market: { title: 'Order', clients: [{ id: 'm1', name: 'A', products: [{ id: 'om1', name: 'X' }] }] } };
  const norm = normalizeConfig(raw);
  assert.ok(Array.isArray(norm.market.lists));
  assert.equal(norm.market.lists.length, 1);
  assert.equal(norm.market.lists[0].title, 'Order');
  assert.equal(norm.market.lists[0].clients[0].name, 'A');
  assert.equal(norm.market.lists[0].clients[0].products[0].name, 'X');
});

test('normalizeConfig keeps the new multi-list market shape', () => {
  const raw = { market: { lists: [
    { id: 'l1', title: 'Market order', clients: [{ id: 'm1', name: 'A', products: [{ id: 'om1', name: 'X' }] }] },
    { id: 'l2', title: 'Italia Restaurant', clients: [] },
  ] } };
  const norm = normalizeConfig(raw);
  assert.equal(norm.market.lists.length, 2);
  assert.equal(norm.market.lists[1].title, 'Italia Restaurant');
});

test('normalizeConfig market products carry no weight (names only)', () => {
  const raw = { market: { lists: [
    { id: 'l1', title: 'O', clients: [{ id: 'm1', name: 'A', products: [{ id: 'om1', name: 'X', weight: 999 }] }] },
  ] } };
  const norm = normalizeConfig(raw);
  const product = norm.market.lists[0].clients[0].products[0];
  assert.deepEqual(product, { id: 'om1', name: 'X' });
});

test('normalizeConfig falls back to a default market when missing/garbage', () => {
  assert.ok(normalizeConfig({}).market.lists.length > 0);
  assert.ok(normalizeConfig({ market: 'oops' }).market.lists.length > 0);
});
