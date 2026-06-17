// calculator-whatsapp-settings.js — the WhatsApp order-lists editor (#wa-overlay).
//
// Opened from its own entry in the Settings hub (next to Recipes / Extra dough /
// Divisor). WhatsApp lists are INDEPENDENT of the dough tabs: a list groups client
// entries, and each entry pairs an address-book client with an explicitly chosen
// set of products picked from the WHOLE address book — not only that client's own
// products. So a client can appear on WhatsApp with a product whose dough it does
// not actually produce, without that product polluting the dough tab.
//
// A three-level drill-in, mirroring the Clients editor's UX:
//   • Level 0  → the list of saved WhatsApp lists (+ Add list)
//   • Level 1  → a list's detail: its name + a card per client entry (+ Add client)
//   • Level 1b → the client chooser (which address-book client to add to the list)
//   • Level 2  → a client entry's product checklist (tick products from the book)
//
// Everything is edited on a deep COPY of the live config; nothing is persisted
// until Save (which writes through the config store — Firestore + cache — and
// re-renders the calculator). Moving between levels never loses edits; a just-added
// empty list is offered for discard on back. Only the list NAME is required.

import { getConfig, saveConfig } from './calculator-config-store.js';
import { cloneConfig, getClients, getClientById, getAllProducts } from './calculator-config.js';
import { el } from './calculator-render.js';
import { confirmDiscard } from './calculator-confirm.js';

let working = null;        // deep copy being edited
let activeList = null;     // null = list index, else the edited list's index
let activeEntry = null;    // null = list detail, else the edited client entry's index
let choosingClient = false; // true = the "add client" chooser is showing
let freshlyAdded = false;  // the list just opened was created by "Add list"
let showErrors = false;    // after a failed Save, mark the empty name
let dirty = false;

function show(id) { document.getElementById(id).classList.add('visible'); }
function hide(id) { document.getElementById(id).classList.remove('visible'); }
function genId(prefix) { return prefix + '-' + Math.random().toString(36).slice(2, 8); }
function isBlank(s) { return !s || !String(s).trim(); }

// The lists array on the working copy (always present, even on a garbage config).
function lists() {
  if (!Array.isArray(working.whatsappLists)) working.whatsappLists = [];
  return working.whatsappLists;
}

function waTitle() { return document.querySelector('#wa-overlay .recipe-overlay-title'); }

