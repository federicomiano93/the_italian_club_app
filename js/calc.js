import { RECIPES } from './recipes.js';
import {
  computeTarget, getTabProducts, doughExtraGrams, isExtraDoughEnabled,
  getDivisorProducts, divisorTotal, splitDough, DIVISOR_MAX,
  isCrateEnabled, getCratePerBox, crateCount,
} from './calculator-config.js';
import { getConfig } from './calculator-config-store.js';
import { el } from './calculator-render.js';
import { scaleFocaccia, scaleBrioche, scaleSourdough } from './calculator-dough-math.js';
import { buildRecipeText } from './calculator-recipe-text.js';

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

// Whether each tab's result card is revealed. The recipe is hidden until the first
// Confirm, then stays visible AND fully editable — the recipe sheet and the log are
// two independent things: each Confirm just saves a separate log, nothing is ever
// locked. Persisted per tab so a reload keeps a revealed recipe shown.
const revealed = { focaccia: false, brioche: false, sourdough: false };
export function markRevealed(tab) {
  revealed[tab] = true;
  try { localStorage.setItem('revealed-' + tab, '1'); } catch (e) {}
}
export function clearRevealed(tab) {
  revealed[tab] = false;
  try { localStorage.removeItem('revealed-' + tab); } catch (e) {}
}
export function restoreRevealed(tab) {
  if (localStorage.getItem('revealed-' + tab) === '1') revealed[tab] = true;
}

// ── Confirm / Edit lock ───────────────────────────────────────────────────────
// Each dough tab has a Confirm button that opens a shared Today/Tomorrow day picker;
// choosing a day saves the log. The tab then LOCKS: its inputs are disabled
// (greyed) and the Confirm button is replaced by an "Edit" button. The
// quantities — and the linked log — stop changing until the user taps Edit to unlock.
// `logId` ties the tab to the log it confirmed, so the next Confirm UPDATES that same
// log instead of creating a new one. Reset clears the link, so the following Confirm
// starts a fresh log. Persisted per tab (lock-<tab>) so a reload keeps both the locked
// state and the link.
const lockState = {
  focaccia:  { locked: false, logId: null },
  brioche:   { locked: false, logId: null },
  sourdough: { locked: false, logId: null },
};
export function getLock(tab) { return lockState[tab] || { locked: false, logId: null }; }

// Whether a dough tab has quantities to confirm (total raw grams > 0).
function tabReady(tab) {
  return (computeTarget(getConfig(), tab, qtyOf) + extraDoughGramsFor(tab)) > 0;
}

// Reflect a tab's lock state in the UI: grey/disable the inputs when locked, and show
// the right control under the orders — the Confirm button (unlocked & ready),
// the Edit button (locked), or nothing (no quantities entered yet).
export function applyTabState(tab) {
  const locked = getLock(tab).locked;
  const ready = tabReady(tab);
  const root = document.getElementById('tab-' + tab);
  if (root) {
    root.querySelectorAll('input[type="number"], select.qty-select, select.extra-unit-select, select.divisor-select')
      .forEach(elm => { elm.disabled = locked; });
  }
  const dayBox = document.getElementById(tab[0] + '-day-confirm');
  const editBtn = document.getElementById(tab[0] + '-edit-btn');
  if (dayBox)  dayBox.style.display  = (ready && !locked) ? 'block' : 'none';
  if (editBtn) editBtn.style.display = (ready && locked)  ? 'block' : 'none';
}

export function setLock(tab, locked, logId) {
  lockState[tab] = { locked: !!locked, logId: logId || null };
  try { localStorage.setItem('lock-' + tab, JSON.stringify(lockState[tab])); } catch (e) {}
  applyTabState(tab);
}

export function clearLock(tab) {
  lockState[tab] = { locked: false, logId: null };
  try { localStorage.removeItem('lock-' + tab); } catch (e) {}
  applyTabState(tab);
}

export function restoreLock(tab) {
  try {
    const raw = localStorage.getItem('lock-' + tab);
    if (raw) { const v = JSON.parse(raw); lockState[tab] = { locked: !!v.locked, logId: v.logId || null }; }
  } catch (e) {}
}

// The computed ingredients for each dough's last calculation: the SINGLE source
// of truth shared by the on-screen render and the Copy/WhatsApp export. Each entry
// is { rows: [{ name, grams }], totalG }. Set only on a successful calculation
// (target > 0), exactly like the rendered rows used to be.
const lastRecipe = { focaccia: null, brioche: null, sourdough: null };

