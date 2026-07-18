// history.js — past orders view.
//
// One section per DAY (most recent first), and inside it one card per supplier —
// because that is what an order now is. Before, a whole week of every supplier's
// items was crushed into a single card, so the screen could never answer the only
// two questions it is asked: what did I order, and when.
//
// Records written by the old weekly model are still shown, as a "Week of …" card
// that groups its items by supplier the way the old view did. Nothing was
// migrated, so they stay exactly as they were written.
//
// Ingredient names and units are resolved at RENDER time from the current
// ingredient list; one deleted since then falls back to its id rather than
// disappearing from its own order.

import { el, groupBy } from './dom.js';
import { dayLabel } from './day.js';
import { groupHistoryByDay, isLegacyRecord } from './archive.js';

const PENCIL_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

function indexById(items) {
  return (items || []).reduce((acc, it) => { acc[it.id] = it; return acc; }, {});
}

// callbacks: { onEdit(record) }
export function renderHistory(container, history, suppliers, ingredients, callbacks = {}) {
  if (!container) return;
  container.textContent = '';

  const days = groupHistoryByDay(history);

  if (!days.length) {
    container.appendChild(el('p', { class: 'history-empty', text: 'No past orders yet.' }));
    return;
  }

  const supById = indexById(suppliers);
  const ingById = indexById(ingredients);

  days.forEach(({ date, records }) => {
    container.appendChild(el('div', { class: 'history-day-label', text: dayLabel(date) }));
    records.forEach(record => container.appendChild(
      isLegacyRecord(record)
        ? buildLegacyCard(record, supById, ingById, callbacks)
        : buildOrderCard(record, ingById, callbacks),
    ));
  });
}

// The rows of one record: "name weight … qty unit", by name.
function itemRows(quantities, ingById) {
  return Object.keys(quantities || {})
    .map(id => ({
      name: [ingById[id]?.name || id, ingById[id]?.weight].filter(Boolean).join(' '),
      unit: ingById[id]?.unit || '',
      qty: quantities[id],
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(r => el('div', { class: 'history-item' }, [
      el('span', { class: 'history-item-name', text: r.name }),
      el('span', { class: 'history-item-qty', text: `${r.qty} ${r.unit}`.trim() }),
    ]));
}

// One order: one supplier, one day.
function buildOrderCard(record, ingById, callbacks) {
  const count = Object.keys(record.quantities || {}).length;
  const rows = itemRows(record.quantities, ingById);

  const body = el('div', { class: 'history-body' }, [
    ...(rows.length ? rows : [el('p', { class: 'history-empty', text: 'No items recorded.' })]),
    el('button', {
      type: 'button',
      class: 'history-edit-btn',
      onClick: () => callbacks.onEdit?.(record),
    }, [
      el('span', { class: 'history-edit-icon', icon: PENCIL_SVG, 'aria-hidden': 'true' }),
      'Edit order',
    ]),
  ]);
  body.hidden = true;

  return el('div', { class: 'supplier-card' }, [
    collapsibleHead(record.supplierName || 'Unknown supplier', itemsLabel(count), body),
    body,
  ]);
}

// A record from the old weekly model: a whole week, every supplier in one
// document. Shown the way the old view showed it — grouped by supplier — so
// nothing that was recorded is lost or reinterpreted.
function buildLegacyCard(record, supById, ingById, callbacks) {
  const quantities = record.quantities || {};
  const bySupplier = groupBy(
    Object.keys(quantities).map(id => ({
      supplierId: ingById[id]?.supplierId || 'unknown',
      name: [ingById[id]?.name || id, ingById[id]?.weight].filter(Boolean).join(' '),
      unit: ingById[id]?.unit || '',
      qty: quantities[id],
    })),
    'supplierId',
  );

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
  body.appendChild(el('button', {
    type: 'button',
    class: 'history-edit-btn',
    onClick: () => callbacks.onEdit?.(record),
  }, [
    el('span', { class: 'history-edit-icon', icon: PENCIL_SVG, 'aria-hidden': 'true' }),
    'Edit order',
  ]));
  body.hidden = true;

  const count = Object.keys(quantities).length;
  return el('div', { class: 'supplier-card' }, [
    collapsibleHead('Whole week — all suppliers', itemsLabel(count), body),
    body,
  ]);
}

function itemsLabel(count) {
  return `${count} item${count === 1 ? '' : 's'}`;
}

function collapsibleHead(title, meta, body) {
  const chevron = el('span', { class: 'supplier-chevron' }, '▸');
  const head = el('button', { type: 'button', class: 'supplier-head', 'aria-expanded': 'false' }, [
    el('div', { class: 'supplier-head-main' }, [
      el('span', { class: 'supplier-name', text: title }),
      el('span', { class: 'supplier-meta', text: meta }),
    ]),
    el('div', { class: 'supplier-head-right' }, [chevron]),
  ]);
  head.addEventListener('click', () => {
    const open = body.hidden;
    body.hidden = !open;
    head.setAttribute('aria-expanded', String(open));
    chevron.classList.toggle('open', open);
  });
  return head;
}
