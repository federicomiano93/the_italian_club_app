// Unit tests for the pure helper in the Orders DOM module (P15). Only groupBy is
// tested here: it is pure logic (used to group ingredients by category). The el()
// helper in the same file needs a real browser document, so it is left to the
// manual smoke test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupBy } from '../js/orders/dom.js';

test('groupBy buckets items by a key, preserving order within each bucket', () => {
  const items = [
    { name: 'Flour', category: 'Dry' },
    { name: 'Milk', category: 'Fresh' },
    { name: 'Sugar', category: 'Dry' },
  ];
  assert.deepEqual(groupBy(items, 'category'), {
    Dry: [{ name: 'Flour', category: 'Dry' }, { name: 'Sugar', category: 'Dry' }],
    Fresh: [{ name: 'Milk', category: 'Fresh' }],
  });
});

test('groupBy on an empty list yields an empty object', () => {
  assert.deepEqual(groupBy([], 'category'), {});
});
