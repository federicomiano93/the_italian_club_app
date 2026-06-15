// management.js — management panel (settings icon).
//
// isAdmin is hardcoded true for now (placeholder — real role checks arrive with
// real auth; note the panel being open is UX only, the Firestore rules still
// validate every write). Lets an admin add/edit/deactivate suppliers (with
// delivery days, contact details and notification timing) and ingredients (with
// supplier, category and unit). "Deactivate" sets active:false because the rules
// deny deletes; reactivating sets it back to true.
//
// data: { suppliers(): [], ingredients(): [] } — live getters from orders-main.
// actions: { onClose, saveSupplier(id,payload), saveIngredient(id,payload),
//            setSupplierActive(id,bool), setIngredientActive(id,bool) }

import { el } from './dom.js';

export const isAdmin = true; // placeholder until real auth/roles exist

// Small on-brand confirmation dialog. Resolves true (confirm) / false (cancel).
function confirmDialog(message, confirmLabel = 'Confirm', danger = true) {
  return new Promise(resolve => {
    const close = value => { wrap.remove(); resolve(value); };
    const wrap = el('div', { class: 'confirm-overlay', onClick: e => { if (e.target === wrap) close(false); } }, [
      el('div', { class: 'confirm-box' }, [
        el('p', { class: 'confirm-msg', text: message }),
        el('div', { class: 'confirm-actions' }, [
          el('button', { type: 'button', class: 'btn-secondary', onClick: () => close(false) }, 'Cancel'),
          el('button', { type: 'button', class: danger ? 'btn-danger' : 'btn-primary', onClick: () => close(true) }, confirmLabel),
        ]),
      ]),
    ]);
    document.body.appendChild(wrap);
  });
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CLOSE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';

export function buildManagement(data, actions) {
  let tab = 'suppliers';
  let view = { type: 'list' };

  const content = el('div', { class: 'mgmt-scroll' });
  const tabBar = el('nav', { class: 'tab-bar' }, [
    tabButton('Suppliers', 'suppliers'),
    tabButton('Ingredients', 'ingredients'),
  ]);

  const overlay = el('div', { class: 'mgmt-overlay' }, [
    el('header', { class: 'orders-header' }, [
      el('button', { type: 'button', class: 'orders-icon-btn', 'aria-label': 'Close', icon: CLOSE_ICON, onClick: () => actions.onClose() }),
      el('div', { class: 'orders-header-title' }, [el('h1', { text: 'Management' })]),
      el('span', { style: { width: '36px', flexShrink: '0' } }),
    ]),
    tabBar,
    content,
  ]);

  function tabButton(label, key) {
    return el('button', { type: 'button', class: 'tab', dataset: { tab: key },
      onClick: () => { tab = key; view = { type: 'list' }; render(); } }, label);
  }

  function render() {
    tabBar.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    content.textContent = '';
    if (view.type === 'supplierForm') content.appendChild(supplierForm(view.item));
    else if (view.type === 'ingredientForm') content.appendChild(ingredientForm(view.item));
    else if (tab === 'suppliers') renderSupplierList();
    else renderIngredientList();
  }

  // ── Lists ─────────────────────────────────────────────────────────────────
  function renderSupplierList() {
    content.appendChild(el('button', { type: 'button', class: 'mgmt-add',
      onClick: () => { view = { type: 'supplierForm', item: null }; render(); } }, '+ Add supplier'));

    const list = el('div', { class: 'mgmt-list' });
    data.suppliers().slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(s => {
      const meta = [s.category, (s.deliveryDays || []).join(', ')].filter(Boolean).join(' · ');
      list.appendChild(mgmtRow(s.name, meta, s.active !== false,
        () => { view = { type: 'supplierForm', item: s }; render(); },
        () => actions.setSupplierActive(s.id, s.active === false)));
    });
    content.appendChild(list);

    if (actions.reloadSample) {
      content.appendChild(el('button', { type: 'button', class: 'mgmt-reload', onClick: async () => {
        const ok = await confirmDialog('Reload sample data? This re-writes the sample suppliers, ingredients and 5 weeks of history (for testing).', 'Reload', false);
        if (ok) actions.reloadSample();
      } }, '↻ Reload sample data (test)'));
    }
  }

  function renderIngredientList() {
    content.appendChild(el('button', { type: 'button', class: 'mgmt-add',
      onClick: () => { view = { type: 'ingredientForm', item: null }; render(); } }, '+ Add ingredient'));

    const supById = {};
    data.suppliers().forEach(s => { supById[s.id] = s.name; });

    const list = el('div', { class: 'mgmt-list' });
    data.ingredients().slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(i => {
      const meta = [supById[i.supplierId] || 'No supplier', i.category, i.unit].filter(Boolean).join(' · ');
      list.appendChild(mgmtRow(i.name, meta, i.active !== false,
        () => { view = { type: 'ingredientForm', item: i }; render(); },
        () => actions.setIngredientActive(i.id, i.active === false)));
    });
    content.appendChild(list);
  }

  function mgmtRow(name, meta, active, onEdit, onToggle) {
    return el('div', { class: 'mgmt-item' + (active ? '' : ' inactive') }, [
      el('div', { class: 'mgmt-item-main' }, [
        el('span', { class: 'mgmt-item-name', text: name }),
        el('span', { class: 'mgmt-item-meta', text: meta }),
      ]),
      el('div', { class: 'mgmt-item-actions' }, [
        el('button', { type: 'button', class: 'mgmt-link', onClick: onEdit }, 'Edit'),
        el('button', { type: 'button', class: 'mgmt-link', onClick: async () => {
          // Confirm before deactivating (guards against accidental taps);
          // reactivating is harmless and needs no confirmation.
          if (active) {
            const ok = await confirmDialog(`Deactivate "${name}"? It will be hidden from the order screen. You can reactivate it later.`, 'Deactivate', true);
            if (!ok) return;
          }
          onToggle();
        } }, active ? 'Deactivate' : 'Activate'),
      ]),
    ]);
  }

  // ── Forms ───────────────────────────────────────────────────────────────────
  function field(labelText, input) {
    return el('label', { class: 'mgmt-field' }, [el('span', { class: 'mgmt-field-label', text: labelText }), input]);
  }

  function supplierForm(item) {
    const name = el('input', { type: 'text', class: 'mgmt-input', value: item?.name || '' });
    const category = el('input', { type: 'text', class: 'mgmt-input', value: item?.category || '' });
    const phone = el('input', { type: 'tel', class: 'mgmt-input', value: item?.phone || '', placeholder: 'e.g. 447700900123' });
    const email = el('input', { type: 'email', class: 'mgmt-input', value: item?.email || '' });
    const notify = el('input', { type: 'number', class: 'mgmt-input', min: '0', value: item?.notifyHoursBefore ?? '' });

    const dayChecks = WEEKDAYS.map(day => {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = (item?.deliveryDays || []).includes(day);
      cb.dataset.day = day;
      return el('label', { class: 'day-check' }, [cb, el('span', { text: day.slice(0, 3) })]);
    });

    const save = el('button', { type: 'button', class: 'btn-primary', onClick: async () => {
      if (!name.value.trim()) { name.focus(); return; }
      save.disabled = true;
      const payload = {
        name: name.value.trim(),
        category: category.value.trim(),
        phone: phone.value.trim(),
        email: email.value.trim(),
        deliveryDays: dayChecks.map(l => l.querySelector('input')).filter(c => c.checked).map(c => c.dataset.day),
        notifyHoursBefore: notify.value === '' ? null : Math.max(0, Number(notify.value) || 0),
        active: item ? item.active !== false : true,
      };
      try { await actions.saveSupplier(item?.id || null, payload); view = { type: 'list' }; render(); }
      catch (err) { console.error('Save supplier failed:', err); save.disabled = false; }
    } }, 'Save');

    return el('div', { class: 'mgmt-form' }, [
      el('h2', { class: 'mgmt-form-title', text: item ? 'Edit supplier' : 'New supplier' }),
      field('Name', name),
      field('Category', category),
      el('div', { class: 'mgmt-field' }, [
        el('span', { class: 'mgmt-field-label', text: 'Delivery days' }),
        el('div', { class: 'day-checks' }, dayChecks),
      ]),
      field('Phone (WhatsApp, digits only)', phone),
      field('Email', email),
      field('Notify (hours before delivery)', notify),
      formActions(save),
    ]);
  }

  function ingredientForm(item) {
    const name = el('input', { type: 'text', class: 'mgmt-input', value: item?.name || '' });
    const category = el('input', { type: 'text', class: 'mgmt-input', value: item?.category || '' });
    const unit = el('input', { type: 'text', class: 'mgmt-input', value: item?.unit || '', placeholder: 'e.g. kg, L, trays' });

    const supplierSelect = el('select', { class: 'mgmt-input' });
    data.suppliers().slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(s => {
      const opt = el('option', { value: s.id, text: s.name });
      if (item?.supplierId === s.id) opt.selected = true;
      supplierSelect.appendChild(opt);
    });

    const save = el('button', { type: 'button', class: 'btn-primary', onClick: async () => {
      if (!name.value.trim() || !supplierSelect.value) { name.focus(); return; }
      save.disabled = true;
      const payload = {
        name: name.value.trim(),
        supplierId: supplierSelect.value,
        category: category.value.trim() || 'Other',
        unit: unit.value.trim(),
        active: item ? item.active !== false : true,
      };
      try { await actions.saveIngredient(item?.id || null, payload); view = { type: 'list' }; render(); }
      catch (err) { console.error('Save ingredient failed:', err); save.disabled = false; }
    } }, 'Save');

    return el('div', { class: 'mgmt-form' }, [
      el('h2', { class: 'mgmt-form-title', text: item ? 'Edit ingredient' : 'New ingredient' }),
      field('Name', name),
      field('Supplier', supplierSelect),
      field('Category', category),
      field('Unit', unit),
      formActions(save),
    ]);
  }

  function formActions(saveBtn) {
    return el('div', { class: 'mgmt-form-actions' }, [
      el('button', { type: 'button', class: 'btn-secondary', onClick: () => { view = { type: 'list' }; render(); } }, 'Cancel'),
      saveBtn,
    ]);
  }

  render();

  // Only re-render from outside (live data change) when not in the middle of a form.
  return { overlay, refresh: () => { if (view.type === 'list') render(); } };
}
