// history.js — past orders view.
//
// Renders previous weeks from orders-history, most recent first. Each week is a
// collapsible card; expanding it shows the ordered quantities grouped by supplier.
// Ingredient names/units and supplier grouping come from the current suppliers and
// ingredients (an ingredient removed since then falls back to its id).

import { el, groupBy } from './dom.js';

function indexById(items) {
  return items.reduce((acc, it) => { acc[it.id] = it; return acc; }, {});
}

export function renderHistory(container, history, suppliers, ingredients) {
  if (!container) return;
  container.textContent = '';

  const weeks = history.slice().sort((a, b) =>
    String(b.weekStart || b.id || '').localeCompare(String(a.weekStart || a.id || '')));

  if (!weeks.length) {
    container.appendChild(el('p', { class: 'history-empty', text: 'No past orders yet.' }));
    return;
  }

  const supById = indexById(suppliers);
  const ingById = indexById(ingredients);

  weeks.forEach(week => container.appendChild(buildWeekCard(week, supById, ingById)));
}

function buildWeekCard(week, supById, ingById) {
  const quantities = week.quantities || {};
  const ingredientIds = Object.keys(quantities);
  const label = week.weekStart ? `Week of ${week.weekStart}` : (week.id || 'Order');

  // Group the ordered ingredient ids by their supplier.
  const rows = ingredientIds.map(id => {
    const ing = ingById[id];
    return {
      supplierId: ing?.supplierId || 'unknown',
      name: ing?.name || id,
      unit: ing?.unit || '',
      qty: quantities[id],
    };
  });
  const bySupplier = groupBy(rows, 'supplierId');

  const body = el('div', { class: 'history-body' });
  Object.keys(bySupplier).forEach(supplierId => {
    body.appendChild(el('div', { class: 'history-supplier', text: supById[supplierId]?.name || 'Unknown supplier' }));
    bySupplier[supplierId]
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(r => body.appendChild(el('div', { class: 'history-item' }, [
        el('span', { class: 'history-item-name', text: r.name }),
        el('span', { class: 'history-item-qty', text: `${r.qty} ${r.unit}`.trim() }),
      ])));
  });
  if (!body.childElementCount) {
    body.appendChild(el('p', { class: 'history-empty', text: 'No items recorded.' }));
  }
  body.hidden = true;

  const chevron = el('span', { class: 'supplier-chevron' }, '▸');
  const head = el('button', { type: 'button', class: 'supplier-head', 'aria-expanded': 'false' }, [
    el('div', { class: 'supplier-head-main' }, [
      el('span', { class: 'supplier-name', text: label }),
      el('span', { class: 'supplier-meta', text: `${ingredientIds.length} product${ingredientIds.length === 1 ? '' : 's'}` }),
    ]),
    el('div', { class: 'supplier-head-right' }, [chevron]),
  ]);
  head.addEventListener('click', () => {
    const open = body.hidden;
    body.hidden = !open;
    head.setAttribute('aria-expanded', String(open));
    chevron.classList.toggle('open', open);
  });

  return el('div', { class: 'supplier-card' }, [head, body]);
}
