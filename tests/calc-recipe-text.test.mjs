// Unit tests for the Copy/WhatsApp recipe text builder (P15 — the owner cannot
// read code, so this is the safety net for the export, which used to be impossible
// to test because it scraped the rendered DOM). Now it is a pure function over the
// same [{ name, grams }] data the screen renders.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecipeText, DOUGH_TITLES } from '../js/calculator-recipe-text.js';

const SEP = '─'.repeat(22);

test('focaccia output: title, separator, lines and the "Flour uniqua blue" split', () => {
  const rows = [
    { name: 'Flour uniqua blue', grams: 1000 },
    { name: 'Yeast', grams: 4 },
  ];
  const out = buildRecipeText('focaccia', rows, 2000);
  assert.equal(out, [
    'FOCACCIA DOUGH  2.0 kg',
    SEP,
    'Flour uniqua',
    'blue:       1000 g',
    'Yeast:         4 g',
  ].join('\n'));
});

test('"Flour uniqua blue" becomes two lines; a normal ingredient stays one line', () => {
  const out = buildRecipeText('sourdough', [{ name: 'Flour uniqua blue', grams: 500 }], 500);
  const lines = out.split('\n');
  // title + separator + bare label + "blue:" line = 4
  assert.equal(lines.length, 4);
  assert.equal(lines[2], 'Flour uniqua');
  assert.match(lines[3], /^blue:\s+500 g$/);

  const single = buildRecipeText('brioche', [{ name: 'Water', grams: 1575 }], 1575);
  assert.equal(single.split('\n').length, 3); // title + separator + one line
});

test('grams are rounded the same way the screen rounds them', () => {
  const out = buildRecipeText('brioche', [{ name: 'Yeast', grams: 127.4 }], 3000);
  assert.match(out, /Yeast:\s+127 g/);
  const up = buildRecipeText('brioche', [{ name: 'Yeast', grams: 4.5 }], 3000);
  assert.match(up, /Yeast:\s+5 g/);
});

test('total is shown in kg with one decimal', () => {
  assert.match(buildRecipeText('focaccia', [], 2500), /^FOCACCIA DOUGH {2}2\.5 kg/);
  assert.match(buildRecipeText('focaccia', [], 0), /^FOCACCIA DOUGH {2}0\.0 kg/);
});

test('each dough uses its own title', () => {
  assert.match(buildRecipeText('focaccia', [], 1000), /^FOCACCIA DOUGH/);
  assert.match(buildRecipeText('brioche', [], 1000), /^BRIOCHE DOUGH/);
  assert.match(buildRecipeText('sourdough', [], 1000), /^SOURDOUGH BREAD/);
  assert.deepEqual(Object.keys(DOUGH_TITLES).sort(), ['brioche', 'focaccia', 'sourdough']);
});

test('an unknown tab returns an empty string', () => {
  assert.equal(buildRecipeText('panettone', [{ name: 'X', grams: 1 }], 100), '');
});
