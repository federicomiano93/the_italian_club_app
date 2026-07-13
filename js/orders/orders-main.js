// orders-main.js — entry point for orders.html.
//
// Tabs + Firebase connectivity; the supplier list with stock + order fields; the
// autosaving real-time draft; preview/send; history; the management panel.
//
// The unit of an order is one DAY and one SUPPLIER. Everything here follows from
// that: "Order placed" lives on each supplier card and touches only that
// supplier's rows; the draft remembers which day each supplier's rows were typed
// on, so an order left unmarked overnight is filed under the day it was written,
// not under today.

import {
  watchCollection, watchCollectionBounded, saveDoc, createDoc, removeDoc, COLLECTIONS,
} from './firebase-orders.js';
import { el, groupBy } from './dom.js';
import { renderSuppliers, refreshSupplierDerived } from './suppliers.js';
import {
  scheduleDraftSave, flushDraftSave, watchDraft, archiveSupplier, clearSupplier,
} from './draft.js';
import { buildSendScreen } from './preview.js';
import { renderHistory as renderHistoryView } from './history.js';
import { buildManagement, isAdmin } from './management.js';
import { computeSuggestion } from './suggestions.js';
import { refreshBankHolidays } from './bank-holidays.js';
import { renderAlerts } from './notifications.js';
import { confirmDialog } from './confirm-dialog.js';
import { todayISO, dayLabel, localDayOf } from './day.js';
import { historyDocId, ingredientsOf, supplierHasItems } from './archive.js';

// The newest history records to keep live. One document per day per supplier adds
// up fast (some suppliers are ordered almost daily), and the whole collection was
// being re-read on every app open — a cost that grew for ever (P14). Older records
// are still reachable: History loads them a page at a time.
const HISTORY_WINDOW = 200;

const state = {
  suppliers: [],
  ingredients: [],
  history: [],
  entries: {},                  // { ingredientId: { qty, stock } } — shared object, mutated in place
  days: {},                     // { supplierId: 'YYYY-MM-DD' } — the day those rows were typed
  draftUpdatedAt: '',           // fallback day for a draft written before `days` existed
  expanded: new Set(),
  loaded: { suppliers: false, ingredients: false, draft: false },
};

let mgmt = null;                // open management panel handle, or null

// Replace state.entries contents WITHOUT changing the reference (row closures keep working).
function setEntries(next) {
  Object.keys(state.entries).forEach(k => delete state.entries[k]);
  Object.assign(state.entries, next || {});
}

const hooks = {
  afterChange(supplierId) {
    const supplier = state.suppliers.find(s => s.id === supplierId);
    if (supplier) {
      refreshSupplierDerived(supplier, ingredientsBySupplier()[supplierId] || [], state.entries);
    }
    // Stamp the day these rows were touched. This is what lets the app offer an
    // order typed yesterday under YESTERDAY's date instead of quietly filing it
    // under today.
    state.days[supplierId] = todayISO();
    scheduleDraftSave(state.entries, state.days);
  },
  onPlaced(supplierId) {
    placeOrder(supplierId);
  },
};

