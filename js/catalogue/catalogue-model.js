// catalogue-model.js — pure data model + kg-scaling for the Recipe catalogue.
//
// This module is intentionally FREE of any DOM / Firebase / localStorage imports
// so the model and the scaling math can be unit-tested in isolation under Node
// (see tests/catalogue-model.test.mjs). The owner cannot read code, so these tests
// are the safety net (P15).
//
// A catalogue recipe is deliberately minimal: { id, name, ingredients:[{label,grams}] }.
// The Firestore document id is the recipe's id (assigned by the data layer on create).
// Advanced fields (leavening, calc logic) are the Calculator's concern; a recipe is
// imported into the Calculator as a plain pro-rata ('total') recipe — see toCalculatorRecipe.

// ── Normalisation (junk-safe: never throws, never yields NaN) ──────────────────

// One ingredient row: a display label and a non-negative gram amount. Non-numeric
// or negative grams coerce to 0 so the scaling math never sees NaN. This is the
// client-side "grams are numbers" guarantee (Firestore rules v2 cannot iterate a
// list to assert it).
function normalizeIngredient(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const label = String(raw.label != null ? raw.label : (raw.name || '')).trim();
  const grams = Number(raw.grams);
  return { label, grams: Number.isFinite(grams) && grams >= 0 ? grams : 0 };
}

function normalizeIngredients(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeIngredient).filter(Boolean);
}

// A catalogue recipe from arbitrary (e.g. Firestore) input. Returns null only for
// non-object input; an empty name is kept (the editor's validation blocks saving it).
export function normalizeCatalogueRecipe(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: raw.id != null ? String(raw.id) : '',
    name: String(raw.name != null ? raw.name : '').trim(),
    ingredients: normalizeIngredients(raw.ingredients),
  };
}

// A list of catalogue recipes, dropping junk entries.
export function normalizeCatalogueRecipes(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeCatalogueRecipe).filter(Boolean);
}

// ── List helpers (used by the catalogue list UI) ──────────────────────────────

// Most-used first: sort by open-count (from the local usage map) descending, then
// by name ascending as a stable tie-break. Never mutates the input array.
export function sortByUsage(recipes, usageMap = {}) {
  return recipes.slice().sort((a, b) => {
    const ua = usageMap[a.id] || 0;
    const ub = usageMap[b.id] || 0;
    if (ub !== ua) return ub - ua;
    return String(a.name).localeCompare(String(b.name));
  });
}

// Case-insensitive substring filter by recipe name. Empty query returns all.
export function filterByName(recipes, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return recipes;
  return recipes.filter(r => String(r.name).toLowerCase().includes(q));
}

// ── kg scaling (pure pro-rata "total" — the catalogue's only calc logic) ──────

// Round an array of gram values so the displayed integers sum EXACTLY to
// Math.round(total). Any ±rounding residual is assigned to the largest ingredient.
// Mirrors fixRounding in js/calculator-dough-math.js (kept independent so the
// catalogue folder stays self-contained — no cross-feature import for a one-liner).
function fixRounding(amounts, total) {
  const rounded = amounts.map(Math.round);
  if (!rounded.length) return rounded;
  const diff = Math.round(total) - rounded.reduce((a, b) => a + b, 0);
  if (diff !== 0) {
    let maxIdx = 0;
    for (let i = 1; i < rounded.length; i++) {
      if (rounded[i] > rounded[maxIdx]) maxIdx = i;
    }
    rounded[maxIdx] += diff;
  }
  return rounded;
}

// Scale a recipe to a target TOTAL weight in grams: every ingredient in proportion
// so the rounded amounts sum exactly to Math.round(targetGrams). An empty recipe or
// a non-positive target yields all zeros (defensive — never NaN).
export function scaleCatalogue(recipe, targetGrams) {
  const ings = (recipe && Array.isArray(recipe.ingredients)) ? recipe.ingredients : [];
  const base = ings.map(i => Number(i.grams) || 0);
  const total = base.reduce((a, b) => a + b, 0);
  const target = Number(targetGrams);
  if (!Number.isFinite(target) || target <= 0 || total <= 0) return base.map(() => 0);
  const factor = target / total;
  return fixRounding(base.map(g => g * factor), target);
}

// The base (unscaled) recipe amounts, as an array aligned with recipe.ingredients.
export function baseAmounts(recipe) {
  const ings = (recipe && Array.isArray(recipe.ingredients)) ? recipe.ingredients : [];
  return ings.map(i => Number(i.grams) || 0);
}

// ── Editor validation ─────────────────────────────────────────────────────────

// The first problem with a recipe, or null if it is valid: 'name' (blank name),
// 'ingredients' (no ingredient with a non-empty label), or 'weight' (every named
// ingredient is 0 g, so the recipe can never be scaled). Used to block Save.
export function findInvalidRecipe(recipe) {
  if (!recipe || !String(recipe.name || '').trim()) return 'name';
  const ings = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const named = ings.filter(i => i && String(i.label || '').trim());
  if (!named.length) return 'ingredients';
  const totalGrams = named.reduce((s, i) => { const g = Number(i.grams); return s + (g > 0 ? g : 0); }, 0);
  if (totalGrams <= 0) return 'weight';
  return null;
}

// ── Import into the Calculator (the single coupling; still pure here) ──────────

// Map a catalogue recipe to the raw Calculator-recipe shape the Calculator's
// normalizeRecipe accepts. 'cat-' + the opaque Firestore id is a stable, unique
// provenance id; logic 'total' = plain pro-rata; visible:false keeps it out of the
// max-4 tab bar until the owner opts it in from Calculator Settings.
export function toCalculatorRecipe(recipe) {
  return {
    id: 'cat-' + recipe.id,
    name: recipe.name,
    logic: 'total',
    ingredients: (recipe.ingredients || []).map(i => ({ label: i.label, grams: i.grams })),
    visible: false,
  };
}

// Add or update an imported recipe inside a config's recipes[]. If a recipe with the
// same id already exists it is replaced in place, preserving its tab order/visibility
// (so a re-import never duplicates and never hijacks the tab bar); otherwise it is
// appended. Pure: returns a new config plus the action taken.
export function mergeImportedRecipe(config, recipe) {
  const recipes = Array.isArray(config.recipes) ? config.recipes.slice() : [];
  const idx = recipes.findIndex(r => r && r.id === recipe.id);
  let action;
  if (idx >= 0) {
    const prev = recipes[idx];
    recipes[idx] = { ...recipe, order: prev.order, visible: prev.visible };
    action = 'updated';
  } else {
    recipes.push(recipe);
    action = 'added';
  }
  return { config: { ...config, recipes }, action };
}
