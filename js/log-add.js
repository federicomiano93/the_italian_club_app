// log-add.js — manual log creation from inside the Log section ("+ Add log"). Lets
// the user pick a dough, enter quantities, choose Today/Tomorrow and an optional
// name, then saves a brand-new log exactly like a calculator Confirm would (same
// sheet math + createAndSave). Independent of the calculator screen — the recipe and
// the log stay separate.

import { el } from './calculator-render.js';
import { getConfig } from './calculator-config-store.js';
import { getTabProducts, getDivisorIncluded } from './calculator-config.js';
import { RECIPES } from './recipes.js';
import { logTimestamp } from './log-time.js';
import { confirmDiscard } from './calculator-confirm.js';
import { buildSheet, buildLogText } from './log-model.js';
import { createAndSave } from './log-store.js';
import { qtyRow } from './log-qty.js';

const DOUGHS = ['Focaccia', 'Brioche', 'Sourdough'];
const DOUGH_TAB = { Focaccia: 'focaccia', Brioche: 'brioche', Sourdough: 'sourdough' };
const PARAM_DEFAULT = { Focaccia: 0.65, Brioche: 4, Sourdough: 18 };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

let state = null; // { dough, tab, forDay, calculatedBy, items[] } or null when closed

export function openLogAdd() {
  state = { dough: null, tab: null, forDay: null, calculatedBy: '', items: [] };
  render();
  updateSaveBtn();
  document.getElementById('logadd-overlay').classList.add('visible');
}

// "Has the user entered anything?" — guards the discard prompt on exit.
function isDirty() {
  if (!state) return false;
  return !!(state.dough || state.forDay || state.calculatedBy.trim() || state.items.some(it => num(it.qty) > 0));
}

function close(saved) {
  if (!saved && !confirmDiscard(isDirty())) return; // "continue editing" on cancel
  document.getElementById('logadd-overlay').classList.remove('visible');
  state = null;
}

// Load the chosen dough's products (quantities start at 0).
function loadDough(dough) {
  state.dough = dough;
  state.tab = DOUGH_TAB[dough];
  state.items = getTabProducts(getConfig(), state.tab).map(p => ({
    id: p.id, name: p.name, clientName: p.clientName, weightG: p.weight, kind: p.kind,
    crate: p.crate || { show: false, perBox: 20 }, qty: 0,
  }));
  render();
  updateSaveBtn();
}

// Save is enabled once both required choices are made (dough + day).
function updateSaveBtn() {
  const b = document.getElementById('logadd-save-btn');
  if (!b) return;
  const ready = !!(state && state.dough && state.forDay);
  b.disabled = !ready;
  b.classList.toggle('dirty', ready);
}

function render() {
  const c = document.getElementById('logadd-content');
  c.textContent = '';

  // Dough chooser (required, first).
  c.appendChild(el('div', { class: 'cp-label' }, 'Dough'));
  const doughChoices = el('div', { class: 'logday-choices' });
  for (const d of DOUGHS) {
    const btn = el('button', { class: 'logday-choice' + (state.dough === d ? ' selected' : ''), type: 'button' }, d);
    btn.addEventListener('click', () => loadDough(d));
    doughChoices.appendChild(btn);
  }
  c.appendChild(doughChoices);

  if (!state.dough) {
    c.appendChild(el('div', { class: 'cp-empty-hint' }, 'Pick a dough to enter quantities.'));
    return;
  }

  // Optional "calculated by" name.
  const by = el('input', { class: 'cp-client-name', type: 'text', value: state.calculatedBy, placeholder: 'Name (optional)' });
  by.addEventListener('input', () => { state.calculatedBy = by.value; });
  c.appendChild(el('div', { class: 'cp-field' }, [el('label', { class: 'cp-label' }, 'Calculated by'), by]));

  // Today / Tomorrow (required).
  c.appendChild(el('div', { class: 'cp-label' }, 'When is this dough for?'));
  const dayChoices = el('div', { class: 'logday-choices' });
  for (const d of ['today', 'tomorrow']) {
    const btn = el('button', { class: 'logday-choice' + (state.forDay === d ? ' selected' : ''), type: 'button' }, d === 'today' ? 'Today' : 'Tomorrow');
    btn.addEventListener('click', () => { state.forDay = d; render(); updateSaveBtn(); });
    dayChoices.appendChild(btn);
  }
  c.appendChild(dayChoices);

  // Quantities, grouped by client (same shape as the edit screen).
  c.appendChild(el('div', { class: 'cp-label' }, 'Products — quantities only'));
  if (!state.items.length) {
    c.appendChild(el('div', { class: 'cp-empty-hint' }, 'No products in this category.'));
  }
  let lastClient = null;
  let card = null;
  for (const it of state.items) {
    if (it.clientName !== lastClient || card === null) {
      lastClient = it.clientName;
      card = el('div', { class: 'card' }, [el('div', { class: 'card-title' }, it.clientName || 'Client')]);
      c.appendChild(card);
    }
    card.appendChild(qtyRow(it, (q) => { it.qty = q; }));
  }

  const save = el('button', { class: 'cp-save-bottom', type: 'button' }, 'Save log');
  save.addEventListener('click', commit);
  c.appendChild(save);
}

// Build and save a brand-new log — same math/shape as a calculator Confirm.
function commit() {
  if (!state || !state.dough || !state.forDay) return;
  if (!confirm('Save this log?')) return;
  const tab = state.tab;
  const items = state.items.map(it => ({
    id: it.id, name: it.name, clientName: it.clientName,
    qty: num(it.qty), weightG: num(it.weightG), kind: it.kind, crate: it.crate,
  }));
  const param = PARAM_DEFAULT[state.dough];
  const divisor = { includedIds: getDivisorIncluded(getConfig(), tab), n: 0 };
  const sheet = buildSheet({ dough: state.dough, recipe: RECIPES[tab], items, extraGrams: 0, param, divisor });
  const text = buildLogText(items, [], { grams: 0, value: 0, unit: 'g' });
  const version = { calculatedBy: (state.calculatedBy || '').trim(), at: logTimestamp(), kind: 'create', items, occasional: [], sheet, text };
  createAndSave({ dough: state.dough, forDay: state.forDay, version, createdAtMs: Date.now() });
  close(true);
}

// ── Wiring (elements exist in calculator.html) ────────────────────────────────
document.querySelector('.logadd-back-btn').addEventListener('click', () => close(false));
document.getElementById('logadd-save-btn').addEventListener('click', commit);
