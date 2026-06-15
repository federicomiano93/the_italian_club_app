// orders-main.js — entry point for orders.html.
//
// Phase 1: tab navigation + Firebase connectivity.
// Phase 2: render suppliers/ingredients with stock + order fields.
// Phase 3: persistent autosaving draft, real-time sync across staff, order
// preview grouped by supplier, and send (WhatsApp/Email) + archive to history.

import { authReady, watchCollection, getCollection, COLLECTIONS } from './firebase-orders.js';
import { el, groupBy } from './dom.js';
import { renderSuppliers, refreshSupplierDerived } from './suppliers.js';
import { seedSampleData } from './sample-data.js';
import { scheduleDraftSave, watchDraft, archiveOrder, clearDraft } from './draft.js';
import { buildPreview } from './preview.js';

const state = {
  suppliers: [],
  ingredients: [],
  lastWeek: {},
  entries: {},                  // { ingredientId: { qty, stock } } — shared object, mutated in place
  expanded: new Set(),
  loaded: { suppliers: false, ingredients: false },
};

// Replace the contents of state.entries WITHOUT changing the object reference,
// so the row closures (which captured this object) stay valid after a remote sync.
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
    scheduleDraftSave(state.entries); // autosave (debounced)
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

// Apply state.entries to the inputs already on screen (used after a remote sync).
// Skips the field the user is currently editing so their typing is never clobbered.
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

// ── Rendering ─────────────────────────────────────────────────────────────────
function render() {
  const container = document.getElementById('suppliers-list');
  if (!container) return;
  if (!state.loaded.suppliers || !state.loaded.ingredients) return;

  const suppliers = activeSuppliers();
  const previewBtn = document.getElementById('preview-btn');

  if (!suppliers.length) {
    if (previewBtn) previewBtn.hidden = true;
    renderEmptyState(container);
    return;
  }

  renderSuppliers(container, suppliers, ingredientsBySupplier(), {
    entries: state.entries,
    lastWeek: state.lastWeek,
    expanded: state.expanded,
    hooks,
  });
  if (previewBtn) previewBtn.hidden = false;
}

function renderEmptyState(container) {
  container.textContent = '';
  const btn = el('button', {
    type: 'button',
    class: 'seed-btn',
    onClick: async () => {
      btn.disabled = true;
      btn.textContent = 'Loading sample data…';
      try {
        await seedSampleData();
        await loadHistory();
      } catch (err) {
        console.error('Seeding sample data failed:', err);
        btn.disabled = false;
        btn.textContent = 'Retry — load sample data';
      }
    },
  }, 'Load sample data');

  container.appendChild(el('div', { class: 'empty-state' }, [
    el('p', { class: 'empty-title', text: 'No suppliers yet' }),
    el('p', { class: 'empty-sub', text: 'Load a set of sample suppliers and ingredients to try the order workflow.' }),
    btn,
  ]));
}

// ── Preview / send ────────────────────────────────────────────────────────────
function openPreview() {
  const overlay = buildPreview(activeSuppliers(), ingredientsBySupplier(), state.entries, {
    onBack: () => overlay.remove(),
    onArchive: async () => {
      try {
        await archiveOrder(state.entries);
        await clearDraft();
        setEntries({});
        syncInputsFromState();
        overlay.remove();
        setStatus('Order saved to history ✓', 'ok');
      } catch (err) {
        console.error('Archiving order failed:', err);
        setStatus('Could not save the order — check your network and try again.', 'error');
      }
    },
  });
  document.body.appendChild(overlay);
}

// ── Data loading ────────────────────────────────────────────────────────────
async function loadHistory() {
  try {
    const history = await getCollection(COLLECTIONS.history);
    history.sort((a, b) => String(b.weekStart || '').localeCompare(String(a.weekStart || '')));
    state.lastWeek = history[0]?.quantities || {};
  } catch (err) {
    console.error('Loading order history failed:', err);
    state.lastWeek = {};
  }
  render();
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

function setStatus(text, kind) {
  const elStatus = document.getElementById('orders-status');
  if (!elStatus) return;
  elStatus.textContent = text;
  elStatus.className = 'orders-status' + (kind ? ' ' + kind : '');
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  setupTabs();
  document.getElementById('preview-btn')?.addEventListener('click', openPreview);

  try {
    await authReady;
    setStatus('Connected ✓', 'ok');
  } catch (err) {
    console.error('Auth failed:', err);
    setStatus('Connection problem — check your network and reload.', 'error');
    return;
  }

  await loadHistory();

  // Real-time draft: restores the exact state on open and keeps staff in sync.
  watchDraft(entries => {
    setEntries(entries);
    syncInputsFromState();
  });

  watchCollection(COLLECTIONS.suppliers, list => {
    state.suppliers = list;
    state.loaded.suppliers = true;
    render();
  });
  watchCollection(COLLECTIONS.ingredients, list => {
    state.ingredients = list;
    state.loaded.ingredients = true;
    render();
  });
}

init();
