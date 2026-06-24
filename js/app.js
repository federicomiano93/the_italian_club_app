import './firebase.js';
import { calcFocaccia, calcBrioche, calcSourdough, copyRecipe, shareRecipeWA, buildDivisorBox, restoreRevealed, clearRevealed, restoreLock, clearLock } from './calc.js';
import { saveDay, editTab, renderLog } from './log.js';
import { saveRecipes, closeRecipes, goHomeFromRecipes } from './recipes.js';
import { openSettings } from './calculator-settings.js';
import './log-settings.js';
import { shareMarketOrder, closeLoafModal, sendWithLoaves, closeListPicker } from './whatsapp.js';
import { getConfig, initConfig } from './calculator-config-store.js';
import { initLogs } from './log-store.js';
import { renderTab } from './calculator-render.js';
import { getTabProducts, isExtraDoughEnabled } from './calculator-config.js';

// ── Service Worker ────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    if (!reg) return; // registration unavailable (e.g. private mode) — fail safe
    setInterval(() => reg.update(), 30000);

    const showBanner = () => document.getElementById('update-banner').classList.add('visible');
    if (reg.waiting) showBanner();

    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed') showBanner();
      });
    });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

function applyUpdate() {
  navigator.serviceWorker.getRegistration().then(reg => {
    if (reg && reg.waiting) {
      reg.waiting.postMessage({ action: 'skipWaiting' });
    } else {
      window.location.reload();
    }
  });
}

// ── Tab switching ─────────────────────────────────────────────────────────────
// The dough tab-bar holds only the three recipes now; the Log lives in the footer
// (next to Settings), so showing it deactivates all dough tabs. The footer stays
// visible everywhere so Log and Settings are always reachable.
let lastDoughTab = 'focaccia'; // remembered so the Log screen's Back returns here
let currentTab = 'focaccia';   // the active screen, for the header Back destination

function switchTab(name) {
  document.querySelectorAll('.content').forEach(el => el.classList.remove('active'));
  const DOUGH = ['focaccia', 'brioche', 'sourdough'];
  document.querySelectorAll('.tab').forEach((el, i) => el.classList.toggle('active', DOUGH[i] === name));
  document.getElementById('tab-'+name).classList.add('active');
  document.querySelector('.scroll-area').scrollTop = 0;
  // Hide the footer "Log" button while the Log section is open (it would be a no-op
  // there); the dough tab-bar above still lets the user leave the Log view.
  const logFooterBtn = document.getElementById('log-footer-btn');
  if (logFooterBtn) logFooterBtn.style.display = name === 'log' ? 'none' : '';
  // The "Check yeast %" banner only makes sense on a dough tab — hide it in the Log
  // section. Clearing the inline style on a dough tab lets the "dismissed" class still
  // hide it if the user had dismissed it.
  const yeastBanner = document.getElementById('yeast-banner');
  if (yeastBanner) yeastBanner.style.display = name === 'log' ? 'none' : '';
  // Header: Back is always on the left. The right is WhatsApp on a dough tab, or Home
  // on the Log screen (where WhatsApp is hidden).
  const isLog = name === 'log';
  if (DOUGH.includes(name)) lastDoughTab = name;
  currentTab = name;
  const setHdr = (id, show) => { const e = document.getElementById(id); if (e) e.style.display = show ? '' : 'none'; };
  setHdr('header-wa-btn', !isLog);
  setHdr('header-home-right', isLog);
  if (name === 'log') renderLog();
}

// ── Config-driven calculator wiring ───────────────────────────────────────────
const DOUGH_TABS = ['focaccia', 'brioche', 'sourdough'];
const CALC = { focaccia: calcFocaccia, brioche: calcBrioche, sourdough: calcSourdough };

function productIds(tab) {
  return getTabProducts(getConfig(), tab).map(p => p.id);
}

// localStorage persistence: one key per product ('qty-<id>'), so the working
// quantities survive a reload and a config re-render.
function saveQty(tab) {
  productIds(tab).forEach(id => {
    const el = document.getElementById(id);
    if (el) localStorage.setItem('qty-' + id, el.value);
  });
}
function clearQty(tab) {
  productIds(tab).forEach(id => localStorage.removeItem('qty-' + id));
}
function restoreQty(tab) {
  productIds(tab).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = localStorage.getItem('qty-' + id);
    if (val !== null) el.value = val;
  });
}

