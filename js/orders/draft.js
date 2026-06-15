// draft.js — persistent, real-time order draft.
//
// The current week's order is a single shared document drafts/current. Every
// change autosaves (debounced) so reopening the app restores the exact state,
// and a real-time listener keeps all staff in sync. On "save to history" the
// week is archived to orders-history (recording BOTH quantity ordered and stock
// on hand, which the Phase 5 suggestion engine needs) and the draft is cleared.

import { saveDoc, getDocOnce, watchDoc, removeDoc, COLLECTIONS } from './firebase-orders.js';
import { currentWeekId, currentWeekStartISO } from './week.js';

const DRAFT_ID = 'current';
const SAVE_DELAY_MS = 800; // debounce to limit Firestore writes (cost control)
let saveTimer = null;

// Autosave the draft a short moment after the last change.
export function scheduleDraftSave(entries) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveDraftNow(entries); }, SAVE_DELAY_MS);
}

export function saveDraftNow(entries) {
  return saveDoc(COLLECTIONS.drafts, DRAFT_ID, {
    weekId: currentWeekId(),
    entries,
    updatedAt: new Date().toISOString(),
  });
}

export async function loadDraft() {
  const draft = await getDocOnce(COLLECTIONS.drafts, DRAFT_ID);
  return draft?.entries || {};
}

// Real-time subscription. onChange receives the entries map ({} when empty).
export function watchDraft(onChange) {
  return watchDoc(COLLECTIONS.drafts, DRAFT_ID, doc => onChange(doc?.entries || {}));
}

export function clearDraft() {
  clearTimeout(saveTimer);
  return removeDoc(COLLECTIONS.drafts, DRAFT_ID);
}

// Archive the current order to orders-history for this week, keyed by week id so
// re-sending the same week overwrites. Stores ordered quantity AND stock on hand
// per ingredient (Phase 5 learns the target level from these).
export function archiveOrder(entries) {
  const quantities = {};
  const stock = {};
  Object.entries(entries).forEach(([id, e]) => {
    if ((e?.qty || 0) > 0) {
      quantities[id] = e.qty;
      stock[id] = e.stock || 0;
    }
  });
  return saveDoc(COLLECTIONS.history, currentWeekId(), {
    weekStart: currentWeekStartISO(),
    createdAt: new Date().toISOString(),
    quantities,
    stock,
  });
}
