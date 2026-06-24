// Equivalence tests for the generic scaleRecipe (P15 — the owner cannot read code).
// These prove that unifying the dough math is SAFE before it is wired into the app:
//   • Brioche and Sourdough come out BYTE-IDENTICAL to their original functions.
//   • Focaccia, moved onto the same clean method, stays within a tiny tolerance of
//     the old focaccia math (and is exactly equal at the shipped default 0.65%).
// If a future change drifts any of this, these fail.
//
// The recipes below are the shipped defaults (RECIPE_DEFAULTS in recipes.js),
// copied here so the test stays self-contained and pure (recipes.js reads
// localStorage on import and cannot be loaded under Node).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scaleRecipe,
  scaleFocaccia,
  scaleBrioche,
  scaleSourdough,
} from '../js/calculator-dough-math.js';

const FOCACCIA = { flourBlu: 278, flourT65: 278, malt: 3, sugar: 8, salt: 11, yeast: 3.6, oil: 56, water1: 334, water2: 24 };
const BRIOCHE = { flour: 3185, yeast: 127.4, water: 1575 };
const SOURDOUGH = { flourBlu: 2560, flourT65: 2560, flourWhole: 570, water1: 3800, starter: 1024, malt: 30, salt: 124, water2: 300 };

// The unified spec for each seed recipe: which ingredient is the leavening and the
// baseline percentage at which the recipe sits "at rest" (see scaleRecipe comment).
const FOCACCIA_SPEC  = { amounts: FOCACCIA,  leaveningKey: 'yeast',   baselinePct: 3.6 / 556 * 100 };
const BRIOCHE_SPEC   = { amounts: BRIOCHE,   leaveningKey: 'yeast',   baselinePct: 4 };
const SOURDOUGH_SPEC = { amounts: SOURDOUGH, leaveningKey: 'starter', baselinePct: 18 };

const sum = (arr) => arr.reduce((a, b) => a + b, 0);

// Divergence allowed, per ingredient, between the unified focaccia and the OLD
// focaccia math. Two regimes (both measured, not guessed):
//   • Normal use (yeast 0.5–1.5%): ≤ 2 g, and exactly 0 at the 0.65% default.
//   • Full knob range (yeast 0.1–3%, doughs up to 25 kg): ≤ 6 g. The extra grams
//     are a CORRECTION — the unified method keeps yeast at exactly the chosen % of
//     flour, while the old method drifted slightly high at large percentages.
const FOCACCIA_TOLERANCE_NORMAL_G = 2;
const FOCACCIA_TOLERANCE_FULL_G = 6;

// ── Brioche: byte-identical to scaleBrioche ─────────────────────────────────────

test('scaleRecipe reproduces scaleBrioche exactly across the full knob range', () => {
  // Brioche yeast knob: min 0.1, max 6 (calculator.html #b-yeast-pct).
  for (const target of [2000, 4887.4, 9000, 9774.8, 18000]) {
    for (const pct of [0.1, 2, 4, 6]) {
      assert.deepEqual(
        scaleRecipe(BRIOCHE_SPEC, target, pct),
        scaleBrioche(BRIOCHE, target, pct),
        `brioche mismatch at target=${target}, pct=${pct}`
      );
    }
  }
});

// ── Sourdough: byte-identical to scaleSourdough ─────────────────────────────────

test('scaleRecipe reproduces scaleSourdough exactly across the full knob range', () => {
  // Sourdough starter knob: min 5, max 40 (calculator.html #s-starter-pct).
  for (const target of [5000, 9000, 18100]) {
    for (const pct of [5, 12, 18, 25, 40]) {
      assert.deepEqual(
        scaleRecipe(SOURDOUGH_SPEC, target, pct),
        scaleSourdough(SOURDOUGH, target, pct),
        `sourdough mismatch at target=${target}, pct=${pct}`
      );
    }
  }
});

// ── Focaccia: within tolerance of scaleFocaccia, exact at the default ────────────

