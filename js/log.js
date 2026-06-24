// log.js — the production log UI: the log list, the Confirm→save flow (with the
// Today/Tomorrow choice), and the tap / edit / delete / history actions. The data
// model and persistence live in log-model.js (pure) and log-store.js (Firestore).

import { showResult, hideResult, markRevealed, clearRevealed, getLock, setLock } from './calc.js';
import { saveDailyEntry } from './firebase.js';
import { getConfig } from './calculator-config-store.js';
import {
  getTabProducts, getDivisorIncluded, isExtraDoughEnabled, doughExtraGrams,
  isLogVisible, getLogRetentionForDough,
} from './calculator-config.js';
import { RECIPES } from './recipes.js';
import { logTimestamp } from './log-time.js';
import { el } from './calculator-render.js';
import { buildSheet, buildLogText, latestVersion, filterVisibleLogs, confirmTarget } from './log-model.js';
import { getLogs, getLogById, createAndSave, appendAndSave, genLogId, deleteLog } from './log-store.js';
import { renderOrder, renderVersion } from './log-view.js';
import { openLogEdit, openLogHistory } from './log-edit.js';
import { openLogAdd } from './log-add.js';

const DOUGH = { focaccia: 'Focaccia', brioche: 'Brioche', sourdough: 'Sourdough' };
const PARAM_ID = { focaccia: 'f-yeast-pct', brioche: 'b-yeast-pct', sourdough: 's-starter-pct' };
const PARAM_DEFAULT = { focaccia: 0.65, brioche: 4, sourdough: 18 };

function qtyOf(id) { const e = document.getElementById(id); return e ? (+e.value || 0) : 0; }

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

// ── Confirm (inline Today/Tomorrow) + Edit ────────────────────────────────────
// Each dough tab confirms with its OWN inline Today/Tomorrow buttons — no shared popup.
// Tapping one saves the log (create the first time, or UPDATE the linked one) and LOCKS
// the tab; the pair is then replaced by an "Edit" button. Edit unlocks the inputs
// (keeping the link) and hides the recipe, which reappears recomputed only on the next
// save. A new, separate log is made only after Reset clears the link.
let pendingTab = null;
let pendingDay = null;

// Tap Today/Tomorrow on a dough tab → save that dough's log for the chosen day.
export function saveDay(tab, day) {
  if (getLock(tab).locked) return; // locked: the buttons are hidden; ignore stray taps
  pendingTab = tab;
  pendingDay = day;
  commitLog();
}

// Tap Edit on a locked dough tab → confirm, then unlock the inputs (keeping the link)
// and hide the recipe so it can't change live; it returns, recomputed, on the next save.
export function editTab(tab) {
  if (!getLock(tab).locked) return;
  if (!confirm('Edit these quantities? The recipe updates only after you save it again.')) return;
  clearRevealed(tab);
  hideResult(tab + '-result');
  setLock(tab, false, getLock(tab).logId);
}

// Build and save the log for the chosen day (one tap on Today/Tomorrow does this).
function commitLog() {
  const tab = pendingTab;
  if (!tab || !pendingDay) return;
  const items = gatherItems(tab);
  const extra = gatherExtra(tab);
  const paramEl = document.getElementById(PARAM_ID[tab]);
  const param = paramEl ? (+paramEl.value || PARAM_DEFAULT[tab]) : PARAM_DEFAULT[tab];
  const divEl = document.getElementById(tab[0] + '-divisor-div');
  const divisor = { includedIds: getDivisorIncluded(getConfig(), tab), n: divEl ? (+divEl.value || 0) : 0 };
  const at = logTimestamp();
  const sheet = buildSheet({ dough: DOUGH[tab], recipe: RECIPES[tab], items, extraGrams: extra.grams, param, divisor });
  const text = buildLogText(items, [], extra);

  // Update the linked log, or create a fresh one. The link is dropped only by Reset;
  // a deleted linked log falls back to create (confirmTarget handles that edge case).
  const lock = getLock(tab);
  const action = confirmTarget({ linkedId: lock.logId, linkedExists: !!getLogById(lock.logId) });
  let logId = lock.logId;
  if (action === 'update') {
    const version = { calculatedBy: '', at, kind: 'edit', items, occasional: [], sheet, text };
    appendAndSave(lock.logId, version, pendingDay);
  } else {
    logId = genLogId();
    const version = { calculatedBy: '', at, kind: 'create', items, occasional: [], sheet, text };
    createAndSave({ id: logId, dough: DOUGH[tab], forDay: pendingDay, version, createdAtMs: Date.now(), origin: 'calculator' });
  }
  saveDailyEntry(buildDailyEntry(tab, sheet, at)); // keep the production archive too

  // Reveal the recipe and LOCK the tab: the Today/Tomorrow pair becomes an "Edit" button
  // and the inputs grey out until the user taps Edit. The link is remembered so the next
  // save updates this same log.
  markRevealed(tab);
  showResult(tab + '-result');
  setLock(tab, true, logId);
  pendingTab = null;
  pendingDay = null;
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
    retentionHours: {
      focaccia: getLogRetentionForDough(cfg, 'focaccia'),
      brioche: getLogRetentionForDough(cfg, 'brioche'),
      sourdough: getLogRetentionForDough(cfg, 'sourdough'),
    },
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

  // Actions: history (icon), edit (manual logs only), delete (low-key). A calculator
  // log is edited from the calculator (Edit → Confirm), never here, so its Edit button
  // is omitted; only a hand-entered log ("+ Add log") shows it.
  const actions = el('div', { class: 'log-actions' });
  const hist = el('button', { class: 'log-hist-btn', type: 'button', 'data-id': log.id, 'aria-label': 'Version history' }, '🕘 History');
  const del = el('button', { class: 'log-delete-btn', type: 'button', 'data-id': log.id, 'aria-label': 'Delete log' }, '🗑');
  actions.appendChild(hist);
  if (log.origin === 'manual') {
    actions.appendChild(el('button', { class: 'log-edit-btn', type: 'button', 'data-id': log.id }, 'Edit'));
  }
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
