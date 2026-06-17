import { RECIPES, recipeTotal } from './recipes.js';
import { computeTarget, getTabProducts } from './calculator-config.js';
import { getConfig } from './calculator-config-store.js';

export function showResult(id) { document.getElementById(id).classList.add('visible'); }
export function hideResult(id) { document.getElementById(id).classList.remove('visible'); }

// Reads a quantity input/select by id; 0 when the element is absent (the product
// may have been removed in Settings) or empty. Works for <input> and <select>.
function qtyOf(id) {
  const el = document.getElementById(id);
  return el ? (+el.value || 0) : 0;
}

// True if a product with this id is configured in the tab.
function hasProduct(tab, id) {
  return getTabProducts(getConfig(), tab).some(p => p.id === id);
}

// Weight of a specific configured product (for the panini-dough helper); 0 if absent.
function productWeight(tab, id) {
  const p = getTabProducts(getConfig(), tab).find(prod => prod.id === id);
  return p ? p.weight : 0;
}

// The fixed parameter field locked together with the quantities, per tab.
const PARAM_ID = { focaccia: 'f-yeast-pct', brioche: 'b-yeast-pct', sourdough: 's-starter-pct' };

// Inputs locked after Confirm: all the tab's product quantities + its parameter.
// Built from config so newly added products are locked too. Divisor fields are
// excluded — they only split dough into portions and never affect the log.
function lockIds(tab) {
  const ids = getTabProducts(getConfig(), tab).map(p => p.id);
  if (PARAM_ID[tab]) ids.push(PARAM_ID[tab]);
  return ids;
}
function setDisabled(tab, disabled) {
  lockIds(tab).forEach(id => { const el = document.getElementById(id); if (el) el.disabled = disabled; });
}
export function lockInputs(tab) { setDisabled(tab, true); }
export function unlockInputs(tab) { setDisabled(tab, false); }

function ing(name, grams) {
  return `<div class="ing-row"><span class="ing-name">${name}</span><span class="ing-val">${Math.round(grams)} g</span></div>`;
}

// Rounds an array of gram values so their displayed integers sum exactly to Math.round(total).
// Assigns any ±1-2g rounding residual to the largest ingredient.
function fixRounding(amounts, total) {
  const rounded = amounts.map(Math.round);
  const diff = Math.round(total) - rounded.reduce((a, b) => a + b, 0);
  if (diff !== 0) {
    const maxIdx = rounded.indexOf(Math.max(...rounded));
    rounded[maxIdx] += diff;
  }
  return rounded;
}

// The "Panini Dough" helper box is specific to the focaccia panini product;
// it hides when that product is not configured.
function updatePaniniBox() {
  const box = document.getElementById('f-panini-box');
  if (!hasProduct('focaccia', 'f-panini')) { if (box) box.style.display = 'none'; return; }
  if (box) box.style.display = '';
  const paniniDough = qtyOf('f-panini') * productWeight('focaccia', 'f-panini');
  document.getElementById('f-panini-total').textContent = Math.round(paniniDough);
  const div = +document.getElementById('f-panini-div').value || 0;
  document.getElementById('f-panini-split').textContent = div > 0 ? Math.round(paniniDough / div) : 0;
}

// The "Ciabatta boxes" helper is specific to the focaccia ciabatta product.
function updateCiabattaBox() {
  const box = document.getElementById('f-ciabatta-box');
  if (!box) return;
  const ciabatta = qtyOf('f-ciabatta');
  if (hasProduct('focaccia', 'f-ciabatta') && ciabatta > 0) {
    document.getElementById('f-ciabatta-boxes').textContent = ciabatta / 20;
    box.style.display = 'block';
  } else {
    box.style.display = 'none';
  }
}

