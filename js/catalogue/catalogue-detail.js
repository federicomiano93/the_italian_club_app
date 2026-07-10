// catalogue-detail.js — a single recipe: shows the base (unscaled) recipe
// immediately, with amounts column-aligned; a bottom "Total dough weight" input
// (starts empty) scales everything pro-rata AFTER a confirm; a Clear button
// (only once scaled) returns to the base; an Import button copies it into the
// Calculator.

import { el } from './dom.js';
import { scaleCatalogue, baseAmounts, weighableTotalGrams, unitOf } from './catalogue-model.js';
import { getScaledTarget, setScaledTarget, clearScaledTarget } from './catalogue-store.js';

const IMPORT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>';
const TRASH_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';

// Whole grams only: values are already rounded in the model, and maximumFractionDigits:0
// is a belt-and-suspenders guard so nothing ever shows a decimal. useGrouping:false
// drops the thousands separator (e.g. 1000 g, not 1,000 g) — Federico's preference.
const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0, useGrouping: false });
const fmtG = (g) => nf.format(g) + ' g';
// One ingredient amount in its own unit; a 'to taste' row (value null) shows no number.
const fmtAmount = (value, unit) => value === null ? 'to taste' : `${nf.format(value)} ${unit}`;

export function renderDetail({ recipe, app }) {
  // Restore a recently calculated batch (kept per device until Clear or 12h), so
  // leaving and reopening the recipe shows the same scaled amounts. 0 = base.
  let displayTarget = getScaledTarget(recipe.id) || 0;

  const ingList = el('div', { class: 'cat-ing-list' });

  const kgInput = el('input', {
    id: 'catKg', type: 'number', min: '0', step: '0.1',
    value: displayTarget > 0 ? String(displayTarget / 1000) : '', placeholder: '0',
    inputmode: 'decimal', 'aria-label': 'Total dough weight in kilograms',
  });

  const clearBtn = el('button', {
    class: 'cat-clear-btn', type: 'button', hidden: 'hidden',
    text: 'Clear — back to base recipe',
    onclick: () => { displayTarget = 0; kgInput.value = ''; clearScaledTarget(recipe.id); renderRows(); },
  });

  const calcBtn = el('button', {
    class: 'cat-calc-btn', type: 'button', text: 'Calculate', onclick: onCalculate,
  });

  function renderRows() {
    ingList.replaceChildren();
    const scaled = displayTarget > 0;
    const amounts = scaled ? scaleCatalogue(recipe, displayTarget) : baseAmounts(recipe);
    recipe.ingredients.forEach((ing, i) => {
      ingList.appendChild(el('div', { class: 'cat-ing-row' }, [
        el('span', { class: 'cat-ing-name', text: ing.label }),
        el('span', { class: 'cat-ing-amt', text: fmtAmount(amounts[i], unitOf(ing)) }),
      ]));
    });
    // Total = the WEIGHABLE mass in grams (weight + volume rows): when scaled it is
    // the target, at base the recipe's own weighable total. Non-weight rows (pieces /
    // to-taste) are shown above but never enter this total.
    const total = scaled ? displayTarget : weighableTotalGrams(recipe);
    ingList.appendChild(el('div', { class: 'cat-ing-row cat-ing-total' }, [
      el('span', { class: 'cat-ing-name', text: 'Total' }),
      el('span', { class: 'cat-ing-amt', text: fmtG(total) }),
    ]));
    clearBtn.hidden = !scaled;
  }

  async function onCalculate() {
    const kg = parseFloat(kgInput.value);
    if (!isFinite(kg) || kg <= 0) { // empty / 0 → base recipe
      displayTarget = 0;
      clearScaledTarget(recipe.id);
      renderRows();
      return;
    }
    const ok = await app.confirm({
      title: 'Calculate recipe?',
      message: `Calculate ${recipe.name} for ${kg} kg?`,
      okLabel: 'Calculate',
    });
    if (!ok) return;
    displayTarget = kg * 1000;
    setScaledTarget(recipe.id, displayTarget); // keep this batch until Clear / 12h
    renderRows();
  }

  const weightPanel = el('div', { class: 'cat-weight-panel' }, [
    el('label', { for: 'catKg', text: 'Total dough weight' }),
    el('div', { class: 'cat-weight-input' }, [
      el('div', { class: 'cat-field' }, [kgInput, el('span', { class: 'unit', text: 'kg' })]),
      calcBtn,
    ]),
    clearBtn,
  ]);
  // No weighable ingredients (all pieces / to-taste) → nothing to scale by weight,
  // so hide the whole panel. getScaledTarget stays 0 in that case too.
  if (weighableTotalGrams(recipe) <= 0) weightPanel.hidden = true;

  const importBtn = el('button', {
    class: 'cat-import-btn', type: 'button',
    onclick: () => app.importRecipe(recipe),
  }, [
    el('span', { icon: IMPORT_SVG, 'aria-hidden': 'true' }),
    'Import into Calculator',
  ]);

  // Low-key delete (P20 — de-emphasised destructive action): routed through the
  // shared guard, which warns if the recipe was imported into the Calculator and
  // navigates back to the list once deleted.
  const deleteBtn = el('button', {
    class: 'cat-detail-del', type: 'button',
    onclick: () => app.confirmAndDelete(recipe),
  }, [
    el('span', { icon: TRASH_SVG, 'aria-hidden': 'true' }),
    'Delete recipe',
  ]);

  renderRows();

  // The recipe name already lives in the green header (setHeader), so no title
  // here. The recipe list is the focus, with the small weight panel right below;
  // Import/Delete are pushed to the bottom (.cat-detail-bottom → margin-top:auto)
  // so they're reached by scrolling and never compete with the recipe.
  return el('div', { class: 'cat-view' }, [
    ingList,
    weightPanel,
    el('div', { class: 'cat-detail-bottom' }, [
      importBtn,
      el('p', {
        class: 'cat-import-hint',
        text: 'Makes a copy you can tweak just for the Calculator — the catalogue recipe stays untouched.',
      }),
      deleteBtn,
    ]),
  ]);
}
