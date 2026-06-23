// whatsapp.js — the order picker, order modal and its WhatsApp share.
//
// WhatsApp orders come from the INDEPENDENT lists (`whatsappLists`), built in
// Settings → WhatsApp and decoupled from the dough tabs. Tapping the header
// WhatsApp button opens a "Send order" picker listing every saved list. Picking
// one shows the order modal: a section per client entry, one row per chosen
// product, with the quantities you type becoming a WhatsApp message grouped by
// client. Client and product names are resolved live from the address book.
//
// A list may attach the SAME product id to two different client entries, so the
// modal inputs are namespaced by the client-entry index AND the product id
// (`wa-<entryIndex>-<productId>`). This avoids both colliding with each other and
// colliding with the calculator's own quantity fields living in the same document.

import { getConfig } from './calculator-config-store.js';
import { getWhatsappLists, getWhatsappClients, resolveListClients, resolveDirectClient } from './calculator-config.js';
import { el } from './calculator-render.js';

// The resolved client entries we are sending: [{ client, products }]. The order
// message heading is the chosen list's title.
let selectedEntries = [];
let selectedTitle = '';

// Build the per-row input id for a product under a given client entry.
function inputId(entryIndex, productId) {
  return 'wa-' + entryIndex + '-' + productId;
}

// Entry point from the header WhatsApp button.
export function shareMarketOrder() {
  const config = getConfig();
  const lists = getWhatsappLists(config);
  const directs = getWhatsappClients(config);
  if (lists.length + directs.length === 0) {
    alert('No WhatsApp lists or clients yet. Add one in Settings → WhatsApp.');
    return;
  }
  // Shortcut: a single saved item opens straight into its order modal.
  if (lists.length + directs.length === 1) {
    if (lists.length === 1) openList(config, lists[0]);
    else openDirect(config, directs[0]);
    return;
  }
  openSendPicker(config, lists, directs);
}

// Resolve a list against the address book and open its order modal, or warn if
// every client it referenced has since been deleted.
function openList(config, list) {
  const entries = resolveListClients(config, list);
  if (!entries.length) {
    alert('This list has no clients yet. Add some in Settings → WhatsApp.');
    return;
  }
  selectedEntries = entries;
  selectedTitle = list.title || 'Order';
  openOrderModal();
}

// Open the order modal for a single direct client: one section (its typed name) with
// its chosen products. The heading is the client name, so the section is not labelled.
function openDirect(config, dc) {
  const resolved = resolveDirectClient(config, dc);
  selectedEntries = [{ client: { name: resolved.name }, products: resolved.products }];
  selectedTitle = resolved.name || 'Order';
  openOrderModal();
}

// ── "Send order" picker: saved lists first, then direct clients ───────────────
function openSendPicker(config, lists, directs) {
  const box = document.querySelector('#list-select-box .loaf-modal-title');
  if (box) box.textContent = 'Send order';
  const body = document.getElementById('list-select-body');
  body.textContent = '';

  if (lists.length) {
    body.appendChild(el('div', { class: 'send-picker-label' }, 'Lists'));
    lists.forEach(list => {
      body.appendChild(pickerItem(list.title || 'Untitled list', () => openList(config, list)));
    });
  }
  if (directs.length) {
    body.appendChild(el('div', { class: 'send-picker-label' }, 'Clients'));
    directs.forEach(dc => {
      body.appendChild(pickerItem(dc.name || 'Unnamed client', () => openDirect(config, dc)));
    });
  }

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

// ── Order modal for the chosen list ───────────────────────────────────────────
function openOrderModal() {
  renderOrderModal();
  document.getElementById('loaf-modal').classList.add('visible');
}

// Rebuild the modal body (one section per client entry, one row per chosen
// product) from the resolved list. CSP-safe DOM building, no innerHTML.
function renderOrderModal() {
  document.getElementById('loaf-modal-title').textContent = selectedTitle || 'Order';
  const body = document.getElementById('loaf-order-body');
  body.textContent = '';
  selectedEntries.forEach((entry, ei) => {
    const rows = entry.products.map(p => {
      const input = el('input', { type: 'number', id: inputId(ei, p.id), class: 'order-qty-input', value: '0', min: '0', inputmode: 'numeric' });
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
      el('div', { class: 'order-section-title' }, entry.client.name),
      ...rows,
    ]));
  });
}

export function closeLoafModal() {
  document.getElementById('loaf-modal').classList.remove('visible');
}

export function sendWithLoaves() {
  closeLoafModal();

  const multi = selectedEntries.length > 1;
  const sections = selectedEntries
    .map((entry, ei) => {
      const lines = entry.products
        .map(p => {
          const input = document.getElementById(inputId(ei, p.id));
          return { name: p.name, val: input ? (+input.value || 0) : 0 };
        })
        .filter(p => p.val > 0)
        .map(p => `- ${p.name}: ${p.val}`);
      if (!lines.length) return null;
      // A single-client order does not repeat the client name (it is the heading).
      return (multi ? `*${entry.client.name}*\n` : '') + lines.join('\n');
    })
    .filter(Boolean);

  if (!sections.length) { alert('No orders to share'); return; }

  const text = `*${selectedTitle || 'Order'}*\n\n` + sections.join('\n\n');
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}
