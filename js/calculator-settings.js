// calculator-settings.js — the Settings hub, the Clients editor and the Products
// (catalogue) editor.
//
// The footer "Settings" button opens a small chooser (#settings-overlay) whose
// entries each open their own overlay: Clients (this editor, #cp-overlay), Products
// (the catalogue editor, #products-overlay, below), WhatsApp
// (calculator-whatsapp-settings.js), Recipes (recipes.js), Extra dough and Divisor.
//
// THE MODEL (Stage 3): products live ONCE in a shared catalogue (config.products[]),
// each with a name, a recipe and a weight. A client has `items[]`: the products it
// orders, each association carrying how its quantity is entered (`kind`) and its
// optional crate box (`crate`). So:
//   • Products edits the catalogue: create / rename / delete a product, set its
//     recipe and weight. A product used by a client cannot be deleted until it is
//     removed from those clients first (safer — P20).
//   • Clients edits the address book: a client's name and the products it orders,
//     each picked from the catalogue via a dropdown, with its quantity type and crate.
//
// Both editors work on a deep copy of the live config and touch nothing until the
// user taps Save (with a confirm), which persists through the config store (Firestore
// + cache) and triggers a calculator re-render. Required fields are validated on Save;
// deleting is a small low-key icon, never competing with Save (P20).

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

let working = null;        // Clients editor: deep copy being edited
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

// ── Clients editor ─────────────────────────────────────────────────────────────
function clients() {
  if (!Array.isArray(working.clients)) working.clients = [];
  return working.clients;
}
function catalogue() {
  return Array.isArray(working.products) ? working.products : [];
}
function productOf(id) {
  return catalogue().find(p => p && p.id === id) || null;
}

function cpTitle() { return document.querySelector('#cp-overlay .recipe-overlay-title'); }

// The header Home button is hidden on detail screens, shown on the list.
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
  show('cp-overlay');
}

// True when a just-added client was left untouched (no name, no items), so it should
// not be kept when leaving its detail screen.
function isEmptyClient(c) {
  return !c || (isBlank(c.name) && (!c.items || c.items.length === 0));
}

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

// The index of the first client that is invalid (a blank name, or an item with no
// product chosen), or null if every client and item is complete.
function findInvalid() {
  const cs = clients();
  for (let i = 0; i < cs.length; i++) {
    if (isBlank(cs[i].name)) return i;
    for (const it of (cs[i].items || [])) {
      if (!it.productId || !productOf(it.productId)) return i;
    }
  }
  return null;
}

async function saveClients() {
  const invalid = findInvalid();
  if (invalid !== null) {
    showErrors = true;
    activeClient = invalid;
    renderEditor();
    alert('Please name every client and choose a product for every row before saving.');
    return;
  }
  if (!confirm('Save these changes?')) return;
  try {
    await saveConfig(working);
    showErrors = false;
    dirty = false;
    updateSaveBtn();
    freshlyAdded = false;
    activeClient = null;
    renderEditor();
  } catch (e) {
    alert('Could not save. Check your connection and try again.');
  }
}

function renderEditor() {
  if (activeClient === null) renderClientList();
  else renderClientDetail(activeClient);
}

function saveBottomButton(onSave) {
  const btn = el('button', { class: 'cp-save-bottom', type: 'button' }, 'Save');
  btn.addEventListener('click', onSave);
  return btn;
}

function deleteIcon(label, onDelete) {
  const btn = el('button', { class: 'cp-del-icon', type: 'button', 'aria-label': label }, '🗑');
  btn.addEventListener('click', onDelete);
  return btn;
}

// ── Clients Level 0: the address book ─────────────────────────────────────────
let clientSortable = null;