// Render an ingredient list into a container, replacing its contents. CSP-safe:
// built with the el() DOM helper (no innerHTML), matching js/log-view.js. Keeps
// the .ing-row / .ing-name / .ing-val classes unchanged (shared with Log/Orders).
function renderIngredients(containerId, rows) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.textContent = '';
  for (const r of rows) {
    container.appendChild(el('div', { class: 'ing-row' }, [
      el('span', { class: 'ing-name' }, r.name),
      el('span', { class: 'ing-val' }, Math.round(r.grams) + ' g'),
    ]));
  }
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

  const active = getDivisorProducts(getConfig(), tab).filter(p => qtyOf(p.qtyId) > 0);
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
    const qty = qtyOf(p.qtyId);
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
    applyTabState('focaccia');
    return;
  }

  const [flu, flt, mlt, sug, slt, yst, oyl, w1, w2] = scaleFocaccia(RECIPES.focaccia, target, yeastPct);

  const rows = [
    { name: 'Flour uniqua blue', grams: flu }, { name: 'Flour T65', grams: flt },
    { name: 'Malt', grams: mlt }, { name: 'Sugar', grams: sug }, { name: 'Salt', grams: slt },
    { name: 'Yeast', grams: yst }, { name: 'Oil', grams: oyl },
    { name: '1° Water', grams: w1 }, { name: '2° Water', grams: w2 },
  ];
  renderIngredients('f-ingredients', rows);
  lastRecipe.focaccia = { rows, totalG: Math.round(target) };

  document.getElementById('f-yeast-display').textContent = yeastPct;
  document.getElementById('f-badge').textContent = Math.round(target) + ' g raw';
  document.getElementById('f-total').textContent  = Math.round(target);
  updateDivisorBox('focaccia');
  renderCrateBoxes('focaccia');
  applyTabState('focaccia');
  if (revealed.focaccia) showResult('focaccia-result'); else hideResult('focaccia-result');
}

export function calcBrioche() {
  const yeastPct = +document.getElementById('b-yeast-pct').value || 4;
  const target = computeTarget(getConfig(), 'brioche', qtyOf) + extraDoughGramsFor('brioche');
  if (target === 0) {
    hideResult('brioche-result');
    applyTabState('brioche');
    return;
  }

  const [fl, ys, wt] = scaleBrioche(RECIPES.brioche, target, yeastPct);

  const rows = [
    { name: 'Mella brioche pof', grams: fl }, { name: 'Yeast', grams: ys }, { name: 'Water', grams: wt },
  ];
  renderIngredients('b-ingredients', rows);
  lastRecipe.brioche = { rows, totalG: Math.round(target) };

  document.getElementById('b-yeast-display').textContent = yeastPct;
  document.getElementById('b-badge').textContent = Math.round(target) + ' g raw';
  document.getElementById('b-total').textContent  = Math.round(target);
  updateDivisorBox('brioche');
  renderCrateBoxes('brioche');
  applyTabState('brioche');
  if (revealed.brioche) showResult('brioche-result'); else hideResult('brioche-result');
}

export function calcSourdough() {
  const starterPct = +document.getElementById('s-starter-pct').value || 18;
  const target = computeTarget(getConfig(), 'sourdough', qtyOf) + extraDoughGramsFor('sourdough');

  if (target === 0) {
    hideResult('sourdough-result');
    applyTabState('sourdough');
    return;
  }

  const [flu, flt, flw, w1, st, mlt, slt, w2] = scaleSourdough(RECIPES.sourdough, target, starterPct);

  const rows = [
    { name: 'Flour uniqua blue', grams: flu }, { name: 'Flour T65', grams: flt },
    { name: 'Flour wholemeal', grams: flw }, { name: '1° Water', grams: w1 },
    { name: 'Starter', grams: st },
    { name: 'Malt', grams: mlt }, { name: 'Salt', grams: slt }, { name: '2° Water', grams: w2 },
  ];
  renderIngredients('s-ingredients', rows);
  lastRecipe.sourdough = { rows, totalG: Math.round(target) };

  document.getElementById('s-badge').textContent  = Math.round(target) + ' g raw';
  document.getElementById('s-total').textContent  = Math.round(target);
  updateDivisorBox('sourdough');
  renderCrateBoxes('sourdough');
  applyTabState('sourdough');
  if (revealed.sourdough) showResult('sourdough-result'); else hideResult('sourdough-result');
}

// Recipe text for the Copy/WhatsApp export, built from the in-memory ingredient
// model (the same data the screen shows) — no DOM scraping. Empty until the dough
// has been calculated at least once.
function recipeTextFor(tab) {
  const model = lastRecipe[tab];
  if (!model) return '';
  return buildRecipeText(tab, model.rows, model.totalG);
}

export function copyRecipe(tab) {
  const btn = document.getElementById(tab[0] + '-copy-btn');
  navigator.clipboard.writeText(recipeTextFor(tab)).then(() => {
    btn.textContent = 'Copied ✓';
    setTimeout(() => { btn.textContent = 'Copy recipe'; }, 2000);
  });
}

export function shareRecipeWA(tab) {
  window.open('https://wa.me/?text=' + encodeURIComponent(recipeTextFor(tab)), '_blank');
}
