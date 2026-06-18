// calculator-settings.js — the Settings hub and the address-book (Clients) editor.
//
// The footer "Settings" button opens a small chooser (#settings-overlay) whose
// entries each open their own overlay: Clients & products (this editor, #cp-overlay),
// WhatsApp (calculator-whatsapp-settings.js), Recipes (recipes.js), Extra dough and
// Divisor (below).
//
// This editor manages the single address book: a drill-in from the client list to a
// tapped client's detail with its products inline. Each product carries which dough
// it belongs to (focaccia/brioche/sourdough) and its own weight; the dough tabs are
// filtered views of this. (WhatsApp order lists live in their own editor and are
// fully independent of the dough tabs — see calculator-whatsapp-settings.js.)
//
// Detail screens show a prominent Save at the bottom; deleting is a small icon by
// the name (kept low-key). New clients/products start with EMPTY names and are
// validated on Save — nothing is persisted until every client and product has a
// name. Moving between levels never loses data — the editor works on a deep copy of
// the live config and nothing is touched until the user taps Save, which persists
// through the config store (Firestore + cache) and triggers a calculator re-render.
// Weights are clamped on save (a typo can never reach the dough math unbounded —
// see calculator-config.js).

import { getConfig, saveConfig } from './calculator-config-store.js';
import {
  WEIGHT_MIN, WEIGHT_MAX, TABS, cloneConfig, isExtraDoughEnabled, getTabProducts, isInDivisor,
} from './calculator-config.js';
import { el } from './calculator-render.js';
import { openRecipes } from './recipes.js';
import { openWhatsapp } from './calculator-whatsapp-settings.js';
import { confirmDiscard } from './calculator-confirm.js';
import Sortable from './vendor/sortable.esm.js';

const DOUGH_LABELS = { focaccia: 'Focaccia', brioche: 'Brioche', sourdough: 'Sourdough' };

// How the quantity is entered on the calculator. 'kg' is not offered here (it is a
// legacy widget tied to the old extra-dough product, no longer creatable).
const TYPE_LABELS = { number: 'Number', dropdown: 'Dropdown' };

let working = null;        // deep copy being edited
let activeClient = null;   // null = the client list, an index = a client's detail
let freshlyAdded = false;  // the item just opened was created by an "Add" button
let showErrors = false;    // after a failed Save, mark empty required fields
let dirty = false;

function show(id) { document.getElementById(id).classList.add('visible'); }
function hide(id) { document.getElementById(id).classList.remove('visible'); }

// Unique element id for a newly created client/product/group.
function genId(prefix) {
  return prefix + '-' + Math.random().toString(36).slice(2, 8);
}

function isBlank(s) { return !s || !String(s).trim(); }

// ── Hub ───────────────────────────────────────────────────────────────────────
export function openSettings() { show('settings-overlay'); }
function closeSettings() { hide('settings-overlay'); }

// ── Working-copy accessors (always present, even on a fresh/garbage config) ────
function clients() {
  if (!Array.isArray(working.clients)) working.clients = [];
  return working.clients;
}

function cpTitle() { return document.querySelector('#cp-overlay .recipe-overlay-title'); }

