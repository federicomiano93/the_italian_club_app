// preview.js — the "Send order on WhatsApp" selection screen.
//
// Opened by the header WhatsApp button. Shows a checkbox per supplier that has
// items in the current order (all ticked by default) plus a "Select all" master
// checkbox, then builds ONE combined message grouped by supplier and opens
// WhatsApp with NO recipient — so the operator picks the chat himself (mirrors the
// Calculator's WhatsApp share, js/whatsapp.js). Sending does NOT archive the order;
// archiving is the separate "Orders placed" button on the Order screen.

import { el } from './dom.js';

const BACK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';

// Build the WhatsApp message: one section per selected supplier, bold name, then
// "- item: qty unit" lines. Grouped and ready to paste into any chat.
function buildCombinedMessage(selected) {
  const sections = selected.map(({ supplier, items }) => {
    const lines = items.map(it => `- ${it.name}: ${it.qty} ${it.unit}`.trim());
    return `*${supplier.name}*\n` + lines.join('\n');
  });
  return '*Order — The Italian Club*\n\n' + sections.join('\n\n');
}

// suppliers: array; ingredientsBySupplier: { supplierId: [ingredient] };
// entries: { ingredientId: { qty, stock } }; callbacks: { onBack }.
export function buildSendScreen(suppliers, ingredientsBySupplier, entries, callbacks) {
  // Only suppliers with at least one ordered item can be sent.
  const withItems = suppliers.map(supplier => {
    const items = (ingredientsBySupplier[supplier.id] || [])
      .filter(ing => (entries[ing.id]?.qty || 0) > 0)
      .map(ing => ({ name: ing.name, unit: ing.unit || '', qty: entries[ing.id].qty }));
    return { supplier, items };
  }).filter(s => s.items.length);

  const scroll = el('div', { class: 'preview-scroll' });
  const sendBtn = el('button', { type: 'button', class: 'btn-primary' }, 'Send on WhatsApp');
  const checks = [];             // { supplier, items, input }
  let selectAllInput = null;

  function syncSendState() {
    sendBtn.disabled = !checks.some(c => c.input.checked);
    if (selectAllInput) selectAllInput.checked = checks.length > 0 && checks.every(c => c.input.checked);
  }

  if (!withItems.length) {
    scroll.appendChild(el('p', { class: 'preview-empty', text: 'No items in this order yet. Add quantities first.' }));
    sendBtn.disabled = true;
  } else {
    selectAllInput = el('input', { type: 'checkbox' });
    selectAllInput.checked = true;
    selectAllInput.addEventListener('change', () => {
      checks.forEach(c => { c.input.checked = selectAllInput.checked; });
      syncSendState();
    });
    scroll.appendChild(el('label', { class: 'send-select-all' }, [
      selectAllInput, el('span', { text: 'Select all suppliers' }),
    ]));

    withItems.forEach(({ supplier, items }) => {
      const input = el('input', { type: 'checkbox' });
      input.checked = true;
      input.addEventListener('change', syncSendState);
      checks.push({ supplier, items, input });
      const count = items.length === 1 ? '1 item' : `${items.length} items`;
      scroll.appendChild(el('label', { class: 'send-supplier-row' }, [
        input,
        el('div', { class: 'send-supplier-main' }, [
          el('span', { class: 'send-supplier-name', text: supplier.name }),
          el('span', { class: 'send-supplier-count', text: count }),
        ]),
      ]));
    });
  }

  sendBtn.addEventListener('click', () => {
    const selected = checks.filter(c => c.input.checked).map(c => ({ supplier: c.supplier, items: c.items }));
    if (!selected.length) return;
    const text = buildCombinedMessage(selected);
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  });

  const backBtn = el('button', { type: 'button', class: 'orders-icon-btn', 'aria-label': 'Back', icon: BACK_ICON,
    onClick: () => callbacks.onBack() });

  return el('div', { class: 'preview-overlay' }, [
    el('header', { class: 'orders-header' }, [
      backBtn,
      el('div', { class: 'orders-header-title' }, [el('h1', { text: 'Send order' })]),
      el('span', { style: { width: '36px', flexShrink: '0' } }),
    ]),
    scroll,
    el('div', { class: 'preview-footer' }, [sendBtn]),
  ]);
}
