// orders-main.js — entry point for orders.html.
//
// Phase 1: tab navigation + Firebase connectivity check.
// Phase 2: load suppliers/ingredients/history, render the supplier list with
// per-supplier ingredient lists, progress bars, badges and counters. An empty
// database offers a "Load sample data" button (test scaffolding, see
// sample-data.js). Draft persistence and sending come in Phase 3.

import { authReady, watchCollection, getCollection, COLLECTIONS } from './firebase-orders.js';
import { el, groupBy } from './dom.js';
import { renderSuppliers, refreshSupplierDerived } from './suppliers.js';
import { seedSampleData } from './sample-data.js';

const state = {
  suppliers: [],
  ingredients: [],
  lastWeek: {},                 // { ingredientId: quantity } from the latest history week
  entries: {},                  // { ingredientId: { qty, stock, checked } } — this week's draft (in memory for now)
  expanded: new Set(),          // ids of expanded supplier cards
  loaded: { suppliers: false, ingredients: false },
};

// Refresh a supplier's badge/counter/progress when a row changes (no full rebuild).
const hooks = {
  afterChange(supplierId) {
    const supplier = state.suppliers.find(s => s.id === supplierId);
    if (!supplier) return;
    const ings = ingredientsBySupplier()[supplierId] || [];
    refreshSupplierDerived(supplier, ings, state.entries);
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

// ── Rendering ─────────────────────────────────────────────────────────────────
function render() {
  const container = document.getElementById('suppliers-list');
  if (!container) return;
  // Wait until both collections have reported at least once.
  if (!state.loaded.suppliers || !state.loaded.ingredients) return;

  const suppliers = activeSuppliers();
  if (!suppliers.length) {
    renderEmptyState(container);
    return;
  }

  renderSuppliers(container, suppliers, ingredientsBySupplier(), {
    entries: state.entries,
    lastWeek: state.lastWeek,
    expanded: state.expanded,
    hooks,
  });
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

// ── Tab navigation (Order / History) ─────────────────────────────────────────
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
  try {
    await authReady;
    setStatus('Connected ✓', 'ok');
  } catch (err) {
    console.error('Auth failed:', err);
    setStatus('Connection problem — check your network and reload.', 'error');
    return;
  }

  await loadHistory();
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
