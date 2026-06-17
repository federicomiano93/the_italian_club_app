// calculator-config-store.js — single source of truth for the live calculator
// configuration, bridging Firestore and the UI.
//
// Resilience (P17): the UI must paint instantly and work offline, so the current
// config is held in memory and mirrored to localStorage. On startup we return
// the cached config (or the default) synchronously; Firestore then streams in
// and, when it has data, updates the cache and notifies the app to re-render.

import { DEFAULT_CONFIG, cloneConfig, normalizeConfig } from './calculator-config.js';
import { watchCalculatorConfig, saveCalculatorConfig } from './firebase.js';

const CACHE_KEY = 'calculator-config';

let current = readCache();
let notify = null; // called with the new config whenever it changes (set by initConfig)

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return normalizeConfig(JSON.parse(raw));
  } catch (e) {
    // Corrupt/unavailable cache — fall back to defaults.
  }
  return cloneConfig(DEFAULT_CONFIG);
}

function writeCache(config) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(config));
  } catch (e) {
    // Storage full/unavailable — the in-memory copy still works for this session.
  }
}

// The config currently in effect (cache/default until Firestore streams in).
export function getConfig() {
  return current;
}

// Start syncing with Firestore. onUpdate(config) fires whenever the remote
// config changes so the app can re-render. Returns the synchronous initial
// config so the first paint never waits on the network.
export function initConfig(onUpdate) {
  notify = typeof onUpdate === 'function' ? onUpdate : null;
  watchCalculatorConfig(remote => {
    if (!remote) return; // no document yet — keep cache/default
    current = normalizeConfig(remote);
    writeCache(current);
    if (notify) notify(current);
  });
  return current;
}

// Persist a new config. Local-first (P17): update memory + cache and re-render
// immediately so the change is instant and works offline; the Firestore write is
// best-effort and its failure (e.g. offline, rules not yet deployed) is logged
// but does not lose the local change or block the UI.
export function saveConfig(config) {
  current = normalizeConfig(config);
  writeCache(current);
  if (notify) notify(current);
  return saveCalculatorConfig(current).catch(err => {
    console.warn('Calculator config saved locally but not synced to Firestore:', err);
  });
}
