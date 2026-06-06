import { RECIPES, recipeTotal } from './recipes.js';

export function showResult(id) { document.getElementById(id).classList.add('visible'); }
export function hideResult(id) { document.getElementById(id).classList.remove('visible'); }

function ing(name, grams) {
  return `<div class="ing-row"><span class="ing-name">${name}</span><span class="ing-val">${Math.round(grams)} g</span></div>`;
}

// Rounds an array of gram values so their displayed integers sum exactly to Math.round(total).
// Assigns any ±1-2g rounding residual to the largest ingredient.
function fixRounding(amounts, total) {
  const rounded = amounts.map(Math.round);
  const diff = Math.round(total) - rounded.reduce((a, b) => a + b, 0);
  if (diff !== 0) {
    const maxIdx = rounded.indexOf(Math.max(...rounded));
    rounded[maxIdx] += diff;
  }
  return rounded;
}

export function calcFocaccia() {
  const pizze    = +document.getElementById('f-pizze').value || 0;
  const focacce  = +document.getElementById('f-focacce').value || 0;
  const ciabatta = +document.getElementById('f-ciabatta').value || 0;
  const tray     = +document.getElementById('f-trayfocaccia').value || 0;
  const panini   = +document.getElementById('f-panini').value || 0;
  const yeastPct = +document.getElementById('f-yeast-pct').value || 0.65;
  const kg_f     = +document.getElementById('f-kg').value || 0;

  const target = pizze*201 + focacce*181 + ciabatta*151 + tray*1800 + panini*131 + kg_f*1000;
  if (target === 0) { hideResult('focaccia-result'); document.getElementById('f-confirm-btn').classList.remove('visible'); return; }

  const R = RECIPES.focaccia;
  const base_total = recipeTotal(R);
  const scale = target / base_total;
  const total_flour = R.flourBlu + R.flourT65;
  const yeast = total_flour * scale * (yeastPct / 100);
  const remaining = target - yeast;
  const non_yeast_base = base_total - R.yeast;

  const amounts = [
    R.flourBlu * remaining / non_yeast_base,
    R.flourT65 * remaining / non_yeast_base,
    R.malt     * remaining / non_yeast_base,
    R.sugar    * remaining / non_yeast_base,
    R.salt     * remaining / non_yeast_base,
    yeast,
    R.oil      * remaining / non_yeast_base,
    R.water1   * remaining / non_yeast_base,
    R.water2   * remaining / non_yeast_base,
  ];
  const [flu, flt, mlt, sug, slt, yst, oyl, w1, w2] = fixRounding(amounts, target);

  document.getElementById('f-ingredients').innerHTML =
    ing('Flour uniqua blue', flu) + ing('Flour T65', flt) +
    ing('Malt', mlt) + ing('Sugar', sug) + ing('Salt', slt) +
    ing('Yeast', yst) + ing('Oil', oyl) +
    ing('1° Water', w1) + ing('2° Water', w2);

  document.getElementById('f-yeast-display').textContent = yeastPct;
  document.getElementById('f-badge').textContent = Math.round(target) + ' g raw';
  document.getElementById('f-total').textContent  = Math.round(target);
  const paniniDough = panini * 131;
  document.getElementById('f-panini-total').textContent = Math.round(paniniDough);
  const paniniDiv = +document.getElementById('f-panini-div').value || 0;
  document.getElementById('f-panini-split').textContent = paniniDiv > 0 ? Math.round(paniniDough / paniniDiv) : 0;
  const fbtn = document.getElementById('f-confirm-btn');
  fbtn.textContent = '✓ Confirm';
  fbtn.dataset.saved = '';
  fbtn.dataset.mode = '';
  fbtn.disabled = false;
  fbtn.classList.add('visible');
  hideResult('focaccia-result');
}

export function calcBrioche() {
  const burgerbuns = +document.getElementById('b-burgerbuns').value || 0;
  const subrolls   = +document.getElementById('b-subrolls').value || 0;
  const bun        = +document.getElementById('b-bun').value || 0;
  const rolls      = +document.getElementById('b-rolls').value || 0;
  const yeastPct   = +document.getElementById('b-yeast-pct').value || 4;
  const kg_b       = +document.getElementById('b-kg').value || 0;

  const target = burgerbuns*81 + subrolls*121 + bun*71 + rolls*71 + kg_b*1000;
  if (target === 0) { hideResult('brioche-result'); document.getElementById('b-confirm-btn').classList.remove('visible'); return; }

  const R = RECIPES.brioche;
  const yeastBase       = R.yeast * (yeastPct / 4);
  const provisionalTotal = R.flour + yeastBase + R.water;
  const factor = target / provisionalTotal;

  const flour = R.flour * factor;
  const yeast = yeastBase * factor;
  const water = R.water * factor;
  const raw   = target;

  const [fl, ys, wt] = fixRounding([flour, yeast, water], raw);

  document.getElementById('b-ingredients').innerHTML =
    ing('Mella brioche pof', fl) + ing('Yeast', ys) + ing('Water', wt);

  document.getElementById('b-yeast-display').textContent = yeastPct;
  document.getElementById('b-badge').textContent = Math.round(raw) + ' g raw';
  document.getElementById('b-total').textContent  = Math.round(raw);
  document.getElementById('b-dough-display').textContent = Math.round(raw);
  const bDoughDiv = +document.getElementById('b-dough-div').value || 0;
  document.getElementById('b-dough-split').textContent = bDoughDiv > 0 ? Math.round(raw / bDoughDiv) : 0;
  const bbtn = document.getElementById('b-confirm-btn');
  bbtn.textContent = '✓ Confirm';
  bbtn.dataset.saved = '';
  bbtn.dataset.mode = '';
  bbtn.disabled = false;
  bbtn.classList.add('visible');
  hideResult('brioche-result');
}

