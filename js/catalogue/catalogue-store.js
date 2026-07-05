// catalogue-store.js — the live recipe list, bridging Firestore and the UI.
//
// Resilience (P17) + cost (P14): the list is held in memory and mirrored to
// localStorage, so the catalogue paints instantly and works offline. The
// full-collection listener is attached only when the catalogue page initialises
// (via initCatalogue), never at app boot. Writes are per-document and LOCAL-FIRST:
// the in-memory list + cache + UI update immediately (instant, offline-friendly);
// the Firestore write is best-effort and, if it is REJECTED (e.g. rules/App Check
// denial), the optimistic change is rolled back and the error is surfaced.
//
// "Most used first" is driven by a LOCAL open-count map (per device, free, no
// extra Firestore writes) — see the usage helpers below.

import { normalizeCatalogueRecipe, normalizeCatalogueRecipes } from './catalogue-model.js';
import {
  watchRecipes,
  saveRecipeDoc,
  removeRecipeDoc,
  newRecipeId,
} from './firebase-catalogue.js';

const CACHE_KEY = 'catalogue-recipes';
const USAGE_KEY = 'catalogue-usage';

let recipes = readCache();
let usage = readUsage();
let notify = null;         // called with the new recipe list whenever it changes
let onSyncError = null;    // called with a message when a background write is rejected

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

// Register a handler for background write failures (shown as a toast by the UI).
export function setSyncErrorHandler(fn) {
  onSyncError = typeof fn === 'function' ? fn : null;
}

// Start syncing with Firestore. onUpdate(recipes) fires whenever the collection
// changes. onError(err) fires if the live stream dies (no auto-resubscribe).
// Returns the synchronous cached list so the first paint never waits on the
// network. The listener is attached here (page open), not at app boot.
export function initCatalogue(onUpdate, onError) {
  notify = typeof onUpdate === 'function' ? onUpdate : null;
  watchRecipes(
    remote => {
      recipes = normalizeCatalogueRecipes(remote);
      writeCache(recipes);
      pruneUsage();
      if (notify) notify(recipes);
    },
    err => { if (onError) onError(err); },
  ).catch(err => { console.error('Catalogue live sync failed to start:', err); if (onError) onError(err); });
  return recipes;
}

// Optimistically upsert a recipe into the in-memory list + cache + UI.
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

// Save a recipe, LOCAL-FIRST. A new recipe (no id) gets a client-side id so it can
// appear instantly and offline; an existing one is merged. The UI update happens
// before the network write, so this returns the id immediately (never blocks on
// the network — no freeze, no duplicate from repeated taps). If the write is later
// REJECTED (not merely offline-pending), the optimistic change is rolled back and
// the error is surfaced.
export function saveRecipe(recipe) {
  const data = { name: recipe.name, ingredients: recipe.ingredients };
  const id = recipe.id || newRecipeId();
  const prev = recipes.find(r => r.id === id) || null;
  upsertLocal({ id, ...data });
  saveRecipeDoc(id, data).catch(err => {
    console.warn('Recipe did not sync to Firestore:', err);
    if (prev) upsertLocal(prev); else removeLocal(id);
    if (onSyncError) onSyncError(`Couldn't save "${recipe.name || 'recipe'}" — check your connection.`);
  });
  return id;
}

// Delete a recipe, LOCAL-FIRST (mirrors saveRecipe). Also prunes the local usage
// entry so the map doesn't accumulate orphans.
export function deleteRecipe(id) {
  const prev = recipes.find(r => r.id === id) || null;
  removeLocal(id);
  if (usage[id] != null) { const u = { ...usage }; delete u[id]; usage = u; writeUsage(usage); }
  removeRecipeDoc(id).catch(err => {
    console.warn('Recipe delete did not sync to Firestore:', err);
    if (prev) upsertLocal(prev);
    if (onSyncError) onSyncError("Couldn't delete the recipe — check your connection.");
  });
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

// Drop usage entries for recipes that no longer exist (keeps the map from growing
// with orphans as recipes are deleted here or on other devices).
function pruneUsage() {
  const ids = new Set(recipes.map(r => r.id));
  let changed = false;
  const next = {};
  for (const key of Object.keys(usage)) {
    if (ids.has(key)) next[key] = usage[key]; else changed = true;
  }
  if (changed) { usage = next; writeUsage(usage); }
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
