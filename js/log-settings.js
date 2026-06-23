// log-settings.js — the "Log" Settings screen: choose which dough types' logs are
// shown in the Log list, and how long a log stays in the list (24/48h). Both are
// DISPLAY-only filters saved in the shared config — logs are always written to and
// kept in Firestore; these only decide what the on-screen list shows. Changes apply
// immediately (local-first via saveConfig, which re-renders and best-effort syncs to
// Firestore). Mirrors the Extra-dough / Divisor settings screens.

import { getConfig, saveConfig } from './calculator-config-store.js';
import {
  cloneConfig, TABS, isLogVisible, getLogRetentionHours,
  LOG_RETENTION_OPTIONS, LOG_RETENTION_DEFAULT,
} from './calculator-config.js';

function show(id) { document.getElementById(id).classList.add('visible'); }
function hide(id) { document.getElementById(id).classList.remove('visible'); }

// Open the screen, reflecting the current config into the toggles + selector.
export function openLogSettings() {
  const cfg = getConfig();
  TABS.forEach(tab => {
    const cb = document.getElementById('logvis-toggle-' + tab);
    if (cb) cb.checked = isLogVisible(cfg, tab);
  });
  const sel = document.getElementById('log-retention-select');
  if (sel) sel.value = String(getLogRetentionHours(cfg));
  show('logsettings-overlay');
}
function closeLogSettings() { hide('logsettings-overlay'); }

// Per-dough visibility toggles: each writes its flag into the shared config.
TABS.forEach(tab => {
  const cb = document.getElementById('logvis-toggle-' + tab);
  if (!cb) return;
  cb.addEventListener('change', () => {
    const cfg = cloneConfig(getConfig());
    if (!cfg.logVisibility || typeof cfg.logVisibility !== 'object') cfg.logVisibility = {};
    cfg.logVisibility[tab] = cb.checked;
    saveConfig(cfg);
  });
});

// Retention selector: store one of the allowed durations (24/48h).
const retSel = document.getElementById('log-retention-select');
if (retSel) {
  retSel.addEventListener('change', () => {
    const cfg = cloneConfig(getConfig());
    const n = Number(retSel.value);
    cfg.logRetentionHours = LOG_RETENTION_OPTIONS.includes(n) ? n : LOG_RETENTION_DEFAULT;
    saveConfig(cfg);
  });
}

document.getElementById('open-logsettings-btn').addEventListener('click', openLogSettings);
document.querySelector('.logsettings-back-btn').addEventListener('click', closeLogSettings);
document.getElementById('logsettings-home-btn').addEventListener('click', () => { window.location.href = 'index.html'; });
