import { showResult, hideResult, lockInputs, unlockInputs, extraDoughGramsFor } from './calc.js';
import { saveLogToFirestore, deleteLogFromFirestore, saveDailyEntry } from './firebase.js';
import { getConfig } from './calculator-config-store.js';
import { getTabProducts } from './calculator-config.js';

// Reads a quantity input/select by id; 0 when absent or empty.
function qtyOf(id) {
  const el = document.getElementById(id);
  return el ? (+el.value || 0) : 0;
}

// Persisted "confirmed" flag per dough, so a locked recipe survives app restarts.
function setConfirmed(tab) { localStorage.setItem('confirmed-' + tab, '1'); }
export function clearConfirmed(tab) { localStorage.removeItem('confirmed-' + tab); }

// On app start, re-show + re-lock a previously confirmed recipe WITHOUT re-saving
// the log, so reopening the app never changes the saved entry or its timestamp.
export function restoreConfirmed(tab) {
  if (localStorage.getItem('confirmed-' + tab) !== '1') return;
  const btn = document.getElementById(tab[0] + '-confirm-btn');
  if (!btn || !btn.classList.contains('visible')) return; // no current recipe (quantities empty)
  btn.textContent = 'Edit';
  btn.dataset.mode = 'edit';
  btn.dataset.saved = '1';
  btn.disabled = false;
  showResult(tab + '-result');
  lockInputs(tab);
}

function logTimestamp() {
  const now = new Date();
  const DAY = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const d = String(now.getDate()).padStart(2,'0');
  const t = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  return { date: `${DAY[now.getDay()]} ${d} ${MON[now.getMonth()]}`, time: t };
}

function isoDate() {
  const n = new Date();
  return n.getFullYear() + '-' +
    String(n.getMonth() + 1).padStart(2, '0') + '-' +
    String(n.getDate()).padStart(2, '0');
}

// Daily production log entry (one map stored under daily-logs/{date}.{dough}).
// Generic by product: total grams plus a "qty_<productId>" field per configured
// product. Nothing reads these fields in the app — they are an archive only.
function buildDailyEntry(tab, record) {
  const base = {
    date_iso: isoDate(),
    date: record.date,
    time: record.time,
    dough: record.dough,
    total_g: parseInt(document.getElementById(tab[0] + '-total').textContent, 10) || 0,
    extra_g: extraDoughGramsFor(tab),
  };
  for (const product of getTabProducts(getConfig(), tab)) {
    base['qty_' + product.id] = qtyOf(product.id);
  }
  return base;
}

// Builds the saved log text grouped by client, from this dough's configured
// products. Each client with at least one ordered product gets a "Client name:"
// header followed by indented "  Product: N pz" (or " kg") lines. The tab's
// products come pre-filtered to this dough and tagged with their owning client,
// contiguous per client, so we just flush a block whenever the client changes.
function buildTabLog(tab) {
  const { date, time } = logTimestamp();
  const lines = [];
  let currentId = null;
  let header = null;
  let items = [];
  const flush = () => {
    if (header && items.length) { lines.push(header + ':'); lines.push(...items); }
    items = [];
  };
  for (const product of getTabProducts(getConfig(), tab)) {
    if (product.clientId !== currentId) { flush(); currentId = product.clientId; header = product.clientName; }
    const qty = qtyOf(product.id);
    if (qty > 0) items.push('  ' + product.name + ': ' + qty + (product.kind === 'kg' ? ' kg' : ' pz'));
  }
  flush();
  const extraVal = document.getElementById(tab[0] + '-extra');
  if (extraVal && extraDoughGramsFor(tab) > 0) {
    const extraUnit = document.getElementById(tab[0] + '-extra-unit');
    lines.push('Extra dough: ' + extraVal.value + ' ' + (extraUnit ? extraUnit.value : 'g'));
  }
  return { date, time, text: lines.join('\n') };
}

