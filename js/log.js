import { showResult, hideResult } from './calc.js';
import { saveLogToFirestore, deleteLogFromFirestore } from './firebase.js';

function logTimestamp() {
  const now = new Date();
  const DAY = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const d = String(now.getDate()).padStart(2,'0');
  const t = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  return { date: `${DAY[now.getDay()]} ${d} ${MON[now.getMonth()]}`, time: t };
}

function buildFocacciaLog() {
  const { date, time } = logTimestamp();
  const pizze    = +document.getElementById('f-pizze').value || 0;
  const focacce  = +document.getElementById('f-focacce').value || 0;
  const ciabatta = +document.getElementById('f-ciabatta').value || 0;
  const tray     = +document.getElementById('f-trayfocaccia').value || 0;
  const panini   = +document.getElementById('f-panini').value || 0;
  const kg_f     = +document.getElementById('f-kg').value || 0;

  const lines = [];
  if (pizze > 0 || focacce > 0) {
    lines.push('Bakery:');
    if (pizze > 0)   lines.push('  Pizzas: ' + pizze + ' pz');
    if (focacce > 0) lines.push('  Focaccias: ' + focacce + ' pz');
  }
  if (ciabatta > 0) { lines.push('Bone&Block:'); lines.push('  Ciabatta: ' + ciabatta + ' pz'); }
  if (tray > 0)     { lines.push('Club Fish:');  lines.push('  Tray focaccia: ' + tray + ' pz'); }
  if (panini > 0)   { lines.push('Cahita:');     lines.push('  Panini: ' + panini + ' pz'); }
  if (kg_f > 0)     lines.push('Extra dough: ' + kg_f + ' kg');

  return { date, time, text: lines.join('\n') };
}

function buildLogText(tab) {
  const { date, time } = logTimestamp();
  const lines = [];
  if (tab === 'brioche') {
    const burgerbuns = +document.getElementById('b-burgerbuns').value || 0;
    const subrolls   = +document.getElementById('b-subrolls').value || 0;
    const bun        = +document.getElementById('b-bun').value || 0;
    const rolls      = +document.getElementById('b-rolls').value || 0;
    const kg_b       = +document.getElementById('b-kg').value || 0;
    if (burgerbuns > 0 || subrolls > 0) {
      lines.push('Bone&Block:');
      if (burgerbuns > 0) lines.push('  Burger buns: ' + burgerbuns + ' pz');
      if (subrolls > 0)   lines.push('  Sub rolls: ' + subrolls + ' pz');
    }
    if (bun > 0 || rolls > 0) {
      lines.push('Club Fish:');
      if (bun > 0)   lines.push('  Buns: ' + bun + ' pz');
      if (rolls > 0) lines.push('  Rolls: ' + rolls + ' pz');
    }
    if (kg_b > 0) lines.push('Extra dough: ' + kg_b + ' kg');
  } else {
    const loaves = +document.getElementById('s-loaves').value || 0;
    const weight = +document.getElementById('s-weight').value || 905;
    if (loaves > 0) lines.push('Loaves: ' + loaves + ' pz (' + weight + ' g each)');
  }
  return { date, time, text: lines.join('\n') };
}

export function confirmAndSave(tab) {
  const btn = document.getElementById(tab[0] + '-confirm-btn');

  if (btn.dataset.mode === 'edit') {
    hideResult(tab + '-result');
    btn.textContent = '✓ Confirm';
    btn.dataset.mode = '';
    return;
  }

  showResult(tab + '-result');

  let record;
  if (tab === 'focaccia') {
    const { date, time, text } = buildFocacciaLog();
    record = { date, time, dough: 'Focaccia', text };
  } else {
    const { date, time, text } = buildLogText(tab);
    record = { date, time, dough: tab === 'brioche' ? 'Brioche' : 'Sourdough', text };
  }

  let log = [];
  try { log = JSON.parse(localStorage.getItem('bakery-log') || '[]'); } catch(e) {}
  log = log.filter(r => r.dough !== record.dough);
  log.push(record);
  if (log.length > 3) log = log.slice(-3);
  localStorage.setItem('bakery-log', JSON.stringify(log));
  saveLogToFirestore(record);

  btn.textContent = 'Saved!';
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = 'Edit';
    btn.dataset.mode = 'edit';
    btn.disabled = false;
  }, 1000);
}

function parseLogText(text) {
  let html = '';
  for (const line of (text || '').split('\n')) {
    if (!line.trim()) continue;
    if (/^[A-Za-z&].+:$/.test(line)) {
      html += `<div class="log-customer">${line.slice(0, -1)}</div>`;
    } else {
      const t = line.trim();
      const ci = t.lastIndexOf(': ');
      if (ci !== -1) {
        html += `<div class="log-item">${t.slice(0, ci + 2)}<strong>${t.slice(ci + 2)}</strong></div>`;
      } else {
        html += `<div class="log-item">${t}</div>`;
      }
    }
  }
  return html;
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
  const sorted = ORDER.map(d => log.find(r => r.dough === d)).filter(Boolean);
  container.innerHTML = sorted.map(r =>
    `<div class="card">
      <div class="card-title">${r.dough}</div>
      <div class="log-timestamp">📅 ${r.date} — ${r.time}</div>
      <div class="log-body">${parseLogText(r.text)}</div>
      <div class="log-actions">
        <button class="log-edit-btn" data-dough="${r.dough}">Edit</button>
        <button class="log-delete-btn" data-dough="${r.dough}">Delete</button>
      </div>
    </div>`
  ).join('');
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
