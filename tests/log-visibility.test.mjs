// Unit tests for the Log display filters (P15): the per-dough visibility + retention
// window that decide what the app's Log LIST shows. These never delete data — they
// only filter the list — so the safety net here is "the right logs are shown/hidden".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterVisibleLogs } from '../js/log-model.js';
import {
  isLogVisible, getLogRetentionHours, normalizeConfig,
  LOG_RETENTION_OPTIONS, LOG_RETENTION_DEFAULT,
} from '../js/calculator-config.js';

const HOUR = 3600 * 1000;
const NOW = 1_000_000_000_000; // fixed "now" so the tests are deterministic

function log(dough, ageHours) {
  return { id: dough + '-' + ageHours, dough, createdAtMs: NOW - ageHours * HOUR };
}

// ── filterVisibleLogs: visibility ─────────────────────────────────────────────
test('filterVisibleLogs: a dough turned off is hidden, others stay', () => {
  const logs = [log('Focaccia', 1), log('Brioche', 1), log('Sourdough', 1)];
  const out = filterVisibleLogs(logs, {
    visibility: { focaccia: false, brioche: true, sourdough: true },
    retentionHours: 24, nowMs: NOW,
  });
  assert.deepEqual(out.map(l => l.dough), ['Brioche', 'Sourdough']);
});

test('filterVisibleLogs: a missing visibility key defaults to visible', () => {
  const out = filterVisibleLogs([log('Focaccia', 1)], { visibility: {}, retentionHours: 24, nowMs: NOW });
  assert.equal(out.length, 1);
});

test('filterVisibleLogs: dough match is case-insensitive', () => {
  const out = filterVisibleLogs([log('Sourdough', 1)], {
    visibility: { sourdough: false }, retentionHours: 24, nowMs: NOW,
  });
  assert.equal(out.length, 0);
});

// ── filterVisibleLogs: retention ──────────────────────────────────────────────
test('filterVisibleLogs: a log older than the window is hidden', () => {
  const out = filterVisibleLogs([log('Focaccia', 25)], { visibility: {}, retentionHours: 24, nowMs: NOW });
  assert.equal(out.length, 0);
});

test('filterVisibleLogs: a log within the window is kept', () => {
  const out = filterVisibleLogs([log('Focaccia', 23)], { visibility: {}, retentionHours: 24, nowMs: NOW });
  assert.equal(out.length, 1);
});

test('filterVisibleLogs: 48h window keeps a 30h-old log that 24h would hide', () => {
  const old = [log('Focaccia', 30)];
  assert.equal(filterVisibleLogs(old, { visibility: {}, retentionHours: 24, nowMs: NOW }).length, 0);
  assert.equal(filterVisibleLogs(old, { visibility: {}, retentionHours: 48, nowMs: NOW }).length, 1);
});

test('filterVisibleLogs: tolerates a missing/garbage list', () => {
  assert.deepEqual(filterVisibleLogs(null, {}), []);
  assert.deepEqual(filterVisibleLogs(undefined, {}), []);
});

// ── config read helpers ───────────────────────────────────────────────────────
test('isLogVisible: defaults to true, false only when explicitly off', () => {
  assert.equal(isLogVisible({}, 'focaccia'), true);
  assert.equal(isLogVisible({ logVisibility: { focaccia: false } }, 'focaccia'), false);
  assert.equal(isLogVisible({ logVisibility: { focaccia: true } }, 'focaccia'), true);
});

test('getLogRetentionHours: defaults to 24, accepts only 24/48', () => {
  assert.equal(getLogRetentionHours({}), LOG_RETENTION_DEFAULT);
  assert.equal(getLogRetentionHours({ logRetentionHours: 48 }), 48);
  assert.equal(getLogRetentionHours({ logRetentionHours: 99 }), 24); // invalid → default
  assert.equal(getLogRetentionHours({ logRetentionHours: 'x' }), 24);
  assert.deepEqual(LOG_RETENTION_OPTIONS, [24, 48]);
});

// ── normalizeConfig fills the new fields with safe defaults ───────────────────
test('normalizeConfig: adds logVisibility (all shown) and logRetentionHours (24)', () => {
  const cfg = normalizeConfig({ clients: [] });
  assert.deepEqual(cfg.logVisibility, { focaccia: true, brioche: true, sourdough: true });
  assert.equal(cfg.logRetentionHours, 24);
});

test('normalizeConfig: preserves stored log settings', () => {
  const cfg = normalizeConfig({ clients: [], logVisibility: { focaccia: false }, logRetentionHours: 48 });
  assert.equal(cfg.logVisibility.focaccia, false);
  assert.equal(cfg.logVisibility.brioche, true); // unspecified → default shown
  assert.equal(cfg.logRetentionHours, 48);
});
