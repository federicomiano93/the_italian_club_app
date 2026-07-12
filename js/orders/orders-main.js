// orders-main.js — entry point for orders.html.
//
// Phase 1: tab navigation + Firebase connectivity.
// Phase 2: render suppliers/ingredients with stock + order fields.
// Phase 3: persistent autosaving draft, real-time sync, preview + send/archive.
// Phase 4: order history view + management panel (suppliers & ingredients).

import { watchCollection, saveDoc, createDoc, removeDoc, COLLECTIONS } from './firebase-orders.js';
import { el, groupBy } from './dom.js';
import { renderSuppliers, refreshSupplierDerived } from './suppliers.js';
import { scheduleDraftSave, watchDraft, archiveOrder, clearDraft } from './draft.js';
import { buildSendScreen } from './preview.js';
import { renderHistory as renderHistoryView } from './history.js';
import { buildManagement, isAdmin } from './management.js';
import { computeSuggestion } from './suggestions.js';
import { refreshBankHolidays } from './bank-holidays.js';
import { renderAlerts } from './notifications.js';
import { confirmDialog } from './confirm-dialog.js';

const state = {
  suppliers: [],
  ingredients: [],
  history: [],
  entries: {},                  // { ingredientId: { qty, stock } } — shared object, mutated in place
  expanded: new Set(),
  loaded: { suppliers: false, ingredients: false },
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
    scheduleDraftSave(state.entries);
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
  const placedBtn = document.getElementById('orders-placed-btn');

  if (!suppliers.length) {
    if (placedBtn) placedBtn.hidden = true;
    renderEmptyState(container);
    return;
  }

  renderSuppliers(container, suppliers, ingredientsBySupplier(), {
    entries: state.entries,
    suggest: (id, stock) => computeSuggestion(id, stock, state.history),
    expanded: state.expanded,
    hooks,
  });
  if (placedBtn) placedBtn.hidden = false;
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

// ── Orders placed (confirm → archive to history + clear the current order) ────
async function ordersPlaced() {
  const hasItems = Object.values(state.entries).some(e => (e?.qty || 0) > 0);
  if (!hasItems) {
    setStatus('Nothing to archive yet — add quantities first.', 'warn');
    return;
  }
  const ok = await confirmDialog({
    message: 'Mark this order as placed? It will be saved to History and the current order cleared.',
    okLabel: 'Orders placed',
  });
  if (!ok) return;
  try {
    await archiveOrder(state.entries);
    await clearDraft();
    setEntries({});
    syncInputsFromState();
    setStatus('Order saved to history ✓', 'ok');
  } catch (err) {
    console.error('Archiving order failed:', err);
    setStatus('Could not save the order — check your network and try again.', 'error');
  }
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
// message set in the meantime is never wiped. Used to make "Connected ✓" fade.
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
  document.getElementById('orders-placed-btn')?.addEventListener('click', ordersPlaced);
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
  // the Phase 6 alerts). Fire-and-forget — failure falls back to the cached list.
  refreshBankHolidays().then(list => { console.log(`Bank holidays loaded: ${list.length} dates`); showAlerts(); });

  // Real-time draft: restores exact state on open and keeps staff in sync.
  watchDraft(entries => {
    setEntries(entries);
    syncInputsFromState();
  });

  watchCollection(COLLECTIONS.history, applyHistory);

  watchCollection(COLLECTIONS.suppliers, list => {
    state.suppliers = list;
    state.loaded.suppliers = true;
    render();
    renderHistory();
    showAlerts();
    mgmt?.refresh();
  });
  watchCollection(COLLECTIONS.ingredients, list => {
    state.ingredients = list;
    state.loaded.ingredients = true;
    render();
    renderHistory();
    mgmt?.refresh();
  });
}

init();
