// Unit tests for the Recipe catalogue pure model (P15 — the owner cannot read code,
// so these lock the core behaviour: junk-safe normalization, exact-sum kg scaling,
// list ordering/search, editor validation, and the Calculator-import mapping).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCatalogueRecipe,
  normalizeCatalogueRecipes,
  sortByUsage,
  filterByName,
  scaleCatalogue,
  baseAmounts,
  findInvalidRecipe,
  toCalculatorRecipe,
  mergeImportedRecipe,
} from '../js/catalogue/catalogue-model.js';

const FOCACCIA = {
  id: 'foc',
  name: 'Focaccia',
  ingredients: [
    { label: 'Flour uniqua blue', grams: 278 },
    { label: 'Flour T65', grams: 278 },
    { label: 'Malt', grams: 3 },
    { label: 'Sugar', grams: 8 },
    { label: 'Salt', grams: 11 },
    { label: 'Yeast', grams: 3.6 },
    { label: 'Oil', grams: 56 },
    { label: '1° Water', grams: 334 },
    { label: '2° Water', grams: 24 },
  ],
};

const sum = (arr) => arr.reduce((a, b) => a + b, 0);

// ── normalization ──────────────────────────────────────────────────────────────

test('normalizeCatalogueRecipe coerces junk safely (never NaN, never throws)', () => {
  const r = normalizeCatalogueRecipe({
    id: 42, name: '  Ciabatta  ',
    ingredients: [
      { label: 'Flour', grams: '500' },   // numeric string
      { name: 'Water', grams: -5 },        // legacy `name`, negative -> 0
      { label: 'Salt', grams: 'abc' },     // non-numeric -> 0
      null,                                // dropped
      'garbage',                           // dropped
    ],
  });
  assert.equal(r.id, '42');
  assert.equal(r.name, 'Ciabatta');
  assert.deepEqual(r.ingredients, [
    { label: 'Flour', grams: 500 },
    { label: 'Water', grams: 0 },
    { label: 'Salt', grams: 0 },
  ]);
});

test('normalizeCatalogueRecipe returns null for non-object input', () => {
  assert.equal(normalizeCatalogueRecipe(null), null);
  assert.equal(normalizeCatalogueRecipe('x'), null);
});

test('normalizeCatalogueRecipes drops junk entries', () => {
  const list = normalizeCatalogueRecipes([FOCACCIA, null, 5, { name: 'X' }]);
  assert.equal(list.length, 2);
  assert.equal(list[0].name, 'Focaccia');
  assert.equal(list[1].name, 'X');
});

// ── scaleCatalogue: the core invariant (integers sum EXACTLY to the target) ─────

test('scaleCatalogue keeps the base recipe when target equals its total', () => {
  const total = sum(baseAmounts(FOCACCIA)); // 995.6
  const out = scaleCatalogue(FOCACCIA, total);
  assert.equal(sum(out), Math.round(total));
});

test('scaleCatalogue to 10 kg: proportional and sums to exactly 10000 g', () => {
  const out = scaleCatalogue(FOCACCIA, 10000);
  assert.equal(sum(out), 10000);
  // proportionality: the two equal flours stay equal, and each is ~10x the base
  assert.equal(out[0], out[1]);
  assert.ok(out[0] > 2700 && out[0] < 2900);
});

test('scaleCatalogue sums to target across many weights (rounding residual absorbed)', () => {
  for (const kg of [0.5, 1, 3, 7, 12.5, 33]) {
    const out = scaleCatalogue(FOCACCIA, kg * 1000);
    assert.equal(sum(out), Math.round(kg * 1000), `sum must equal target for ${kg} kg`);
  }
});

test('scaleCatalogue is defensive: empty recipe / non-positive / bad target -> zeros', () => {
  assert.deepEqual(scaleCatalogue({ ingredients: [] }, 10000), []);
  assert.deepEqual(scaleCatalogue(FOCACCIA, 0).every(x => x === 0), true);
  assert.deepEqual(scaleCatalogue(FOCACCIA, -5).every(x => x === 0), true);
  assert.deepEqual(scaleCatalogue(FOCACCIA, NaN).every(x => x === 0), true);
});

