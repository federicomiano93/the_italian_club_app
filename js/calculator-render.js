// calculator-render.js — builds the client/product input cards for a dough tab
// from the configuration. The markup is intentionally identical to the cards
// that used to be hard-coded in calculator.html, so the look and the way the
// user enters quantities do not change. Only the *content* (which clients,
// products and weights) now comes from config instead of being fixed.
//
// CSP-safe: elements are created via the DOM API (no innerHTML, no inline style
// attributes), matching the page's strict Content-Security-Policy.

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

const CIABATTA_OPTIONS = [0, 20, 40, 60, 80, 100];

// The quantity widget for a product. Ciabatta keeps its fixed dropdown; every
// other product is a plain number field. Kg products take decimals (kilograms).
function quantityControl(product) {
  if (product.kind === 'ciabatta') {
    const select = el('select', { id: product.id, class: 'qty-select' });
    for (const v of CIABATTA_OPTIONS) {
      select.appendChild(el('option', { value: String(v) }, String(v)));
    }
    return select;
  }
  const attrs = { type: 'number', id: product.id, value: '0', min: '0' };
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
export function renderTab(config, tab, container) {
  if (!container) return;
  container.textContent = '';
  const clients = (config[tab] && config[tab].clients) || [];
  for (const client of clients) {
    const card = el('div', { class: 'card' }, [
      el('div', { class: 'card-title' }, client.name),
      ...(client.products || []).map(productRow),
    ]);
    container.appendChild(card);
  }
}
