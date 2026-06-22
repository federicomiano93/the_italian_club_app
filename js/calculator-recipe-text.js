// calculator-recipe-text.js — PURE text builder for the Copy/WhatsApp recipe
// export (no DOM, no Firebase, no storage), so it is unit-testable in isolation
// (P15 — the owner cannot read code). It takes the same ingredient data that
// feeds the on-screen render — a [{ name, grams }] list plus the total grams —
// so the export no longer re-reads the rendered DOM markup.

// Dough title shown on the first line of the exported recipe, per tab.
export const DOUGH_TITLES = {
  focaccia: 'FOCACCIA DOUGH',
  brioche: 'BRIOCHE DOUGH',
  sourdough: 'SOURDOUGH BREAD',
};

// Plain ASCII divider: the box-drawing character used before (U+2500) renders as
// a "missing glyph" box on some phone/WhatsApp fonts.
const SEP = '-'.repeat(22);

// One aligned "name:   value g" line, padded exactly as the old export did.
function fmtLine(name, val) {
  return (name + ':').padEnd(11) + String(val).padStart(5) + ' g';
}

// One ingredient → its export line(s). "Flour uniqua blue" is split onto two
// lines ("Flour uniqua" as a bare label, then "blue:" with the value) so the
// long name does not overflow — preserved exactly from the original export.
function formatIngredient(name, val) {
  if (name === 'Flour uniqua blue') {
    return ['Flour uniqua', fmtLine('blue', val)];
  }
  return [fmtLine(name, val)];
}

// Build the full recipe text for a dough tab from its ingredient rows and total.
// rows: [{ name, grams }]. totalG: integer grams. Returns '' for an unknown tab.
export function buildRecipeText(tab, rows, totalG) {
  const title = DOUGH_TITLES[tab];
  if (!title) return '';
  return [
    title + '  ' + (totalG / 1000).toFixed(1) + ' kg',
    SEP,
    ...rows.flatMap(r => formatIngredient(r.name, Math.round(r.grams))),
  ].join('\n');
}
