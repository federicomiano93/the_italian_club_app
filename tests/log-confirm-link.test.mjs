// Unit tests for the Confirm/Edit link model (P15): the rule that a calculator tab
// confirms into the SAME log until Reset drops the link, and that a re-confirm can
// move the log to a different Today/Tomorrow. Pure functions only — the lock UI and
// localStorage live in calc.js/app.js and are exercised by the manual smoke test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmTarget, setForDay, createLog, addVersion, latestVersion } from '../js/log-model.js';

function version(kind) {
  return { calculatedBy: '', at: { date: '2026-06-24', time: '10:00' }, kind, items: [], occasional: [], sheet: null, text: '' };
}

// ── confirmTarget: create vs update ───────────────────────────────────────────
test('confirmTarget: no linked log → create', () => {
  assert.equal(confirmTarget({ linkedId: null, linkedExists: false }), 'create');
});

test('confirmTarget: linked log that exists → update', () => {
  assert.equal(confirmTarget({ linkedId: 'log-1', linkedExists: true }), 'update');
});

test('confirmTarget: linked id but the log was deleted → create (safe fallback)', () => {
  assert.equal(confirmTarget({ linkedId: 'log-1', linkedExists: false }), 'create');
});

test('confirmTarget: empty id never counts as a link', () => {
  assert.equal(confirmTarget({ linkedId: '', linkedExists: true }), 'create');
});

// ── setForDay: a re-confirm can move the log to a different day ────────────────
test('setForDay: changes today → tomorrow without touching history', () => {
  const log = createLog({ id: 'log-1', dough: 'Focaccia', forDay: 'today', version: version('create'), createdAtMs: 1 });
  const moved = setForDay(log, 'tomorrow');
  assert.equal(moved.forDay, 'tomorrow');
  assert.equal(moved.versions.length, 1); // history untouched
});

test('setForDay: an invalid day keeps the existing one', () => {
  const log = createLog({ id: 'log-1', dough: 'Focaccia', forDay: 'today', version: version('create'), createdAtMs: 1 });
  assert.equal(setForDay(log, 'someday').forDay, 'today');
});

test('setForDay: returns a NEW object, never mutates the input', () => {
  const log = createLog({ id: 'log-1', dough: 'Focaccia', forDay: 'today', version: version('create'), createdAtMs: 1 });
  const moved = setForDay(log, 'tomorrow');
  assert.equal(log.forDay, 'today'); // original unchanged
  assert.notEqual(moved, log);
});

// ── origin: only manual logs are editable from the Log screen ──────────────────
test('createLog: a manual log is tagged origin=manual', () => {
  const log = createLog({ id: 'log-1', dough: 'Focaccia', forDay: 'today', version: version('create'), createdAtMs: 1, origin: 'manual' });
  assert.equal(log.origin, 'manual');
});

test('createLog: a calculator log is tagged origin=calculator', () => {
  const log = createLog({ id: 'log-1', dough: 'Focaccia', forDay: 'today', version: version('create'), createdAtMs: 1, origin: 'calculator' });
  assert.equal(log.origin, 'calculator');
});

test('createLog: a missing or unknown origin defaults to calculator (not editable in the Log screen)', () => {
  const noOrigin = createLog({ id: 'a', dough: 'Focaccia', forDay: 'today', version: version('create'), createdAtMs: 1 });
  const badOrigin = createLog({ id: 'b', dough: 'Focaccia', forDay: 'today', version: version('create'), createdAtMs: 1, origin: 'whatever' });
  assert.equal(noOrigin.origin, 'calculator');
  assert.equal(badOrigin.origin, 'calculator');
});

// ── The full re-confirm flow: update appends an 'edit' version + can move the day ──
test('re-confirm: append an edit version then move the day, history preserved', () => {
  let log = createLog({ id: 'log-1', dough: 'Brioche', forDay: 'today', version: version('create'), createdAtMs: 1 });
  log = addVersion(log, version('edit'));
  log = setForDay(log, 'tomorrow');
  assert.equal(log.versions.length, 2);
  assert.equal(latestVersion(log).kind, 'edit');
  assert.equal(log.forDay, 'tomorrow');
  assert.equal(log.versions[0].kind, 'create'); // the original create is still there
});
