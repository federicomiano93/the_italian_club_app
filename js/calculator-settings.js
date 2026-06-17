// calculator-settings.js — the Settings hub and the address-book editor.
//
// The footer "Settings" button opens a small chooser (#settings-overlay):
//   • Clients & products → this editor (#cp-overlay)
//   • Recipes            → the recipe overlay (recipes.js)
//
// The editor has two sections (the #cp-tabs):
//   • Clients  → the single address book. A drill-in: the client list, then a
//                tapped client's detail with its products inline. Each product
//                carries which dough it belongs to (focaccia/brioche/sourdough)
//                and its own weight; the dough tabs are filtered views of this.
//   • WhatsApp → saved order groups. A drill-in: the group list, then a group's
//                detail (its title + a checkbox per address-book client to pick
//                who is in the group). Sending a single client needs no group.
//
// Detail screens show a prominent Save at the bottom; deleting is a small icon by
// the name (kept low-key). New clients/products/groups start with EMPTY names and
// are validated on Save — nothing is persisted until every client, product and
// group has a name. Moving between levels never loses data — the editor works on
// a deep copy of the live config and nothing is touched until the user taps Save,
// which persists through the config store (Firestore + cache) and triggers a
// calculator re-render. Weights are clamped on save (a typo can never reach the
// dough math unbounded — see calculator-config.js).

import { getConfig, saveConfig } from './calculator-config-store.js';
import { WEIGHT_MIN, WEIGHT_MAX, TABS, cloneConfig, isExtraDoughEnabled } from './calculator-config.js';
import { el } from './calculator-render.js';
import { openRecipes } from './recipes.js';
import { confirmDiscard } from './calculator-confirm.js';
import Sortable from './vendor/sortable.esm.js';

const DOUGH_LABELS = { focaccia: 'Focaccia', brioche: 'Brioche', sourdough: 'Sourdough' };

let working = null;        // deep copy being edited
let activeTab = 'clients'; // 'clients' | 'whatsapp'
let activeClient = null;   // Clients section: null = list, index = a client's detail
let activeGroup = null;    // WhatsApp section: null = list, index = a group's detail
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
function groups() {
  if (!Array.isArray(working.groups)) working.groups = [];
  return working.groups;
}

function cpTitle() { return document.querySelector('#cp-overlay .recipe-overlay-title'); }
function cpTabs()  { return document.querySelector('#cp-overlay .cp-tabs'); }

