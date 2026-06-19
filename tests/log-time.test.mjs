// Unit tests for the log timestamp formatting (P15 — the owner cannot read code).
// They lock the 12-hour AM/PM format and the date string built by logTimestamp.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logTimestamp } from '../js/log-time.js';

test('midnight reads as 12:MM AM', () => {
  // 2026-06-08 is a Monday; midnight, 7 minutes past.
  const { time } = logTimestamp(new Date(2026, 5, 8, 0, 7));
  assert.equal(time, '12:07 AM');
});

test('morning reads as AM with no leading zero on the hour', () => {
  const { time } = logTimestamp(new Date(2026, 5, 8, 9, 5));
  assert.equal(time, '9:05 AM');
});

test('noon reads as 12:MM PM', () => {
  const { time } = logTimestamp(new Date(2026, 5, 8, 12, 0));
  assert.equal(time, '12:00 PM');
});

test('afternoon converts 24h to 12h with PM', () => {
  const { time } = logTimestamp(new Date(2026, 5, 8, 14, 5));
  assert.equal(time, '2:05 PM');
});

test('late evening reads as PM', () => {
  const { time } = logTimestamp(new Date(2026, 5, 8, 23, 59));
  assert.equal(time, '11:59 PM');
});

test('minutes are zero-padded', () => {
  const { time } = logTimestamp(new Date(2026, 5, 8, 8, 3));
  assert.equal(time, '8:03 AM');
});

test('date string is "Weekday DD Month" with padded day', () => {
  const { date } = logTimestamp(new Date(2026, 5, 8, 8, 3));
  assert.equal(date, 'Monday 08 June');
});