function renderClientList() {
  cpTitle().textContent = 'Clients';
  setHomeVisible(true);
  const content = document.getElementById('cp-content');
  if (clientSortable) { clientSortable.destroy(); clientSortable = null; }
  content.textContent = '';

  const listWrap = el('div', { class: 'cp-client-list' });
  clients().forEach((client, ci) => listWrap.appendChild(clientBox(client, ci)));
  content.appendChild(listWrap);

  if (clients().length > 1) {
    clientSortable = Sortable.create(listWrap, {
      animation: 150,
      delay: 200,
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
    clients().push({ id: genId('c'), name: '', items: [] });
    markDirty();
    freshlyAdded = true;
    activeClient = clients().length - 1;
    renderEditor();
  });
  content.appendChild(add);
}

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

function syncClientOrderFromDom() {
  const ids = [...document.querySelectorAll('#cp-content .drill-reorder')].map(n => n.dataset.cid);
  const cs = clients();
  const before = cs.map(c => c.id).join('|');
  cs.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  if (cs.map(c => c.id).join('|') !== before) markDirty();
}

// ── Clients Level 1: a client's detail (name + ordered-product cards) ──────────
function renderClientDetail(ci) {
  const client = clients()[ci];
  if (!Array.isArray(client.items)) client.items = [];
  cpTitle().textContent = 'Edit client';
  setHomeVisible(false);
  const content = document.getElementById('cp-content');
  content.textContent = '';

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

  // The products this client orders, each its own card. Products come from the
  // catalogue (the Products tab) — here you only pick which ones, and set how the
  // quantity is entered and the crate box (these can differ per client).
  const field = el('div', { class: 'cp-field' }, [el('label', { class: 'cp-label' }, 'Products ordered')]);
  if (catalogue().length === 0) {
    field.appendChild(el('div', { class: 'cp-empty-hint' }, 'No products yet. Add them in Settings → Products first, then come back here.'));
  } else {
    client.items.forEach((it, ii) => field.appendChild(itemCard(client, it, ii)));
    const addProd = el('button', { class: 'cp-add-prod', type: 'button' }, '+ Add product');
    addProd.addEventListener('click', () => {
      client.items.push({ productId: '', kind: 'number', crate: { show: false, perBox: 20 } });
      markDirty();
      renderEditor();
    });
    field.appendChild(addProd);
  }
  content.appendChild(field);

  content.appendChild(saveBottomButton(saveClients));
}

// One ordered-product card: a dropdown to pick which catalogue product, a read-only
// line showing its recipe + weight, the quantity type, the crate box, and a remove
// icon. Picking a product re-renders so the recipe/weight line updates.
function itemCard(client, item, ii) {
  const del = deleteIcon('Remove product', () => {
    client.items.splice(ii, 1);
    markDirty();
    renderEditor();
  });

  // Product dropdown: catalogue products not already ordered by this client (plus the
  // one this row currently holds), so a client never orders the same product twice.
  const usedElsewhere = new Set(
    client.items.filter((_, i) => i !== ii).map(i => i.productId).filter(Boolean)
  );
  const select = el('select', { class: 'cp-prod-name', 'aria-label': 'Product' });
  select.appendChild(el('option', { value: '' }, '— Choose a product —'));
  for (const p of catalogue()) {
    if (usedElsewhere.has(p.id)) continue;
    const opt = el('option', { value: p.id }, p.name + ' (' + DOUGH_LABELS[p.recipeId] + ')');
    select.appendChild(opt);
  }
  select.value = item.productId || '';
  if (showErrors && (!item.productId || !productOf(item.productId))) select.classList.add('cp-invalid');
  select.addEventListener('change', () => { item.productId = select.value; markDirty(); renderEditor(); });

  const head = el('div', { class: 'cp-prod-card-head' }, [select, del]);

  const product = productOf(item.productId);
  const children = [head];

  if (product) {
    children.push(el('div', { class: 'cp-prod-card-row' }, [
      el('span', { class: 'cp-unit' }, DOUGH_LABELS[product.recipeId] + ' · ' + product.weight + ' g'),
    ]));

    if (item.kind === 'kg') {
      // Legacy kg association: quantity entered in kilograms; no type/crate options.
      children.push(el('div', { class: 'cp-prod-card-row' }, [el('span', { class: 'cp-kg-note' }, 'kg')]));
    } else {
      const type = el('select', { class: 'cp-prod-dough', 'aria-label': 'Quantity type' });
      for (const k of ['number', 'dropdown']) type.appendChild(el('option', { value: k }, TYPE_LABELS[k]));
      type.value = item.kind === 'dropdown' ? 'dropdown' : 'number';
      type.addEventListener('change', () => { item.kind = type.value; markDirty(); });
      children.push(el('div', { class: 'cp-prod-card-row' }, [el('span', { class: 'cp-unit' }, 'Type'), type]));

      if (!item.crate || typeof item.crate !== 'object') item.crate = { show: false, perBox: 20 };
      const crateToggle = el('input', { type: 'checkbox' });
      crateToggle.checked = !!item.crate.show;
      const perBoxInput = el('input', {
        class: 'cp-prod-weight', type: 'number', min: '1', max: '1000', step: '1',
        value: String(item.crate.perBox || 20), inputmode: 'numeric',
      });
      perBoxInput.disabled = !item.crate.show;
      crateToggle.addEventListener('change', () => {
        item.crate.show = crateToggle.checked;
        perBoxInput.disabled = !crateToggle.checked;
        markDirty();
      });
      perBoxInput.addEventListener('input', () => { item.crate.perBox = +perBoxInput.value || 0; markDirty(); });
      children.push(el('div', { class: 'cp-prod-card-row' }, [
        el('label', { class: 'cp-crate-label' }, [crateToggle, el('span', {}, 'Crate box')]),
        perBoxInput,
        el('span', { class: 'cp-unit' }, 'pz'),
      ]));
    }
  }

  return el('div', { class: 'cp-prod-card' }, children);
}

// ── Products (catalogue) editor ────────────────────────────────────────────────
// The shared product list: create / rename / delete a product, set its recipe and
// weight. A product ordered by a client cannot be deleted until removed from those
// clients first. Edited on its own working copy, saved with a confirm.
let prodWorking = null;
let prodActive = null;   // null = the product list, an index = a product's detail
let prodFresh = false;
let prodShowErrors = false;
let prodDirty = false;

function pcProducts() {
  if (!Array.isArray(prodWorking.products)) prodWorking.products = [];
  return prodWorking.products;
}
function pcTitle() { return document.querySelector('#products-overlay .recipe-overlay-title'); }
function setProdHomeVisible(visible) {
  const btn = document.getElementById('products-home-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
}
function prodMarkDirty() { prodDirty = true; updateProdSaveBtn(); }
function updateProdSaveBtn() {
  const btn = document.getElementById('products-save-btn');
  if (!btn) return;
  btn.disabled = !prodDirty;
  btn.classList.toggle('dirty', prodDirty);
}

function openProducts() {
  prodWorking = cloneConfig(getConfig());
  prodActive = null;
  prodFresh = false;
  prodShowErrors = false;
  prodDirty = false;
  renderProductsEditor();
  updateProdSaveBtn();
  show('products-overlay');
}

// How many clients order a given product (drives the delete guard + the list hint).
function clientCountFor(productId) {
  let n = 0;
  for (const c of (prodWorking.clients || [])) {
    if ((c.items || []).some(i => i.productId === productId)) n++;
  }
  return n;
}

function isEmptyProduct(p) { return !p || isBlank(p.name); }

function closeProducts() {
  if (prodActive !== null) {
    const product = pcProducts()[prodActive];
    if (prodFresh && isEmptyProduct(product)) {
      if (!confirm('Discard this new product? You have not named it.')) return;
      pcProducts().splice(prodActive, 1);
    }
    prodFresh = false;
    prodActive = null;
    renderProductsEditor();
    return;
  }
  if (!confirmDiscard(prodDirty)) return;
  hide('products-overlay');
}

function goHomeFromProducts() {
  if (!confirmDiscard(prodDirty)) return;
  window.location.href = 'index.html';
}

function findInvalidProduct() {
  const ps = pcProducts();
  for (let i = 0; i < ps.length; i++) if (isBlank(ps[i].name)) return i;
  return null;
}

async function saveProducts() {
  const invalid = findInvalidProduct();
  if (invalid !== null) {
    prodShowErrors = true;
    prodActive = invalid;
    renderProductsEditor();
    alert('Please give every product a name before saving.');
    return;
  }
  if (!confirm('Save these changes?')) return;
  try {
    await saveConfig(prodWorking);
    prodShowErrors = false;
    prodDirty = false;
    updateProdSaveBtn();
    prodFresh = false;
    prodActive = null;
    renderProductsEditor();
  } catch (e) {
    alert('Could not save. Check your connection and try again.');
  }
}

function renderProductsEditor() {
  if (prodActive === null) renderProductsList();
  else renderProductDetail(prodActive);
}

// Level 0: the catalogue, grouped by recipe, each product a drill-in row.
function renderProductsList() {
  pcTitle().textContent = 'Products';
  setProdHomeVisible(true);
  const content = document.getElementById('products-content');
  content.textContent = '';
  content.appendChild(el('p', { class: 'extra-help' },
    'Your products, grouped by recipe. Tap one to edit its name, recipe or weight, or add a new one. Pick which clients order them in Settings → Clients.'));

  const products = pcProducts();
  if (products.length === 0) {
    content.appendChild(el('div', { class: 'cp-empty-hint' }, 'No products yet. Add your first one below.'));
  } else {
    for (const tab of TABS) {
      const inTab = products.filter(p => p.recipeId === tab);
      if (inTab.length === 0) continue;
      content.appendChild(el('div', { class: 'section-label' }, DOUGH_LABELS[tab]));
      inTab.forEach(p => content.appendChild(productListBox(p)));
    }
  }

  const add = el('button', { class: 'cp-add-client', type: 'button' }, '+ Add product');
  add.addEventListener('click', () => {
    pcProducts().push({ id: genId('p'), name: '', recipeId: 'focaccia', weight: 100 });
    prodMarkDirty();
    prodFresh = true;
    prodActive = pcProducts().length - 1;
    renderProductsEditor();
  });
  content.appendChild(add);
}

function productListBox(product) {
  const n = clientCountFor(product.id);
  const sub = product.weight + ' g' + (n ? '  ·  ' + n + (n === 1 ? ' client' : ' clients') : '  ·  unused');
  const box = el('button', { class: 'drill-item wa-entry-open', type: 'button', 'data-pid': product.id }, [
    el('span', { class: 'wa-entry-text' }, [
      el('span', { class: 'wa-entry-name' }, product.name || 'Unnamed product'),
      el('span', { class: 'wa-entry-sub' }, sub),
    ]),
    el('span', { class: 'drill-chevron' }, '→'),
  ]);
  box.addEventListener('click', () => {
    const idx = pcProducts().findIndex(p => p.id === product.id);
    if (idx === -1) return;
    prodFresh = false;
    prodActive = idx;
    renderProductsEditor();
  });
  return box;
}

// Level 1: a product's detail — name, recipe, weight, and a low-key delete (blocked
// while any client still orders it).
function renderProductDetail(pi) {
  const product = pcProducts()[pi];
  pcTitle().textContent = 'Edit product';
  setProdHomeVisible(false);
  const content = document.getElementById('products-content');
  content.textContent = '';

  const nameInput = el('input', { class: 'cp-client-name', type: 'text', value: product.name || '', placeholder: 'Product name' });
  if (prodShowErrors && isBlank(product.name)) nameInput.classList.add('cp-invalid');
  nameInput.addEventListener('input', () => { product.name = nameInput.value; nameInput.classList.remove('cp-invalid'); prodMarkDirty(); });

  const used = clientCountFor(product.id);
  const del = deleteIcon('Delete product', () => {
    if (used > 0) {
      alert('This product is ordered by ' + used + (used === 1 ? ' client' : ' clients') + '. Remove it from them in Settings → Clients first.');
      return;
    }
    if (!confirm('Delete this product?')) return;
    pcProducts().splice(pi, 1);
    prodMarkDirty();
    prodActive = null;
    renderProductsEditor();
  });
  content.appendChild(el('div', { class: 'cp-field' }, [
    el('label', { class: 'cp-label' }, 'Product name'),
    el('div', { class: 'cp-name-row' }, [nameInput, del]),
  ]));

  // Recipe selector.
  const recipe = el('select', { class: 'cp-prod-dough', 'aria-label': 'Recipe' });
  for (const t of TABS) recipe.appendChild(el('option', { value: t }, DOUGH_LABELS[t]));
  recipe.value = TABS.includes(product.recipeId) ? product.recipeId : 'focaccia';
  recipe.addEventListener('change', () => { product.recipeId = recipe.value; prodMarkDirty(); });
  content.appendChild(el('div', { class: 'cp-field' }, [
    el('label', { class: 'cp-label' }, 'Recipe'),
    recipe,
  ]));

  // Weight (grams).
  const weight = el('input', {
    class: 'cp-prod-weight', type: 'number', min: String(WEIGHT_MIN), max: String(WEIGHT_MAX),
    step: '1', value: String(product.weight), inputmode: 'numeric',
  });
  weight.addEventListener('input', () => { product.weight = +weight.value || 0; prodMarkDirty(); });
  content.appendChild(el('div', { class: 'cp-field' }, [
    el('label', { class: 'cp-label' }, 'Weight'),
    el('div', { class: 'cp-prod-card-row' }, [weight, el('span', { class: 'cp-unit' }, 'g')]),
  ]));

  content.appendChild(saveBottomButton(saveProducts));
}

// ── Extra-dough visibility (separate Settings screen) ─────────────────────────
let extraWorking = null;
let extraDirty = false;

function updateExtraSaveBtn() {
  const btn = document.getElementById('extra-save-btn');
  if (!btn) return;
  btn.disabled = !extraDirty;
  btn.classList.toggle('dirty', extraDirty);
}

function openExtra() {
  extraWorking = cloneConfig(getConfig());
  extraDirty = false;
  TABS.forEach(tab => {
    const cb = document.getElementById('extra-toggle-' + tab);
    if (cb) cb.checked = isExtraDoughEnabled(extraWorking, tab);
  });
  updateExtraSaveBtn();
  show('extra-overlay');
}
function closeExtra() {
  if (!confirmDiscard(extraDirty)) return;
  hide('extra-overlay');
}

async function saveExtra() {
  if (!confirm('Save these changes?')) return;
  try {
    await saveConfig(extraWorking);
    extraDirty = false;
    updateExtraSaveBtn();
  } catch (e) {
    alert('Could not save. Check your connection and try again.');
  }
}

TABS.forEach(tab => {
  const cb = document.getElementById('extra-toggle-' + tab);
  if (!cb) return;
  cb.addEventListener('change', () => {
    if (!extraWorking.extraDough || typeof extraWorking.extraDough !== 'object') extraWorking.extraDough = {};
    extraWorking.extraDough[tab] = cb.checked;
    extraDirty = true;
    updateExtraSaveBtn();
  });
});
document.getElementById('open-extra-btn').addEventListener('click', openExtra);
document.querySelector('.extra-back-btn').addEventListener('click', closeExtra);
document.getElementById('extra-save-btn').addEventListener('click', saveExtra);
document.getElementById('extra-home-btn').addEventListener('click', () => {
  if (!confirmDiscard(extraDirty)) return;
  window.location.href = 'index.html';
});

// ── Divisor selection (separate Settings screen) ──────────────────────────────
let divisorTab = null;
let divisorWorking = null;
let divisorDirty = false;

function openDivisor() {
  divisorTab = null; divisorWorking = null; divisorDirty = false;
  renderDivisorSettings();
  show('divisor-overlay');
}
function closeDivisor() { hide('divisor-overlay'); }

function backDivisor() {
  if (divisorTab !== null) {
    if (!confirmDiscard(divisorDirty)) return;
    divisorTab = null; divisorWorking = null; divisorDirty = false;
    renderDivisorSettings();
    return;
  }
  closeDivisor();
}

function setDivisorTitle(text) {
  const t = document.querySelector('#divisor-overlay .recipe-overlay-title');
  if (t) t.textContent = text;
}
function setDivisorHomeVisible(visible) {
  const btn = document.getElementById('divisor-home-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
}

function updateDivisorSaveBtn() {
  const btn = document.getElementById('divisor-save-btn');
  if (!btn) return;
  btn.disabled = !divisorDirty;
  btn.classList.toggle('dirty', divisorDirty);
}

function renderDivisorSettings() {
  if (divisorTab === null) renderDivisorTabChooser();
  else renderDivisorTabDetail(divisorTab);
}

function renderDivisorTabChooser() {
  setDivisorTitle('Divisor');
  setDivisorHomeVisible(true);
  const content = document.getElementById('divisor-content');
  content.textContent = '';
  content.appendChild(el('p', { class: 'extra-help' },
    'Pick which products each tab’s divisor box splits into crates. Nothing is split until you tick it. Tap Save to apply.'));
  for (const tab of TABS) {
    const box = el('button', { class: 'drill-item', type: 'button' }, [
      el('span', {}, DOUGH_LABELS[tab]),
      el('span', { class: 'drill-chevron' }, '→'),
    ]);
    box.addEventListener('click', () => { divisorTab = tab; renderDivisorSettings(); });
    content.appendChild(box);
  }
}

function renderDivisorTabDetail(tab) {
  setDivisorTitle(DOUGH_LABELS[tab] + ' divisor');
  setDivisorHomeVisible(false);
  if (divisorWorking === null) { divisorWorking = cloneConfig(getConfig()); divisorDirty = false; }
  const content = document.getElementById('divisor-content');
  content.textContent = '';
  // One checkbox per product of this recipe (by product id, not per client), so a
  // ticked product is split across every client that orders it. De-duplicate the
  // tab rows (which are per client) down to one row per product.
  const seen = new Set();
  const products = getTabProducts(getConfig(), tab).filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  if (products.length === 0) {
    content.appendChild(el('div', { class: 'cp-empty-hint' }, 'No products in this tab yet.'));
    return;
  }
  products.forEach(p => content.appendChild(divisorProductRow(tab, p)));
  const clearBtn = el('button', { class: 'divisor-clear-btn', type: 'button' }, 'Untick all');
  clearBtn.addEventListener('click', () => clearDivisorTab(tab));
  content.appendChild(clearBtn);
  const saveBtn = el('button', { class: 'cp-save-bottom', id: 'divisor-save-btn', type: 'button' }, 'Save');
  saveBtn.addEventListener('click', saveDivisor);
  content.appendChild(saveBtn);
  updateDivisorSaveBtn();
}

function divisorProductRow(tab, product) {
  const box = el('input', { type: 'checkbox' });
  box.checked = isInDivisor(divisorWorking, tab, product.id);
  box.addEventListener('change', () => toggleDivisorProduct(tab, product.id, box.checked));
  return el('label', { class: 'cp-check-row' }, [box, el('span', {}, product.name)]);
}

function toggleDivisorProduct(tab, productId, included) {
  if (!divisorWorking.divisorIncluded || typeof divisorWorking.divisorIncluded !== 'object') divisorWorking.divisorIncluded = {};
  const list = Array.isArray(divisorWorking.divisorIncluded[tab]) ? divisorWorking.divisorIncluded[tab] : [];
  const i = list.indexOf(productId);
  if (included && i === -1) list.push(productId);
  else if (!included && i !== -1) list.splice(i, 1);
  divisorWorking.divisorIncluded[tab] = list;
  divisorDirty = true;
  updateDivisorSaveBtn();
}

function clearDivisorTab(tab) {
  if (!divisorWorking.divisorIncluded || typeof divisorWorking.divisorIncluded !== 'object') divisorWorking.divisorIncluded = {};
  divisorWorking.divisorIncluded[tab] = [];
  divisorDirty = true;
  renderDivisorSettings();
}

async function saveDivisor() {
  if (!confirm('Save these changes?')) return;
  try {
    await saveConfig(divisorWorking);
    divisorWorking = cloneConfig(getConfig());
    divisorDirty = false;
    updateDivisorSaveBtn();
  } catch (e) {
    alert('Could not save. Check your connection and try again.');
  }
}

document.getElementById('open-divisor-btn').addEventListener('click', openDivisor);
document.querySelector('.divisor-back-btn').addEventListener('click', backDivisor);
document.getElementById('divisor-home-btn').addEventListener('click', () => {
  if (!confirmDiscard(divisorDirty)) return;
  window.location.href = 'index.html';
});

// ── Static wiring (elements exist in calculator.html) ─────────────────────────
document.querySelector('.settings-back-btn').addEventListener('click', closeSettings);
document.getElementById('open-clients-btn').addEventListener('click', openClients);
document.getElementById('open-products-btn').addEventListener('click', openProducts);
document.getElementById('open-whatsapp-btn').addEventListener('click', openWhatsapp);
document.getElementById('open-recipes-btn').addEventListener('click', openRecipes);
document.querySelector('.cp-back-btn').addEventListener('click', closeClients);
document.getElementById('cp-home-btn').addEventListener('click', goHomeFromClients);
document.getElementById('cp-save-btn').addEventListener('click', saveClients);
document.querySelector('.products-back-btn').addEventListener('click', closeProducts);
document.getElementById('products-home-btn').addEventListener('click', goHomeFromProducts);
document.getElementById('products-save-btn').addEventListener('click', saveProducts);
