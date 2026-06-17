// Unit tests for the dough-math foundation (P15 — the owner cannot read code, so
// these tests are the safety net). They lock in the rule that the configurable
// weight sum produces EXACTLY the same raw grams as the old hardcoded formulas in
// calc.js, now driven by the single address book. If a future change breaks the
// math, these fail.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  computeTarget,
  clampWeight,
  doughExtraGrams,
  getTabProducts,
  getClients,
  getClientById,
  getGroups,
  resolveGroupClients,
  isExtraDoughEnabled,
  normalizeConfig,
  WEIGHT_MIN,
  WEIGHT_MAX,
  EXTRA_MAX_G,
} from '../js/calculator-config.js';

// Helper: build a getQty(id) function from a plain { id: qty } map.
const qtyFrom = (map) => (id) => map[id] || 0;

test('focaccia target matches the legacy hardcoded formula (products only)', () => {
  const q = { 'f-pizze': 10, 'f-focacce': 5, 'f-ciabatta': 40, 'f-trayfocaccia': 3, 'f-panini': 24 };
  // Legacy: pizze*201 + focacce*181 + ciabatta*151 + tray*1800 + panini*131
  // ("extra dough" in kg is no longer a product — it is a per-tab box added in calc.js).
  const legacy = 10 * 201 + 5 * 181 + 40 * 151 + 3 * 1800 + 24 * 131;
  assert.equal(computeTarget(DEFAULT_CONFIG, 'focaccia', qtyFrom(q)), legacy);
});

test('brioche target matches the legacy hardcoded formula (products only)', () => {
  const q = { 'b-burgerbuns': 50, 'b-subrolls': 30, 'b-bun': 20, 'b-rolls': 15 };
  // Legacy: burgerbuns*81 + subrolls*121 + bun*71 + rolls*71
  const legacy = 50 * 81 + 30 * 121 + 20 * 71 + 15 * 71;
  assert.equal(computeTarget(DEFAULT_CONFIG, 'brioche', qtyFrom(q)), legacy);
});

test('doughExtraGrams: kg multiplies, grams pass through, junk is zero, capped', () => {
  assert.equal(doughExtraGrams(1, 'kg'), 1000);
  assert.equal(doughExtraGrams(1.5, 'kg'), 1500);
  assert.equal(doughExtraGrams(1500, 'g'), 1500);
  assert.equal(doughExtraGrams(0, 'g'), 0);
  assert.equal(doughExtraGrams(-5, 'g'), 0);     // never negative
  assert.equal(doughExtraGrams('abc', 'kg'), 0); // never NaN
  assert.equal(doughExtraGrams(999999, 'kg'), EXTRA_MAX_G); // extreme typo capped
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
    clients: [
      { id: 'c1', name: 'Client A', products: [{ id: 'p1', name: 'Panini', dough: 'focaccia', weight: 130, kind: 'number' }] },
      { id: 'c2', name: 'Client B', products: [{ id: 'p2', name: 'Panini', dough: 'focaccia', weight: 150, kind: 'number' }] },
    ],
  };
  const q = { p1: 10, p2: 10 };
  assert.equal(computeTarget(config, 'focaccia', qtyFrom(q)), 10 * 130 + 10 * 150);
});

test('a tab view only includes products of that dough', () => {
  // One client with products across all three doughs: each tab sees only its own.
  const config = { clients: [
    { id: 'c1', name: 'Mixed', products: [
      { id: 'pf', name: 'F', dough: 'focaccia',  weight: 100, kind: 'number' },
      { id: 'pb', name: 'B', dough: 'brioche',   weight: 200, kind: 'number' },
      { id: 'ps', name: 'S', dough: 'sourdough', weight: 300, kind: 'number' },
    ] },
  ] };
  assert.deepEqual(getTabProducts(config, 'focaccia').map(p => p.id), ['pf']);
  assert.deepEqual(getTabProducts(config, 'brioche').map(p => p.id), ['pb']);
  assert.deepEqual(getTabProducts(config, 'sourdough').map(p => p.id), ['ps']);
  // Math sums only the matching dough's products.
  const q = { pf: 1, pb: 1, ps: 1 };
  assert.equal(computeTarget(config, 'brioche', qtyFrom(q)), 200);
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
  const config = { clients: [
    { id: 'c1', name: 'X', products: [{ id: 'p1', name: 'Bad', dough: 'focaccia', weight: 'oops', kind: 'number' }] },
  ] };
  const result = computeTarget(config, 'focaccia', () => 5);
  assert.ok(Number.isFinite(result));
});

test('getTabProducts flattens the address book and tags each product with its client', () => {
  const products = getTabProducts(DEFAULT_CONFIG, 'focaccia');
  assert.equal(products.length, 5); // pizze, focacce, ciabatta, trayfocaccia, panini
  const ciabatta = products.find((p) => p.id === 'f-ciabatta');
  assert.equal(ciabatta.clientName, 'Client 1');
  assert.equal(ciabatta.kind, 'ciabatta');
});

test('getTabProducts tolerates a missing or malformed config', () => {
  assert.deepEqual(getTabProducts({}, 'focaccia'), []);
  assert.deepEqual(getTabProducts({ clients: 'oops' }, 'focaccia'), []);
  assert.deepEqual(getTabProducts(null, 'focaccia'), []);
});

