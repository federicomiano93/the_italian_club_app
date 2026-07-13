// suppliers.js — renders the supplier list.
//
// Each supplier is a collapsible card showing name, category and delivery days.
// Expanding a card reveals its ingredient list (built by ingredients.js) with a
// progress bar on top ("2 of 5 filled"), and at the bottom the ONE action that
// belongs to that supplier: "Order placed".
//
// That button is per supplier on purpose. Suppliers are not ordered on the same
// days — Salvo on Mondays, Continental on Thursdays — so the old single button
// that archived everything and emptied the whole order wiped the quantities
// already typed for a supplier you order later in the week.
//
// The collapsed head stays quiet, with one exception: a small dot when that
// supplier has quantities waiting to be placed, so an unfinished order is visible
// without opening every card.

import { el } from './dom.js';
import { buildIngredientList } from './ingredients.js';

const DAY_SHORT = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu',
  Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
};

const CHECK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

// Compute how many of a supplier's products have a quantity entered.
export function supplierStats(ingredients, entries) {
  const total = ingredients.length;
  const filled = ingredients.filter(i => (entries[i.id]?.qty || 0) > 0).length;
  return { total, filled };
}

// Refresh everything derived from the entries for one supplier (no rebuild, so
// inputs keep focus while the user types): the progress bar, the "order waiting"
// dot on the head, and whether "Order placed" can be tapped. Guards on element
// presence — the bar and the button exist only while the card is expanded.
export function refreshSupplierDerived(supplier, ingredients, entries) {
  const { total, filled } = supplierStats(ingredients, entries);

  const fill = document.getElementById(`progress-fill-${supplier.id}`);
  if (fill) fill.style.width = `${total ? Math.round((filled / total) * 100) : 0}%`;

  const text = document.getElementById(`progress-text-${supplier.id}`);
  if (text) text.textContent = `${filled} of ${total} filled`;

  const dot = document.getElementById(`waiting-${supplier.id}`);
  if (dot) dot.hidden = filled === 0;

  const placeBtn = document.getElementById(`place-btn-${supplier.id}`);
  if (placeBtn) placeBtn.disabled = filled === 0;
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
  const { filled } = supplierStats(ingredients, ctx.entries);

  const chevron = el('span', { class: `supplier-chevron${expanded ? ' open' : ''}` }, '▸');
  const waiting = el('span', {
    class: 'supplier-waiting',
    id: `waiting-${supplier.id}`,
    title: 'Order not placed yet',
    'aria-label': 'Order not placed yet',
  });
  waiting.hidden = filled === 0;

  const head = el('button', {
    type: 'button',
    class: 'supplier-head',
    'aria-expanded': String(expanded),
  }, [
    el('div', { class: 'supplier-head-main' }, [
      el('span', { class: 'supplier-name', text: supplier.name }),
      el('span', { class: 'supplier-meta', text: [supplier.category, days].filter(Boolean).join(' · ') }),
    ]),
    el('div', { class: 'supplier-head-right' }, [waiting, chevron]),
  ]);

  const bodyInner = buildIngredientList(supplier, ingredients, ctx.suggest, ctx.entries, ctx.hooks);

  const children = [bodyInner];
  if (ingredients.length) {
    const placeBtn = el('button', {
      type: 'button',
      class: 'btn-primary supplier-place-btn',
      id: `place-btn-${supplier.id}`,
      onClick: () => ctx.hooks.onPlaced(supplier.id),
    }, [
      el('span', { class: 'supplier-place-icon', icon: CHECK_SVG, 'aria-hidden': 'true' }),
      'Order placed',
    ]);
    placeBtn.disabled = filled === 0;
    children.push(placeBtn);
  }

  const body = el('div', { class: 'supplier-body' }, children);
  if (!expanded) body.hidden = true;

  head.addEventListener('click', () => {
    const nowOpen = body.hidden;
    body.hidden = !nowOpen;
    head.setAttribute('aria-expanded', String(nowOpen));
    chevron.classList.toggle('open', nowOpen);
    if (nowOpen) ctx.expanded.add(supplier.id); else ctx.expanded.delete(supplier.id);
  });

  return el('div', { class: 'supplier-card', dataset: { supplier: supplier.id } }, [head, body]);
}
