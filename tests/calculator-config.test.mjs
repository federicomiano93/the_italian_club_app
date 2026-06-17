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
  getWhatsappLists,
  getProductById,
  getAllProducts,
  resolveListClients,
  isExtraDoughEnabled,
  normalizeConfig,
  getDivisorProducts,
  getDivisorIncluded,
  isInDivisor,
  divisorTotal,
  splitDough,
  clampCratePerBox,
  isCrateEnabled,
  getCratePerBox,
  crateCount,
  CRATE_PERBOX_MIN,
  CRATE_PERBOX_MAX,
  CRATE_PERBOX_DEFAULT,
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
  assert.equal(ciabatta.kind, 'dropdown');
});

test('normalizeConfig migrates legacy kinds: ciabatta->dropdown, panini->number', () => {
  const raw = { clients: [
    { id: 'c1', name: 'X', products: [
      { id: 'p1', name: 'Ciabatta', dough: 'focaccia', weight: 151, kind: 'ciabatta' },
      { id: 'p2', name: 'Panini',   dough: 'focaccia', weight: 131, kind: 'panini' },
      { id: 'p3', name: 'Plain',    dough: 'focaccia', weight: 100, kind: 'number' },
    ] },
  ] };
  const products = getClientById(normalizeConfig(raw), 'c1').products;
  assert.equal(products[0].kind, 'dropdown'); // ciabatta widget preserved as a dropdown
  assert.equal(products[1].kind, 'number');   // panini was only ever a plain number field
  assert.equal(products[2].kind, 'number');
});

test('getTabProducts tolerates a missing or malformed config', () => {
  assert.deepEqual(getTabProducts({}, 'focaccia'), []);
  assert.deepEqual(getTabProducts({ clients: 'oops' }, 'focaccia'), []);
  assert.deepEqual(getTabProducts(null, 'focaccia'), []);
});

test('getClientById / getWhatsappLists / resolveListClients on the default config', () => {
  assert.equal(getClients(DEFAULT_CONFIG).length, 4);
  assert.equal(getClientById(DEFAULT_CONFIG, 'c-client-2').name, 'Client 2');
  assert.equal(getClientById(DEFAULT_CONFIG, 'nope'), null);

  const lists = getWhatsappLists(DEFAULT_CONFIG);
  assert.equal(lists.length, 1);
  assert.equal(lists[0].title, 'Market order');
  const resolved = resolveListClients(DEFAULT_CONFIG, lists[0]);
  assert.deepEqual(resolved.map(r => r.client.id), ['c-client-1', 'c-client-2', 'c-client-3']);
  // Each client entry resolves to real product objects, names from the address book.
  const client1 = resolved.find(r => r.client.id === 'c-client-1');
  assert.deepEqual(client1.products.map(p => p.id), ['f-ciabatta', 'b-burgerbuns', 'b-subrolls']);
});

test('a WhatsApp list can attach a product owned by ANOTHER client (decoupled)', () => {
  // The whole point: Client B's WhatsApp entry shows a product that, in the address
  // book, belongs to Client A — without Client B having that dough product itself.
  const config = {
    clients: [
      { id: 'cA', name: 'A', products: [{ id: 'pA', name: 'Loaf', dough: 'sourdough', weight: 900, kind: 'number' }] },
      { id: 'cB', name: 'B', products: [{ id: 'pB', name: 'Panini', dough: 'focaccia', weight: 130, kind: 'number' }] },
    ],
    whatsappLists: [
      { id: 'wl1', title: 'Order', clients: [{ clientId: 'cB', products: ['pB', 'pA'] }] },
    ],
  };
  const resolved = resolveListClients(config, config.whatsappLists[0]);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].client.name, 'B');
  // B's WhatsApp entry carries B's own Panini AND A's Loaf — the cross-client link.
  assert.deepEqual(resolved[0].products.map(p => p.name), ['Panini', 'Loaf']);
});

test('getProductById finds a product across all clients; getAllProducts tags owners', () => {
  assert.equal(getProductById(DEFAULT_CONFIG, 's-loaf').name, 'Loaf');
  assert.equal(getProductById(DEFAULT_CONFIG, 'nope'), null);
  const all = getAllProducts(DEFAULT_CONFIG);
  assert.equal(all.length, 10); // every product across the four default clients
  const loaf = all.find(p => p.id === 's-loaf');
  assert.equal(loaf.ownerClientId, 'c-client-2');
  assert.equal(loaf.ownerClientName, 'Client 2');
});

