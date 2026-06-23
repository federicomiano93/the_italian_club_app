// log.js — the production log UI: the log list, the Confirm→save flow (with the
// Today/Tomorrow choice), and the tap / edit / delete / history actions. The data
// model and persistence live in log-model.js (pure) and log-store.js (Firestore).

import { showResult, markRevealed } from './calc.js';
import { saveDailyEntry } from './firebase.js';
import { getConfig } from './calculator-config-store.js';
import {
  getTabProducts, getDivisorIncluded, isExtraDoughEnabled, doughExtraGrams,
  isLogVisible, getLogRetentionHours,
} from './calculator-config.js';
import { RECIPES } from './recipes.js';
import { logTimestamp } from './log-time.js';
import { el } from './calculator-render.js';
import { buildSheet, buildLogText, latestVersion, filterVisibleLogs } from './log-model.js';
import { getLogs, getLogById, createAndSave, deleteLog } from './log-store.js';
import { renderOrder, renderVersion } from './log-view.js';
import { openLogEdit, openLogHistory } from './log-edit.js';
import { openLogAdd } from './log-add.js';

const DOUGH = { focaccia: 'Focaccia', brioche: 'Brioche', sourdough: 'Sourdough' };
const PARAM_ID = { focaccia: 'f-yeast-pct', brioche: 'b-yeast-pct', sourdough: 's-starter-pct' };
const PARAM_DEFAULT = { focaccia: 0.65, brioche: 4, sourdough: 18 };

function qtyOf(id) { const e = document.getElementById(id); return e ? (+e.value || 0) : 0; }

// Brief "Saved ✓" feedback on the Confirm button after a log is created, then the
// button re-arms to "✓ Confirm". Nothing is locked: the quantities stay editable and
// confirming again creates a NEW, separate log.
function flashSaved(tab) {
  const btn = document.getElementById(tab[0] + '-confirm-btn');
  if (!btn) return;
  btn.textContent = 'Saved ✓';
  btn.disabled = true;
  setTimeout(() => { btn.textContent = '✓ Confirm'; btn.disabled = false; }, 1500);
}

function isoDate() {
  const n = new Date();
  return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
}

// ── Gather the current calculator state for a dough tab ───────────────────────
function gatherItems(tab) {
  return getTabProducts(getConfig(), tab).map(p => ({
    id: p.id, name: p.name, clientName: p.clientName,
    qty: qtyOf(p.id), weightG: p.weight, kind: p.kind,
    crate: p.crate || { show: false, perBox: 20 },
  }));
}
function gatherExtra(tab) {
  const v = document.getElementById(tab[0] + '-extra');
  if (!v || !isExtraDoughEnabled(getConfig(), tab)) return { grams: 0, value: 0, unit: 'g' };
  const u = document.getElementById(tab[0] + '-extra-unit');
  const unit = u ? u.value : 'g';
  return { grams: doughExtraGrams(v.value, unit), value: +v.value || 0, unit };
}

// ── Daily-logs archive (unchanged behaviour, kept for the production archive) ──
function buildDailyEntry(tab, sheet, at) {
  const base = {
    date_iso: isoDate(), date: at.date, time: at.time, dough: DOUGH[tab],
    total_g: sheet.total_g, extra_g: sheet.extra_g,
  };
  for (const p of getTabProducts(getConfig(), tab)) base['qty_' + p.id] = qtyOf(p.id);
  return base;
}

// ── Confirm → Save modal (Today / Tomorrow + optional "calculated by") ────────
let pendingTab = null;
let pendingDay = null;

export function confirmAndSave(tab) {
  // Each Confirm creates a NEW, separate log — the recipe is never locked, so the
  // same dough can be confirmed again (with changed quantities) into a fresh log.
  pendingTab = tab;
  openLogDayModal();
}

function openLogDayModal() {
  pendingDay = null;
  document.querySelectorAll('.logday-choice').forEach(b => b.classList.remove('selected'));
  document.getElementById('logday-by').value = '';
  document.querySelector('.logday-save').disabled = true;
  document.getElementById('logday-modal').classList.add('visible');
}
function closeLogDayModal() {
  document.getElementById('logday-modal').classList.remove('visible');
  pendingTab = null;
}

function commitLog() {
  const tab = pendingTab;
  if (!tab || !pendingDay) return;
  const by = document.getElementById('logday-by').value.trim();
  const items = gatherItems(tab);
  const extra = gatherExtra(tab);
  const paramEl = document.getElementById(PARAM_ID[tab]);
  const param = paramEl ? (+paramEl.value || PARAM_DEFAULT[tab]) : PARAM_DEFAULT[tab];
  const divEl = document.getElementById(tab[0] + '-divisor-div');
  const divisor = { includedIds: getDivisorIncluded(getConfig(), tab), n: divEl ? (+divEl.value || 0) : 0 };
  const at = logTimestamp();
  const sheet = buildSheet({ dough: DOUGH[tab], recipe: RECIPES[tab], items, extraGrams: extra.grams, param, divisor });
  const text = buildLogText(items, [], extra);
  const version = { calculatedBy: by, at, kind: 'create', items, occasional: [], sheet, text };

  createAndSave({ dough: DOUGH[tab], forDay: pendingDay, version, createdAtMs: Date.now() });
  saveDailyEntry(buildDailyEntry(tab, sheet, at)); // keep the production archive too

  // Reveal the recipe and keep it editable — the recipe sheet and the log stay
  // independent. The brief "Saved ✓" confirms the log was created, then the button
  // re-arms so editing the quantities and confirming again creates a NEW log.
  markRevealed(tab);
  showResult(tab + '-result');
  flashSaved(tab);
  closeLogDayModal();
}

