// whatsapp.js — the order picker, order modal and its WhatsApp share.
//
// WhatsApp orders reuse the single address book — there are no separate WhatsApp
// clients any more. Tapping the header WhatsApp button opens a "Send order"
// picker listing every saved group (e.g. the market and its stalls) and every
// individual client. Picking one shows the order modal: a section per client,
// one row per product, with the quantities you type becoming a WhatsApp message
// grouped by client. All names come from the address book.
//
// The modal inputs are namespaced `wa-<productId>` so they never collide with the
// calculator's own quantity fields (same product id) living in the same document.

import { getConfig } from './calculator-config-store.js';
import { getClients, getGroups, resolveGroupClients } from './calculator-config.js';
import { el } from './calculator-render.js';

let selectedClients = []; // the client objects whose order we are sending
let selectedTitle = '';   // message heading: a group title or a single client name

// Entry point from the header WhatsApp button.
export function shareMarketOrder() {
  const config = getConfig();
  const clients = getClients(config);
  const groups = getGroups(config);
  if (clients.length === 0) {
    alert('No clients yet. Add one in Settings → Clients.');
    return;
  }
  // Shortcut: a single client and no groups → open it directly.
  if (clients.length === 1 && groups.length === 0) {
    sendTo([clients[0]], clients[0].name);
    return;
  }
  openSendPicker(config, clients, groups);
}

// Set the current selection and open the order modal (or warn on an empty group).
function sendTo(clientList, title) {
  if (!clientList.length) { alert('This group has no clients yet. Add some in Settings → WhatsApp.'); return; }
  selectedClients = clientList;
  selectedTitle = title || 'Order';
  openOrderModal();
}

// ── "Send order" picker: groups first, then individual clients ────────────────
function openSendPicker(config, clients, groups) {
  const box = document.querySelector('#list-select-box .loaf-modal-title');
  if (box) box.textContent = 'Send order';
  const body = document.getElementById('list-select-body');
  body.textContent = '';

  if (groups.length) {
    body.appendChild(el('div', { class: 'send-picker-label' }, 'Groups'));
    groups.forEach(group => {
      body.appendChild(pickerItem(group.title || 'Untitled group',
        () => sendTo(resolveGroupClients(config, group), group.title)));
    });
    body.appendChild(el('div', { class: 'send-picker-label' }, 'Clients'));
  }

  clients.forEach(client => {
    body.appendChild(pickerItem(client.name || 'Unnamed client',
      () => sendTo([client], client.name)));
  });

  document.getElementById('list-select-modal').classList.add('visible');
}

function pickerItem(label, onPick) {
  const btn = el('button', { class: 'drill-item', type: 'button' }, [
    el('span', {}, label),
    el('span', { class: 'drill-chevron' }, '→'),
  ]);
  btn.addEventListener('click', () => { closeListPicker(); onPick(); });
  return btn;
}

export function closeListPicker() {
  document.getElementById('list-select-modal').classList.remove('visible');
}

// ── Order modal for the chosen client(s) ──────────────────────────────────────
function openOrderModal() {
  renderOrderModal();
  document.getElementById('loaf-modal').classList.add('visible');
}

// Rebuild the modal body (one section per selected client, one row per product)
// from the address book. CSP-safe DOM building, no innerHTML.
function renderOrderModal() {
  document.getElementById('loaf-modal-title').textContent = selectedTitle || 'Order';
  const body = document.getElementById('loaf-order-body');
  body.textContent = '';
  for (const client of selectedClients) {
    const rows = (client.products || []).map(p => {
      const input = el('input', { type: 'number', id: 'wa-' + p.id, class: 'order-qty-input', value: '0', min: '0', inputmode: 'numeric' });
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

  const multi = selectedClients.length > 1;
  const sections = selectedClients
    .map(client => {
      const lines = (client.products || [])
        .map(p => {
          const input = document.getElementById('wa-' + p.id);
          return { name: p.name, val: input ? (+input.value || 0) : 0 };
        })
        .filter(p => p.val > 0)
        .map(p => `- ${p.name}: ${p.val}`);
      if (!lines.length) return null;
      // A single-client order does not repeat the client name (it is the heading).
      return (multi ? `*${client.name}*\n` : '') + lines.join('\n');
    })
    .filter(Boolean);

  if (!sections.length) { alert('No orders to share'); return; }

  const text = `📋 *${selectedTitle || 'Order'}*\n\n` + sections.join('\n\n');
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}
