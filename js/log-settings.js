// log-settings.js — the "Log" Settings screen: ONE card per dough (mirrors Recipes),
// each choosing whether that dough's logs appear in the Log list and for how long
// (24/48h, per dough). DISPLAY-only filters in the shared config — logs are always
// written to and kept in Firestore; these only decide what the on-screen list shows.
//
// Edits are made on a WORKING COPY and applied only on Save (with a confirm). Leaving
// with unsaved changes asks to discard (P20). local-first via saveConfig, which
// re-renders and best-effort syncs to Firestore.

import { getConfig, saveConfig } from './calculator-config-store.js';
import {
  cloneConfig, TABS, isLogVisible, getLogRetentionForDough,
  LOG_RETENTION_OPTIONS, getTabProducts,
} from './calculator-config.js';
import { el } from './calculator-render.js';
import { confirmDiscard } from './calculator-confirm.js';

const DOUGH_LABEL = { focaccia: 'Focaccia', brioche: 'Brioche', sourdough: 'Sourdough' };

let working = null; // { visibility: {tab:bool}, retention: {tab:hours} } or null when closed
let dirty = false;

function show(id) { document.getElementById(id).classList.add('visible'); }
function hide(id) { document.getElementById(id).classList.remove('visible'); }

// Open the screen, loading the current config into a working copy (nothing is saved
// until the user taps Save).
export function openLogSettings() {
  const cfg = getConfig();
  working = { visibility: {}, retention: {} };
  TABS.forEach(tab => {
    working.visibility[tab] = isLogVisible(cfg, tab);
    working.retention[tab] = getLogRetentionForDough(cfg, tab);
  });
  dirty = false;
  render();
  show('logsettings-overlay');
}

function render() {
  const c = document.getElementById('logsettings-content');
  c.textContent = '';
  c.appendChild(el('p', { class: 'extra-help' },
    'For each dough: choose whether its logs appear in the Log list and how long they stay. ' +
    'Logs are always kept in the database — this only controls the in-app list.'));
  TABS.forEach(tab => c.appendChild(doughCard(tab)));
  const save = el('button', { class: 'cp-save-bottom', type: 'button' }, 'Save changes');
  save.addEventListener('click', saveAll);
  c.appendChild(save);
}

// One card per dough: its products (for context) + the two editable settings.
function doughCard(tab) {
  const card = el('div', { class: 'card logset-card' });
  card.appendChild(el('div', { class: 'card-title' }, DOUGH_LABEL[tab]));

  const names = getTabProducts(getConfig(), tab).map(p => p.name);
  card.appendChild(el('div', { class: 'logset-products' }, names.length ? names.join(', ') : 'No products'));

  // Keep logs visible (on/off) — edits the working copy only.
  const visRow = el('label', { class: 'extra-toggle-row' }, [el('span', {}, 'Keep logs visible')]);
  const cb = el('input', { type: 'checkbox' });
  cb.checked = working.visibility[tab];
  cb.addEventListener('change', () => { working.visibility[tab] = cb.checked; dirty = true; });
  visRow.appendChild(cb);
  card.appendChild(visRow);

  // Keep visible for (24/48h) — per dough.
  const durRow = el('label', { class: 'extra-toggle-row' }, [el('span', {}, 'Keep visible for')]);
  const sel = el('select', { class: 'extra-unit-select', 'aria-label': 'Log duration for ' + DOUGH_LABEL[tab] });
  LOG_RETENTION_OPTIONS.forEach(h => sel.appendChild(el('option', { value: String(h) }, h + ' hours')));
  sel.value = String(working.retention[tab]);
  sel.addEventListener('change', () => { working.retention[tab] = Number(sel.value); dirty = true; });
  durRow.appendChild(sel);
  card.appendChild(durRow);

  return card;
}

function saveAll() {
  if (!confirm('Save these log settings?')) return;
  const cfg = cloneConfig(getConfig());
  cfg.logVisibility = { ...working.visibility };
  cfg.logRetentionByDough = { ...working.retention };
  saveConfig(cfg);
  dirty = false;
  hide('logsettings-overlay');
}

function closeLogSettings() {
  if (!confirmDiscard(dirty)) return; // ask before dropping unsaved edits
  dirty = false;
  hide('logsettings-overlay');
}

document.getElementById('open-logsettings-btn').addEventListener('click', openLogSettings);
document.querySelector('.logsettings-back-btn').addEventListener('click', closeLogSettings);
document.getElementById('logsettings-home-btn').addEventListener('click', () => {
  if (!confirmDiscard(dirty)) return;
  window.location.href = 'index.html';
});
