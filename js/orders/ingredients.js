// ingredients.js — builds the ingredient list for one supplier.
//
// Minimal, chef-first: each row shows the ingredient name + unit, a STOCK ON
// HAND field (entered first), and the ORDER quantity (+/- stepper). Entering
// stock auto-fills the suggested order quantity from history (Phase 5) — the
// operator can always override it. A small line shows the suggestion, or a
// countdown while fewer than 4 weeks of history exist.
//
// State lives in the shared `entries` object ({ [id]: { qty, stock } }).
// `suggest(ingredientId, stock)` returns the suggestion engine result.

import { el, groupBy } from './dom.js';

export function buildIngredientList(supplier, ingredients, suggest, entries, hooks) {
  const progress = el('div', { class: 'progress' }, [
    el('div', { class: 'progress-track' }, [
      el('div', { class: 'progress-fill', id: `progress-fill-${supplier.id}` }),
    ]),
    el('span', { class: 'progress-text', id: `progress-text-${supplier.id}` }, 'Loading…'),
  ]);

  const body = el('div', { class: 'ingredient-list' }, [progress]);

  const byCategory = groupBy(ingredients, 'category');
  Object.keys(byCategory).sort().forEach(category => {
    body.appendChild(el('div', { class: 'ing-category' }, category));
    byCategory[category]
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(ing => body.appendChild(buildRow(ing, supplier, suggest, entries, hooks)));
  });

  return body;
}

function buildRow(ing, supplier, suggest, entries, hooks) {
  const entry = entries[ing.id] || (entries[ing.id] = { qty: 0, stock: 0 });

  const stockInput = el('input', {
    type: 'number', class: 'ing-stock', min: '0', inputmode: 'numeric',
    'aria-label': `${ing.name} stock on hand`,
  });
  const qtyInput = el('input', {
    type: 'number', class: 'ing-qty', min: '0', inputmode: 'numeric',
    'aria-label': `${ing.name} quantity to order`,
  });
  const hint = el('div', { class: 'ing-suggestion' });

  function setQty(value, fromInput) {
    const qty = Math.max(0, Math.round(Number(value) || 0));
    entries[ing.id].qty = qty;
    if (!fromInput) qtyInput.value = qty || '';
    hooks.afterChange(supplier.id);
  }

  function updateHint() {
    const result = suggest(ing.id, entries[ing.id].stock || 0);
    if (result.active) {
      hint.textContent = `Suggested: ${result.suggestion}`;
      hint.className = 'ing-suggestion active';
    } else {
      const n = result.weeksRemaining;
      hint.textContent = `Suggestion available in ${n} week${n === 1 ? '' : 's'}`;
      hint.className = 'ing-suggestion pending';
    }
    return result;
  }

  stockInput.addEventListener('input', () => {
    entries[ing.id].stock = Math.max(0, Math.round(Number(stockInput.value) || 0));
    const result = updateHint();
    if (result.active) setQty(result.suggestion); // auto-fill the suggested order (also autosaves)
    else hooks.afterChange(supplier.id);           // still autosave the stock value
  });
  qtyInput.addEventListener('input', () => setQty(qtyInput.value, true));

  const stepper = el('div', { class: 'qty-stepper' }, [
    el('button', { type: 'button', class: 'step-btn', 'aria-label': 'Decrease',
      onClick: () => setQty((entries[ing.id].qty || 0) - 1) }, '−'),
    qtyInput,
    el('button', { type: 'button', class: 'step-btn', 'aria-label': 'Increase',
      onClick: () => setQty((entries[ing.id].qty || 0) + 1) }, '+'),
  ]);

  const row = el('div', { class: 'ing-row', dataset: { ing: ing.id } }, [
    el('div', { class: 'ing-top' }, [
      el('span', { class: 'ing-name', text: ing.name }),
      el('span', { class: 'ing-unit', text: ing.unit }),
    ]),
    el('div', { class: 'ing-fields' }, [
      el('label', { class: 'field stock-field' }, [
        el('span', { class: 'field-label', text: 'Stock' }),
        stockInput,
      ]),
      el('div', { class: 'field order-field' }, [
        el('span', { class: 'field-label', text: 'Order' }),
        stepper,
      ]),
    ]),
    hint,
  ]);

  stockInput.value = entry.stock || '';
  qtyInput.value = entry.qty || '';
  updateHint(); // show suggestion/countdown without overwriting a restored quantity
  return row;
}
