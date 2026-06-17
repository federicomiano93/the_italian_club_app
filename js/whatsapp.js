// whatsapp.js — the "market order" modal and its WhatsApp share.
//
// Clients, products and the modal title come from the configuration
// (config.market), not from hard-coded names. The modal body is rendered from
// config each time it opens, then the entered quantities are turned into a
// WhatsApp message.

import { getConfig } from './calculator-config-store.js';
import { el } from './calculator-render.js';

function market() {
  return getConfig().market || { title: 'Market order', clients: [] };
}

// Rebuild the modal body (one section per client, one row per product) from the
// current config. CSP-safe DOM building, no innerHTML.
function renderMarketModal() {
  const m = market();
  document.getElementById('loaf-modal-title').textContent = m.title || 'Market order';
  const body = document.getElementById('loaf-order-body');
  body.textContent = '';
  for (const client of (m.clients || [])) {
    const rows = (client.products || []).map(p => {
      const input = el('input', { type: 'number', id: p.id, class: 'order-qty-input', value: '0', min: '0', inputmode: 'numeric' });
      // Same focus/blur convenience as the calculator fields: tapping a 0 clears
      // it, leaving it empty restores 0.
      input.addEventListener('focus', function() {
        if (this.value === '0' || this.value === '') this.value = '';
        else this.select();
      });
      input.addEventListener('blur', function() {
        if (this.value === '' || isNaN(parseFloat(this.value))) this.value = '0';
      });
      return el('div', { class: 'order-row' }, [el('span', { class: 'order-label' }, p.name), input]);
    });
    body.appendChild(el('div', { class: 'order-section' }, [
      el('div', { class: 'order-section-title' }, client.name),
      ...rows,
    ]));
  }
}

export function shareMarketOrder() {
  renderMarketModal();
  document.getElementById('loaf-modal').classList.add('visible');
}

export function closeLoafModal() {
  document.getElementById('loaf-modal').classList.remove('visible');
}

export function sendWithLoaves() {
  closeLoafModal();

  const m = market();
  const sections = (m.clients || [])
    .map(client => {
      const lines = (client.products || [])
        .map(p => {
          const input = document.getElementById(p.id);
          return { name: p.name, val: input ? (+input.value || 0) : 0 };
        })
        .filter(p => p.val > 0)
        .map(p => `- ${p.name}: ${p.val}`);
      return lines.length ? `*${client.name}*\n` + lines.join('\n') : null;
    })
    .filter(Boolean);

  if (!sections.length) { alert('No orders to share'); return; }

  const text = `📋 *${m.title || 'Market order'}*\n\n` + sections.join('\n\n');
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}
