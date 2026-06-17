// calculator-settings.js — the Settings hub and the clients/products editor.
//
// The footer "Settings" button opens a small chooser (#settings-overlay):
//   • Clients & products → this editor (#cp-overlay)
//   • Recipes            → the existing recipe overlay (unchanged)
//
// The editor works on a deep copy of the live config. Nothing is touched until
// the user taps Save, which persists through the config store (Firestore + cache)
// and triggers a calculator re-render. Weights are clamped on save (a typo can
// never reach the dough math unbounded — see calculator-config.js).

import { getConfig, saveConfig } from './calculator-config-store.js';
import { WEIGHT_MIN, WEIGHT_MAX, cloneConfig } from './calculator-config.js';
import { el } from './calculator-render.js';
import { openRecipes } from './recipes.js';

let working = null;      // deep copy being edited
let activeTab = 'focaccia';
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
function openClients() {
  working = cloneConfig(getConfig());
  activeTab = 'focaccia';
  dirty = false;
  hide('settings-overlay');
  syncTabs();
  renderEditor();
  updateSaveBtn();
  show('cp-overlay');
}

function closeClients() {
  if (dirty && !confirm('Discard your changes?')) return;
  hide('cp-overlay');
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
  try {
    await saveConfig(working);
    dirty = false;
    updateSaveBtn();
    hide('cp-overlay');
  } catch (e) {
    alert('Could not save. Check your connection and try again.');
  }
}

// Build the editor for the active section. Re-rendered on every add/delete; plain
// name/weight typing mutates the working copy in place (no re-render, keeps focus).
function renderEditor() {
  const content = document.getElementById('cp-content');
  content.textContent = '';
  const isMarket = activeTab === 'market';
  const section = working[activeTab] || (working[activeTab] = { clients: [] });

  if (isMarket) content.appendChild(marketTitleField());

  const clients = section.clients || (section.clients = []);
  clients.forEach((client, ci) => content.appendChild(clientCard(client, ci, isMarket)));

  const addClient = el('button', { class: 'cp-add-client' }, '+ Add client');
  addClient.addEventListener('click', () => {
    clients.push({ id: genId(activeTab[0] + '-c'), name: 'New client', products: [] });
    markDirty();
    renderEditor();
  });
  content.appendChild(addClient);
}

function marketTitleField() {
  if (!working.market) working.market = { title: 'Market order', clients: [] };
  const input = el('input', { class: 'cp-client-name', type: 'text', value: working.market.title || '' });
  input.addEventListener('input', () => { working.market.title = input.value; markDirty(); });
  return el('div', { class: 'cp-field' }, [el('label', { class: 'cp-label' }, 'Order title'), input]);
}

function clientCard(client, ci, isMarket) {
  const nameInput = el('input', { class: 'cp-client-name', type: 'text', value: client.name || '' });
  nameInput.addEventListener('input', () => { client.name = nameInput.value; markDirty(); });

  const del = el('button', { class: 'cp-del-client', type: 'button', 'aria-label': 'Delete client' }, '🗑');
  del.addEventListener('click', () => {
    if (!confirm('Delete this client and its products?')) return;
    working[activeTab].clients.splice(ci, 1);
    markDirty();
    renderEditor();
  });

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

  return el('div', { class: 'cp-client' }, [
    el('div', { class: 'cp-client-head' }, [nameInput, del]),
    ...rows,
    addProd,
  ]);
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
document.getElementById('open-recipes-btn').addEventListener('click', () => { closeSettings(); openRecipes(); });
document.querySelector('.cp-back-btn').addEventListener('click', closeClients);
document.getElementById('cp-save-btn').addEventListener('click', saveClients);
document.querySelectorAll('.cp-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.dataset.tab === activeTab) return;
    activeTab = tab.dataset.tab;
    syncTabs();
    renderEditor();
  });
});