export function confirmAndSave(tab) {
  const btn = document.getElementById(tab[0] + '-confirm-btn');

  if (btn.dataset.mode === 'edit') {
    if (!confirm('Change the quantities? You will need to Confirm again to update the recipe and the log.')) return;
    hideResult(tab + '-result');
    unlockInputs(tab);
    clearConfirmed(tab);
    btn.textContent = '✓ Confirm';
    btn.dataset.mode = '';
    btn.dataset.saved = '';
    btn.disabled = false;
    btn.classList.add('visible');
    return;
  }

  showResult(tab + '-result');

  const DOUGH = { focaccia: 'Focaccia', brioche: 'Brioche', sourdough: 'Sourdough' };
  const { date, time, text } = buildTabLog(tab);
  const record = { date, time, dough: DOUGH[tab], text };

  let log = [];
  try { log = JSON.parse(localStorage.getItem('bakery-log') || '[]'); } catch(e) {}
  log = log.filter(r => r.dough !== record.dough);
  log.push(record);
  if (log.length > 3) log = log.slice(-3);
  localStorage.setItem('bakery-log', JSON.stringify(log));
  saveLogToFirestore(record);
  saveDailyEntry(buildDailyEntry(tab, record));

  lockInputs(tab);
  setConfirmed(tab);

  btn.textContent = 'Saved!';
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = 'Edit';
    btn.dataset.mode = 'edit';
    btn.disabled = false;
  }, 1000);
}

function parseLogText(text) {
  const frag = document.createDocumentFragment();
  for (const line of (text || '').split('\n')) {
    if (!line.trim()) continue;
    const div = document.createElement('div');
    // Headers are "Client name:" (no leading space, ends with a colon); items are
    // indented "  Product: qty". Client names are user-typed, so accept any name
    // (accents, digits, emoji) rather than ASCII only.
    if (!/^\s/.test(line) && line.endsWith(':')) {
      div.className = 'log-customer';
      div.textContent = line.slice(0, -1);
    } else {
      div.className = 'log-item';
      const t = line.trim();
      const ci = t.lastIndexOf(': ');
      if (ci !== -1) {
        div.appendChild(document.createTextNode(t.slice(0, ci + 2)));
        const strong = document.createElement('strong');
        strong.textContent = t.slice(ci + 2);
        div.appendChild(strong);
      } else {
        div.textContent = t;
      }
    }
    frag.appendChild(div);
  }
  return frag;
}

export function getLog() {
  if (window.firestoreLog && window.firestoreLog.length > 0) return window.firestoreLog;
  try { return JSON.parse(localStorage.getItem('bakery-log') || '[]'); } catch(e) { return []; }
}

export function renderLog() {
  const container = document.getElementById('log-content');
  const log = getLog();
  if (log.length === 0) {
    container.innerHTML = '<p class="log-empty">No records yet. Calculate and confirm a dough to save it here.</p>';
    return;
  }
  const ORDER = ['Focaccia', 'Brioche', 'Sourdough'];
  const sorted = ORDER.map(d => log.find(r => r.dough === d)).filter(Boolean).filter(r => ORDER.includes(r.dough));
  container.textContent = '';
  for (const r of sorted) {
    const card = document.createElement('div');
    card.className = 'card';

    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = r.dough;
    card.appendChild(title);

    const ts = document.createElement('div');
    ts.className = 'log-timestamp';
    ts.textContent = `📅 ${r.date} — ${r.time}`;
    card.appendChild(ts);

    const body = document.createElement('div');
    body.className = 'log-body';
    body.appendChild(parseLogText(r.text));
    card.appendChild(body);

    const actions = document.createElement('div');
    actions.className = 'log-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'log-edit-btn';
    editBtn.dataset.dough = r.dough;
    editBtn.textContent = 'Edit';
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'log-delete-btn';
    deleteBtn.dataset.dough = r.dough;
    deleteBtn.textContent = 'Delete';
    actions.appendChild(deleteBtn);

    card.appendChild(actions);
    container.appendChild(card);
  }
}

function deleteLog(dough) {
  if (!confirm('Delete ' + dough + ' log entry?')) return;
  let log = [];
  try { log = JSON.parse(localStorage.getItem('bakery-log') || '[]'); } catch(e) {}
  localStorage.setItem('bakery-log', JSON.stringify(log.filter(r => r.dough !== dough)));
  deleteLogFromFirestore(dough);
}

export function shareLogEntry(dough) {
  const r = getLog().find(e => e.dough === dough);
  if (!r) return;
  const text = `📋 *${r.dough.toUpperCase()} — ${r.date}*\n\n${r.text}`;
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}

// Event delegation for dynamically generated log buttons
document.getElementById('log-content').addEventListener('click', e => {
  const editBtn = e.target.closest('.log-edit-btn');
  const deleteBtn = e.target.closest('.log-delete-btn');
  if (editBtn) {
    document.dispatchEvent(new CustomEvent('switch-tab', { detail: editBtn.dataset.dough.toLowerCase() }));
  }
  if (deleteBtn) {
    deleteLog(deleteBtn.dataset.dough);
  }
});