// Attach listeners to the dynamically-created product inputs of a tab.
function wireProductInputs(tab) {
  const calc = CALC[tab];
  productIds(tab).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const evt = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evt, () => { calc(); saveQty(tab); });
    if (el.tagName !== 'SELECT') {
      el.addEventListener('focus', function() {
        if (this.value === '0' || this.value === '') this.value = '';
        else this.select();
      });
      el.addEventListener('blur', function() {
        if (this.value === '' || isNaN(parseFloat(this.value))) { this.value = '0'; calc(); }
      });
    }
  });
}

// (Re)build every dough tab from the current config, restore quantities, run the
// calculations and re-apply any confirmed/locked state. Called on first paint
// and whenever the remote config changes.
function renderAll() {
  DOUGH_TABS.forEach(tab => {
    renderTab(getConfig(), tab, document.getElementById(tab[0] + '-orders'));
    wireProductInputs(tab);
    restoreQty(tab);
    restoreExtra(tab);
    buildDivisorBox(tab);
    restoreRevealed(tab); // re-show a previously revealed recipe
    restoreLock(tab);     // re-apply a previously confirmed (locked) state + its log link
    const extraRow = document.querySelector('#tab-' + tab + ' .extra-dough-row');
    if (extraRow) extraRow.style.display = isExtraDoughEnabled(getConfig(), tab) ? '' : 'none';
  });
  calcFocaccia();
  calcBrioche();
  calcSourdough();
  // Keep the Log list in sync with config changes (e.g. visibility/retention edits).
  renderLog();
}

// ── Reset ─────────────────────────────────────────────────────────────────────
const PARAM_DEFAULTS = {
  'f-yeast-pct': '0.65', 'b-yeast-pct': '4', 's-starter-pct': '18',
};

function resetTab(tab) {
  if (!confirm('Reset all fields?')) return;
  // Hide the revealed recipe, unlock the inputs and DROP the link to the current log.
  // Existing logs are NOT touched — Reset only clears the calculator; because the link
  // is dropped, the next Confirm creates a brand-new log (the one way to start a fresh
  // one). Without Reset, confirming again updates the same log.
  clearRevealed(tab);
  clearLock(tab);
  document.querySelectorAll('#tab-'+tab+' input[type="number"]').forEach(input => {
    input.value = PARAM_DEFAULTS[input.id] || '0';
  });
  document.querySelectorAll('#tab-'+tab+' select.qty-select').forEach(sel => { sel.value = '0'; });
  const divSel = document.getElementById(tab[0] + '-divisor-div');
  if (divSel) divSel.value = '0';
  clearQty(tab);
  const extraUnit = document.getElementById(tab[0] + '-extra-unit');
  if (extraUnit) extraUnit.value = 'kg'; // the number field is already reset to 0 above
  clearExtra(tab);
  CALC[tab]();
}

// ── Extra-dough box (one free amount per tab, in g or kg) ─────────────────────
// Static inputs (they live in the HTML, not rebuilt by renderTab). Persisted in
// localStorage, like the product quantities, so they survive a reload.
function saveExtra(tab) {
  const v = document.getElementById(tab[0] + '-extra');
  const u = document.getElementById(tab[0] + '-extra-unit');
  if (v) localStorage.setItem('extra-' + tab, v.value);
  if (u) localStorage.setItem('extra-unit-' + tab, u.value);
}
function restoreExtra(tab) {
  const v = document.getElementById(tab[0] + '-extra');
  const u = document.getElementById(tab[0] + '-extra-unit');
  const sv = localStorage.getItem('extra-' + tab);
  const su = localStorage.getItem('extra-unit-' + tab);
  if (v && sv !== null) v.value = sv;
  if (u && su !== null) u.value = su;
}
function clearExtra(tab) {
  localStorage.removeItem('extra-' + tab);
  localStorage.removeItem('extra-unit-' + tab);
}

DOUGH_TABS.forEach(tab => {
  const v = document.getElementById(tab[0] + '-extra');
  const u = document.getElementById(tab[0] + '-extra-unit');
  if (v) {
    v.addEventListener('input', () => { CALC[tab](); saveExtra(tab); });
    v.addEventListener('focus', function() {
      if (this.value === '0' || this.value === '') this.value = '';
      else this.select();
    });
    v.addEventListener('blur', function() {
      if (this.value === '' || isNaN(parseFloat(this.value))) this.value = '0';
      CALC[tab](); saveExtra(tab);
    });
  }
  if (u) u.addEventListener('change', () => { CALC[tab](); saveExtra(tab); });
});

// ── Static parameter inputs (not products) ────────────────────────────────────
const STATIC_NUMBER_IDS = ['f-yeast-pct', 'b-yeast-pct', 's-starter-pct'];

