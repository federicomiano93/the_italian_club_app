import './firebase.js';
import { calcFocaccia, calcBrioche, calcSourdough, copyRecipe, shareRecipeWA, unlockInputs, buildDivisorBox } from './calc.js';
import { confirmAndSave, renderLog, restoreConfirmed, clearConfirmed } from './log.js';
import { saveRecipes, closeRecipes, goHomeFromRecipes } from './recipes.js';
import { openSettings } from './calculator-settings.js';
import { shareMarketOrder, closeLoafModal, sendWithLoaves, closeListPicker } from './whatsapp.js';
import { getConfig, initConfig } from './calculator-config-store.js';
import { renderTab } from './calculator-render.js';
import { getTabProducts, isExtraDoughEnabled } from './calculator-config.js';

// ── Service Worker ────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
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
function switchTab(name) {
  document.querySelectorAll('.content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab').forEach((el, i) => {
    el.classList.toggle('active', ['focaccia','brioche','sourdough','log'][i] === name);
  });
  document.getElementById('tab-'+name).classList.add('active');
  document.querySelector('.scroll-area').scrollTop = 0;
  document.querySelector('.recipe-footer').style.display = name === 'log' ? 'none' : '';
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
    const extraRow = document.querySelector('#tab-' + tab + ' .extra-dough-row');
    if (extraRow) extraRow.style.display = isExtraDoughEnabled(getConfig(), tab) ? '' : 'none';
  });
  calcFocaccia();
  calcBrioche();
  calcSourdough();
  restoreConfirmed('focaccia');
  restoreConfirmed('brioche');
  restoreConfirmed('sourdough');
}

// ── Reset ─────────────────────────────────────────────────────────────────────
const PARAM_DEFAULTS = {
  'f-yeast-pct': '0.65', 'b-yeast-pct': '4', 's-starter-pct': '18',
};

function resetTab(tab) {
  if (!confirm('Reset all fields?')) return;
  unlockInputs(tab);
  clearConfirmed(tab);
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

document.querySelectorAll('.tab').forEach((btn, i) => {
  const tabs = ['focaccia','brioche','sourdough','log'];
  btn.addEventListener('click', () => switchTab(tabs[i]));
});

document.getElementById('f-confirm-btn').addEventListener('click', () => confirmAndSave('focaccia'));
document.getElementById('b-confirm-btn').addEventListener('click', () => confirmAndSave('brioche'));
document.getElementById('s-confirm-btn').addEventListener('click', () => confirmAndSave('sourdough'));

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

document.querySelector('.recipe-footer-btn').addEventListener('click', openSettings);
document.getElementById('recipe-save-btn').addEventListener('click', saveRecipes);
document.querySelector('.recipe-back-btn').addEventListener('click', closeRecipes);
document.getElementById('recipe-home-btn').addEventListener('click', goHomeFromRecipes);

document.querySelector('.loaf-modal-cancel').addEventListener('click', closeLoafModal);
document.querySelector('.loaf-modal-send').addEventListener('click', sendWithLoaves);
document.querySelector('.list-select-cancel').addEventListener('click', closeListPicker);

// ── Cross-module events ───────────────────────────────────────────────────────
document.addEventListener('switch-tab', e => switchTab(e.detail));
document.addEventListener('firestore-log-updated', renderLog);
document.addEventListener('recipes-saved', () => { calcFocaccia(); calcBrioche(); calcSourdough(); });

// ── Init ──────────────────────────────────────────────────────────────────────
// Paint immediately from cache/default, then re-render whenever Firestore streams
// a new configuration.
initConfig(renderAll);
renderAll();
