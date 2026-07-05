// Unit tests for reconcileConfigWrite — the optimistic-concurrency reconciliation
// that stops a Calculator save from blindly clobbering a recipe another writer (a
// catalogue import) just added, WITHOUT breaking normal recipe deletes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileConfigWrite } from '../js/calculator-config.js';

test('no concurrent writer (revs match): recipes pass through, rev climbs', () => {
  const config = { configRev: 3, recipes: [{ id: 'focaccia' }, { id: 'brioche' }] };
  const server = { configRev: 3, recipes: [{ id: 'focaccia' }, { id: 'brioche' }] };
  const out = reconcileConfigWrite(config, server);
  assert.deepEqual(out.recipes.map(r => r.id), ['focaccia', 'brioche']);
  assert.equal(out.configRev, 4);
});

test('concurrent import preserved: a cat-* recipe added on the server survives the save', () => {
  const config = { configRev: 3, recipes: [{ id: 'focaccia' }] };            // stale (pre-import)
  const server = { configRev: 4, recipes: [{ id: 'focaccia' }, { id: 'cat-x', name: 'X' }] };
  const out = reconcileConfigWrite(config, server);
  assert.deepEqual(out.recipes.map(r => r.id), ['focaccia', 'cat-x']);       // import kept
  assert.equal(out.configRev, 5);
});

test('normal delete is NOT resurrected (no conflict): removed recipe stays removed', () => {
  const config = { configRev: 4, recipes: [{ id: 'focaccia' }] };            // user deleted brioche
  const server = { configRev: 4, recipes: [{ id: 'focaccia' }, { id: 'brioche' }] };
  const out = reconcileConfigWrite(config, server);
  assert.deepEqual(out.recipes.map(r => r.id), ['focaccia']);                // brioche stays deleted
  assert.equal(out.configRev, 5);
});

test('deleting an imported (cat-*) recipe works when there is no concurrent writer', () => {
  const config = { configRev: 5, recipes: [{ id: 'focaccia' }] };            // user deleted cat-x
  const server = { configRev: 5, recipes: [{ id: 'focaccia' }, { id: 'cat-x' }] };
  const out = reconcileConfigWrite(config, server);
  assert.deepEqual(out.recipes.map(r => r.id), ['focaccia']);                // cat-x stays deleted
});

test('first write (no server document yet): rev starts at 1, recipes unchanged', () => {
  const config = { configRev: 0, recipes: [{ id: 'focaccia' }] };
  const out = reconcileConfigWrite(config, null);
  assert.deepEqual(out.recipes.map(r => r.id), ['focaccia']);
  assert.equal(out.configRev, 1);
});

test('only imported (cat-*) recipes are preserved on conflict, not arbitrary ones', () => {
  const config = { configRev: 3, recipes: [{ id: 'focaccia' }] };
  const server = { configRev: 4, recipes: [{ id: 'focaccia' }, { id: 'my-recipe' }] };
  const out = reconcileConfigWrite(config, server);
  assert.deepEqual(out.recipes.map(r => r.id), ['focaccia']);                // non-cat not force-kept
  assert.equal(out.configRev, 5);
});

test('a cat-* already present in the save is not duplicated', () => {
  const config = { configRev: 3, recipes: [{ id: 'focaccia' }, { id: 'cat-x' }] };
  const server = { configRev: 4, recipes: [{ id: 'focaccia' }, { id: 'cat-x' }] };
  const out = reconcileConfigWrite(config, server);
  assert.deepEqual(out.recipes.map(r => r.id), ['focaccia', 'cat-x']);       // no duplicate
});
