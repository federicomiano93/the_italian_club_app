import './firebase.js';
import { calcFocaccia, calcBrioche, calcSourdough, copyRecipe } from './calc.js';
import { confirmAndSave, renderLog } from './log.js';
import { openRecipes, saveRecipes, closeRecipes } from './recipes.js';
import { shareMarketOrder, closeLoafModal, sendWithLoaves } from './whatsapp.js';

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

// ── Reset ─────────────────────────────────────────────────────────────────────
function resetTab(tab) {
  if (!confirm('Reset all fields?')) return;
  document.querySelectorAll('#tab-'+tab+' input[type="number"]').forEach(input => {
    const defaults = { 'f-yeast-pct':'0.65', 'b-yeast-pct':'4', 's-starter-pct':'18', 's-weight':'905', 'f-kg':'0', 'b-kg':'0', 'f-panini-div':'0' };
    input.value = defaults[input.id] || '0';
  });
  clearQty(tab);
  if (tab === 'focaccia') calcFocaccia();
  if (tab === 'brioche') calcBrioche();
  if (tab === 'sourdough') calcSourdough();
}

// ── localStorage persistence ──────────────────────────────────────────────────
const QTY_IDS = {
  focaccia: ['f-pizze','f-focacce','f-ciabatta','f-trayfocaccia','f-panini','f-kg'],
  brioche:  ['b-burgerbuns','b-subrolls','b-bun','b-rolls','b-kg'],
  sourdough:['s-loaves','s-weight'],
};

function saveQty(tab) {
  QTY_IDS[tab].forEach(id => localStorage.setItem(id, document.getElementById(id).value));
}

function clearQty(tab) {
  QTY_IDS[tab].forEach(id => localStorage.removeItem(id));
}

function restoreAndInit() {
  Object.values(QTY_IDS).flat().forEach(id => {
    const val = localStorage.getItem(id);
    if (val !== null) document.getElementById(id).value = val;
  });
  Object.entries(QTY_IDS).forEach(([tab, ids]) => {
    ids.forEach(id => document.getElementById(id).addEventListener('input', () => saveQty(tab)));
  });
  calcFocaccia();
  calcBrioche();
  calcSourdough();
}

// ── Input focus/blur ──────────────────────────────────────────────────────────
const DEFAULTS = { 'f-yeast-pct':'0.65', 'b-yeast-pct':'4', 's-starter-pct':'18', 's-weight':'905', 'f-panini-div':'0' };

document.querySelectorAll('input[type="number"]').forEach(input => {
  input.addEventListener('focus', function() {
    if (this.value === '0' || this.value === '') {
      this.value = '';
    } else {
      this.select();
    }
  });
  input.addEventListener('blur', function() {
    if (this.value === '' || isNaN(parseFloat(this.value))) {
      this.value = DEFAULTS[this.id] || '0';
      if (this.id.startsWith('f-')) calcFocaccia();
      else if (this.id.startsWith('b-')) calcBrioche();
      else if (this.id.startsWith('s-')) calcSourdough();
    }
  });
});

// ── Calc input listeners ──────────────────────────────────────────────────────
['f-yeast-pct','f-pizze','f-focacce','f-ciabatta','f-trayfocaccia','f-panini','f-kg'].forEach(id => {
  document.getElementById(id).addEventListener('input', calcFocaccia);
});
document.getElementById('f-panini-div').addEventListener('input', () => {
  const total = +document.getElementById('f-panini-total').textContent || 0;
  const div   = +document.getElementById('f-panini-div').value || 0;
  document.getElementById('f-panini-split').textContent = div > 0 ? Math.round(total / div) : 0;
});
document.getElementById('f-panini-div').addEventListener('focus', () => {
  setTimeout(() => {
    document.getElementById('f-panini-div').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 300);
});
['b-yeast-pct','b-burgerbuns','b-subrolls','b-bun','b-rolls','b-kg'].forEach(id => {
  document.getElementById(id).addEventListener('input', calcBrioche);
});
['s-starter-pct','s-loaves','s-weight'].forEach(id => {
  document.getElementById(id).addEventListener('input', calcSourdough);
});

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

document.querySelectorAll('.reset-btn').forEach((btn, i) => {
  const tabs = ['focaccia','brioche','sourdough'];
  btn.addEventListener('click', () => resetTab(tabs[i]));
});

document.querySelector('.recipe-footer-btn').addEventListener('click', openRecipes);
document.getElementById('recipe-save-btn').addEventListener('click', saveRecipes);
document.querySelector('.recipe-back-btn').addEventListener('click', closeRecipes);

document.querySelector('.loaf-modal-cancel').addEventListener('click', closeLoafModal);
document.querySelector('.loaf-modal-send').addEventListener('click', sendWithLoaves);

// ── Cross-module events ───────────────────────────────────────────────────────
document.addEventListener('switch-tab', e => switchTab(e.detail));
document.addEventListener('firestore-log-updated', renderLog);
document.addEventListener('recipes-saved', () => { calcFocaccia(); calcBrioche(); calcSourdough(); });

// ── Init ──────────────────────────────────────────────────────────────────────
restoreAndInit();
