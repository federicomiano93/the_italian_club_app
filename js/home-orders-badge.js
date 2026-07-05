// home-orders-badge.js — a small badge on the Orders home card when an order is
// due to be placed today, so Federico sees it on the landing screen without
// opening Orders. Best-effort and lightweight: ONE small suppliers read on Home
// load, then the pure computeAlerts (reused from the Orders feature) runs against
// the cached bank-holiday list. Nothing shows offline or on any error.
//
// Home is the shared landing screen — the ONE sanctioned place a feature signal
// may surface outside its own folder (see the modularity note in the project docs).
// It reuses the Orders data layer + pure alert engine, so there is no duplicated
// logic to drift out of sync.

import { getCollection } from './orders/firebase-orders.js';
import { computeAlerts } from './orders/notifications.js';

async function showOrdersBadge() {
  try {
    const suppliers = await getCollection('suppliers');
    const alerts = computeAlerts(suppliers);
    // Only the primary "place the order" alert drives the badge — holiday/conflict
    // notices are informational and would otherwise nag every day near a holiday.
    const orderAlert = alerts.find(a => a.kind === 'order');
    const count = orderAlert ? orderAlert.items.length : 0;
    if (count > 0) paintBadge(count);
  } catch (err) {
    // Offline / not signed in / rules — no badge, never blocks the Home screen.
    console.warn('Orders badge skipped:', err);
  }
}

function paintBadge(count) {
  const card = document.querySelector('.home-card[href="orders.html"]');
  if (!card) return;
  const badge = document.createElement('span');
  badge.className = 'home-card-badge';
  badge.textContent = String(count);
  badge.setAttribute('aria-label', `${count} order${count === 1 ? '' : 's'} to place today`);
  card.appendChild(badge);
}

showOrdersBadge();