// ── sortByUsage / filterByName ──────────────────────────────────────────────────

test('sortByUsage: open-count desc, then name asc; does not mutate input', () => {
  const recipes = [
    { id: 'a', name: 'Brioche' },
    { id: 'b', name: 'Focaccia' },
    { id: 'c', name: 'Sourdough' },
  ];
  const snapshot = recipes.slice();
  const sorted = sortByUsage(recipes, { b: 5, c: 5, a: 1 });
  assert.deepEqual(sorted.map(r => r.id), ['b', 'c', 'a']); // b,c tie on 5 -> name asc (Focaccia<Sourdough)
  assert.deepEqual(recipes, snapshot); // original untouched
});

test('sortByUsage: missing counts treated as 0', () => {
  const sorted = sortByUsage([{ id: 'x', name: 'Zebra' }, { id: 'y', name: 'Apple' }], {});
  assert.deepEqual(sorted.map(r => r.name), ['Apple', 'Zebra']);
});

test('filterByName: case-insensitive substring; empty query returns all', () => {
  const recipes = [{ name: 'Focaccia' }, { name: 'Brioche' }, { name: 'Sourdough' }];
  assert.deepEqual(filterByName(recipes, 'bri').map(r => r.name), ['Brioche']);
  assert.deepEqual(filterByName(recipes, 'O').length, 3); // focaccia, brioche, sourdough
  assert.deepEqual(filterByName(recipes, '   ').length, 3);
});

// ── findInvalidRecipe ────────────────────────────────────────────────────────────

test('findInvalidRecipe flags blank name and no-named-ingredient, passes valid', () => {
  assert.equal(findInvalidRecipe({ name: '', ingredients: [{ label: 'Flour', grams: 1 }] }), 'name');
  assert.equal(findInvalidRecipe({ name: 'X', ingredients: [] }), 'ingredients');
  assert.equal(findInvalidRecipe({ name: 'X', ingredients: [{ label: '  ', grams: 1 }] }), 'ingredients');
  assert.equal(findInvalidRecipe(FOCACCIA), null);
});

// ── toCalculatorRecipe / mergeImportedRecipe (the import mapping) ────────────────

test('toCalculatorRecipe maps to a hidden pro-rata Calculator recipe', () => {
  const cr = toCalculatorRecipe(FOCACCIA);
  assert.equal(cr.id, 'cat-foc');
  assert.equal(cr.name, 'Focaccia');
  assert.equal(cr.logic, 'total');
  assert.equal(cr.visible, false);
  assert.equal(cr.ingredients.length, FOCACCIA.ingredients.length);
  assert.deepEqual(cr.ingredients[0], { label: 'Flour uniqua blue', grams: 278 });
});

test('mergeImportedRecipe appends a new recipe (action: added)', () => {
  const cfg = { recipes: [{ id: 'focaccia' }] };
  const { config, action } = mergeImportedRecipe(cfg, toCalculatorRecipe(FOCACCIA));
  assert.equal(action, 'added');
  assert.equal(config.recipes.length, 2);
  assert.equal(config.recipes[1].id, 'cat-foc');
});

test('mergeImportedRecipe updates in place, no duplicate, preserving order/visible', () => {
  const cfg = { recipes: [
    { id: 'focaccia' },
    { id: 'cat-foc', name: 'Old', order: 2, visible: true },
  ] };
  const updated = toCalculatorRecipe({ ...FOCACCIA, name: 'New name' });
  const { config, action } = mergeImportedRecipe(cfg, updated);
  assert.equal(action, 'updated');
  assert.equal(config.recipes.length, 2); // no duplicate
  assert.equal(config.recipes[1].name, 'New name');
  assert.equal(config.recipes[1].order, 2);    // preserved
  assert.equal(config.recipes[1].visible, true); // preserved
});
