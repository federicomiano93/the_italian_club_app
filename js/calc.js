import { RECIPES, recipeTotal } from './recipes.js';
import {
  computeTarget, getTabProducts, doughExtraGrams, isExtraDoughEnabled,
  getDivisorProducts, divisorTotal, splitDough, DIVISOR_MAX,
  isCrateEnabled, getCratePerBox, crateCount,
} from './calculator-config.js';
import { getConfig } from './calculator-config-store.js';
import { el } from './calculator-render.js';

export function showResult(id) { document.getElementById(id).classList.add('visible'); }
export function hideResult(id) { document.getElementById(id).classList.remove('visible'); }

// Reads a quantity input/select by id; 0 when the element is absent (the product
// may have been removed in Settings) or empty. Works for <input> and <select>.
function qtyOf(id) {
  const el = document.getElementById(id);
  return el ? (+el.value || 0) : 0;
}

// Extra dough: a free amount entered per tab (in g or kg), added on top of the
// products' total. Independent of any product. Exported so the log can report it.
export function extraDoughGramsFor(tab) {
  if (!isExtraDoughEnabled(getConfig(), tab)) return 0; // box hidden for this tab
  const valEl = document.getElementById(tab[0] + '-extra');
  if (!valEl) return 0;
  const unitEl = document.getElementById(tab[0] + '-extra-unit');
  return doughExtraGrams(valEl.value, unitEl ? unitEl.value : 'g');
}

// The fixed parameter field locked together with the quantities, per tab.
const PARAM_ID = { focaccia: 'f-yeast-pct', brioche: 'b-yeast-pct', sourdough: 's-starter-pct' };

// Inputs locked after Confirm: all the tab's product quantities + its parameter.
// Built from config so newly added products are locked too. Divisor fields are
// excluded — they only split dough into portions and never affect the log.
function lockIds(tab) {
  const ids = getTabProducts(getConfig(), tab).map(p => p.id);
  if (PARAM_ID[tab]) ids.push(PARAM_ID[tab]);
  ids.push(tab[0] + '-extra', tab[0] + '-extra-unit'); // the extra-dough box is locked too
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

// ── Divisor box (display-only crate split) ────────────────────────────────────
// Builds a tab's divisor box skeleton from config: a names line (filled by
// updateDivisorBox) + a "÷ N" row with a 0–4 dropdown. Rebuilt whenever the config
// changes (which products are ticked); the names and running totals are refreshed
// by updateDivisorBox on every quantity change. The box never affects the recipe
// or the log — it only splits dough into crates. Exported because app.js rebuilds
// it on each config render.
export function buildDivisorBox(tab) {
  const box = document.getElementById(tab[0] + '-divisor-box');
  if (!box) return;
  box.textContent = '';
  // No product ticked for this tab → the box can never appear; nothing to build.
  if (getDivisorProducts(getConfig(), tab).length === 0) { box.style.display = 'none'; return; }

  const select = el('select', { id: tab[0] + '-divisor-div', class: 'divisor-select', 'aria-label': 'Number of crates' });
  for (let n = 0; n <= DIVISOR_MAX; n++) select.appendChild(el('option', { value: String(n) }, String(n)));
  select.addEventListener('change', () => updateDivisorBox(tab));

  box.appendChild(el('div', { class: 'divisor-names', id: tab[0] + '-divisor-names' }, ''));
  box.appendChild(el('div', { class: 'divisor-row' }, [
    el('span', { class: 'divisor-total', id: tab[0] + '-divisor-total' }, '0'),
    el('span', { class: 'divisor-unit' }, 'g'),
    el('span', { class: 'divisor-sym' }, '÷'),
    select,
    el('span', { class: 'divisor-eq' }, '='),
    el('span', { class: 'divisor-result', id: tab[0] + '-divisor-result' }, '0'),
    el('span', { class: 'divisor-unit' }, 'g'),
  ]));
  updateDivisorBox(tab);
}

// Refresh a divisor box from the current quantities and dropdown value. Only the
// ticked products that actually have a quantity entered now are shown and summed,
// so the box reflects exactly what is being calculated. Hides the box when no such
// product exists (nothing ticked, or nothing entered yet).
export function updateDivisorBox(tab) {
  const box = document.getElementById(tab[0] + '-divisor-box');
  if (!box) return;
  const namesEl = document.getElementById(tab[0] + '-divisor-names');
  if (!namesEl) { box.style.display = 'none'; return; } // skeleton not built (none ticked)

  const active = getDivisorProducts(getConfig(), tab).filter(p => qtyOf(p.id) > 0);
  if (active.length === 0) { box.style.display = 'none'; return; }
  box.style.display = '';

  const names = [];
  for (const p of active) if (!names.includes(p.name)) names.push(p.name);
  namesEl.textContent = names.join(', ');

  const total = divisorTotal(getConfig(), tab, qtyOf);
  const divEl = document.getElementById(tab[0] + '-divisor-div');
  const n = divEl ? (+divEl.value || 0) : 0;
  document.getElementById(tab[0] + '-divisor-total').textContent = Math.round(total);
  document.getElementById(tab[0] + '-divisor-result').textContent = Math.round(splitDough(total, n));
}

// Crate boxes: a display-only helper, one box per product that has opted in
// (product.crate.show) and currently has a quantity. Each box shows the product
// name, how many crates the order fills (quantity ÷ pieces per crate) and the crate
// weight (pieces × the product's unit weight). Bound to the product, not its name,
// so renaming never breaks it. Rebuilt on every recalculation — no persistent state.
function renderCrateBoxes(tab) {
  const wrap = document.getElementById(tab[0] + '-crate-boxes');
  if (!wrap) return;
  wrap.textContent = '';
  for (const p of getTabProducts(getConfig(), tab)) {
    if (!isCrateEnabled(p)) continue;
    const qty = qtyOf(p.id);
    if (qty <= 0) continue;
    const perBox = getCratePerBox(p);
    const crates = crateCount(qty, perBox);
    wrap.appendChild(el('div', { class: 'crate-box' }, [
      el('div', { class: 'crate-box-title' }, p.name),
      el('div', { class: 'crate-count' }, [
        el('span', { class: 'crate-count-val' }, String(Math.round(crates * 10) / 10)),
        el('span', { class: 'crate-count-unit' }, ' box'),
      ]),
      el('div', { class: 'crate-sub' }, (perBox * p.weight) + 'g each box'),
    ]));
  }
}

export function calcFocaccia() {
  const yeastPct = +document.getElementById('f-yeast-pct').value || 0.65;
  const target = computeTarget(getConfig(), 'focaccia', qtyOf) + extraDoughGramsFor('focaccia');
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
  updateDivisorBox('focaccia');
  renderCrateBoxes('focaccia');
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
  const target = computeTarget(getConfig(), 'brioche', qtyOf) + extraDoughGramsFor('brioche');
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
  updateDivisorBox('brioche');
  renderCrateBoxes('brioche');
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
  const target = computeTarget(getConfig(), 'sourdough', qtyOf) + extraDoughGramsFor('sourdough');

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
  updateDivisorBox('sourdough');
  renderCrateBoxes('sourdough');
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
    const total = parseInt(document.getElementById('f-total').textContent, 10);
    return [
      'FOCACCIA DOUGH  ' + (total / 1000).toFixed(1) + ' kg',
      SEP,
      ...readIngredients('f'),
    ].join('\n');

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