export function calcFocaccia() {
  const yeastPct = +document.getElementById('f-yeast-pct').value || 0.65;
  const target = computeTarget(getConfig(), 'focaccia', qtyOf);
  if (target === 0) {
    hideResult('focaccia-result');
    const fbtn0 = document.getElementById('f-confirm-btn');
    fbtn0.classList.remove('visible');
    fbtn0.dataset.mode = '';
    fbtn0.textContent = '✓ Confirm';
    fbtn0.disabled = false;
    return;
  }

  const R = RECIPES.focaccia;
  const base_total = recipeTotal(R);
  const scale = target / base_total;
  const total_flour = R.flourBlu + R.flourT65;
  const yeast = total_flour * scale * (yeastPct / 100);
  const remaining = target - yeast;
  const non_yeast_base = base_total - R.yeast;

  const amounts = [
    R.flourBlu * remaining / non_yeast_base,
    R.flourT65 * remaining / non_yeast_base,
    R.malt     * remaining / non_yeast_base,
    R.sugar    * remaining / non_yeast_base,
    R.salt     * remaining / non_yeast_base,
    yeast,
    R.oil      * remaining / non_yeast_base,
    R.water1   * remaining / non_yeast_base,
    R.water2   * remaining / non_yeast_base,
  ];
  const [flu, flt, mlt, sug, slt, yst, oyl, w1, w2] = fixRounding(amounts, target);

  document.getElementById('f-ingredients').innerHTML =
    ing('Flour uniqua blue', flu) + ing('Flour T65', flt) +
    ing('Malt', mlt) + ing('Sugar', sug) + ing('Salt', slt) +
    ing('Yeast', yst) + ing('Oil', oyl) +
    ing('1° Water', w1) + ing('2° Water', w2);

  document.getElementById('f-yeast-display').textContent = yeastPct;
  document.getElementById('f-badge').textContent = Math.round(target) + ' g raw';
  document.getElementById('f-total').textContent  = Math.round(target);
  updatePaniniBox();
  updateCiabattaBox();
  const fbtn = document.getElementById('f-confirm-btn');
  if (fbtn.dataset.mode !== 'edit') {
    fbtn.textContent = '✓ Confirm';
    fbtn.dataset.saved = '';
    fbtn.dataset.mode = '';
    fbtn.disabled = false;
    fbtn.classList.add('visible');
    hideResult('focaccia-result');
  }
}

export function calcBrioche() {
  const yeastPct = +document.getElementById('b-yeast-pct').value || 4;
  const target = computeTarget(getConfig(), 'brioche', qtyOf);
  if (target === 0) {
    hideResult('brioche-result');
    const bbtn0 = document.getElementById('b-confirm-btn');
    bbtn0.classList.remove('visible');
    bbtn0.dataset.mode = '';
    bbtn0.textContent = '✓ Confirm';
    bbtn0.disabled = false;
    return;
  }

  const R = RECIPES.brioche;
  const yeastBase       = R.yeast * (yeastPct / 4);
  const provisionalTotal = R.flour + yeastBase + R.water;
  const factor = target / provisionalTotal;

  const flour = R.flour * factor;
  const yeast = yeastBase * factor;
  const water = R.water * factor;
  const raw   = target;

  const [fl, ys, wt] = fixRounding([flour, yeast, water], raw);

  document.getElementById('b-ingredients').innerHTML =
    ing('Mella brioche pof', fl) + ing('Yeast', ys) + ing('Water', wt);

  document.getElementById('b-yeast-display').textContent = yeastPct;
  document.getElementById('b-badge').textContent = Math.round(raw) + ' g raw';
  document.getElementById('b-total').textContent  = Math.round(raw);
  document.getElementById('b-dough-display').textContent = Math.round(raw);
  const bDoughDiv = +document.getElementById('b-dough-div').value || 0;
  document.getElementById('b-dough-split').textContent = bDoughDiv > 0 ? Math.round(raw / bDoughDiv) : 0;
  const bbtn = document.getElementById('b-confirm-btn');
  if (bbtn.dataset.mode !== 'edit') {
    bbtn.textContent = '✓ Confirm';
    bbtn.dataset.saved = '';
    bbtn.dataset.mode = '';
    bbtn.disabled = false;
    bbtn.classList.add('visible');
    hideResult('brioche-result');
  }
}

