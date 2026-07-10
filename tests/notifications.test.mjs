// Unit tests for the Orders alert engine (P15 — the owner cannot read code, so
// these tests are the safety net). computeAlerts() is the pure decision layer
// behind the in-app banners; the rendering/browser-notification parts are not
// tested here (they need a real browser).
//
// Note on imports: notifications.js pulls in bank-holidays.js, which on load
// tries to read the browser cache. In Node there is no localStorage, but that
// read is wrapped in try/catch, so the module quietly falls back to its built-in
// holiday list (which includes 2025-12-25 ... 2026-12-28). The tests below rely
// on that fixed fallback list, choosing dates around Christmas 2026.
//
// Weekdays are derived in-test from the same dates (not hard-coded), so the
// assertions hold on any machine/CI timezone.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAlerts, isReminderDue } from '../js/orders/notifications.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekdayOf = (date) => WEEKDAYS[date.getDay()];

// A quiet week well away from any fallback bank holiday, so only the order-day
// logic fires (mid-June 2026: nearest holidays are 25 May and 31 Aug).
const QUIET_NOW = new Date(2026, 5, 17); // Wednesday 17 June 2026

test('flags a place-order alert when a supplier’s order day is today', () => {
  const today = weekdayOf(QUIET_NOW);
  // QUIET_NOW is Wednesday 17 June 2026, so the next Friday is 2 days away.
  const suppliers = [{ id: 's1', name: 'ACME', active: true, orderDays: [today], deliveryDays: ['Friday'] }];
  const alerts = computeAlerts(suppliers, QUIET_NOW);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].kind, 'order');
  assert.equal(alerts[0].items.length, 1);
  assert.equal(alerts[0].items[0], 'ACME — Friday');
  // Notification: title carries the action, body is the supplier names only.
  assert.equal(alerts[0].title, 'Order to place today');
  assert.equal(alerts[0].text, 'ACME');
});

test('place-order line says "tomorrow" when the next delivery is the next day', () => {
  const today = weekdayOf(QUIET_NOW);                    // Wednesday
  const tomorrow = weekdayOf(new Date(2026, 5, 18));     // Thursday 18 June
  const suppliers = [{ id: 's1', name: 'ACME', active: true, orderDays: [today], deliveryDays: [tomorrow] }];
  const alerts = computeAlerts(suppliers, QUIET_NOW);
  assert.equal(alerts[0].items[0], 'ACME — tomorrow');
});

test('place-order line shows ONLY the next delivery day, never the full list', () => {
  const today = weekdayOf(QUIET_NOW);                    // Wednesday
  const tomorrow = weekdayOf(new Date(2026, 5, 18));     // Thursday (next delivery)
  const later = weekdayOf(new Date(2026, 5, 20));        // Saturday (a further delivery day)
  const suppliers = [{ id: 's1', name: 'ACME', active: true, orderDays: [today], deliveryDays: [tomorrow, later] }];
  const alerts = computeAlerts(suppliers, QUIET_NOW);
  assert.equal(alerts[0].items[0], 'ACME — tomorrow');   // the soonest one only
  assert.doesNotMatch(alerts[0].items[0], new RegExp(later)); // the later day is not shown
});

test('place-order line shows just the name when the supplier has no delivery days', () => {
  const today = weekdayOf(QUIET_NOW);
  const suppliers = [{ id: 's1', name: 'ACME', active: true, orderDays: [today] }];
  const alerts = computeAlerts(suppliers, QUIET_NOW);
  assert.equal(alerts[0].items[0], 'ACME');
});

test('groups every supplier due today into ONE numbered banner', () => {
  const today = weekdayOf(QUIET_NOW);
  const suppliers = [
    { id: 's1', name: 'Flour Co', active: true, orderDays: [today], deliveryDays: ['Wednesday'] },
    { id: 's2', name: 'Dairy Ltd', active: true, orderDays: [today], deliveryDays: ['Thursday'] },
  ];
  const alerts = computeAlerts(suppliers, QUIET_NOW);
  assert.equal(alerts.length, 1);              // a single grouped banner, not one per supplier
  assert.equal(alerts[0].kind, 'order');
  assert.equal(alerts[0].items.length, 2);
  assert.equal(alerts[0].title, 'Orders to place today');  // plural for more than one
  assert.equal(alerts[0].text, 'Flour Co, Dairy Ltd');     // notification body: names only
});

test('no place-order alert when no supplier orders today', () => {
  // Order day two days ahead — not today.
  const otherDay = weekdayOf(new Date(2026, 5, 19));
  const suppliers = [{ id: 's1', name: 'ACME', active: true, orderDays: [otherDay], deliveryDays: ['Friday'] }];
  assert.deepEqual(computeAlerts(suppliers, QUIET_NOW), []);
});

test('a supplier with delivery days but no order days raises no place-order alert', () => {
  const today = weekdayOf(QUIET_NOW);
  const suppliers = [{ id: 's1', name: 'ACME', active: true, deliveryDays: [today] }];
  assert.deepEqual(computeAlerts(suppliers, QUIET_NOW), []);
});

test('inactive suppliers are ignored', () => {
  const today = weekdayOf(QUIET_NOW);
  const suppliers = [{ id: 's1', name: 'ACME', active: false, orderDays: [today], deliveryDays: [today] }];
  assert.deepEqual(computeAlerts(suppliers, QUIET_NOW), []);
});

test('warns about a bank holiday in the coming week, with a day countdown', () => {
  // Monday 21 Dec 2026: Christmas Day (25 Dec, in the fallback list) is 4 days away.
  // No suppliers, so the holiday notice is the only alert.
  const now = new Date(2026, 11, 21);
  const alerts = computeAlerts([], now);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].kind, 'holiday');
  assert.match(alerts[0].text, /2026-12-25/);
  assert.match(alerts[0].text, /in 4 days/);
});

test('warns about a delivery day that clashes with an upcoming bank holiday', () => {
  // 15 Dec 2026: Christmas Day (25 Dec) is within the 14-day conflict window.
  const now = new Date(2026, 11, 15);
  const christmasWeekday = weekdayOf(new Date(2026, 11, 25));
  const suppliers = [{ id: 's1', name: 'ACME', active: true, deliveryDays: [christmasWeekday] }];
  const alerts = computeAlerts(suppliers, now);
  const conflict = alerts.find(a => a.kind === 'conflict');
  assert.ok(conflict, 'expected a conflict alert');
  assert.match(conflict.text, /ACME/);
  assert.match(conflict.text, /2026-12-25/);
});

test('a missing supplier list produces no alerts (and never throws)', () => {
  assert.deepEqual(computeAlerts(undefined, QUIET_NOW), []);
  assert.deepEqual(computeAlerts(null, QUIET_NOW), []);
});

// ── Daily Home reminder gate (isReminderDue) ──────────────────────────────────
test('reminder is due when it has never been shown', () => {
  assert.equal(isReminderDue(null, QUIET_NOW), true);
  assert.equal(isReminderDue(undefined, QUIET_NOW), true);
});

test('reminder is NOT due again on the same day it was last shown', () => {
  const today = '2026-06-17'; // matches QUIET_NOW (17 June 2026)
  assert.equal(isReminderDue(today, QUIET_NOW), false);
});

test('reminder is due again once the day has changed', () => {
  const yesterday = '2026-06-16';
  assert.equal(isReminderDue(yesterday, QUIET_NOW), true);
});
