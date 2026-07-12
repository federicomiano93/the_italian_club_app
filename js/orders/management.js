// management.js — management panel (settings icon).
//
// isAdmin is hardcoded true for now (placeholder — real role checks arrive with
// real auth; note the panel being open is UX only, the Firestore rules still
// validate every write). Lets an admin add/edit/deactivate/delete suppliers (with
// delivery days, order days and contact details) and ingredients (with supplier,
// category and unit). "Deactivate" sets active:false (reversible, hides from the
// order screen); "Delete" removes the document permanently (irreversible, gated
// by a strong confirm and by the Firestore rules).
//
// data: { suppliers(): [], ingredients(): [] } — live getters from orders-main.
// actions: { onClose, saveSupplier(id,payload), saveIngredient(id,payload),
//            setSupplierActive(id,bool), setIngredientActive(id,bool),
//            deleteSupplier(id), deleteIngredient(id) }

import { el } from './dom.js';
import { renderNotificationSettings } from './notifications.js';
import { confirmDialog } from './confirm-dialog.js';

export const isAdmin = true; // placeholder until real auth/roles exist

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const BACK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';

export function buildManagement(data, actions) {
  let tab = 'suppliers';
  let view = { type: 'list' };

  const content = el('div', { class: 'mgmt-scroll' });
  const tabBar = el('nav', { class: 'tab-bar' }, [
    tabButton('Suppliers', 'suppliers'),
    tabButton('Ingredients', 'ingredients'),
    tabButton('Alerts', 'notifications'),
  ]);

  // The header button is a context-aware Back arrow (matches the app's drill-in
  // pattern): inside a form it returns to the list; on a list it closes the panel.
  const overlay = el('div', { class: 'mgmt-overlay' }, [
    el('header', { class: 'orders-header' }, [
      el('button', { type: 'button', class: 'orders-icon-btn', 'aria-label': 'Back', icon: BACK_ICON, onClick: handleBack }),
      el('div', { class: 'orders-header-title' }, [el('h1', { text: 'Management' })]),
      el('span', { style: { width: '36px', flexShrink: '0' } }),
    ]),
    tabBar,
    content,
  ]);

  function handleBack() {
    if (view.type === 'supplierForm' || view.type === 'ingredientForm') {
      view = { type: 'list' };
      render();
    } else {
      actions.onClose();
    }
  }

  function tabButton(label, key) {
    return el('button', { type: 'button', class: 'tab', dataset: { tab: key },
      onClick: () => { tab = key; view = { type: 'list' }; render(); } }, label);
  }

  function render() {
    tabBar.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    content.textContent = '';
    if (view.type === 'supplierForm') content.appendChild(supplierForm(view.item));
    else if (view.type === 'ingredientForm') content.appendChild(ingredientForm(view.item));
    else if (tab === 'notifications') renderNotifications();
    else if (tab === 'suppliers') renderSupplierList();
    else renderIngredientList();
  }

  function renderNotifications() {
    const box = el('div', { class: 'mgmt-notif' });
    content.appendChild(box);
    renderNotificationSettings(box);
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
        () => actions.setSupplierActive(s.id, s.active === false),
        () => actions.deleteSupplier(s.id)));
    });
    content.appendChild(list);
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
        () => actions.setIngredientActive(i.id, i.active === false),
        () => actions.deleteIngredient(i.id)));
    });
    content.appendChild(list);
  }

  // A row with three actions: Edit, Deactivate/Activate (reversible), Delete
  // (permanent). Deactivate confirms only when hiding; Delete always confirms with
  // a strong, irreversible warning and is styled low-key in danger red (P20).
  function mgmtRow(name, meta, active, onEdit, onToggle, onDelete) {
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
            const ok = await confirmDialog({
              message: `Deactivate "${name}"? It will be hidden from the order screen. You can reactivate it later.`,
              okLabel: 'Deactivate', danger: true,
            });
            if (!ok) return;
          }
          onToggle();
        } }, active ? 'Deactivate' : 'Activate'),
        el('button', { type: 'button', class: 'mgmt-link danger', onClick: async () => {
          const ok = await confirmDialog({
            message: `Permanently delete "${name}"? This cannot be undone.`,
            okLabel: 'Delete', danger: true,
          });
          if (!ok) return;
          onDelete();
        } }, 'Delete'),
      ]),
    ]);
  }

  // ── Forms ───────────────────────────────────────────────────────────────────
  function field(labelText, input) {
    return el('label', { class: 'mgmt-field' }, [el('span', { class: 'mgmt-field-label', text: labelText }), input]);
  }

  // Build one weekday checkbox group (used for both delivery days and order days).
  function makeDayChecks(selectedDays) {
    return WEEKDAYS.map(day => {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = (selectedDays || []).includes(day);
      cb.dataset.day = day;
      return el('label', { class: 'day-check' }, [cb, el('span', { text: day.slice(0, 3) })]);
    });
  }
  function checkedDays(checks) {
    return checks.map(l => l.querySelector('input')).filter(c => c.checked).map(c => c.dataset.day);
  }

  function supplierForm(item) {
    const name = el('input', { type: 'text', class: 'mgmt-input', value: item?.name || '' });
    const category = el('input', { type: 'text', class: 'mgmt-input', value: item?.category || '' });
    const phone = el('input', { type: 'tel', class: 'mgmt-input', value: item?.phone || '', placeholder: 'e.g. 447700900123' });
    const email = el('input', { type: 'email', class: 'mgmt-input', value: item?.email || '' });

    const deliveryChecks = makeDayChecks(item?.deliveryDays);
    const orderChecks = makeDayChecks(item?.orderDays);

    const save = el('button', { type: 'button', class: 'btn-primary', onClick: async () => {
      if (!name.value.trim()) { name.focus(); return; }
      save.disabled = true;
      const payload = {
        name: name.value.trim(),
        category: category.value.trim(),
        phone: phone.value.trim(),
        email: email.value.trim(),
        deliveryDays: checkedDays(deliveryChecks),
        orderDays: checkedDays(orderChecks),
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
        el('span', { class: 'mgmt-field-label', text: 'Delivery days — when they deliver' }),
        el('div', { class: 'day-checks' }, deliveryChecks),
      ]),
      el('div', { class: 'mgmt-field' }, [
        el('span', { class: 'mgmt-field-label', text: 'Order days — when you place the order' }),
        el('div', { class: 'day-checks' }, orderChecks),
      ]),
      field('Phone (WhatsApp, digits only)', phone),
      field('Email', email),
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
