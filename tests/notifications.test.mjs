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
import { computeAlerts } from '../js/orders/notifications.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekdayOf = (date) => WEEKDAYS[date.getDay()];

// A quiet week well away from any fallback bank holiday, so only the delivery-day
// logic fires (mid-June 2026: nearest holidays are 25 May and 31 Aug).
const QUIET_NOW = new Date(2026, 5, 17); // Wednesday 17 June 2026

test('flags an order due when a supplier delivers today', () => {
  const today = weekdayOf(QUIET_NOW);
  const suppliers = [{ id: 's1', name: 'ACME', active: true, deliveryDays: [today] }];
  const alerts = computeAlerts(suppliers, QUIET_NOW);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].kind, 'due');
  assert.match(alerts[0].text, /ACME delivers today/);
});

test('flags an order soon when a supplier delivers tomorrow', () => {
  const tomorrow = weekdayOf(new Date(2026, 5, 18)); // day after QUIET_NOW
  const suppliers = [{ id: 's1', name: 'ACME', active: true, deliveryDays: [tomorrow] }];
  const alerts = computeAlerts(suppliers, QUIET_NOW);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].kind, 'due');
  assert.match(alerts[0].text, /ACME delivers tomorrow/);
});

test('no due alert when the supplier does not deliver today or tomorrow', () => {
  // Pick a weekday two days ahead, which is neither today nor tomorrow.
  const otherDay = weekdayOf(new Date(2026, 5, 19));
  const suppliers = [{ id: 's1', name: 'ACME', active: true, deliveryDays: [otherDay] }];
  assert.deepEqual(computeAlerts(suppliers, QUIET_NOW), []);
});

test('inactive suppliers are ignored', () => {
  const today = weekdayOf(QUIET_NOW);
  const suppliers = [{ id: 's1', name: 'ACME', active: false, deliveryDays: [today] }];
  assert.deepEqual(computeAlerts(suppliers, QUIET_NOW), []);
});

test('warns about a bank holiday in the coming week', () => {
  // Monday 21 Dec 2026: Christmas Day (25 Dec, in the fallback list) is 4 days away.
  // No suppliers, so the holiday notice is the only alert.
  const now = new Date(2026, 11, 21);
  const alerts = computeAlerts([], now);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].kind, 'holiday');
  assert.match(alerts[0].text, /2026-12-25/);
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
