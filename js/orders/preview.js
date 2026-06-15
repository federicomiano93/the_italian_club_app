// preview.js — order preview + send.
//
// Builds a full-screen overlay showing the order grouped by supplier with final
// quantities. Each supplier has a WhatsApp button (pre-formatted message) and an
// Email button (pre-filled subject + body). A footer lets the operator go back
// or mark the order as sent (which archives it to history and clears the draft).

import { el } from './dom.js';

// Build "Order — The Italian Club / Supplier: X / - item: qty unit" text.
function buildMessage(supplier, items) {
  const lines = ['Order — The Italian Club', `Supplier: ${supplier.name}`, ''];
  items.forEach(it => lines.push(`- ${it.name}: ${it.qty} ${it.unit}`));
  return lines.join('\n');
}

function supplierSection(supplier, items) {
  const message = buildMessage(supplier, items);
  const phone = (supplier.phone || '').replace(/\D/g, '');
  const subject = `Order — The Italian Club — ${supplier.name}`;

  const actions = [];
  if (phone) {
    actions.push(el('a', {
      class: 'send-btn wa',
      href: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      target: '_blank', rel: 'noopener',
    }, 'WhatsApp'));
  }
  if (supplier.email) {
    actions.push(el('a', {
      class: 'send-btn email',
      href: `mailto:${supplier.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`,
    }, 'Email'));
  }
  if (!actions.length) {
    actions.push(el('span', { class: 'send-missing', text: 'No phone or email set' }));
  }

  return el('div', { class: 'preview-supplier' }, [
    el('div', { class: 'preview-supplier-name', text: supplier.name }),
    el('div', { class: 'preview-items' },
      items.map(it => el('div', { class: 'preview-item' }, [
        el('span', { class: 'preview-item-name', text: it.name }),
        el('span', { class: 'preview-item-qty', text: `${it.qty} ${it.unit}` }),
      ]))),
    el('div', { class: 'preview-actions-row' }, actions),
  ]);
}

// suppliers: array; ingredientsBySupplier: { supplierId: [ingredient] };
// entries: { ingredientId: { qty, stock } }; callbacks: { onBack, onArchive }.
export function buildPreview(suppliers, ingredientsBySupplier, entries, callbacks) {
  const scroll = el('div', { class: 'preview-scroll' });

  let itemCount = 0;
  suppliers.forEach(supplier => {
    const items = (ingredientsBySupplier[supplier.id] || [])
      .filter(ing => (entries[ing.id]?.qty || 0) > 0)
      .map(ing => ({ name: ing.name, unit: ing.unit, qty: entries[ing.id].qty }));
    if (!items.length) return;
    itemCount += items.length;
    scroll.appendChild(supplierSection(supplier, items));
  });

  if (!itemCount) {
    scroll.appendChild(el('p', { class: 'preview-empty', text: 'No items in this order yet. Add quantities first.' }));
  }

  const backBtn = el('button', { type: 'button', class: 'orders-icon-btn', 'aria-label': 'Back', icon:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    onClick: () => callbacks.onBack() });

  const archiveBtn = el('button', { type: 'button', class: 'btn-primary', onClick: () => callbacks.onArchive() },
    'Mark as ordered');
  if (!itemCount) archiveBtn.disabled = true;

  return el('div', { class: 'preview-overlay' }, [
    el('header', { class: 'orders-header' }, [
      backBtn,
      el('div', { class: 'orders-header-title' }, [el('h1', { text: 'Order preview' })]),
      el('span', { style: { width: '36px', flexShrink: '0' } }),
    ]),
    scroll,
    el('div', { class: 'preview-footer' }, [
      el('button', { type: 'button', class: 'btn-secondary', onClick: () => callbacks.onBack() }, 'Back'),
      archiveBtn,
    ]),
  ]);
}