function tabOfId(id) {
  if (id.startsWith('f-')) return 'focaccia';
  if (id.startsWith('b-')) return 'brioche';
  if (id.startsWith('s-')) return 'sourdough';
  return null;
}

STATIC_NUMBER_IDS.forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('focus', function() {
    if (this.value === '0' || this.value === '') this.value = '';
    else this.select();
  });
  el.addEventListener('blur', function() {
    if (this.value === '' || isNaN(parseFloat(this.value))) {
      this.value = PARAM_DEFAULTS[this.id] || '0';
      const t = tabOfId(this.id);
      if (t) CALC[t]();
    }
  });
});

// Parameter fields recalculate their tab on every input.
document.getElementById('f-yeast-pct').addEventListener('input', calcFocaccia);
document.getElementById('b-yeast-pct').addEventListener('input', calcBrioche);
document.getElementById('s-starter-pct').addEventListener('input', calcSourdough);

// The divisor box (its 0–4 dropdown) is built per render in calc.js, which also
// wires its change handler — no static wiring here.

// ── Static button event listeners ─────────────────────────────────────────────
document.getElementById('update-banner').addEventListener('click', applyUpdate);
document.getElementById('yeast-banner').addEventListener('click', () => {
  document.getElementById('yeast-banner').classList.add('hidden');
});
document.getElementById('header-wa-btn').addEventListener('click', shareMarketOrder);
document.getElementById('header-back-btn').addEventListener('click', () => {
  // From the Log screen, Back returns to the calculator; from a dough tab it leaves
  // to the app home (the landing screen).
  if (currentTab === 'log') switchTab(lastDoughTab);
  else window.location.href = 'index.html';
});

document.querySelectorAll('.tab').forEach((btn, i) => {
  const tabs = ['focaccia','brioche','sourdough'];
  btn.addEventListener('click', () => switchTab(tabs[i]));
});

// The Log now lives in the footer (next to Settings), not in the dough tab-bar.
document.getElementById('log-footer-btn').addEventListener('click', () => switchTab('log'));

// Inline Today/Tomorrow buttons (one tap saves) + the Edit button, per dough tab.
document.querySelectorAll('.day-btn').forEach(btn => {
  btn.addEventListener('click', () => saveDay(btn.dataset.tab, btn.dataset.day));
});
document.getElementById('f-edit-btn').addEventListener('click', () => editTab('focaccia'));
document.getElementById('b-edit-btn').addEventListener('click', () => editTab('brioche'));
document.getElementById('s-edit-btn').addEventListener('click', () => editTab('sourdough'));

document.getElementById('f-copy-btn').addEventListener('click', () => copyRecipe('focaccia'));
document.getElementById('b-copy-btn').addEventListener('click', () => copyRecipe('brioche'));
document.getElementById('s-copy-btn').addEventListener('click', () => copyRecipe('sourdough'));
document.getElementById('f-wa-recipe-btn').addEventListener('click', () => shareRecipeWA('focaccia'));
document.getElementById('b-wa-recipe-btn').addEventListener('click', () => shareRecipeWA('brioche'));
document.getElementById('s-wa-recipe-btn').addEventListener('click', () => shareRecipeWA('sourdough'));

document.querySelectorAll('.reset-btn').forEach((btn, i) => {
  const tabs = ['focaccia','brioche','sourdough'];
  btn.addEventListener('click', () => resetTab(tabs[i]));
});

document.getElementById('settings-footer-btn').addEventListener('click', openSettings);
document.getElementById('recipe-save-btn').addEventListener('click', saveRecipes);
document.querySelector('.recipe-back-btn').addEventListener('click', closeRecipes);
document.getElementById('recipe-home-btn').addEventListener('click', goHomeFromRecipes);

document.querySelector('.loaf-modal-cancel').addEventListener('click', closeLoafModal);
document.querySelector('.loaf-modal-send').addEventListener('click', sendWithLoaves);
document.querySelector('.list-select-cancel').addEventListener('click', closeListPicker);

// ── Cross-module events ───────────────────────────────────────────────────────
document.addEventListener('recipes-saved', () => { calcFocaccia(); calcBrioche(); calcSourdough(); });

// ── Init ──────────────────────────────────────────────────────────────────────
// Paint immediately from cache/default, then re-render whenever Firestore streams
// a new configuration.
initConfig(renderAll);
renderAll();
// Start the logs sync; re-render the log list whenever the logs change remotely.
initLogs(renderLog);
