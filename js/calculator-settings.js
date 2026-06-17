// calculator-settings.js — the Settings hub and the clients/products editor.
//
// The footer "Settings" button opens a small chooser (#settings-overlay):
//   • Clients & products → this editor (#cp-overlay)
//   • Recipes            → the recipe overlay (recipes.js)
//
// The dough tabs (Focaccia/Brioche/Sourdough) are a two-level "drill-in": a list
// of clients, then a tapped client's detail with its products inline. The
// WhatsApp tab has one extra level on top: a list of order "lists" (e.g. the
// market, later other restaurants), then inside a list its clients, then a
// client's products. Moving between levels never loses data — the editor works
// on a deep copy of the live config and nothing is touched until the user taps
// Save, which persists through the config store (Firestore + cache) and triggers
// a calculator re-render. Weights are clamped on save (a typo can never reach the
// dough math unbounded — see calculator-config.js).

import { getConfig, saveConfig } from './calculator-config-store.js';
import { WEIGHT_MIN, WEIGHT_MAX, cloneConfig } from './calculator-config.js';
import { el } from './calculator-render.js';
import { openRecipes } from './recipes.js';
import { confirmDiscard } from './calculator-confirm.js';

let working = null;        // deep copy being edited
let activeTab = 'focaccia';
let activeList = null;     // WhatsApp only: null = list of lists; index = inside that list
let activeClient = null;   // null = client list; index = a client's detail
let freshlyAdded = false;  // the item just opened was created by an "Add" button
let dirty = false;

function show(id) { document.getElementById(id).classList.add('visible'); }
function hide(id) { document.getElementById(id).classList.remove('visible'); }

// Unique element id for a newly created client/product.
function genId(prefix) {
  return prefix + '-' + Math.random().toString(36).slice(2, 8);
}

// ── Hub ───────────────────────────────────────────────────────────────────────
export function openSettings() { show('settings-overlay'); }
function closeSettings() { hide('settings-overlay'); }

// ── Clients & products editor ─────────────────────────────────────────────────
function cpTitle() { return document.querySelector('#cp-overlay .recipe-overlay-title'); }
function cpTabs()  { return document.querySelector('#cp-overlay .cp-tabs'); }

function openClients() {
  working = cloneConfig(getConfig());
  activeTab = 'focaccia';
  activeList = null;
  activeClient = null;
  freshlyAdded = false;
  dirty = false;
  syncTabs();
  renderEditor();
  updateSaveBtn();
  // Settings stays mounted underneath (lower z-index); closing this reveals it.
  show('cp-overlay');
}

// True when a just-added item was left untouched, so it should not be kept.
function isEmptyClient(c) {
  return !c || ((!c.name || c.name === 'New client') && (!c.products || c.products.length === 0));
}
function isEmptyList(l) {
  return !l || ((!l.title || l.title === 'New list') && (!l.clients || l.clients.length === 0));
}

