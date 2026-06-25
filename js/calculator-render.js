// calculator-render.js — builds the client/product input cards for a dough tab
// from the configuration. The markup is intentionally identical to the cards
// that used to be hard-coded in calculator.html, so the look and the way the
// user enters quantities do not change. Only the *content* (which clients,
// products and weights) now comes from config instead of being fixed.
//
// A dough tab is a FILTERED VIEW of the single address book: it shows only the
// products whose `dough` matches, grouped back into a card per owning client. A
// client with no product in this dough simply does not appear here.
//
// CSP-safe: elements are created via the DOM API (no innerHTML, no inline style
// attributes), matching the page's strict Content-Security-Policy.

import { getTabProducts } from './calculator-config.js';

// Small element helper. attrs: { class, id, ... } set as attributes; children
// can be strings or nodes. 'style' is never accepted (CSP forbids style attrs).
export function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else node.setAttribute(k, v);
    }
  }
  for (const child of [].concat(children || [])) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

const DROPDOWN_OPTIONS = [0, 20, 40, 60, 80, 100];

// The quantity widget for a product row. A 'dropdown' product picks its quantity
// from a fixed preset list; every other product is a plain number field. Kg products
// take decimals (kilograms). The element id is the row's `qtyId` — the per (client,
// product) quantity key — so the same product ordered by two clients gets its own box.
function quantityControl(product) {
  if (product.kind === 'dropdown') {
    const select = el('select', { id: product.qtyId, class: 'qty-select' });
    for (const v of DROPDOWN_OPTIONS) {
      select.appendChild(el('option', { value: String(v) }, String(v)));
    }
    return select;
  }
  const attrs = { type: 'number', id: product.qtyId, value: '0', min: '0' };
  if (product.kind === 'kg') {
    attrs.step = '0.5';
    attrs.inputmode = 'decimal';
  } else {
    attrs.inputmode = 'numeric';
  }
  return el('input', attrs);
}

// One product row: label (name + weight) on the left, quantity + unit on the
// right. Kg rows show no parenthesised weight, exactly like today.
function productRow(product) {
  const unit = product.kind === 'kg' ? 'kg' : 'pz';
  const label = product.kind === 'kg'
    ? el('span', { class: 'product-label' }, product.name)
    : el('span', { class: 'product-label' }, [
        product.name + ' ',
        el('span', { class: 'product-weight' }, `(${product.weight}g)`),
      ]);
  return el('div', { class: 'product-row' }, [
    label,
    el('div', { class: 'qty-group' }, [quantityControl(product), el('span', { class: 'unit' }, unit)]),
  ]);
}

// Render all client cards for a tab into `container`, replacing its contents.
// The tab's products (already filtered to this dough and tagged with their owning
// client) are grouped back into one card per client, preserving address-book order.
export function renderTab(config, tab, container) {
  if (!container) return;
  container.textContent = '';
  const products = getTabProducts(config, tab);
  let currentCard = null;
  let currentClientId = null;
  for (const product of products) {
    if (product.clientId !== currentClientId || currentCard === null) {
      currentClientId = product.clientId;
      currentCard = el('div', { class: 'card' }, [
        el('div', { class: 'card-title' }, product.clientName),
      ]);
      container.appendChild(currentCard);
    }
    currentCard.appendChild(productRow(product));
  }
}