test('scaleRecipe matches scaleFocaccia exactly at the shipped default (5000 g, 0.65%)', () => {
  assert.deepEqual(
    scaleRecipe(FOCACCIA_SPEC, 5000, 0.65),
    scaleFocaccia(FOCACCIA, 5000, 0.65)
  );
});

// Helper: worst per-ingredient divergence between the unified and old focaccia math
// over a grid of targets × percentages.
function focacciaMaxDiff(targets, pcts) {
  let maxDiff = 0, worst = null;
  for (const target of targets) {
    for (const pct of pcts) {
      const a = scaleRecipe(FOCACCIA_SPEC, target, pct);
      const b = scaleFocaccia(FOCACCIA, target, pct);
      for (let i = 0; i < a.length; i++) {
        const d = Math.abs(a[i] - b[i]);
        if (d > maxDiff) { maxDiff = d; worst = { target, pct, i, unified: a[i], old: b[i] }; }
      }
    }
  }
  return { maxDiff, worst };
}

test('scaleRecipe stays within 2 g of old focaccia at normal settings (yeast 0.5–1.5%)', () => {
  const { maxDiff, worst } = focacciaMaxDiff([1000, 3217, 5000, 9000, 15000], [0.5, 0.65, 1, 1.5]);
  assert.ok(
    maxDiff <= FOCACCIA_TOLERANCE_NORMAL_G,
    `focaccia diverged by ${maxDiff} g (limit ${FOCACCIA_TOLERANCE_NORMAL_G}) at ${JSON.stringify(worst)}`
  );
});

test('scaleRecipe stays within 6 g of old focaccia across the full knob range (yeast 0.1–3%, ≤25 kg)', () => {
  // Focaccia yeast knob: min 0.1, max 3, step 0.05 (calculator.html #f-yeast-pct).
  const targets = [], pcts = [];
  for (let t = 300; t <= 25000; t += 100) targets.push(t);
  for (let p = 0.1; p <= 3.0001; p += 0.05) pcts.push(Math.round(p * 100) / 100);
  const { maxDiff, worst } = focacciaMaxDiff(targets, pcts);
  assert.ok(
    maxDiff <= FOCACCIA_TOLERANCE_FULL_G,
    `focaccia diverged by ${maxDiff} g (limit ${FOCACCIA_TOLERANCE_FULL_G}) at ${JSON.stringify(worst)}`
  );
});

// ── Pure proportional path (recipe with no leavening) ───────────────────────────

test('scaleRecipe with no leavening scales pro-rata and sums to the target', () => {
  const base = { a: 100, b: 200, c: 300 };
  const spec = { amounts: base, leaveningKey: null, baselinePct: null };
  const ideal = (target) => Object.values(base).map(g => g * target / 600);
  for (const target of [600, 1234, 9999]) {
    const out = scaleRecipe(spec, target, 0);
    assert.equal(sum(out), Math.round(target), `no-leavening sum at ${target}`);
    // Each ingredient stays within rounding+residual distance of its exact share
    // (≤ 0.5 g rounding, plus the ≤ ~1.5 g residual that lands on one ingredient).
    ideal(target).forEach((v, i) => {
      assert.ok(Math.abs(out[i] - v) <= 2, `no-leavening proportion at ${target}, i=${i}: ${out[i]} vs ${v}`);
    });
  }
});

test('scaleRecipe never produces NaN on a zero-mass recipe', () => {
  const spec = { amounts: { a: 0, b: 0 }, leaveningKey: null, baselinePct: null };
  assert.deepEqual(scaleRecipe(spec, 1000, 0), [0, 0]);
});

// ── Core invariant: displayed integers always sum to the target ─────────────────

test('scaleRecipe output always sums exactly to Math.round(target)', () => {
  const cases = [
    [FOCACCIA_SPEC, 5000, 0.65],
    [BRIOCHE_SPEC, 9774.8, 4],
    [SOURDOUGH_SPEC, 9000, 18],
    [FOCACCIA_SPEC, 1234.6, 1.2],
    [SOURDOUGH_SPEC, 18100, 25],
  ];
  for (const [spec, target, pct] of cases) {
    assert.equal(sum(scaleRecipe(spec, target, pct)), Math.round(target));
  }
});
