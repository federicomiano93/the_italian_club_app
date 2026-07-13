// reminder-view.js — the banners at the top of the Orders screen.
//
// What to order TODAY, and what is already done. The alert itself is not new
// (computeAlerts has always produced it), but it used to be filtered out of this
// screen because it could only nag: it had no way of knowing what you had already
// ordered. Now that an order is one day and one supplier, it does — so it can
// tick suppliers off instead of repeating itself.
//
// Small on purpose: one line of chips, not a numbered list. A supplier still to
// order is a button — tapping it opens that supplier's card.

import { el } from './dom.js';

const CHECK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

// list: [{ supplier, placed }] from reminders.todayOrders
export function renderTodayOrders(container, list, { onPick } = {}) {
  if (!container) return;
  container.textContent = '';

  // Nothing is ordered today — say nothing at all.
  if (!list.length) return;

  if (list.every(item => item.placed)) {
    container.appendChild(el('div', { class: 'today-banner all-done' }, [
      el('span', { class: 'today-check', icon: CHECK_SVG, 'aria-hidden': 'true' }),
      el('span', { text: "Today's orders are all placed" }),
    ]));
    return;
  }

  const chips = list.map(({ supplier, placed }) => (placed
    ? el('span', { class: 'today-chip placed' }, [
      el('span', { class: 'today-check', icon: CHECK_SVG, 'aria-hidden': 'true' }),
      el('span', { text: supplier.name }),
    ])
    : el('button', {
      type: 'button',
      class: 'today-chip',
      onClick: () => onPick?.(supplier.id),
    }, supplier.name)));

  container.appendChild(el('div', { class: 'today-banner' }, [
    el('span', { class: 'today-label', text: 'Order today' }),
    el('div', { class: 'today-chips' }, chips),
  ]));
}