test('getClientById / getGroups / resolveGroupClients on the default config', () => {
  assert.equal(getClients(DEFAULT_CONFIG).length, 4);
  assert.equal(getClientById(DEFAULT_CONFIG, 'c-client-2').name, 'Client 2');
  assert.equal(getClientById(DEFAULT_CONFIG, 'nope'), null);

  const groups = getGroups(DEFAULT_CONFIG);
  assert.equal(groups.length, 1);
  const members = resolveGroupClients(DEFAULT_CONFIG, groups[0]);
  assert.deepEqual(members.map(c => c.id), ['c-client-1', 'c-client-2', 'c-client-3']);
});

test('resolveGroupClients drops ids no longer in the address book', () => {
  const config = {
    clients: [{ id: 'c1', name: 'A', products: [] }],
    groups: [{ id: 'g1', title: 'G', clientIds: ['c1', 'ghost'] }],
  };
  assert.deepEqual(resolveGroupClients(config, config.groups[0]).map(c => c.id), ['c1']);
});

test('normalizeConfig clamps weights, repairs kind/dough and drops junk products', () => {
  const raw = { clients: [
    { id: 'c1', name: 'X', products: [
      { id: 'p1', name: 'Big', dough: 'brioche', weight: 99999, kind: 'number' }, // weight capped
      { id: 'p2', name: 'Bad', dough: 'weird',   weight: 'oops', kind: 'weird' },  // dough->focaccia, weight->MIN, kind->number
      { notAnId: true },                                                            // dropped
    ] },
  ] };
  const norm = normalizeConfig(raw);
  const client = getClientById(norm, 'c1');
  assert.equal(client.products.length, 2);
  assert.equal(client.products[0].weight, WEIGHT_MAX);
  assert.equal(client.products[0].dough, 'brioche');
  assert.equal(client.products[1].dough, 'focaccia');
  assert.equal(client.products[1].weight, WEIGHT_MIN);
  assert.equal(client.products[1].kind, 'number');
});

test('normalizeConfig prunes group client ids that no longer exist', () => {
  const raw = {
    clients: [{ id: 'c1', name: 'A', products: [] }],
    groups: [{ id: 'g1', title: 'G', clientIds: ['c1', 'gone'] }],
  };
  const norm = normalizeConfig(raw);
  assert.deepEqual(norm.groups[0].clientIds, ['c1']);
});

test('isExtraDoughEnabled defaults to true and honours an explicit false', () => {
  assert.equal(isExtraDoughEnabled(DEFAULT_CONFIG, 'focaccia'), true);
  assert.equal(isExtraDoughEnabled({}, 'brioche'), true);            // missing → shown
  assert.equal(isExtraDoughEnabled(null, 'sourdough'), true);
  assert.equal(isExtraDoughEnabled({ extraDough: { focaccia: false } }, 'focaccia'), false);
  assert.equal(isExtraDoughEnabled({ extraDough: { focaccia: false } }, 'brioche'), true);
});

test('normalizeConfig keeps extraDough flags (explicit false preserved, rest default true)', () => {
  const norm = normalizeConfig({ clients: [], extraDough: { brioche: false } });
  assert.equal(isExtraDoughEnabled(norm, 'focaccia'), true);
  assert.equal(isExtraDoughEnabled(norm, 'brioche'), false);
  assert.equal(isExtraDoughEnabled(norm, 'sourdough'), true);
});

test('normalizeConfig falls back to the default for missing/garbage input', () => {
  assert.equal(getClients(normalizeConfig(null)).length, 4);
  assert.equal(getClients(normalizeConfig('oops')).length, 4);
  assert.equal(getClients(normalizeConfig({})).length, 4);
});

test('normalizeConfig migrates the legacy per-tab + market shape into the address book', () => {
  // Old shape: same-named clients across tabs must merge; products keep their
  // dough; the market list becomes a group referencing those clients.
  const legacy = {
    focaccia: { clients: [
      { id: 'f-c1', name: 'Client 1', products: [{ id: 'f-cia', name: 'Ciabatta', weight: 151, kind: 'ciabatta' }] },
    ] },
    brioche: { clients: [
      { id: 'b-c1', name: 'Client 1', products: [{ id: 'b-bb', name: 'Burger buns', weight: 81, kind: 'number' }] },
    ] },
    market: { lists: [
      { id: 'l1', title: 'Market order', clients: [{ id: 'm-1', name: 'Client 1', products: [{ id: 'om-x', name: 'X' }] }] },
    ] },
  };
  const norm = normalizeConfig(legacy);
  // "Client 1" appears in three places -> one merged client with both products.
  assert.equal(getClients(norm).length, 1);
  const client = getClients(norm)[0];
  assert.equal(client.name, 'Client 1');
  assert.deepEqual(client.products.map(p => p.id).sort(), ['b-bb', 'f-cia']);
  assert.equal(client.products.find(p => p.id === 'f-cia').dough, 'focaccia');
  assert.equal(client.products.find(p => p.id === 'b-bb').dough, 'brioche');
  // The market list became a group pointing at the merged client.
  assert.equal(norm.groups.length, 1);
  assert.equal(norm.groups[0].title, 'Market order');
  assert.deepEqual(norm.groups[0].clientIds, [client.id]);
});

test('migration math equals the legacy formula after normalising old data', () => {
  const legacy = {
    focaccia: { clients: [
      { id: 'f-c', name: 'A', products: [{ id: 'f-pizze', name: 'Pizzas', weight: 201, kind: 'number' }] },
    ] },
  };
  const norm = normalizeConfig(legacy);
  assert.equal(computeTarget(norm, 'focaccia', qtyFrom({ 'f-pizze': 7 })), 7 * 201);
});
