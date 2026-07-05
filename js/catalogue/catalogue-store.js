// catalogue-store.js — the live recipe list, bridging Firestore and the UI.
//
// Resilience (P17) + cost (P14): the list is held in memory and mirrored to
// localStorage, so the catalogue paints instantly and works offline. The
// full-collection listener is attached only when the catalogue page initialises
// (via initCatalogue), never at app boot. Writes are per-document.
//
// "Most used first" is driven by a LOCAL open-count map (per device, free, no
// extra Firestore writes) — see the usage helpers below.

import { normalizeCatalogueRecipe, normalizeCatalogueRecipes } from './catalogue-model.js';
import {
  watchRecipes,
  saveRecipeDoc,
  createRecipeDoc,
  removeRecipeDoc,
} from './firebase-catalogue.js';

const CACHE_KEY = 'catalogue-recipes';
const USAGE_KEY = 'catalogue-usage';

let recipes = readCache();
let usage = readUsage();
let notify = null; // called with the new recipe list whenever it changes

// ── Recipe cache (localStorage mirror for instant/offline first paint) ─────────

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return normalizeCatalogueRecipes(JSON.parse(raw));
  } catch (e) {
    // Corrupt/unavailable cache — start empty; the listener will fill it in.
  }
  return [];
}

function writeCache(list) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch (e) {
    // Storage full/unavailable — the in-memory copy still works this session.
  }
}

// The recipes currently in memory (cache until the listener streams in).
export function getRecipes() {
  return recipes;
}

// Start syncing with Firestore. onUpdate(recipes) fires whenever the collection
// changes. Returns the synchronous cached list so the first paint never waits on
// the network. The listener is attached here (page open), not at app boot.
export function initCatalogue(onUpdate) {
  notify = typeof onUpdate === 'function' ? onUpdate : null;
  watchRecipes(remote => {
    recipes = normalizeCatalogueRecipes(remote);
    writeCache(recipes);
    if (notify) notify(recipes);
  }).catch(err => console.error('Catalogue live sync failed to start:', err));
  return recipes;
}

// Optimistically upsert a recipe into the in-memory list + cache + UI, so an edit
// shows immediately even before Firestore echoes it back through the listener.
function upsertLocal(recipe) {
  const norm = normalizeCatalogueRecipe(recipe);
  if (!norm) return;
  const idx = recipes.findIndex(r => r.id === norm.id);
  const next = recipes.slice();
  if (idx >= 0) next[idx] = norm; else next.push(norm);
  recipes = next;
  writeCache(recipes);
  if (notify) notify(recipes);
}

function removeLocal(id) {
  recipes = recipes.filter(r => r.id !== id);
  writeCache(recipes);
  if (notify) notify(recipes);
}

// Save a recipe. New recipe (no id) → create with an auto id; existing → merge.
// Local-first for edits (instant UI); returns the recipe id. The persisted shape
// is just { name, ingredients } — usage and cache metadata never go to Firestore.
export async function saveRecipe(recipe) {
  const data = { name: recipe.name, ingredients: recipe.ingredients };
  if (recipe.id) {
    upsertLocal({ id: recipe.id, ...data });
    await saveRecipeDoc(recipe.id, data);
    return recipe.id;
  }
  const id = await createRecipeDoc(data);
  upsertLocal({ id, ...data });
  return id;
}

// Delete a recipe (local-first, then Firestore).
export async function deleteRecipe(id) {
  removeLocal(id);
  await removeRecipeDoc(id);
}

// ── Local usage map ("most used first") ────────────────────────────────────────

function readUsage() {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {
    // ignore corrupt usage map
  }
  return {};
}

function writeUsage(map) {
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(map));
  } catch (e) {
    // ignore storage failure — ordering is a nicety, not data
  }
}

// The current open-count map { recipeId: count }.
export function getUsage() {
  return usage;
}

// Record that a recipe was opened/used (drives "most used first").
export function bumpUsage(id) {
  if (!id) return;
  usage = { ...usage, [id]: (usage[id] || 0) + 1 };
  writeUsage(usage);
}
