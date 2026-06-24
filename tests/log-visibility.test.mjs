// Unit tests for the Log display filters (P15): the per-dough visibility + retention
// window that decide what the app's Log LIST shows. These never delete data — they
// only filter the list — so the safety net here is "the right logs are shown/hidden".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterVisibleLogs } from '../js/log-model.js';
import {
  isLogVisible, getLogRetentionHours, getLogRetentionForDough, normalizeConfig,
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

// ── Per-dough retention (each dough chooses its own 24/48h) ───────────────────
test('getLogRetentionForDough: reads the per-dough value', () => {
  const cfg = { logRetentionByDough: { focaccia: 48, brioche: 24, sourdough: 48 } };
  assert.equal(getLogRetentionForDough(cfg, 'focaccia'), 48);
  assert.equal(getLogRetentionForDough(cfg, 'brioche'), 24);
});

test('getLogRetentionForDough: falls back to the legacy global, then the default', () => {
  assert.equal(getLogRetentionForDough({ logRetentionHours: 48 }, 'focaccia'), 48); // legacy global
  assert.equal(getLogRetentionForDough({}, 'focaccia'), LOG_RETENTION_DEFAULT);     // nothing set
  assert.equal(getLogRetentionForDough({ logRetentionByDough: { focaccia: 99 } }, 'focaccia'), 24); // invalid → default
});

test('filterVisibleLogs: a per-dough retention map applies the right window to each dough', () => {
  const logs = [log('Focaccia', 30), log('Brioche', 30)];
  const out = filterVisibleLogs(logs, {
    visibility: {},
    retentionHours: { focaccia: 48, brioche: 24 }, // focaccia keeps 30h, brioche hides it
    nowMs: NOW,
  });
  assert.deepEqual(out.map(l => l.dough), ['Focaccia']);
});

test('normalizeConfig: adds per-dough retention, migrating from the legacy global', () => {
  const cfg = normalizeConfig({ clients: [], logRetentionHours: 48 });
  assert.deepEqual(cfg.logRetentionByDough, { focaccia: 48, brioche: 48, sourdough: 48 });
});

test('normalizeConfig: keeps explicit per-dough retention over the legacy global', () => {
  const cfg = normalizeConfig({ clients: [], logRetentionHours: 24, logRetentionByDough: { focaccia: 48 } });
  assert.equal(cfg.logRetentionByDough.focaccia, 48);
  assert.equal(cfg.logRetentionByDough.brioche, 24); // unspecified → legacy global fallback
});
