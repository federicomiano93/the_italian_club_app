// notifications.js — client-side order alerts.
//
// Computes three alerts and shows them as in-app banners; when the user grants
// permission, it also raises a browser notification while the app is open:
//   1. Order due — a supplier delivers today or tomorrow
//   2. Bank holiday next week — plan orders ahead
//   3. Delivery conflict — an upcoming bank holiday falls on a supplier's delivery day
//
// Client-side only (per Federico): these fire while the app is open. Pushing to
// staff with the app closed needs the server step (Firebase Cloud Functions),
// deferred for now — see js/firebase.example.js.

import { el } from './dom.js';
import { isBankHolidayWithinNextDays, nextBankHoliday, isBankHoliday } from './bank-holidays.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CONFLICT_WINDOW_DAYS = 14;
const notified = new Set(); // browser notifications already raised this session

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Bank-holiday ISO dates within the next `days` days (from tomorrow).
function upcomingHolidays(from, days) {
  const result = [];
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  for (let i = 1; i <= days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const iso = toISODate(d);
    if (isBankHoliday(iso)) result.push(iso);
  }
  return result;
}

export function computeAlerts(suppliers, now = new Date()) {
  const alerts = [];
  const active = (suppliers || []).filter(s => s.active !== false);

  // 1. Order due — delivery today or tomorrow.
  const todayWd = WEEKDAYS[now.getDay()];
  const tomorrowWd = WEEKDAYS[(now.getDay() + 1) % 7];
  active.forEach(s => {
    const days = s.deliveryDays || [];
    if (days.includes(todayWd)) {
      alerts.push({ kind: 'due', key: `due-${s.id}-${toISODate(now)}`, text: `Order due: ${s.name} delivers today (${todayWd}).` });
    } else if (days.includes(tomorrowWd)) {
      alerts.push({ kind: 'due', key: `soon-${s.id}-${toISODate(now)}`, text: `Order soon: ${s.name} delivers tomorrow (${tomorrowWd}).` });
    }
  });

  // 2. Bank holiday next week.
  if (isBankHolidayWithinNextDays(now, 7)) {
    const h = nextBankHoliday(now);
    alerts.push({ kind: 'holiday', key: `bh-${h}`, text: `UK bank holiday next week (${h}). Plan your orders ahead.` });
  }

  // 3. Delivery conflict — an upcoming holiday lands on a supplier's delivery day.
  upcomingHolidays(now, CONFLICT_WINDOW_DAYS).forEach(iso => {
    const wd = WEEKDAYS[new Date(`${iso}T00:00:00`).getDay()];
    active.forEach(s => {
      if ((s.deliveryDays || []).includes(wd)) {
        alerts.push({ kind: 'conflict', key: `conf-${s.id}-${iso}`, text: `Heads up: ${s.name} delivers on ${wd}, but ${iso} is a bank holiday — check the delivery.` });
      }
    });
  });

  return alerts;
}

// Raise a browser notification for each new alert (only when permission granted).
function maybeNotify(alerts) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  alerts.forEach(a => {
    if (notified.has(a.key)) return;
    notified.add(a.key);
    try { new Notification('The Italian Club — Orders', { body: a.text, tag: a.key }); }
    catch (err) { console.warn('Notification failed:', err); }
  });
}

// Render the alert banners (and an "Enable notifications" button when relevant)
// into `container`, and raise browser notifications for new alerts.
export function renderAlerts(container, suppliers, now = new Date()) {
  if (!container) return;
  container.textContent = '';

  const supported = 'Notification' in window;
  if (supported && Notification.permission === 'default') {
    container.appendChild(el('button', { type: 'button', class: 'enable-notifs', onClick: async () => {
      try { await Notification.requestPermission(); } catch (err) { console.warn('Permission request failed:', err); }
      renderAlerts(container, suppliers, now);
    } }, '🔔 Enable notifications'));
  }

  const alerts = computeAlerts(suppliers, now);
  alerts.forEach(a => container.appendChild(el('div', { class: `alert-banner ${a.kind}`, text: a.text })));
  maybeNotify(alerts);
}