// The header Home button is hidden on detail screens (Edit client / Edit group),
// shown on the lists.
function setHomeVisible(visible) {
  const btn = document.getElementById('cp-home-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
}

function openClients() {
  working = cloneConfig(getConfig());
  activeTab = 'clients';
  activeClient = null;
  activeGroup = null;
  freshlyAdded = false;
  showErrors = false;
  dirty = false;
  syncTabs();
  renderEditor();
  updateSaveBtn();
  // Settings stays mounted underneath (lower z-index); closing this reveals it.
  show('cp-overlay');
}

// True when a just-added item was left untouched, so it should not be kept.
function isEmptyClient(c) {
  return !c || (isBlank(c.name) && (!c.products || c.products.length === 0));
}
function isEmptyGroup(g) {
  return !g || (isBlank(g.title) && (!g.clientIds || g.clientIds.length === 0));
}

// Contextual "back": step up one level (detail → list) without losing data —
// edits live in the working copy. A just-added but still-empty item is offered
// for discard, so leaving the "add" screen without filling anything does not
// leave junk behind. Only a real exit from a list fires the unsaved guard.
function closeClients() {
  if (activeTab === 'clients' && activeClient !== null) {
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
  if (activeTab === 'whatsapp' && activeGroup !== null) {
    const group = groups()[activeGroup];
    if (freshlyAdded && isEmptyGroup(group)) {
      if (!confirm('Discard this new group? You have not added anything to it.')) return;
      groups().splice(activeGroup, 1);
    }
    freshlyAdded = false;
    activeGroup = null;
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

// The first client/product/group missing a name, or null if all are named.
function findInvalid() {
  const cs = clients();
  for (let i = 0; i < cs.length; i++) {
    if (isBlank(cs[i].name)) return { tab: 'clients', clientIndex: i };
    for (const p of (cs[i].products || [])) {
      if (isBlank(p.name)) return { tab: 'clients', clientIndex: i };
    }
  }
  const gs = groups();
  for (let i = 0; i < gs.length; i++) {
    if (isBlank(gs[i].title)) return { tab: 'whatsapp', groupIndex: i };
  }
  return null;
}

async function saveClients() {
  // Required-field guard: never persist a nameless client/product/group. Jump to
  // the first offender and highlight the empty fields.
  const invalid = findInvalid();
  if (invalid) {
    showErrors = true;
    activeTab = invalid.tab;
    activeClient = invalid.tab === 'clients' ? invalid.clientIndex : null;
    activeGroup = invalid.tab === 'whatsapp' ? invalid.groupIndex : null;
    syncTabs();
    renderEditor();
    alert('Please give every client, product and group a name before saving.');
    return;
  }
  if (!confirm('Save these changes?')) return;
  try {
    await saveConfig(working);
    showErrors = false;
    dirty = false;
    updateSaveBtn();
    // Return to the current section's list — a clear "saved" signal and the
    // natural next step when adding clients one after another.
    freshlyAdded = false;
    activeClient = null;
    activeGroup = null;
    renderEditor();
  } catch (e) {
    alert('Could not save. Check your connection and try again.');
  }
}

// Dispatch to the active section/level.
function renderEditor() {
  if (activeTab === 'whatsapp') {
    if (activeGroup === null) renderGroupList();
    else renderGroupDetail(activeGroup);
  } else {
    if (activeClient === null) renderClientList();
    else renderClientDetail(activeClient);
  }
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
  cpTabs().style.display = '';
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
  cpTabs().style.display = 'none';
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

  return el('div', { class: 'cp-prod-card' }, [
    el('div', { class: 'cp-prod-card-head' }, [nameInput, del]),
    el('div', { class: 'cp-prod-card-row' }, rowChildren),
  ]);
}

// ── WhatsApp Level 0: the list of saved groups ────────────────────────────────
function renderGroupList() {
  cpTitle().textContent = 'WhatsApp groups';
  cpTabs().style.display = '';
  setHomeVisible(true);
  const content = document.getElementById('cp-content');
  content.textContent = '';

  groups().forEach((group, gi) => {
    const box = el('button', { class: 'drill-item', type: 'button' }, [
      el('span', {}, group.title || 'Untitled group'),
      el('span', { class: 'drill-chevron' }, '→'),
    ]);
    box.addEventListener('click', () => { freshlyAdded = false; activeGroup = gi; renderEditor(); });
    content.appendChild(box);
  });

  const add = el('button', { class: 'cp-add-client', type: 'button' }, '+ Add group');
  add.addEventListener('click', () => {
    groups().push({ id: genId('g'), title: '', clientIds: [] });
    markDirty();
    freshlyAdded = true;
    activeGroup = groups().length - 1;
    renderEditor();
  });
  content.appendChild(add);
}

// ── WhatsApp Level 1: a group's detail (title + which clients belong) ─────────
function renderGroupDetail(gi) {
  const group = groups()[gi];
  if (!Array.isArray(group.clientIds)) group.clientIds = [];
  cpTitle().textContent = 'Edit group';
  cpTabs().style.display = 'none';
  setHomeVisible(false);
  const content = document.getElementById('cp-content');
  content.textContent = '';

  const titleInput = el('input', { class: 'cp-client-name', type: 'text', value: group.title || '', placeholder: 'Group name' });
  if (showErrors && isBlank(group.title)) titleInput.classList.add('cp-invalid');
  titleInput.addEventListener('input', () => { group.title = titleInput.value; titleInput.classList.remove('cp-invalid'); markDirty(); });
  const del = deleteIcon('Delete group', () => {
    if (!confirm('Delete this group?')) return;
    groups().splice(gi, 1);
    markDirty();
    activeGroup = null;
    renderEditor();
  });
  content.appendChild(el('div', { class: 'cp-field' }, [
    el('label', { class: 'cp-label' }, 'Group name'),
    el('div', { class: 'cp-name-row' }, [titleInput, del]),
  ]));

  const field = el('div', { class: 'cp-field' }, [el('label', { class: 'cp-label' }, 'Clients in this group')]);
  const list = clients();
  if (list.length === 0) {
    field.appendChild(el('div', { class: 'cp-empty-hint' }, 'Add clients first, then pick who is in this group.'));
  } else {
    list.forEach(client => field.appendChild(groupClientRow(group, client)));
  }
  content.appendChild(field);

  content.appendChild(saveBottomButton());
}

// A checkbox row toggling one client's membership in the group.
function groupClientRow(group, client) {
  const checked = group.clientIds.includes(client.id);
  const box = el('input', { type: 'checkbox' });
  box.checked = checked;
  box.addEventListener('change', () => {
    const i = group.clientIds.indexOf(client.id);
    if (box.checked && i === -1) group.clientIds.push(client.id);
    else if (!box.checked && i !== -1) group.clientIds.splice(i, 1);
    markDirty();
  });
  return el('label', { class: 'cp-check-row' }, [box, el('span', {}, client.name || 'Unnamed client')]);
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
    activeClient = null;     // switching section always returns to its top level
    activeGroup = null;
    freshlyAdded = false;
    syncTabs();
    renderEditor();
  });
});
