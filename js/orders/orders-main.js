// orders-main.js — entry point for orders.html.
//
// Phase 1: wire up tab navigation and verify Firebase connectivity + that the
// new Firestore rules are deployed (by reading the suppliers collection).
// Later phases plug in suppliers, ingredients, draft, preview, history,
// management, suggestions and notifications.

import { authReady, getCollection, COLLECTIONS } from './firebase-orders.js';

// ── Tab navigation (Order / History) ─────────────────────────────────────────
function setupTabs() {
  const tabs = [
    { btn: 'tab-order-btn', panel: 'tab-order' },
    { btn: 'tab-history-btn', panel: 'tab-history' },
  ];
  tabs.forEach(({ btn, panel }) => {
    const button = document.getElementById(btn);
    if (!button) return;
    button.addEventListener('click', () => {
      tabs.forEach(t => {
        document.getElementById(t.btn)?.classList.toggle('active', t.btn === btn);
        document.getElementById(t.panel)?.classList.toggle('active', t.panel === panel);
      });
    });
  });
}

// ── Connection check ─────────────────────────────────────────────────────────
function setStatus(text, kind) {
  const el = document.getElementById('orders-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'orders-status' + (kind ? ' ' + kind : '');
}

async function checkConnection() {
  try {
    await authReady;
    setStatus('Connected to Firebase ✓', 'ok');
    // Reading suppliers confirms the new rules are deployed (otherwise the
    // default-deny rule rejects this read).
    const suppliers = await getCollection(COLLECTIONS.suppliers);
    setStatus(`Connected ✓ — suppliers in database: ${suppliers.length}`, 'ok');
  } catch (err) {
    console.error('Orders connection check failed:', err);
    setStatus(
      'Connected to Firebase, but the "suppliers" collection is blocked. ' +
      'Deploy the Firestore rules to enable Orders.',
      'warn',
    );
  }
}

setupTabs();
checkConnection();