test('resolveListClients drops a deleted client and prunes deleted product ids', () => {
  const config = {
    clients: [{ id: 'c1', name: 'A', products: [{ id: 'p1', name: 'X', dough: 'focaccia', weight: 100, kind: 'number' }] }],
    whatsappLists: [{ id: 'wl1', title: 'L', clients: [
      { clientId: 'c1', products: ['p1', 'ghost'] }, // ghost product pruned
      { clientId: 'gone', products: ['p1'] },         // deleted client dropped entirely
    ] }],
  };
  const resolved = resolveListClients(config, config.whatsappLists[0]);
  assert.deepEqual(resolved.map(r => r.client.id), ['c1']);
  assert.deepEqual(resolved[0].products.map(p => p.id), ['p1']);
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

test('normalizeConfig prunes WhatsApp list entries for clients/products that no longer exist', () => {
  const raw = {
    clients: [{ id: 'c1', name: 'A', products: [{ id: 'p1', name: 'X', dough: 'focaccia', weight: 100, kind: 'number' }] }],
    whatsappLists: [{ id: 'wl1', title: 'L', clients: [
      { clientId: 'c1', products: ['p1', 'ghost'] }, // ghost product id pruned
      { clientId: 'gone', products: ['p1'] },         // deleted client entry dropped
    ] }],
  };
  const norm = normalizeConfig(raw);
  assert.equal(norm.whatsappLists[0].clients.length, 1);
  assert.deepEqual(norm.whatsappLists[0].clients[0], { clientId: 'c1', products: ['p1'] });
});

test('normalizeConfig migrates the legacy `groups` shape into independent lists', () => {
  // An old document still carrying `groups` (client ids only): each client entry
  // is seeded with that client's current products, reproducing the old message.
  const raw = {
    clients: [
      { id: 'c1', name: 'A', products: [
        { id: 'p1', name: 'X', dough: 'focaccia', weight: 100, kind: 'number' },
        { id: 'p2', name: 'Y', dough: 'brioche',  weight: 80,  kind: 'number' },
      ] },
      { id: 'c2', name: 'B', products: [{ id: 'p3', name: 'Z', dough: 'sourdough', weight: 900, kind: 'number' }] },
    ],
    groups: [{ id: 'g1', title: 'Market order', clientIds: ['c1', 'c2'] }],
  };
  const norm = normalizeConfig(raw);
  assert.equal(norm.groups, undefined);            // legacy field gone
  assert.equal(norm.whatsappLists.length, 1);
  assert.equal(norm.whatsappLists[0].title, 'Market order');
  assert.deepEqual(norm.whatsappLists[0].clients, [
    { clientId: 'c1', products: ['p1', 'p2'] },
    { clientId: 'c2', products: ['p3'] },
  ]);
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
  // The market list became an independent WhatsApp list: one client entry pointing
  // at the merged client, seeded with that client's products.
  assert.equal(norm.whatsappLists.length, 1);
  assert.equal(norm.whatsappLists[0].title, 'Market order');
  assert.equal(norm.whatsappLists[0].clients.length, 1);
  assert.equal(norm.whatsappLists[0].clients[0].clientId, client.id);
  assert.deepEqual(norm.whatsappLists[0].clients[0].products.sort(), ['b-bb', 'f-cia']);
});

// ── Divisor (display-only crate split) ────────────────────────────────────────

test('divisor includes NOTHING by default (opt-in): no product is split until ticked', () => {
  const q = { 'f-pizze': 10, 'f-focacce': 5, 'f-ciabatta': 40, 'f-trayfocaccia': 3, 'f-panini': 24 };
  // Default config has an empty divisorIncluded → no product is in the divisor.
  assert.equal(divisorTotal(DEFAULT_CONFIG, 'focaccia', qtyFrom(q)), 0);
  assert.equal(getDivisorProducts(DEFAULT_CONFIG, 'focaccia').length, 0);
  assert.equal(isInDivisor(DEFAULT_CONFIG, 'focaccia', 'f-panini'), false);
});

test('only ticked products are summed by the divisor; the dough math is untouched', () => {
  const config = {
    clients: [{ id: 'c1', name: 'X', products: [
      { id: 'p1', name: 'Panini', dough: 'focaccia', weight: 100, kind: 'number' },
      { id: 'p2', name: 'Pizza',  dough: 'focaccia', weight: 200, kind: 'number' },
    ] }],
    divisorIncluded: { focaccia: ['p1'], brioche: [], sourdough: [] },
  };
  const q = { p1: 10, p2: 10 };
  // Divisor sums only the ticked p1; computeTarget still sums both products.
  assert.equal(divisorTotal(config, 'focaccia', qtyFrom(q)), 10 * 100);
  assert.equal(computeTarget(config, 'focaccia', qtyFrom(q)), 10 * 100 + 10 * 200);
  assert.equal(isInDivisor(config, 'focaccia', 'p1'), true);
  assert.equal(isInDivisor(config, 'focaccia', 'p2'), false);
  assert.deepEqual(getDivisorProducts(config, 'focaccia').map(p => p.id), ['p1']);
});

test('splitDough divides into crates, and is safe at the edges', () => {
  assert.equal(splitDough(3000, 2), 1500);
  assert.equal(splitDough(5000, 4), 1250);
  assert.equal(splitDough(3000, 0), 0);    // 0 crates → no split
  assert.equal(splitDough(3000, -1), 0);   // never negative parts
  assert.equal(splitDough('abc', 2), 0);   // never NaN
  assert.equal(splitDough(3000, 'x'), 0);
});

test('normalizeConfig prunes divisor inclusions for products that no longer exist', () => {
  const raw = {
    clients: [{ id: 'c1', name: 'X', products: [
      { id: 'p1', name: 'Panini', dough: 'focaccia', weight: 100, kind: 'number' },
    ] }],
    divisorIncluded: { focaccia: ['p1', 'ghost'], brioche: ['also-gone'] },
  };
  const norm = normalizeConfig(raw);
  assert.deepEqual(getDivisorIncluded(norm, 'focaccia'), ['p1']); // ghost dropped
  assert.deepEqual(getDivisorIncluded(norm, 'brioche'), []);       // all gone
  assert.deepEqual(getDivisorIncluded(norm, 'sourdough'), []);     // default empty
});

test('divisor defaults to none-included on a config without the field', () => {
  assert.deepEqual(getDivisorIncluded(DEFAULT_CONFIG, 'focaccia'), []);
  assert.deepEqual(getDivisorIncluded({}, 'focaccia'), []);
  assert.equal(isInDivisor({}, 'focaccia', 'anything'), false);
});

// ── Crate boxes (display-only, per product) ───────────────────────────────────

test('crateCount = quantity ÷ pieces per box, safe at the edges', () => {
  assert.equal(crateCount(40, 20), 2);
  assert.equal(crateCount(30, 20), 1.5);  // fractional crate
  assert.equal(crateCount(0, 20), 0);
  assert.equal(crateCount(40, 0), 0);     // no box size → no count
  assert.equal(crateCount(-5, 20), 0);    // never negative
  assert.equal(crateCount('abc', 20), 0); // never NaN
});

test('clampCratePerBox keeps sane values and defaults on junk', () => {
  assert.equal(clampCratePerBox(20), 20);
  assert.equal(clampCratePerBox(0), CRATE_PERBOX_MIN);       // too small
  assert.equal(clampCratePerBox(99999), CRATE_PERBOX_MAX);   // too big
  assert.equal(clampCratePerBox('abc'), CRATE_PERBOX_DEFAULT);
  assert.equal(clampCratePerBox(undefined), CRATE_PERBOX_DEFAULT);
});

test('crate box is per-product: off by default, on only when explicitly enabled', () => {
  assert.equal(isCrateEnabled({ crate: { show: true, perBox: 20 } }), true);
  assert.equal(isCrateEnabled({ crate: { show: false } }), false);
  assert.equal(isCrateEnabled({}), false);   // no crate → off
  assert.equal(isCrateEnabled(null), false);
  assert.equal(getCratePerBox({ crate: { perBox: 24 } }), 24);
  assert.equal(getCratePerBox({}), CRATE_PERBOX_DEFAULT);
});

test('the default ciabatta product has its crate box enabled (20 pieces)', () => {
  const ciabatta = getTabProducts(DEFAULT_CONFIG, 'focaccia').find(p => p.id === 'f-ciabatta');
  assert.equal(isCrateEnabled(ciabatta), true);
  assert.equal(getCratePerBox(ciabatta), 20);
});

test('normalizeConfig keeps a product crate box (clamped perBox, show preserved)', () => {
  const raw = { clients: [{ id: 'c1', name: 'X', products: [
    { id: 'p1', name: 'Ciabatte', dough: 'focaccia', weight: 150, kind: 'number', crate: { show: true, perBox: 0 } },
    { id: 'p2', name: 'Plain',    dough: 'focaccia', weight: 100, kind: 'number' },
  ] }] };
  const products = getClientById(normalizeConfig(raw), 'c1').products;
  assert.equal(isCrateEnabled(products[0]), true);
  assert.equal(getCratePerBox(products[0]), CRATE_PERBOX_MIN); // 0 clamped up to the min
  assert.equal(isCrateEnabled(products[1]), false);            // no crate field → off
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