export function calcSourdough() {
  const loaves     = +document.getElementById('s-loaves').value || 0;
  const weight     = +document.getElementById('s-weight').value || 905;
  const starterPct = +document.getElementById('s-starter-pct').value || 18;

  if (loaves === 0) { hideResult('sourdough-result'); document.getElementById('s-confirm-btn').classList.remove('visible'); return; }

  const target = loaves * weight;
  const R = RECIPES.sourdough;
  const starterBase      = R.starter * (starterPct / 18);
  const provisionalTotal = R.flourBlu + R.flourT65 + R.flourWhole + R.water1 + starterBase + R.malt + R.salt + R.water2;
  const factor = target / provisionalTotal;

  const flourBlu   = R.flourBlu   * factor;
  const flourT65   = R.flourT65   * factor;
  const flourWhole = R.flourWhole * factor;
  const water1     = R.water1     * factor;
  const starter    = starterBase  * factor;
  const malt       = R.malt       * factor;
  const salt       = R.salt       * factor;
  const water2     = R.water2     * factor;
  const raw = target;

  const [flu, flt, flw, w1, st, mlt, slt, w2] = fixRounding(
    [flourBlu, flourT65, flourWhole, water1, starter, malt, salt, water2], raw
  );

  document.getElementById('s-ingredients').innerHTML =
    ing('Flour uniqua blue', flu) + ing('Flour T65', flt) +
    ing('Flour wholemeal', flw) + ing('1° Water', w1) +
    ing('Starter', st) +
    ing('Malt', mlt) + ing('Salt', slt) + ing('2° Water', w2);

  document.getElementById('s-badge').textContent  = Math.round(raw) + ' g raw';
  document.getElementById('s-total').textContent  = Math.round(raw);
  document.getElementById('s-dough-display').textContent = Math.round(raw);
  const sDoughDiv = +document.getElementById('s-dough-div').value || 0;
  document.getElementById('s-dough-split').textContent = sDoughDiv > 0 ? Math.round(raw / sDoughDiv) : 0;
  const sbtn = document.getElementById('s-confirm-btn');
  sbtn.textContent = '✓ Confirm';
  sbtn.dataset.saved = '';
  sbtn.dataset.mode = '';
  sbtn.disabled = false;
  sbtn.classList.add('visible');
  hideResult('sourdough-result');
}

function buildRecipeText(tab) {
  const SEP = '─'.repeat(25);

  function fmtLine(name, val) {
    return name.padEnd(20) + String(val).padStart(5) + ' g';
  }

  function readIngredients(prefix, pctName, pctVal) {
    const lines = [];
    document.querySelectorAll('#' + prefix + '-ingredients .ing-row').forEach(row => {
      let name = row.querySelector('.ing-name').textContent.trim();
      const val = parseInt(row.querySelector('.ing-val').textContent, 10);
      if (pctName && name === pctName) name += ' (' + pctVal + '%)';
      lines.push(fmtLine(name, val));
    });
    return lines;
  }

  if (tab === 'focaccia') {
    const total  = parseInt(document.getElementById('f-total').textContent, 10);
    const panini = parseInt(document.getElementById('f-panini-total').textContent, 10);
    const pct    = document.getElementById('f-yeast-display').textContent;
    const lines  = [
      'FOCACCIA DOUGH  ' + (total / 1000).toFixed(1) + ' kg',
      ...readIngredients('f', 'Yeast', pct),
      fmtLine('Total dough', total),
    ];
    if (panini > 0) { lines.push(SEP); lines.push(fmtLine('Panini', panini)); }
    return lines.join('\n');

  } else if (tab === 'brioche') {
    const total = parseInt(document.getElementById('b-total').textContent, 10);
    const pct   = document.getElementById('b-yeast-display').textContent;
    return [
      'BRIOCHE DOUGH  ' + (total / 1000).toFixed(1) + ' kg',
      ...readIngredients('b', 'Yeast', pct),
      fmtLine('Total dough', total),
    ].join('\n');

  } else if (tab === 'sourdough') {
    const total = parseInt(document.getElementById('s-total').textContent, 10);
    const pct   = document.getElementById('s-starter-pct').value;
    return [
      'SOURDOUGH BREAD  ' + (total / 1000).toFixed(1) + ' kg',
      ...readIngredients('s', 'Starter', pct),
      fmtLine('Total dough', total),
    ].join('\n');
  }
  return '';
}

export function copyRecipe(tab) {
  const btn = document.getElementById(tab[0] + '-copy-btn');
  navigator.clipboard.writeText(buildRecipeText(tab)).then(() => {
    btn.textContent = 'Copied ✓';
    setTimeout(() => { btn.textContent = 'Copy recipe'; }, 2000);
  });
}

export function shareRecipeWA(tab) {
  window.open('https://wa.me/?text=' + encodeURIComponent(buildRecipeText(tab)), '_blank');
}