export function calcSourdough() {
  const starterPct = +document.getElementById('s-starter-pct').value || 18;
  const target = computeTarget(getConfig(), 'sourdough', qtyOf);

  if (target === 0) {
    hideResult('sourdough-result');
    const sbtn0 = document.getElementById('s-confirm-btn');
    sbtn0.classList.remove('visible');
    sbtn0.dataset.mode = '';
    sbtn0.textContent = '✓ Confirm';
    sbtn0.disabled = false;
    return;
  }

  const R = RECIPES.sourdough;
  const starterBase      = R.starter * (starterPct / 18);
  const provisionalTotal = R.flourBlu + R.flourT65 + R.flourWhole + R.water1 + starterBase + R.malt + R.salt + R.water2;
  const factor = target / provisionalTotal;

  const flourBlu   = R.flourBlu   * factor;
  const flourT65   = R.flourT65   * factor;
  const flourWhole = R.flourWhole * factor;
  const water1     = R.water1     * factor;
  const starter    = starterBase  * factor;
  const malt       = R.malt       * factor;
  const salt       = R.salt       * factor;
  const water2     = R.water2     * factor;
  const raw = target;

  const [flu, flt, flw, w1, st, mlt, slt, w2] = fixRounding(
    [flourBlu, flourT65, flourWhole, water1, starter, malt, salt, water2], raw
  );

  document.getElementById('s-ingredients').innerHTML =
    ing('Flour uniqua blue', flu) + ing('Flour T65', flt) +
    ing('Flour wholemeal', flw) + ing('1° Water', w1) +
    ing('Starter', st) +
    ing('Malt', mlt) + ing('Salt', slt) + ing('2° Water', w2);

  document.getElementById('s-badge').textContent  = Math.round(raw) + ' g raw';
  document.getElementById('s-total').textContent  = Math.round(raw);
  document.getElementById('s-dough-display').textContent = Math.round(raw);
  const sDoughDiv = +document.getElementById('s-dough-div').value || 0;
  document.getElementById('s-dough-split').textContent = sDoughDiv > 0 ? Math.round(raw / sDoughDiv) : 0;
  const sbtn = document.getElementById('s-confirm-btn');
  if (sbtn.dataset.mode !== 'edit') {
    sbtn.textContent = '✓ Confirm';
    sbtn.dataset.saved = '';
    sbtn.dataset.mode = '';
    sbtn.disabled = false;
    sbtn.classList.add('visible');
    hideResult('sourdough-result');
  }
}

function buildRecipeText(tab) {
  const SEP = '─'.repeat(22);

  function fmtLine(name, val) {
    return (name + ':').padEnd(11) + String(val).padStart(5) + ' g';
  }

  function readIngredients(prefix) {
    const lines = [];
    document.querySelectorAll('#' + prefix + '-ingredients .ing-row').forEach(row => {
      const name = row.querySelector('.ing-name').textContent.trim();
      const val  = parseInt(row.querySelector('.ing-val').textContent, 10);
      if (name === 'Flour uniqua blue') {
        lines.push('Flour uniqua');
        lines.push(fmtLine('blue', val));
      } else {
        lines.push(fmtLine(name, val));
      }
    });
    return lines;
  }

  if (tab === 'focaccia') {
    const total  = parseInt(document.getElementById('f-total').textContent, 10);
    const panini = parseInt(document.getElementById('f-panini-total').textContent, 10);
    const lines  = [
      'FOCACCIA DOUGH  ' + (total / 1000).toFixed(1) + ' kg',
      SEP,
      ...readIngredients('f'),
    ];
    if (panini > 0) { lines.push(SEP); lines.push(fmtLine('Panini', panini)); }
    return lines.join('\n');

  } else if (tab === 'brioche') {
    const total = parseInt(document.getElementById('b-total').textContent, 10);
    return [
      'BRIOCHE DOUGH  ' + (total / 1000).toFixed(1) + ' kg',
      SEP,
      ...readIngredients('b'),
    ].join('\n');

  } else if (tab === 'sourdough') {
    const total = parseInt(document.getElementById('s-total').textContent, 10);
    return [
      'SOURDOUGH BREAD  ' + (total / 1000).toFixed(1) + ' kg',
      SEP,
      ...readIngredients('s'),
    ].join('\n');
  }
  return '';
}

export function copyRecipe(tab) {
  const btn = document.getElementById(tab[0] + '-copy-btn');
  navigator.clipboard.writeText(buildRecipeText(tab)).then(() => {
    btn.textContent = 'Copied ✓';
    setTimeout(() => { btn.textContent = 'Copy recipe'; }, 2000);
  });
}

export function shareRecipeWA(tab) {
  window.open('https://wa.me/?text=' + encodeURIComponent(buildRecipeText(tab)), '_blank');
}
