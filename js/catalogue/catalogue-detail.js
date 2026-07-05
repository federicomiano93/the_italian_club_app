// catalogue-detail.js — a single recipe: shows the base (unscaled) recipe
// immediately, with amounts column-aligned; a bottom "Total dough weight" input
// (starts empty) scales everything pro-rata AFTER a confirm; a Clear button
// (only once scaled) returns to the base; an Import button copies it into the
// Calculator.

import { el } from './dom.js';
import { scaleCatalogue, baseAmounts } from './catalogue-model.js';

const IMPORT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>';

const nf = new Intl.NumberFormat('en-GB');
const fmtG = (g) => nf.format(g) + ' g';
const fmtKg = (g) => (g / 1000).toLocaleString('en-GB', { maximumFractionDigits: 3 }) + ' kg';

export function renderDetail({ recipe, app }) {
  let displayTarget = 0; // grams; 0 = base recipe

  const ingList = el('div', { class: 'cat-ing-list' });
  const scaledNote = el('p', { class: 'cat-scaled-note', hidden: 'hidden' });

  const kgInput = el('input', {
    id: 'catKg', type: 'number', min: '0', step: '0.1', value: '', placeholder: '0',
    inputmode: 'decimal', 'aria-label': 'Total dough weight in kilograms',
  });

  const clearBtn = el('button', {
    class: 'cat-clear-btn', type: 'button', hidden: 'hidden',
    text: 'Clear — back to base recipe',
    onclick: () => { displayTarget = 0; kgInput.value = ''; renderRows(); },
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
        el('span', { class: 'cat-ing-amt', text: fmtG(amounts[i]) }),
      ]));
    });
    // Total matches the rows exactly: the scaled rows are integers summing to the
    // target; the base rows keep their (possibly fractional) amounts, so the total
    // is their true sum — not a rounded value that wouldn't add up.
    const total = amounts.reduce((a, b) => a + b, 0);
    ingList.appendChild(el('div', { class: 'cat-ing-row cat-ing-total' }, [
      el('span', { class: 'cat-ing-name', text: 'Total' }),
      el('span', { class: 'cat-ing-amt', text: fmtG(total) }),
    ]));
    scaledNote.hidden = !scaled;
    clearBtn.hidden = !scaled;
    if (scaled) scaledNote.textContent = 'Scaled to ' + fmtKg(displayTarget);
  }

  async function onCalculate() {
    const kg = parseFloat(kgInput.value);
    if (!isFinite(kg) || kg <= 0) { // empty / 0 → base recipe
      displayTarget = 0;
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

  const importBtn = el('button', {
    class: 'cat-import-btn', type: 'button',
    onclick: () => app.importRecipe(recipe),
  }, [
    el('span', { icon: IMPORT_SVG, 'aria-hidden': 'true' }),
    'Import into Calculator',
  ]);

  renderRows();

  return el('div', { class: 'cat-view' }, [
    el('div', { class: 'cat-ing-head' }, [el('h2', { text: recipe.name })]),
    ingList,
    scaledNote,
    weightPanel,
    importBtn,
    el('p', {
      class: 'cat-import-hint',
      text: 'Makes a copy you can tweak just for the Calculator — the catalogue recipe stays untouched.',
    }),
  ]);
}
