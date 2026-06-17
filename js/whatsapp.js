// whatsapp.js — the order modal and its WhatsApp share.
//
// The WhatsApp section holds one or more order "lists" (config.market.lists),
// each with a title and clients. Tapping the header WhatsApp button picks a list
// (directly when there is only one), then shows that list's order modal; entered
// quantities become a WhatsApp message grouped by client. Names/titles all come
// from the configuration, nothing is hard-coded.

import { getConfig } from './calculator-config-store.js';
import { el } from './calculator-render.js';

let selectedListIndex = 0;

function lists() {
  const m = getConfig().market;
  return (m && Array.isArray(m.lists)) ? m.lists : [];
}

// The order list currently chosen for sending.
function market() {
  return lists()[selectedListIndex] || { title: 'Market order', clients: [] };
}

// Entry point from the header WhatsApp button: pick a list first when there is
// more than one, otherwise open that single list's order directly.
export function shareMarketOrder() {
  const all = lists();
  if (all.length === 0) { alert('No order lists yet. Add one in Settings → WhatsApp.'); return; }
  if (all.length === 1) { selectedListIndex = 0; openOrderModal(); return; }
  openListPicker();
}

// ── List picker (only when there is more than one list) ───────────────────────
function openListPicker() {
  const body = document.getElementById('list-select-body');
  body.textContent = '';
  lists().forEach((list, li) => {
    const btn = el('button', { class: 'drill-item', type: 'button' }, [
      el('span', {}, list.title || 'Untitled list'),
      el('span', { class: 'drill-chevron' }, '→'),
    ]);
    btn.addEventListener('click', () => { selectedListIndex = li; closeListPicker(); openOrderModal(); });
    body.appendChild(btn);
  });
  document.getElementById('list-select-modal').classList.add('visible');
}

export function closeListPicker() {
  document.getElementById('list-select-modal').classList.remove('visible');
}

// ── Order modal for the chosen list ───────────────────────────────────────────
function openOrderModal() {
  renderMarketModal();
  document.getElementById('loaf-modal').classList.add('visible');
}

// Rebuild the modal body (one section per client, one row per product) from the
// chosen list. CSP-safe DOM building, no innerHTML.
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