// Home is shown on the top list, hidden on detail/sub-screens (to avoid an
// accidental exit mid-edit), matching the Clients editor.
function setHomeVisible(visible) {
  const btn = document.getElementById('wa-home-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
}

function markDirty() { dirty = true; updateSaveBtn(); }
function updateSaveBtn() {
  const btn = document.getElementById('wa-save-btn');
  btn.disabled = !dirty;
  btn.classList.toggle('dirty', dirty);
}

// ── Open / close / navigate ───────────────────────────────────────────────────
export function openWhatsapp() {
  working = cloneConfig(getConfig());
  activeList = null;
  activeEntry = null;
  choosingClient = false;
  freshlyAdded = false;
  showErrors = false;
  dirty = false;
  renderEditor();
  updateSaveBtn();
  show('wa-overlay');
}

function isEmptyList(list) {
  return !list || (isBlank(list.title) && (!list.clients || list.clients.length === 0));
}

// Contextual "back": step up one level without losing edits. From the product
// checklist or the client chooser, return to the list detail; from a list detail,
// return to the index (offering to discard a still-empty just-added list); from the
// index, exit the overlay (firing the unsaved-changes guard).
function backWhatsapp() {
  if (activeList !== null) {
    if (choosingClient) { choosingClient = false; renderEditor(); return; }
    if (activeEntry !== null) { activeEntry = null; renderEditor(); return; }
    const list = lists()[activeList];
    if (freshlyAdded && isEmptyList(list)) {
      if (!confirm('Discard this new list? You have not added anything to it.')) return;
      lists().splice(activeList, 1);
    }
    freshlyAdded = false;
    activeList = null;
    renderEditor();
    return;
  }
  if (!confirmDiscard(dirty)) return;
  hide('wa-overlay');
}

function goHome() {
  if (!confirmDiscard(dirty)) return;
  window.location.href = 'index.html';
}

// The first list missing a name, or null if all are named (the only required field).
function findInvalid() {
  const ls = lists();
  for (let i = 0; i < ls.length; i++) {
    if (isBlank(ls[i].title)) return i;
  }
  return null;
}

async function saveWhatsapp() {
  const invalid = findInvalid();
  if (invalid !== null) {
    showErrors = true;
    activeList = invalid;
    activeEntry = null;
    choosingClient = false;
    renderEditor();
    alert('Please give every list a name before saving.');
    return;
  }
  if (!confirm('Save these changes?')) return;
  try {
    await saveConfig(working);
    showErrors = false;
    dirty = false;
    updateSaveBtn();
    freshlyAdded = false;
    activeList = null;
    activeEntry = null;
    choosingClient = false;
    renderEditor();
  } catch (e) {
    alert('Could not save. Check your connection and try again.');
  }
}

// ── Render dispatch ────────────────────────────────────────────────────────────
function renderEditor() {
  if (activeList === null) { renderListIndex(); return; }
  if (choosingClient) { renderClientChooser(); return; }
  if (activeEntry === null) { renderListDetail(); return; }
  renderEntryProducts();
}

function saveBottomButton() {
  const btn = el('button', { class: 'cp-save-bottom', type: 'button' }, 'Save');
  btn.addEventListener('click', saveWhatsapp);
  return btn;
}

function deleteIcon(label, onDelete) {
  const btn = el('button', { class: 'cp-del-icon', type: 'button', 'aria-label': label }, '🗑');
  btn.addEventListener('click', onDelete);
  return btn;
}

// ── Level 0: the saved lists ───────────────────────────────────────────────────
function renderListIndex() {
  waTitle().textContent = 'WhatsApp lists';
  setHomeVisible(true);
  const content = document.getElementById('wa-content');
  content.textContent = '';

  lists().forEach((list, li) => {
    const box = el('button', { class: 'drill-item', type: 'button' }, [
      el('span', {}, list.title || 'Untitled list'),
      el('span', { class: 'drill-chevron' }, '→'),
    ]);
    box.addEventListener('click', () => { freshlyAdded = false; activeList = li; activeEntry = null; renderEditor(); });
    content.appendChild(box);
  });

  const add = el('button', { class: 'cp-add-client', type: 'button' }, '+ Add list');
  add.addEventListener('click', () => {
    lists().push({ id: genId('wl'), title: '', clients: [] });
    markDirty();
    freshlyAdded = true;
    activeList = lists().length - 1;
    activeEntry = null;
    renderEditor();
  });
  content.appendChild(add);
}

// ── Level 1: a list's detail (name + client-entry cards) ───────────────────────
function renderListDetail() {
  const list = lists()[activeList];
  if (!Array.isArray(list.clients)) list.clients = [];
  waTitle().textContent = 'Edit list';
  setHomeVisible(false);
  const content = document.getElementById('wa-content');
  content.textContent = '';

  const nameInput = el('input', { class: 'cp-client-name', type: 'text', value: list.title || '', placeholder: 'List name' });
  if (showErrors && isBlank(list.title)) nameInput.classList.add('cp-invalid');
  nameInput.addEventListener('input', () => { list.title = nameInput.value; nameInput.classList.remove('cp-invalid'); markDirty(); });
  const del = deleteIcon('Delete list', () => {
    if (!confirm('Delete this list?')) return;
    lists().splice(activeList, 1);
    markDirty();
    activeList = null;
    renderEditor();
  });
  content.appendChild(el('div', { class: 'cp-field' }, [
    el('label', { class: 'cp-label' }, 'List name'),
    el('div', { class: 'cp-name-row' }, [nameInput, del]),
  ]));

  const field = el('div', { class: 'cp-field' }, [el('label', { class: 'cp-label' }, 'Clients in this list')]);
  if (list.clients.length === 0) {
    field.appendChild(el('div', { class: 'cp-empty-hint' }, 'Add a client, then pick the products to send for it.'));
  } else {
    list.clients.forEach((entry, ei) => field.appendChild(entryCard(list, entry, ei)));
  }
  content.appendChild(field);

  const addClient = el('button', { class: 'cp-add-prod', type: 'button' }, '+ Add client');
  addClient.addEventListener('click', () => { choosingClient = true; renderEditor(); });
  content.appendChild(addClient);

  content.appendChild(saveBottomButton());
}

// One client-entry card: the client's name (from the address book), a summary of
// its chosen products, a tap target to edit those products, and a small remove icon.
function entryCard(list, entry, ei) {
  const client = getClientById(getConfig(), entry.clientId);
  const name = client ? (client.name || 'Unnamed client') : 'Unknown client';

  const productIds = Array.isArray(entry.products) ? entry.products : [];
  const names = productIds
    .map(id => { const all = getAllProducts(getConfig()).find(p => p.id === id); return all ? all.name : null; })
    .filter(Boolean);
  const summary = names.length ? names.join(', ') : 'No products yet — tap to choose';

  const open = el('button', { class: 'drill-item wa-entry-open', type: 'button' }, [
    el('span', { class: 'wa-entry-text' }, [
      el('span', { class: 'wa-entry-name' }, name),
      el('span', { class: 'wa-entry-sub' }, summary),
    ]),
    el('span', { class: 'drill-chevron' }, '→'),
  ]);
  open.addEventListener('click', () => { activeEntry = ei; renderEditor(); });

  const del = deleteIcon('Remove client from list', () => {
    list.clients.splice(ei, 1);
    markDirty();
    renderEditor();
  });

  return el('div', { class: 'wa-entry-card' }, [open, del]);
}

// ── Level 1b: choose which address-book client to add to the list ──────────────
function renderClientChooser() {
  const list = lists()[activeList];
  waTitle().textContent = 'Add client';
  setHomeVisible(false);
  const content = document.getElementById('wa-content');
  content.textContent = '';

  // Offer only clients not already in this list, so a client is never duplicated.
  const already = new Set(list.clients.map(e => e.clientId));
  const available = getClients(getConfig()).filter(c => !already.has(c.id));

  if (getClients(getConfig()).length === 0) {
    content.appendChild(el('div', { class: 'cp-empty-hint' }, 'No clients yet. Add them in Settings → Clients & products first.'));
    return;
  }
  if (available.length === 0) {
    content.appendChild(el('div', { class: 'cp-empty-hint' }, 'All clients are already in this list.'));
    return;
  }

  content.appendChild(el('p', { class: 'extra-help' }, 'Pick a client to add. Next you choose which products to send for it.'));
  available.forEach(client => {
    const box = el('button', { class: 'drill-item', type: 'button' }, [
      el('span', {}, client.name || 'Unnamed client'),
      el('span', { class: 'drill-chevron' }, '→'),
    ]);
    box.addEventListener('click', () => {
      list.clients.push({ clientId: client.id, products: [] });
      markDirty();
      choosingClient = false;
      activeEntry = list.clients.length - 1; // drill straight into its product picker
      renderEditor();
    });
    content.appendChild(box);
  });
}

// ── Level 2: a client entry's product checklist ────────────────────────────────
function renderEntryProducts() {
  const list = lists()[activeList];
  const entry = list.clients[activeEntry];
  if (!Array.isArray(entry.products)) entry.products = [];
  const client = getClientById(getConfig(), entry.clientId);
  waTitle().textContent = 'Pick products';
  setHomeVisible(false);
  const content = document.getElementById('wa-content');
  content.textContent = '';

  content.appendChild(el('p', { class: 'extra-help' },
    'Products to send for ' + (client ? (client.name || 'this client') : 'this client') +
    '. Pick any product from the address book — it need not belong to this client.'));

  const all = getAllProducts(getConfig());
  if (all.length === 0) {
    content.appendChild(el('div', { class: 'cp-empty-hint' }, 'No products in the address book yet.'));
    content.appendChild(saveBottomButton());
    return;
  }

  all.forEach(product => content.appendChild(productCheckRow(entry, product)));
  content.appendChild(saveBottomButton());
}

// A checkbox row toggling one product's membership in the entry. The owner client
// name disambiguates same-named products from different clients.
function productCheckRow(entry, product) {
  const box = el('input', { type: 'checkbox' });
  box.checked = entry.products.includes(product.id);
  box.addEventListener('change', () => {
    const i = entry.products.indexOf(product.id);
    if (box.checked && i === -1) entry.products.push(product.id);
    else if (!box.checked && i !== -1) entry.products.splice(i, 1);
    markDirty();
  });
  const label = product.name + (product.ownerClientName ? '  ·  ' + product.ownerClientName : '');
  return el('label', { class: 'cp-check-row' }, [box, el('span', {}, label)]);
}

// ── Static wiring (elements exist in calculator.html) ──────────────────────────
document.querySelector('.wa-back-btn').addEventListener('click', backWhatsapp);
document.getElementById('wa-home-btn').addEventListener('click', goHome);
document.getElementById('wa-save-btn').addEventListener('click', saveWhatsapp);