// ── Log list ──────────────────────────────────────────────────────────────────
export function renderLog() {
  const container = document.getElementById('log-content');
  if (!container) return;
  const cfg = getConfig();
  const logs = filterVisibleLogs(getLogs(), {
    visibility: {
      focaccia: isLogVisible(cfg, 'focaccia'),
      brioche: isLogVisible(cfg, 'brioche'),
      sourdough: isLogVisible(cfg, 'sourdough'),
    },
    retentionHours: getLogRetentionHours(cfg),
    nowMs: Date.now(),
  });
  container.textContent = '';
  if (!logs.length) {
    // Distinguish "nothing saved yet" from "everything is hidden/expired by the
    // current Log settings", so the empty state is never misleading.
    const anySaved = getLogs().length > 0;
    container.appendChild(el('p', { class: 'log-empty' }, anySaved
      ? 'No logs to show right now — check the Log settings (visibility and duration).'
      : 'No logs yet. Calculate and confirm a dough to save it here.'));
  } else {
    for (const log of logs) container.appendChild(logCard(log));
  }

  // Manual add-log entry point, always available below the list.
  const addBtn = el('button', { class: 'cp-add-client', type: 'button', id: 'log-add-btn' }, '+ Add log');
  addBtn.addEventListener('click', openLogAdd);
  container.appendChild(addBtn);
}

function logCard(log) {
  const v = latestVersion(log) || {};
  const card = el('div', { class: 'card log-card' });

  // Tappable body → read-only full sheet (D).
  const body = el('button', { class: 'log-card-body', type: 'button', 'data-id': log.id });
  body.appendChild(el('div', { class: 'log-card-top' }, [
    el('span', { class: 'card-title log-card-dough' }, log.dough),
    el('span', { class: 'logday-badge' + (log.forDay === 'tomorrow' ? ' tomorrow' : '') }, log.forDay === 'tomorrow' ? 'Tomorrow' : 'Today'),
  ]));
  const at = v.at || {};
  body.appendChild(el('div', { class: 'log-timestamp' }, '📅 ' + (at.date || '') + ' — ' + (at.time || '')));
  if (v.calculatedBy) body.appendChild(el('div', { class: 'logview-by' }, 'by ' + v.calculatedBy));
  if ((log.versions || []).length > 1) body.appendChild(el('div', { class: 'log-ver-count' }, 'v' + log.versions.length + ' (edited)'));
  body.appendChild(renderOrder(v));
  card.appendChild(body);

  // Actions: history (icon), edit, delete (low-key).
  const actions = el('div', { class: 'log-actions' });
  const hist = el('button', { class: 'log-hist-btn', type: 'button', 'data-id': log.id, 'aria-label': 'Version history' }, '🕘 History');
  const edit = el('button', { class: 'log-edit-btn', type: 'button', 'data-id': log.id }, 'Edit');
  const del = el('button', { class: 'log-delete-btn', type: 'button', 'data-id': log.id, 'aria-label': 'Delete log' }, '🗑');
  actions.appendChild(hist);
  actions.appendChild(edit);
  actions.appendChild(del);
  card.appendChild(actions);
  return card;
}

// ── Read-only view (D) ────────────────────────────────────────────────────────
function openLogView(id) {
  const log = getLogById(id);
  if (!log) return;
  const c = document.getElementById('logview-content');
  c.textContent = '';
  document.getElementById('logview-title').textContent = log.dough + ' log';
  c.appendChild(renderVersion(latestVersion(log), log));
  document.getElementById('logview-overlay').classList.add('visible');
}
function closeLogView() { document.getElementById('logview-overlay').classList.remove('visible'); }

// Edit (B): confirm first, then open the dedicated edit screen (never the calculator).
function startEdit(id) {
  if (!confirm('Edit this log?')) return;
  openLogEdit(id);
}

// ── Wiring (elements exist in calculator.html) ────────────────────────────────
document.querySelectorAll('.logday-choice').forEach(b => {
  b.addEventListener('click', () => {
    pendingDay = b.dataset.day;
    document.querySelectorAll('.logday-choice').forEach(x => x.classList.toggle('selected', x === b));
    document.querySelector('.logday-save').disabled = false;
  });
});
document.querySelector('.logday-cancel').addEventListener('click', closeLogDayModal);
document.querySelector('.logday-save').addEventListener('click', commitLog);
document.querySelector('.logview-back-btn').addEventListener('click', closeLogView);
document.querySelector('.logview-home-btn').addEventListener('click', () => { window.location.href = 'index.html'; });

document.getElementById('log-content').addEventListener('click', e => {
  const histB = e.target.closest('.log-hist-btn');
  const editB = e.target.closest('.log-edit-btn');
  const delB = e.target.closest('.log-delete-btn');
  const bodyB = e.target.closest('.log-card-body');
  if (histB) { openLogHistory(histB.dataset.id); return; }
  if (editB) { startEdit(editB.dataset.id); return; }
  if (delB) {
    const id = delB.dataset.id;
    const log = getLogById(id);
    if (confirm('Delete this ' + (log ? log.dough : '') + ' log? This cannot be undone.')) deleteLog(id);
    return;
  }
  if (bodyB) { openLogView(bodyB.dataset.id); return; }
});