function activeSuppliers() {
  return state.suppliers
    .filter(s => s.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function ingredientsBySupplier() {
  return groupBy(state.ingredients.filter(i => i.active !== false), 'supplierId');
}

function refreshAllSuppliers() {
  const bySupplier = ingredientsBySupplier();
  activeSuppliers().forEach(s => refreshSupplierDerived(s, bySupplier[s.id] || [], state.entries));
}

function syncInputsFromState() {
  document.querySelectorAll('#suppliers-list .ing-row').forEach(row => {
    const entry = state.entries[row.dataset.ing] || {};
    const stock = row.querySelector('.ing-stock');
    const qty = row.querySelector('.ing-qty');
    if (stock && stock !== document.activeElement) stock.value = entry.stock || '';
    if (qty && qty !== document.activeElement) qty.value = entry.qty || '';
  });
  refreshAllSuppliers();
}

// ── Rendering: order tab ──────────────────────────────────────────────────────
function render() {
  const container = document.getElementById('suppliers-list');
  if (!container) return;
  if (!state.loaded.suppliers || !state.loaded.ingredients) return;

  const suppliers = activeSuppliers();

  if (!suppliers.length) {
    renderEmptyState(container);
    return;
  }

  renderSuppliers(container, suppliers, ingredientsBySupplier(), {
    entries: state.entries,
    suggest: (id, stock) => computeSuggestion(id, stock, state.history),
    expanded: state.expanded,
    hooks,
  });
}

function renderEmptyState(container) {
  container.textContent = '';
  container.appendChild(el('div', { class: 'empty-state' }, [
    el('p', { class: 'empty-title', text: 'No suppliers yet' }),
    el('p', { class: 'empty-sub', text: 'Add your suppliers and ingredients from the settings panel (gear icon, top right).' }),
  ]));
}

// ── Rendering: history tab ────────────────────────────────────────────────────
function applyHistory(list) {
  state.history = list;
  renderHistory();
  render(); // refresh order-tab suggestions now that history is available
}

function renderHistory() {
  renderHistoryView(document.getElementById('history-list'), state.history, state.suppliers, state.ingredients);
}

function showAlerts() {
  renderAlerts(document.getElementById('orders-alerts'), state.suppliers);
}

// ── Send order (WhatsApp selection screen) ────────────────────────────────────
function openSendScreen() {
  const overlay = buildSendScreen(activeSuppliers(), ingredientsBySupplier(), state.entries, {
    onBack: () => overlay.remove(),
  });
  document.body.appendChild(overlay);
}

// ── Order placed (one supplier at a time) ─────────────────────────────────────

// The day a supplier's rows belong to: the day they were typed. Falls back to the
// draft's own timestamp for rows written before the app recorded that, and to
// today when there is nothing at all to go on.
function dayForSupplier(supplierId) {
  return state.days[supplierId] || localDayOf(state.draftUpdatedAt) || todayISO();
}

// "today" / "yesterday" / "on Mon 6 Jul 2026" — the confirm dialog always names
// the day, so recording a forgotten order under an older date is never a surprise.
function dayPhrase(date) {
  const label = dayLabel(date);
  return label === 'Today' || label === 'Yesterday' ? label.toLowerCase() : `on ${label}`;
}

// Drop a supplier's rows from the in-memory draft immediately, so the screen
// clears without waiting for the write to come back (and so a debounced save
// already in flight cannot resurrect them).
function forgetSupplierLocally(supplierId) {
  ingredientsOf(supplierId, state.ingredients, { activeOnly: false })
    .forEach(ing => { delete state.entries[ing.id]; });
  delete state.days[supplierId];
}

async function placeOrder(supplierId) {
  const supplier = state.suppliers.find(s => s.id === supplierId);
  if (!supplier) return;

  if (!supplierHasItems(supplierId, state.ingredients, state.entries)) {
    setStatus('Nothing to record for this supplier — add quantities first.', 'warn', 4000);
    return;
  }
  // Firestore has no offline persistence here, so the write would simply never
  // resolve and the tap would hang. Say so instead.
  if (!navigator.onLine) {
    setStatus("You're offline — reconnect to record this order.", 'error', 6000);
    return;
  }

  const ok = await confirmPlacement(supplier);
  if (!ok) return;

  const date = dayForSupplier(supplierId);
  try {
    // Any keystroke from the last 800ms is still sitting in the debounce timer —
    // possibly for ANOTHER supplier. Write it before the surgical clear, or it is
    // lost when the next snapshot arrives.
    await flushDraftSave();
    await archiveSupplier({
      supplier, ingredients: state.ingredients, entries: state.entries, date,
    });
    await clearSupplier(supplierId, state.ingredients);
    forgetSupplierLocally(supplierId);
    syncInputsFromState();
    renderReminders();
    setStatus(`${supplier.name} — order saved to history ✓`, 'ok', 5000);
  } catch (err) {
    console.error('Archiving order failed:', err);
    setStatus('Could not save the order — check your network and try again.', 'error');
  }
}

function confirmPlacement(supplier) {
  const date = dayForSupplier(supplier.id);
  const when = dayPhrase(date);
  const already = state.history.some(h => h.id === historyDocId(date, supplier.id));

  const message = already
    ? `An order for ${supplier.name} is already recorded ${when}. These items will be ADDED to it.\n\nSend the order on WhatsApp first — recording it clears the rows.`
    : `Record ${supplier.name}'s order ${when}?\n\nSend the order on WhatsApp first — recording it clears the rows.`;

  return confirmDialog({
    title: already ? `Add to ${supplier.name}'s order` : `${supplier.name} — order placed`,
    message,
    okLabel: already ? 'Add to it' : 'Order placed',
  });
}

// ── Reminders (today's orders / an order left from an earlier day) ────────────
function renderReminders() {
  // Filled in by the reminder banners (next commits). Kept as one call site so
  // every path that changes the draft or the history refreshes them.
}

// ── Management panel ──────────────────────────────────────────────────────────
function openManagement() {
  if (mgmt) return;
  mgmt = buildManagement(
    { suppliers: () => state.suppliers, ingredients: () => state.ingredients },
    {
      onClose: () => { mgmt.overlay.remove(); mgmt = null; },
      saveSupplier: (id, payload) =>
        id ? saveDoc(COLLECTIONS.suppliers, id, payload) : createDoc(COLLECTIONS.suppliers, payload),
      saveIngredient: (id, payload) =>
        id ? saveDoc(COLLECTIONS.ingredients, id, payload) : createDoc(COLLECTIONS.ingredients, payload),
      setSupplierActive: (id, active) => saveDoc(COLLECTIONS.suppliers, id, { active }),
      setIngredientActive: (id, active) => saveDoc(COLLECTIONS.ingredients, id, { active }),
      deleteSupplier: (id) => removeDoc(COLLECTIONS.suppliers, id),
      deleteIngredient: (id) => removeDoc(COLLECTIONS.ingredients, id),
    },
  );
  document.body.appendChild(mgmt.overlay);
}

// ── Tabs / status ─────────────────────────────────────────────────────────────
function setupTabs() {
  const tabs = [
    { btn: 'tab-order-btn', panel: 'tab-order' },
    { btn: 'tab-history-btn', panel: 'tab-history' },
  ];
  tabs.forEach(({ btn, panel }) => {
    const button = document.getElementById(btn);
    if (!button) return;
    button.addEventListener('click', () => {
      tabs.forEach(t => {
        document.getElementById(t.btn)?.classList.toggle('active', t.btn === btn);
        document.getElementById(t.panel)?.classList.toggle('active', t.panel === panel);
      });
    });
  });
}

let statusTimer = null;
// Set the status line. With autoHideMs, the line hides itself after that delay,
// but ONLY if its text is still the same — so a later error / "order saved"
// message set in the meantime is never wiped.
function setStatus(text, kind, autoHideMs) {
  const elStatus = document.getElementById('orders-status');
  if (!elStatus) return;
  clearTimeout(statusTimer);
  elStatus.hidden = false;
  elStatus.textContent = text;
  elStatus.className = 'orders-status' + (kind ? ' ' + kind : '');
  if (autoHideMs) {
    statusTimer = setTimeout(() => {
      if (elStatus.textContent === text) elStatus.hidden = true;
    }, autoHideMs);
  }
}

// Bottom bar shown ONLY while the device is offline. There is no
// "connecting/connected" message anymore: the page fills in when data streams in,
// and this is the single, quiet signal that there is no connection. Uses the
// browser's own network state (navigator.onLine + the online/offline events).
function setupOfflineIndicator() {
  const bar = document.getElementById('orders-offline');
  if (!bar) return;
  const sync = () => { bar.hidden = navigator.onLine; };
  sync();
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  setupTabs();
  document.getElementById('orders-wa-btn')?.addEventListener('click', openSendScreen);

  const settingsBtn = document.getElementById('settings-footer-btn');
  if (settingsBtn) {
    if (isAdmin) settingsBtn.addEventListener('click', openManagement);
    else settingsBtn.hidden = true;
  }

  setupOfflineIndicator();

  // No "connecting/connected" status: the data watchers below each await auth
  // internally, so they attach as soon as the (persisted) anonymous session is
  // ready and then stream live. init never blocks, so the page never sits waiting.

  // Refresh the official UK bank-holiday calendar (cached for offline; used by
  // the alerts). Fire-and-forget — failure falls back to the cached list.
  refreshBankHolidays().then(list => { console.log(`Bank holidays loaded: ${list.length} dates`); showAlerts(); });

  // Real-time draft: restores exact state on open and keeps staff in sync.
  watchDraft(draft => {
    setEntries(draft.entries);
    state.days = draft.days || {};
    state.draftUpdatedAt = draft.updatedAt;
    state.loaded.draft = true;
    syncInputsFromState();
    renderReminders();
  });

  watchCollectionBounded(COLLECTIONS.history, HISTORY_WINDOW, list => {
    applyHistory(list);
    renderReminders();
  });

  // Suppliers and ingredients stay unbounded: they are a handful of documents and
  // every one of them is needed to draw the screen. Only history grows without end.
  watchCollection(COLLECTIONS.suppliers, list => {
    state.suppliers = list;
    state.loaded.suppliers = true;
    render();
    renderHistory();
    showAlerts();
    renderReminders();
    mgmt?.refresh();
  });
  watchCollection(COLLECTIONS.ingredients, list => {
    state.ingredients = list;
    state.loaded.ingredients = true;
    render();
    renderHistory();
    renderReminders();
    mgmt?.refresh();
  });
}

init();
