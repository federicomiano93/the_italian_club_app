// calculator-dough-math.js — the pure dough-scaling math, extracted from calc.js
// so it can be unit-tested in isolation (P15 — the owner cannot read code).
//
// Each function takes a recipe object and a target raw weight (grams) and returns
// the per-ingredient grams as an array, rounded so the displayed integers sum
// EXACTLY to Math.round(target). No DOM, no storage — pure arithmetic. The numbers
// are identical to the former inline math in calc.js; only their home changed.

// Sum of all ingredient amounts in a recipe object.
export function recipeTotal(r) {
  return Object.values(r).reduce((s, v) => s + v, 0);
}

// Rounds an array of gram values so their displayed integers sum exactly to
// Math.round(total). Assigns any ±1-2g rounding residual to the largest ingredient.
export function fixRounding(amounts, total) {
  const rounded = amounts.map(Math.round);
  const diff = Math.round(total) - rounded.reduce((a, b) => a + b, 0);
  if (diff !== 0) {
    const maxIdx = rounded.indexOf(Math.max(...rounded));
    rounded[maxIdx] += diff;
  }
  return rounded;
}

// Focaccia: yeast is a percentage of the flour weight; everything else scales
// pro-rata to fill the remaining weight up to the target.
// Returns [flourBlu, flourT65, malt, sugar, salt, yeast, oil, water1, water2].
export function scaleFocaccia(recipe, target, yeastPct) {
  const R = recipe;
  const baseTotal = recipeTotal(R);
  const scale = target / baseTotal;
  const totalFlour = R.flourBlu + R.flourT65;
  const yeast = totalFlour * scale * (yeastPct / 100);
  const remaining = target - yeast;
  const nonYeastBase = baseTotal - R.yeast;
  const amounts = [
    R.flourBlu * remaining / nonYeastBase,
    R.flourT65 * remaining / nonYeastBase,
    R.malt     * remaining / nonYeastBase,
    R.sugar    * remaining / nonYeastBase,
    R.salt     * remaining / nonYeastBase,
    yeast,
    R.oil      * remaining / nonYeastBase,
    R.water1   * remaining / nonYeastBase,
    R.water2   * remaining / nonYeastBase,
  ];
  return fixRounding(amounts, target);
}

// Brioche: yeast scales from a 4% baseline, then flour/yeast/water scale together
// to the target. Returns [flour, yeast, water].
export function scaleBrioche(recipe, target, yeastPct) {
  const R = recipe;
  const yeastBase = R.yeast * (yeastPct / 4);
  const provisionalTotal = R.flour + yeastBase + R.water;
  const factor = target / provisionalTotal;
  return fixRounding([R.flour * factor, yeastBase * factor, R.water * factor], target);
}

// Sourdough: starter scales from an 18% baseline, then everything scales together
// to the target. Returns [flourBlu, flourT65, flourWhole, water1, starter, malt,
// salt, water2].
export function scaleSourdough(recipe, target, starterPct) {
  const R = recipe;
  const starterBase = R.starter * (starterPct / 18);
  const provisionalTotal =
    R.flourBlu + R.flourT65 + R.flourWhole + R.water1 + starterBase + R.malt + R.salt + R.water2;
  const factor = target / provisionalTotal;
  return fixRounding([
    R.flourBlu   * factor,
    R.flourT65   * factor,
    R.flourWhole * factor,
    R.water1     * factor,
    starterBase  * factor,
    R.malt       * factor,
    R.salt       * factor,
    R.water2     * factor,
  ], target);
}

// Generic recipe scaler — the single, unified dough math that every recipe can use.
// It reproduces scaleBrioche and scaleSourdough EXACTLY (byte-for-byte) and brings
// focaccia onto the same clean method (sub-gram differences vs the old focaccia
// math at normal settings; coincides exactly at the default 0.65%). Equivalence is
// proven in tests/unified-scaler.test.mjs.
//
// spec = {
//   amounts:      { key: grams, ... }  // insertion order = output order
//   leaveningKey: string | null        // which ingredient is the yeast/starter
//   baselinePct:  number | null        // the leavening percentage at which the
//                                       // recipe values sit "at rest"
// }
// target       = desired total raw weight in grams
// leaveningPct = the chosen leavening percentage (from the knob, or the default)
//
// Returns the per-ingredient grams as an array (same order as spec.amounts keys),
// rounded so the integers sum EXACTLY to Math.round(target) — see fixRounding.
//
// Why baselinePct is STORED, not derived from leavening/flour: brioche's yeast is
// exactly 4% of its flour, but sourdough's starter is 18% by design while
// starter/flour = 1024/5690 = 17.996%. Deriving it would drift sourdough off its
// locked values; storing the intended baseline (brioche 4, sourdough 18, focaccia
// ≈ 3.6/556*100 = 0.6475) keeps both byte-identical to their original functions.
export function scaleRecipe(spec, target, leaveningPct) {
  const { amounts, leaveningKey, baselinePct } = spec;
  const keys = Object.keys(amounts);
  const totalBase = keys.reduce((s, k) => s + amounts[k], 0);

  // No designated leavening (or no baseline) → pure pro-rata scaling.
  if (leaveningKey == null || !baselinePct) {
    if (totalBase <= 0) return keys.map(() => 0);
    const factor = target / totalBase;
    return fixRounding(keys.map(k => amounts[k] * factor), target);
  }

  // Bring the leavening to its share for the chosen percentage, then scale the
  // whole recipe uniformly to hit the target.
  const base = amounts[leaveningKey] * (leaveningPct / baselinePct);
  const provisional = totalBase - amounts[leaveningKey] + base;
  if (provisional <= 0) return keys.map(() => 0);
  const factor = target / provisional;
  return fixRounding(
    keys.map(k => (k === leaveningKey ? base : amounts[k]) * factor),
    target
  );
}
