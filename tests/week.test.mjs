// Unit tests for the Orders week helpers (P15 — the owner cannot read code, so
// these tests are the safety net). Weekly orders are keyed by ISO week, so a bug
// here would file an order under the wrong week.
//
// Every date is built from numeric components (new Date(year, monthIndex, day)),
// which is LOCAL time, and the helpers read it back with local getters — so the
// assertions hold on any machine/CI timezone. Parsing ISO strings would be the
// one thing that shifts across timezones; we avoid it on purpose.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentWeekStartISO, currentWeekId } from '../js/orders/week.js';

test('currentWeekStartISO returns the Monday of the week (Wed input)', () => {
  // Wednesday 17 June 2026 → Monday 15 June 2026.
  assert.equal(currentWeekStartISO(new Date(2026, 5, 17)), '2026-06-15');
});

test('currentWeekStartISO on a Monday returns that same Monday', () => {
  assert.equal(currentWeekStartISO(new Date(2026, 5, 15)), '2026-06-15');
});

test('currentWeekStartISO on a Sunday returns the Monday that started the week', () => {
  // Sunday 21 June 2026 belongs to the week starting Monday 15 June (not the next).
  assert.equal(currentWeekStartISO(new Date(2026, 5, 21)), '2026-06-15');
});

test('currentWeekId returns the ISO-8601 week id', () => {
  assert.equal(currentWeekId(new Date(2026, 5, 17)), '2026-W25');
});

test('currentWeekId zero-pads single-digit week numbers', () => {
  // Thursday 8 January 2026 is in ISO week 2 → must read "W02", not "W2".
  assert.equal(currentWeekId(new Date(2026, 0, 8)), '2026-W02');
});

test('currentWeekId handles the first week of the year', () => {
  // Thursday 1 January 2026 is in ISO week 1.
  assert.equal(currentWeekId(new Date(2026, 0, 1)), '2026-W01');
});

test('the Monday of a week and any later day in it share the same week id', () => {
  const monday = new Date(2026, 5, 15);
  const sunday = new Date(2026, 5, 21);
  assert.equal(currentWeekId(monday), currentWeekId(sunday));
});