// The header Home button is hidden on detail screens (Edit client / Edit group),
// shown on the lists.
function setHomeVisible(visible) {
  const btn = document.getElementById('cp-home-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
}

function openClients() {
  working = cloneConfig(getConfig());
  activeClient = null;
  freshlyAdded = false;
  showErrors = false;
  dirty = false;
  renderEditor();
  updateSaveBtn();
  // Settings stays mounted underneath (lower z-index); closing this reveals it.
  show('cp-overlay');
}

// True when a just-added item was left untouched, so it should not be kept.
function isEmptyClient(c) {
  return !c || (isBlank(c.name) && (!c.products || c.products.length === 0));
}

// Contextual "back": step up one level (detail → list) without losing data —
// edits live in the working copy. A just-added but still-empty item is offered
// for discard, so leaving the "add" screen without filling anything does not
// leave junk behind. Only a real exit from a list fires the unsaved guard.
function closeClients() {
  if (activeClient !== null) {
    const client = clients()[activeClient];
    if (freshlyAdded && isEmptyClient(client)) {
      if (!confirm('Discard this new client? You have not added anything to it.')) return;
      clients().splice(activeClient, 1);
    }
    freshlyAdded = false;
    activeClient = null;
    renderEditor();
    return;
  }
  if (!confirmDiscard(dirty)) return;
  hide('cp-overlay');
}

// Jump straight to the home screen, guarding unsaved edits.
function goHomeFromClients() {
  if (!confirmDiscard(dirty)) return;
  window.location.href = 'index.html';
}

function markDirty() { dirty = true; updateSaveBtn(); }

function updateSaveBtn() {
  const btn = document.getElementById('cp-save-btn');
  btn.disabled = !dirty;
  btn.classList.toggle('dirty', dirty);
}

// The index of the first client with a missing name (its own or a product's), or
// null if every client and product is named.
function findInvalid() {
  const cs = clients();
  for (let i = 0; i < cs.length; i++) {
    if (isBlank(cs[i].name)) return i;
    for (const p of (cs[i].products || [])) {
      if (isBlank(p.name)) return i;
    }
  }
  return null;
}

async function saveClients() {
  // Required-field guard: never persist a nameless client/product/group. Jump to
  // the first offender and highlight the empty fields.
  const invalid = findInvalid();
  if (invalid !== null) {
    showErrors = true;
    activeClient = invalid;
    renderEditor();
    alert('Please give every client and product a name before saving.');
    return;
  }
  if (!confirm('Save these changes?')) return;
  try {
    await saveConfig(working);
    showErrors = false;
    dirty = false;
    updateSaveBtn();
    // Return to the client list — a clear "saved" signal and the natural next step
    // when adding clients one after another.
    freshlyAdded = false;
    activeClient = null;
    renderEditor();
  } catch (e) {
    alert('Could not save. Check your connection and try again.');
  }
}

// Dispatch to the active level: the client list, or a client's detail.
function renderEditor() {
  if (activeClient === null) renderClientList();
  else renderClientDetail(activeClient);
}

// A prominent Save button for the bottom of a detail screen.
function saveBottomButton() {
  const btn = el('button', { class: 'cp-save-bottom', type: 'button' }, 'Save');
  btn.addEventListener('click', saveClients);
  return btn;
}

// A small, low-key delete icon (used in a detail's header row).
function deleteIcon(label, onDelete) {
  const btn = el('button', { class: 'cp-del-icon', type: 'button', 'aria-label': label }, '🗑');
  btn.addEventListener('click', onDelete);
  return btn;
}

// ── Clients Level 0: the address book ─────────────────────────────────────────
let clientSortable = null; // active SortableJS instance on the client list

function renderClientList() {
  cpTitle().textContent = 'Clients & products';
  setHomeVisible(true);
  const content = document.getElementById('cp-content');
  if (clientSortable) { clientSortable.destroy(); clientSortable = null; }
  content.textContent = '';

  // The reorderable client boxes live in their own list wrapper; the "Add" button
  // sits outside it so it can never be dragged or used as a drop target.
  const listWrap = el('div', { class: 'cp-client-list' });
  clients().forEach((client, ci) => listWrap.appendChild(clientBox(client, ci)));
  content.appendChild(listWrap);

  if (clients().length > 1) {
    clientSortable = Sortable.create(listWrap, {
      animation: 150,
      delay: 200,            // hold to grab, so a quick swipe still scrolls/taps
      delayOnTouchOnly: true,
      draggable: '.drill-reorder',
      ghostClass: 'cp-sortable-ghost',
      chosenClass: 'cp-sortable-chosen',
      dragClass: 'cp-sortable-drag',
      onEnd: syncClientOrderFromDom,
    });
  }

  const add = el('button', { class: 'cp-add-client', type: 'button' }, '+ Add client');
  add.addEventListener('click', () => {
    clients().push({ id: genId('c'), name: '', products: [] });
    markDirty();
    freshlyAdded = true;
    activeClient = clients().length - 1;
    renderEditor();
  });
  content.appendChild(add);
}

// A tappable box that drills into a client's detail. It is also a SortableJS
// drag handle (class drill-reorder). The click looks up the client's CURRENT
// index by id, so it stays correct even after a reorder moved boxes around.
function clientBox(client, ci) {
  const box = el('button', { class: 'drill-item drill-reorder', type: 'button', 'data-cid': client.id }, [
    el('span', {}, client.name || 'Unnamed client'),
    el('span', { class: 'drill-chevron' }, '→'),
  ]);
  box.addEventListener('click', () => {
    const idx = clients().findIndex(c => c.id === client.id);
    if (idx === -1) return;
    freshlyAdded = false;
    activeClient = idx;
    renderEditor();
  });
  return box;
}

// After a drag, reorder the working client array to match the on-screen order.
// SortableJS has already moved the DOM nodes; we just read them back. Persists
// only on Save, like every other edit.
function syncClientOrderFromDom() {
  const ids = [...document.querySelectorAll('#cp-content .drill-reorder')].map(n => n.dataset.cid);
  const cs = clients();
  const before = cs.map(c => c.id).join('|');
  cs.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  if (cs.map(c => c.id).join('|') !== before) markDirty();
}

// ── Clients Level 1: a client's detail (name + product cards) ─────────────────
function renderClientDetail(ci) {
  const client = clients()[ci];
  cpTitle().textContent = 'Edit client';
  setHomeVisible(false);
  const content = document.getElementById('cp-content');
  content.textContent = '';

  // Name (prominent) with a small delete icon beside it.
  const nameInput = el('input', { class: 'cp-client-name', type: 'text', value: client.name || '', placeholder: 'Client name' });
  if (showErrors && isBlank(client.name)) nameInput.classList.add('cp-invalid');
  nameInput.addEventListener('input', () => { client.name = nameInput.value; nameInput.classList.remove('cp-invalid'); markDirty(); });
  const del = deleteIcon('Delete client', () => {
    if (!confirm('Delete this client and its products?')) return;
    clients().splice(ci, 1);
    markDirty();
    activeClient = null;
    renderEditor();
  });
  content.appendChild(el('div', { class: 'cp-field' }, [
    el('label', { class: 'cp-label' }, 'Client name'),
    el('div', { class: 'cp-name-row' }, [nameInput, del]),
  ]));

  // Products, each as its own clearly separated card.
  const cards = (client.products || []).map((p, pi) => productCard(client, p, pi));
  const addProd = el('button', { class: 'cp-add-prod', type: 'button' }, '+ Add product');
  addProd.addEventListener('click', () => {
    if (!client.products) client.products = [];
    client.products.push({ id: genId('p'), name: '', dough: 'focaccia', weight: 100, kind: 'number' });
    markDirty();
    renderEditor();
  });
  content.appendChild(el('div', { class: 'cp-field' }, [
    el('label', { class: 'cp-label' }, 'Products'), ...cards, addProd,
  ]));

  content.appendChild(saveBottomButton());
}

// One product card: a prominent name on top, then dough selector + weight, with a
// small delete icon. Clearly boxed so products do not blur into one another.
function productCard(client, p, pi) {
  const nameInput = el('input', { class: 'cp-prod-name', type: 'text', value: p.name || '', placeholder: 'Product name' });
  if (showErrors && isBlank(p.name)) nameInput.classList.add('cp-invalid');
  nameInput.addEventListener('input', () => { p.name = nameInput.value; nameInput.classList.remove('cp-invalid'); markDirty(); });

  const del = deleteIcon('Delete product', () => {
    client.products.splice(pi, 1);
    markDirty();
    renderEditor();
  });

  const dough = el('select', { class: 'cp-prod-dough', 'aria-label': 'Dough' });
  for (const t of TABS) {
    dough.appendChild(el('option', { value: t }, DOUGH_LABELS[t]));
  }
  dough.value = TABS.includes(p.dough) ? p.dough : 'focaccia';
  dough.addEventListener('change', () => { p.dough = dough.value; markDirty(); });

  // How the quantity is entered: a plain number field or a fixed preset dropdown.
  // Drives only the calculator widget, never the dough math. Hidden for the legacy
  // 'kg' widget (not creatable here).
  let typeRow = null;
  if (p.kind !== 'kg') {
    const type = el('select', { class: 'cp-prod-dough', 'aria-label': 'Quantity type' });
    for (const k of ['number', 'dropdown']) {
      type.appendChild(el('option', { value: k }, TYPE_LABELS[k]));
    }
    type.value = p.kind === 'dropdown' ? 'dropdown' : 'number';
    type.addEventListener('change', () => { p.kind = type.value; markDirty(); });
    typeRow = el('div', { class: 'cp-prod-card-row' }, [el('span', { class: 'cp-unit' }, 'Type'), type]);
  }

  const rowChildren = [dough];
  if (p.kind === 'kg') {
    // Extra-dough row: quantity is entered in kilograms, weight is not editable.
    rowChildren.push(el('span', { class: 'cp-kg-note' }, 'kg'));
  } else {
    const weight = el('input', {
      class: 'cp-prod-weight', type: 'number', min: String(WEIGHT_MIN), max: String(WEIGHT_MAX),
      step: '1', value: String(p.weight), inputmode: 'numeric',
    });
    weight.addEventListener('input', () => { p.weight = +weight.value || 0; markDirty(); });
    rowChildren.push(weight, el('span', { class: 'cp-unit' }, 'g'));
  }

  // Optional crate box: tick to show a "how many crates" helper in the calculator,
  // and set how many pieces fit one crate. Bound to this product (not its name). The
  // pieces field is enabled only while the box is on. Not offered for 'kg' products.
  let crateRow = null;
  if (p.kind !== 'kg') {
    if (!p.crate || typeof p.crate !== 'object') p.crate = { show: false, perBox: 20 };
    const crateToggle = el('input', { type: 'checkbox' });
    crateToggle.checked = !!p.crate.show;
    const perBoxInput = el('input', {
      class: 'cp-prod-weight', type: 'number', min: '1', max: '1000', step: '1',
      value: String(p.crate.perBox || 20), inputmode: 'numeric',
    });
    perBoxInput.disabled = !p.crate.show;
    crateToggle.addEventListener('change', () => {
      p.crate.show = crateToggle.checked;
      perBoxInput.disabled = !crateToggle.checked;
      markDirty();
    });
    perBoxInput.addEventListener('input', () => { p.crate.perBox = +perBoxInput.value || 0; markDirty(); });
    crateRow = el('div', { class: 'cp-prod-card-row' }, [
      el('label', { class: 'cp-crate-label' }, [crateToggle, el('span', {}, 'Crate box')]),
      perBoxInput,
      el('span', { class: 'cp-unit' }, 'pz'),
    ]);
  }

  return el('div', { class: 'cp-prod-card' }, [
    el('div', { class: 'cp-prod-card-head' }, [nameInput, del]),
    typeRow,
    el('div', { class: 'cp-prod-card-row' }, rowChildren),
    crateRow,
  ]);
}

// ── Extra-dough visibility (separate Settings screen) ─────────────────────────
// Three switches (one per dough tab) that show/hide the per-tab Extra-dough box.
// Stored in the shared config, applied immediately (local-first via saveConfig,
// which re-renders the calculator and best-effort syncs to Firestore).
function openExtra() {
  const cfg = getConfig();
  TABS.forEach(tab => {
    const cb = document.getElementById('extra-toggle-' + tab);
    if (cb) cb.checked = isExtraDoughEnabled(cfg, tab);
  });
  show('extra-overlay');
}
function closeExtra() { hide('extra-overlay'); }

TABS.forEach(tab => {
  const cb = document.getElementById('extra-toggle-' + tab);
  if (!cb) return;
  cb.addEventListener('change', () => {
    const cfg = cloneConfig(getConfig());
    if (!cfg.extraDough || typeof cfg.extraDough !== 'object') cfg.extraDough = {};
    cfg.extraDough[tab] = cb.checked;
    saveConfig(cfg);
  });
});
document.getElementById('open-extra-btn').addEventListener('click', openExtra);
document.querySelector('.extra-back-btn').addEventListener('click', closeExtra);
document.getElementById('extra-home-btn').addEventListener('click', () => { window.location.href = 'index.html'; });

// ── Divisor selection (separate Settings screen) ──────────────────────────────
// A drill-in: first a chooser of the three dough tabs, then a tapped tab's product
// checklist. Ticked = included in that tab's divisor box (opt-in: nothing is split
// until ticked, so a new product never joins on its own). Each change applies
// immediately (local-first via saveConfig, which re-renders the calculator and
// best-effort syncs to Firestore).
let divisorTab = null; // null = the tab chooser; a tab name = that tab's checklist

function openDivisor() { divisorTab = null; renderDivisorSettings(); show('divisor-overlay'); }
function closeDivisor() { hide('divisor-overlay'); }

// Contextual back: from a tab's checklist step up to the chooser; from the chooser
// close the overlay (revealing the Settings hub underneath).
function backDivisor() {
  if (divisorTab !== null) { divisorTab = null; renderDivisorSettings(); return; }
  closeDivisor();
}

function setDivisorTitle(text) {
  const t = document.querySelector('#divisor-overlay .recipe-overlay-title');
  if (t) t.textContent = text;
}
// Home is shown on the chooser, hidden on a tab's checklist (a detail screen).
function setDivisorHomeVisible(visible) {
  const btn = document.getElementById('divisor-home-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
}

function renderDivisorSettings() {
  if (divisorTab === null) renderDivisorTabChooser();
  else renderDivisorTabDetail(divisorTab);
}

// Level 0: one drill-in box per dough tab.
function renderDivisorTabChooser() {
  setDivisorTitle('Divisor');
  setDivisorHomeVisible(true);
  const content = document.getElementById('divisor-content');
  content.textContent = '';
  content.appendChild(el('p', { class: 'extra-help' },
    'Pick which products each tab’s divisor box splits into crates. Nothing is split until you tick it.'));
  for (const tab of TABS) {
    const box = el('button', { class: 'drill-item', type: 'button' }, [
      el('span', {}, DOUGH_LABELS[tab]),
      el('span', { class: 'drill-chevron' }, '→'),
    ]);
    box.addEventListener('click', () => { divisorTab = tab; renderDivisorSettings(); });
    content.appendChild(box);
  }
}

// Level 1: a tab's product checklist + an "Untick all" button.
function renderDivisorTabDetail(tab) {
  setDivisorTitle(DOUGH_LABELS[tab] + ' divisor');
  setDivisorHomeVisible(false);
  const content = document.getElementById('divisor-content');
  content.textContent = '';
  const products = getTabProducts(getConfig(), tab);
  if (products.length === 0) {
    content.appendChild(el('div', { class: 'cp-empty-hint' }, 'No products in this tab yet.'));
    return;
  }
  products.forEach(p => content.appendChild(divisorProductRow(tab, p)));
  const clearBtn = el('button', { class: 'divisor-clear-btn', type: 'button' }, 'Untick all');
  clearBtn.addEventListener('click', () => clearDivisorTab(tab));
  content.appendChild(clearBtn);
}

// A checkbox row toggling one product's membership in its tab's divisor. The
// client name disambiguates same-named products from different clients.
function divisorProductRow(tab, product) {
  const box = el('input', { type: 'checkbox' });
  box.checked = isInDivisor(getConfig(), tab, product.id);
  box.addEventListener('change', () => toggleDivisorProduct(tab, product.id, box.checked));
  const label = product.name + (product.clientName ? '  ·  ' + product.clientName : '');
  return el('label', { class: 'cp-check-row' }, [box, el('span', {}, label)]);
}

function toggleDivisorProduct(tab, productId, included) {
  const cfg = cloneConfig(getConfig());
  if (!cfg.divisorIncluded || typeof cfg.divisorIncluded !== 'object') cfg.divisorIncluded = {};
  const list = Array.isArray(cfg.divisorIncluded[tab]) ? cfg.divisorIncluded[tab] : [];
  const i = list.indexOf(productId);
  if (included && i === -1) list.push(productId);       // tick → include
  else if (!included && i !== -1) list.splice(i, 1);    // untick → exclude
  cfg.divisorIncluded[tab] = list;
  saveConfig(cfg);
}

// Untick every product of a tab at once, then re-render so the boxes reflect it.
function clearDivisorTab(tab) {
  const cfg = cloneConfig(getConfig());
  if (!cfg.divisorIncluded || typeof cfg.divisorIncluded !== 'object') cfg.divisorIncluded = {};
  cfg.divisorIncluded[tab] = [];
  saveConfig(cfg);
  renderDivisorSettings();
}

document.getElementById('open-divisor-btn').addEventListener('click', openDivisor);
document.querySelector('.divisor-back-btn').addEventListener('click', backDivisor);
document.getElementById('divisor-home-btn').addEventListener('click', () => { window.location.href = 'index.html'; });

// ── Static wiring (elements exist in calculator.html) ─────────────────────────
document.querySelector('.settings-back-btn').addEventListener('click', closeSettings);
document.getElementById('open-clients-btn').addEventListener('click', openClients);
// WhatsApp / Recipes / Extra dough / Divisor each open on top of Settings (which
// stays mounted underneath); closing them reveals Settings again. WhatsApp lists
// have their own editor module (calculator-whatsapp-settings.js).
document.getElementById('open-whatsapp-btn').addEventListener('click', openWhatsapp);
document.getElementById('open-recipes-btn').addEventListener('click', openRecipes);
document.querySelector('.cp-back-btn').addEventListener('click', closeClients);
document.getElementById('cp-home-btn').addEventListener('click', goHomeFromClients);
document.getElementById('cp-save-btn').addEventListener('click', saveClients);
