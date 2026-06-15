// ingredients.js — builds the ingredient list for one supplier.
//
// Deliberately minimal for chefs (per Federico): each row shows the ingredient
// name + unit, a STOCK ON HAND field (entered first), and the ORDER quantity
// (a +/- stepper). From Phase 5, entering stock auto-fills the suggested order
// quantity from history — the operator can always override it.
//
// State lives in the shared `entries` object ({ [ingredientId]: { qty, stock } }).
// Row handlers mutate it, then call hooks.afterChange(supplierId) so the supplier
// badge/counter/progress refresh without a full rebuild (inputs keep focus).
//
// `lastWeek` is accepted for the Phase 5 suggestion engine; it is not displayed.

import { el, groupBy } from './dom.js';

export function buildIngredientList(supplier, ingredients, lastWeek, entries, hooks) {
  // Progress bar (values filled in by suppliers.js refreshSupplierDerived).
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
      .forEach(ing => body.appendChild(buildRow(ing, supplier, entries, hooks)));
  });

  return body;
}

function buildRow(ing, supplier, entries, hooks) {
  const entry = entries[ing.id] || (entries[ing.id] = { qty: 0, stock: 0 });

  const stockInput = el('input', {
    type: 'number', class: 'ing-stock', min: '0', inputmode: 'numeric',
    'aria-label': `${ing.name} stock on hand`,
  });
  const qtyInput = el('input', {
    type: 'number', class: 'ing-qty', min: '0', inputmode: 'numeric',
    'aria-label': `${ing.name} quantity to order`,
  });

  function setQty(value, fromInput) {
    const qty = Math.max(0, Math.round(Number(value) || 0));
    entries[ing.id].qty = qty;
    if (!fromInput) qtyInput.value = qty || '';
    hooks.afterChange(supplier.id);
  }

  stockInput.addEventListener('input', () => {
    entries[ing.id].stock = Math.max(0, Math.round(Number(stockInput.value) || 0));
    // Phase 5: entering stock will auto-fill the suggested order quantity here.
    hooks.afterChange(supplier.id); // triggers the draft autosave
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
  ]);

  stockInput.value = entry.stock || '';
  qtyInput.value = entry.qty || '';
  return row;
}
