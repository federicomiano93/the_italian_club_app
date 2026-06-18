// Unit tests for the UK bank-holiday helpers (P15). These feed the Orders alerts
// (holiday-next-week and delivery-conflict notices). The module's source of truth
// is the gov.uk calendar fetched at runtime, but in Node there is no network or
// localStorage, so on import it falls back to its built-in 2025-2026 list — the
// dates asserted below come from that fallback.
//
// Dates are built from numeric components / plain ISO strings compared as text,
// so the assertions hold on any machine/CI timezone.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isBankHoliday,
  nextBankHoliday,
  isBankHolidayWithinNextDays,
} from '../js/orders/bank-holidays.js';

test('isBankHoliday recognises a fallback holiday and rejects a normal day', () => {
  assert.equal(isBankHoliday('2026-12-25'), true);  // Christmas Day
  assert.equal(isBankHoliday('2026-12-24'), false); // Christmas Eve is a working day
  assert.equal(isBankHoliday('2026-06-17'), false);
});

test('isBankHoliday is safe with junk input', () => {
  assert.equal(isBankHoliday('not-a-date'), false);
  assert.equal(isBankHoliday(''), false);
  assert.equal(isBankHoliday(undefined), false);
});

test('nextBankHoliday returns the first holiday on or after the given date', () => {
  // From 1 June 2026 the next fallback holiday is the Summer bank holiday, 31 Aug.
  assert.equal(nextBankHoliday(new Date(2026, 5, 1)), '2026-08-31');
  // From Boxing-day territory, the next one is 28 Dec 2026.
  assert.equal(nextBankHoliday(new Date(2026, 11, 26)), '2026-12-28');
});

test('nextBankHoliday returns null when no holiday remains in the list', () => {
  // The fallback list ends in 2026, so anything in 2027 has no "next".
  assert.equal(nextBankHoliday(new Date(2027, 0, 1)), null);
});

test('isBankHolidayWithinNextDays detects a holiday inside the window', () => {
  // Monday 21 Dec 2026: Christmas (25 Dec) is 4 days away → within a week.
  assert.equal(isBankHolidayWithinNextDays(new Date(2026, 11, 21), 7), true);
});

test('isBankHolidayWithinNextDays is false in a quiet stretch', () => {
  // Mid-June 2026: nearest holiday (31 Aug) is well outside a week.
  assert.equal(isBankHolidayWithinNextDays(new Date(2026, 5, 17), 7), false);
});

test('isBankHolidayWithinNextDays looks ahead from tomorrow, not today', () => {
  // On Christmas Day itself, "today" does not count — only the days AFTER it.
  // 26-31 Dec has the 28th, so a 7-day look-ahead from 25 Dec is still true,
  // but a 1-day look-ahead (just the 26th) is false.
  assert.equal(isBankHolidayWithinNextDays(new Date(2026, 11, 25), 1), false);
});