// Contextual "back": step up one level (client detail → client list → list of
// lists, for WhatsApp) without losing data — edits live in the working copy.
// A just-added but still-empty item is offered for discard, so leaving the "add"
// screen without filling anything does not leave junk behind. Only a real exit
// from the top level fires the unsaved-changes guard.
function closeClients() {
  if (activeClient !== null) {
    const client = currentOwner().clients[activeClient];
    if (freshlyAdded && isEmptyClient(client)) {
      if (!confirm('Discard this new client? You have not added anything to it.')) return;
      currentOwner().clients.splice(activeClient, 1);
    }
    freshlyAdded = false;
    activeClient = null;
    renderEditor();
    return;
  }
  if (activeTab === 'market' && activeList !== null) {
    const list = ensureMarket().lists[activeList];
    if (freshlyAdded && isEmptyList(list)) {
      if (!confirm('Discard this new list? You have not added anything to it.')) return;
      ensureMarket().lists.splice(activeList, 1);
    }
    freshlyAdded = false;
    activeList = null;
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

function syncTabs() {
  document.querySelectorAll('.cp-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === activeTab));
}

async function saveClients() {
  if (!confirm('Save these changes?')) return;
  try {
    await saveConfig(working);
    // Stay where the user is so they do not lose their place; the now-disabled
    // Save button is the signal that everything was saved.
    dirty = false;
    updateSaveBtn();
  } catch (e) {
    alert('Could not save. Check your connection and try again.');
  }
}

// Dispatch to the active level. Plain name/weight typing mutates the working copy
// in place (no re-render, keeps focus); add/delete re-render.
function renderEditor() {
  if (activeTab === 'market') {
    if (activeList === null) renderListOfLists();
    else if (activeClient === null) renderListDetail();
    else renderClientDetail(activeClient);
  } else {
    if (activeClient === null) renderClientList();
    else renderClientDetail(activeClient);
  }
}

function ensureMarket() {
  const m = working.market;
  if (m && Array.isArray(m.lists)) return m;
  // Tolerate a legacy single-order market ({ title, clients }) reaching the editor
  // (e.g. older cached data): migrate it in place so its data is never lost.
  if (m && Array.isArray(m.clients)) {
    working.market = { lists: [{ id: 'list-market', title: m.title || 'Market order', clients: m.clients }] };
  } else {
    working.market = { lists: [] };
  }
  return working.market;
}

// The object that owns the .clients array currently being shown: a dough tab, or
// the selected WhatsApp list.
function currentOwner() {
  if (activeTab === 'market') return ensureMarket().lists[activeList];
  return working[activeTab] || (working[activeTab] = { clients: [] });
}

// A tappable box that drills into a client's detail.
function clientBox(client, ci) {
  const box = el('button', { class: 'drill-item', type: 'button' }, [
    el('span', {}, client.name || 'Unnamed client'),
    el('span', { class: 'drill-chevron' }, '→'),
  ]);
  box.addEventListener('click', () => { freshlyAdded = false; activeClient = ci; renderEditor(); });
  return box;
}

// "+ Add client" for the active owner; drops straight into the new client.
function addClientButton() {
  const isMarket = activeTab === 'market';
  const btn = el('button', { class: 'cp-add-client', type: 'button' }, '+ Add client');
  btn.addEventListener('click', () => {
    const owner = currentOwner();
    if (!owner.clients) owner.clients = [];
    owner.clients.push(newClient(isMarket));
    markDirty();
    freshlyAdded = true;
    activeClient = owner.clients.length - 1;
    renderEditor();
  });
  return btn;
}

function newClient(isMarket) {
  const prefix = isMarket ? 'm' : activeTab[0];
  return { id: genId(prefix + '-c'), name: 'New client', products: [] };
}

// ── WhatsApp Level 0: the list of order lists ─────────────────────────────────
function renderListOfLists() {
  cpTitle().textContent = 'Clients & products';
  cpTabs().style.display = '';
  const content = document.getElementById('cp-content');
  content.textContent = '';

  const m = ensureMarket();
  m.lists.forEach((list, li) => {
    const box = el('button', { class: 'drill-item', type: 'button' }, [
      el('span', {}, list.title || 'Untitled list'),
      el('span', { class: 'drill-chevron' }, '→'),
    ]);
    box.addEventListener('click', () => { freshlyAdded = false; activeList = li; activeClient = null; renderEditor(); });
    content.appendChild(box);
  });

  const addList = el('button', { class: 'cp-add-client', type: 'button' }, '+ Add list');
  addList.addEventListener('click', () => {
    m.lists.push({ id: genId('list'), title: 'New list', clients: [] });
    markDirty();
    freshlyAdded = true;
    activeList = m.lists.length - 1;
    activeClient = null;
    renderEditor();
  });
  content.appendChild(addList);
}

// ── WhatsApp Level 1: one list's detail (its title + its clients) ─────────────
function renderListDetail() {
  const list = ensureMarket().lists[activeList];
  cpTitle().textContent = 'Edit list';
  cpTabs().style.display = 'none';
  const content = document.getElementById('cp-content');
  content.textContent = '';

  const nameInput = el('input', { class: 'cp-client-name', type: 'text', value: list.title || '' });
  nameInput.addEventListener('input', () => { list.title = nameInput.value; markDirty(); });
  content.appendChild(el('div', { class: 'cp-field' }, [el('label', { class: 'cp-label' }, 'List name'), nameInput]));

  const clientsField = el('div', { class: 'cp-field' }, [el('label', { class: 'cp-label' }, 'Clients')]);
  (list.clients || []).forEach((client, ci) => clientsField.appendChild(clientBox(client, ci)));
  clientsField.appendChild(addClientButton());
  content.appendChild(clientsField);

  const delList = el('button', { class: 'cp-del-client-btn', type: 'button' }, '🗑  Delete this list');
  delList.addEventListener('click', () => {
    if (!confirm('Delete this list and everything in it?')) return;
    ensureMarket().lists.splice(activeList, 1);
    markDirty();
    activeList = null;
    activeClient = null;
    renderEditor();
  });
  content.appendChild(delList);
}

// ── Dough tabs Level 0: the client list ───────────────────────────────────────
function renderClientList() {
  cpTitle().textContent = 'Clients & products';
  cpTabs().style.display = '';
  const content = document.getElementById('cp-content');
  content.textContent = '';

  const section = working[activeTab] || (working[activeTab] = { clients: [] });
  (section.clients || (section.clients = [])).forEach((client, ci) =>
    content.appendChild(clientBox(client, ci)));
  content.appendChild(addClientButton());
}

// ── Client detail (shared by dough tabs and WhatsApp): name + products inline ──
function renderClientDetail(ci) {
  const isMarket = activeTab === 'market';
  const client = currentOwner().clients[ci];
  cpTitle().textContent = 'Edit client';
  cpTabs().style.display = 'none';
  const content = document.getElementById('cp-content');
  content.textContent = '';

  const nameInput = el('input', { class: 'cp-client-name', type: 'text', value: client.name || '' });
  nameInput.addEventListener('input', () => { client.name = nameInput.value; markDirty(); });
  content.appendChild(el('div', { class: 'cp-field' }, [el('label', { class: 'cp-label' }, 'Name'), nameInput]));

  const rows = (client.products || []).map((p, pi) => productRow(client, p, pi, isMarket));
  const addProd = el('button', { class: 'cp-add-prod', type: 'button' }, '+ Add product');
  addProd.addEventListener('click', () => {
    if (!client.products) client.products = [];
    client.products.push(isMarket
      ? { id: genId('om'), name: 'New product' }
      : { id: genId(activeTab[0] + '-p'), name: 'New product', weight: 100, kind: 'number' });
    markDirty();
    renderEditor();
  });
  content.appendChild(el('div', { class: 'cp-field' }, [
    el('label', { class: 'cp-label' }, 'Products'), ...rows, addProd,
  ]));

  const delClient = el('button', { class: 'cp-del-client-btn', type: 'button' }, '🗑  Delete this client');
  delClient.addEventListener('click', () => {
    if (!confirm('Delete this client and its products?')) return;
    currentOwner().clients.splice(ci, 1);
    markDirty();
    activeClient = null;
    renderEditor();
  });
  content.appendChild(delClient);
}

function productRow(client, p, pi, isMarket) {
  const nameInput = el('input', { class: 'cp-prod-name', type: 'text', value: p.name || '' });
  nameInput.addEventListener('input', () => { p.name = nameInput.value; markDirty(); });

  const children = [nameInput];
  if (!isMarket && p.kind === 'kg') {
    // Extra-dough row: quantity is entered in kilograms, weight is not editable.
    children.push(el('span', { class: 'cp-kg-note' }, 'kg'));
  } else if (!isMarket) {
    const weight = el('input', {
      class: 'cp-prod-weight', type: 'number', min: String(WEIGHT_MIN), max: String(WEIGHT_MAX),
      step: '1', value: String(p.weight), inputmode: 'numeric',
    });
    weight.addEventListener('input', () => { p.weight = +weight.value || 0; markDirty(); });
    children.push(weight, el('span', { class: 'cp-unit' }, 'g'));
  }

  const del = el('button', { class: 'cp-del-prod', type: 'button', 'aria-label': 'Delete product' }, '🗑');
  del.addEventListener('click', () => {
    client.products.splice(pi, 1);
    markDirty();
    renderEditor();
  });
  children.push(del);

  return el('div', { class: 'cp-prod-row' }, children);
}

// ── Static wiring (elements exist in calculator.html) ─────────────────────────
document.querySelector('.settings-back-btn').addEventListener('click', closeSettings);
document.getElementById('open-clients-btn').addEventListener('click', openClients);
// Recipes opens on top of Settings (which stays mounted underneath); closing
// Recipes reveals Settings again, no extra wiring needed.
document.getElementById('open-recipes-btn').addEventListener('click', openRecipes);
document.querySelector('.cp-back-btn').addEventListener('click', closeClients);
document.getElementById('cp-home-btn').addEventListener('click', goHomeFromClients);
document.getElementById('cp-save-btn').addEventListener('click', saveClients);
document.querySelectorAll('.cp-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.dataset.tab === activeTab) return;
    activeTab = tab.dataset.tab;
    activeList = null;     // switching section always returns to its top level
    activeClient = null;
    freshlyAdded = false;
    syncTabs();
    renderEditor();
  });
});
