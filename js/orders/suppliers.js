// suppliers.js — renders the supplier list.
//
// Each supplier is a collapsible card showing name, category, delivery days, a
// product counter ("2 of 5") and a coloured badge (green = all products filled,
// yellow = incomplete). Expanding a card reveals its ingredient list (built by
// ingredients.js) with a progress bar on top.

import { el } from './dom.js';
import { buildIngredientList } from './ingredients.js';

const DAY_SHORT = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu',
  Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
};

// Compute how many of a supplier's products have a quantity entered.
export function supplierStats(ingredients, entries) {
  const total = ingredients.length;
  const filled = ingredients.filter(i => (entries[i.id]?.qty || 0) > 0).length;
  return { total, filled, complete: total > 0 && filled === total };
}

// Refresh the counter, badge and progress bar for one supplier (no rebuild, so
// inputs keep focus while the user types).
export function refreshSupplierDerived(supplier, ingredients, entries) {
  const { total, filled, complete } = supplierStats(ingredients, entries);

  const counter = document.getElementById(`counter-${supplier.id}`);
  if (counter) counter.textContent = `${filled} of ${total}`;

  const badge = document.getElementById(`badge-${supplier.id}`);
  if (badge) badge.className = `supplier-badge ${complete ? 'green' : 'yellow'}`;

  const fill = document.getElementById(`progress-fill-${supplier.id}`);
  if (fill) fill.style.width = `${total ? Math.round((filled / total) * 100) : 0}%`;

  const text = document.getElementById(`progress-text-${supplier.id}`);
  if (text) text.textContent = `${filled} of ${total} filled`;
}

export function renderSuppliers(container, suppliers, ingredientsBySupplier, ctx) {
  container.textContent = '';
  suppliers.forEach(supplier => {
    const ingredients = ingredientsBySupplier[supplier.id] || [];
    container.appendChild(buildSupplierCard(supplier, ingredients, ctx));
  });
}

function buildSupplierCard(supplier, ingredients, ctx) {
  const expanded = ctx.expanded.has(supplier.id);
  const days = (supplier.deliveryDays || []).map(d => DAY_SHORT[d] || d).join(', ');

  const counter = el('span', { class: 'supplier-counter', id: `counter-${supplier.id}` }, '0 of 0');
  const badge = el('span', { class: 'supplier-badge yellow', id: `badge-${supplier.id}` });
  const chevron = el('span', { class: `supplier-chevron${expanded ? ' open' : ''}` }, '▸');

  const head = el('button', {
    type: 'button',
    class: 'supplier-head',
    'aria-expanded': String(expanded),
  }, [
    el('div', { class: 'supplier-head-main' }, [
      el('span', { class: 'supplier-name', text: supplier.name }),
      el('span', { class: 'supplier-meta', text: [supplier.category, days].filter(Boolean).join(' · ') }),
    ]),
    el('div', { class: 'supplier-head-right' }, [counter, badge, chevron]),
  ]);

  const bodyInner = buildIngredientList(supplier, ingredients, ctx.suggest, ctx.entries, ctx.hooks);
  const body = el('div', { class: 'supplier-body' }, [bodyInner]);
  if (!expanded) body.hidden = true;

  head.addEventListener('click', () => {
    const nowOpen = body.hidden;
    body.hidden = !nowOpen;
    head.setAttribute('aria-expanded', String(nowOpen));
    chevron.classList.toggle('open', nowOpen);
    if (nowOpen) ctx.expanded.add(supplier.id); else ctx.expanded.delete(supplier.id);
  });

  // Set initial counter/badge/progress from current state.
  refreshSupplierDerived(supplier, ingredients, ctx.entries);

  return el('div', { class: 'supplier-card', dataset: { supplier: supplier.id } }, [head, body]);
}
