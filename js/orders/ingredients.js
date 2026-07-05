// ingredients.js — builds the ingredient list for one supplier.
//
// Minimal, chef-first: each row shows the ingredient name + unit and two plain
// number inputs side by side — STOCK ON HAND (entered first) and the ORDER
// quantity. Entering stock auto-fills the suggested order quantity from history
// (Phase 5) — the operator can always override it. When enough history exists a
// small line shows the suggestion; otherwise nothing (no countdown noise).
//
// State lives in the shared `entries` object ({ [id]: { qty, stock } }).
// `suggest(ingredientId, stock)` returns the suggestion engine result.

import { el, groupBy } from './dom.js';

// How many of a supplier's ingredients already have a quantity entered — used to
// paint the progress bar correctly on first render (before any typing), so a
// supplier is never stuck on a placeholder. refreshSupplierDerived (suppliers.js)
// keeps it in sync as the operator types.
function countFilled(ingredients, entries) {
  return ingredients.filter(i => (entries[i.id]?.qty || 0) > 0).length;
}

export function buildIngredientList(supplier, ingredients, suggest, entries, hooks) {
  // A supplier with no ingredients shows a clear empty state, not a progress bar
  // stuck at 0 of 0 (the old "Loading…" bug: nothing ever replaced the placeholder).
  if (!ingredients.length) {
    return el('div', { class: 'ingredient-list' }, [
      el('p', { class: 'ing-empty', text: 'No ingredients yet — add them in Settings ⚙.' }),
    ]);
  }

  const total = ingredients.length;
  const filled = countFilled(ingredients, entries);

  const fill = el('div', { class: 'progress-fill', id: `progress-fill-${supplier.id}`,
    style: { width: `${Math.round((filled / total) * 100)}%` } });
  const progress = el('div', { class: 'progress' }, [
    el('div', { class: 'progress-track' }, [fill]),
    el('span', { class: 'progress-text', id: `progress-text-${supplier.id}` }, `${filled} of ${total} filled`),
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

  // Show the "Suggested: X" hint only when history has produced an active
  // suggestion; otherwise leave the line empty (no "available in N weeks" noise).
  function updateHint() {
    const result = suggest(ing.id, entries[ing.id].stock || 0);
    if (result.active) {
      hint.textContent = `Suggested: ${result.suggestion}`;
      hint.className = 'ing-suggestion active';
    } else {
      hint.textContent = '';
      hint.className = 'ing-suggestion';
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
      el('label', { class: 'field order-field' }, [
        el('span', { class: 'field-label', text: 'Order' }),
        qtyInput,
      ]),
    ]),
    hint,
  ]);

  stockInput.value = entry.stock || '';
  qtyInput.value = entry.qty || '';
  updateHint(); // show suggestion without overwriting a restored quantity
  return row;
}
