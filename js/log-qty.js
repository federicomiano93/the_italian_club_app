// log-qty.js — the editable quantity row for a single product, shared by the log
// EDIT screen (log-edit.js) and the manual-ADD screen (log-add.js) so the two never
// drift apart. Pure DOM (el-based, CSP-safe). It renders the product's name + weight
// and a number/dropdown input; the caller owns the data — onChange(newQty) fires on
// every change and the caller updates its own model.

import { el } from './calculator-render.js';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export function qtyRow(it, onChange) {
  const input = it.kind === 'dropdown' ? selectQty(it, onChange) : numQty(it, onChange);
  const unit = it.kind === 'kg' ? 'kg' : 'pz';
  const label = it.kind === 'kg'
    ? el('span', { class: 'product-label' }, it.name)
    : el('span', { class: 'product-label' }, [it.name + ' ', el('span', { class: 'product-weight' }, '(' + it.weightG + 'g)')]);
  return el('div', { class: 'product-row' }, [label, el('div', { class: 'qty-group' }, [input, el('span', { class: 'unit' }, unit)])]);
}

function numQty(it, onChange) {
  const inp = el('input', { type: 'number', min: '0', value: String(num(it.qty)), inputmode: it.kind === 'kg' ? 'decimal' : 'numeric' });
  if (it.kind === 'kg') inp.setAttribute('step', '0.5');
  inp.addEventListener('input', () => onChange(num(inp.value)));
  inp.addEventListener('focus', function () { if (this.value === '0' || this.value === '') this.value = ''; else this.select(); });
  inp.addEventListener('blur', function () { if (this.value === '' || isNaN(parseFloat(this.value))) { this.value = '0'; onChange(0); } });
  return inp;
}

function selectQty(it, onChange) {
  const sel = el('select', { class: 'qty-select' });
  for (const v of [0, 20, 40, 60, 80, 100]) sel.appendChild(el('option', { value: String(v) }, String(v)));
  sel.value = String(num(it.qty));
  sel.addEventListener('change', () => onChange(num(sel.value)));
  return sel;
}
