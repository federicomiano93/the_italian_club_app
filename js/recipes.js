export const RECIPE_DEFAULTS = {
  focaccia: { flourBlu:278, flourT65:278, malt:3, sugar:8, salt:11, yeast:3.6, oil:56, water1:334, water2:24 },
  brioche:  { flour:3185, yeast:127.4, water:1575 },
  sourdough:{ flourBlu:2560, flourT65:2560, flourWhole:570, water1:3800, starter:1024, malt:30, salt:124, water2:300 },
};

export let RECIPES;
(function() {
  const saved = localStorage.getItem('bakery-recipes');
  if (saved) { try { RECIPES = JSON.parse(saved); } catch(e) {} }
  if (!RECIPES) RECIPES = JSON.parse(JSON.stringify(RECIPE_DEFAULTS));
})();

export function recipeTotal(r) { return Object.values(r).reduce((s, v) => s + v, 0); }

const OVERLAY_FIELDS = {
  focaccia: [
    { key:'flourBlu',   label:'Flour uniqua blu' },
    { key:'flourT65',   label:'Flour T65' },
    { key:'malt',       label:'Malt' },
    { key:'sugar',      label:'Sugar' },
    { key:'salt',       label:'Salt' },
    { key:'yeast',      label:'Yeast' },
    { key:'oil',        label:'Oil' },
    { key:'water1',     label:'1° Water' },
    { key:'water2',     label:'2° Water' },
  ],
  brioche: [
    { key:'flour',  label:'Mella brioche pof' },
    { key:'yeast',  label:'Yeast' },
    { key:'water',  label:'1° Water' },
  ],
  sourdough: [
    { key:'flourBlu',   label:'Flour uniqua blu' },
    { key:'flourT65',   label:'Flour T65' },
    { key:'flourWhole', label:'Flour wholemeal' },
    { key:'water1',     label:'1° Water' },
    { key:'starter',    label:'Starter' },
    { key:'malt',       label:'Malt' },
    { key:'salt',       label:'Salt' },
    { key:'water2',     label:'2° Water' },
  ],
};

const CARD_TITLES = { focaccia:'Focaccia', brioche:'Brioche', sourdough:'Sourdough' };

let isDirty = false;

function updateSaveBtn() {
  const btn = document.getElementById('recipe-save-btn');
  btn.disabled = !isDirty;
  btn.classList.toggle('dirty', isDirty);
}

function onRecipeInput(tab) {
  const total = OVERLAY_FIELDS[tab].reduce(
    (s, f) => s + (+document.getElementById('ri-' + tab + '-' + f.key).value || 0), 0
  );
  document.getElementById('ri-total-' + tab).textContent = Math.round(total * 10) / 10 + ' g';
  isDirty = true;
  updateSaveBtn();
}

export function openRecipes() {
  document.getElementById('recipe-content').innerHTML =
    Object.entries(OVERLAY_FIELDS).map(([tab, fields]) => {
      const rows = fields.map(f => {
        const id = 'ri-' + tab + '-' + f.key;
        const val = parseFloat((RECIPES[tab][f.key] || 0).toFixed(1));
        return `<div class="recipe-ing-row">
          <span class="recipe-ing-name">${f.label}</span>
          <input class="recipe-ing-input" type="number" id="${id}" value="${val}" step="0.1" inputmode="decimal" data-tab="${tab}">
          <span class="recipe-unit">g</span>
        </div>`;
      }).join('');
      const total = recipeTotal(RECIPES[tab]);
      return `<div class="recipe-card">
        <div class="recipe-card-title">${CARD_TITLES[tab]}</div>
        ${rows}
        <div class="recipe-total-row">
          <span class="recipe-total-label">Total</span>
          <span class="recipe-total-val" id="ri-total-${tab}">${Math.round(total * 10) / 10} g</span>
        </div>
      </div>`;
    }).join('');

  // Attach listeners after inserting HTML
  Object.entries(OVERLAY_FIELDS).forEach(([tab, fields]) => {
    fields.forEach(f => {
      document.getElementById('ri-' + tab + '-' + f.key)
        .addEventListener('input', () => onRecipeInput(tab));
    });
  });

  isDirty = false;
  updateSaveBtn();
  document.getElementById('recipe-overlay').classList.add('visible');
}

export function saveRecipes() {
  Object.entries(OVERLAY_FIELDS).forEach(([tab, fields]) => {
    fields.forEach(f => {
      RECIPES[tab][f.key] = +document.getElementById('ri-' + tab + '-' + f.key).value || 0;
    });
  });
  localStorage.setItem('bakery-recipes', JSON.stringify(RECIPES));
  isDirty = false;
  updateSaveBtn();
  document.dispatchEvent(new CustomEvent('recipes-saved'));
}

export function closeRecipes() {
  if (isDirty) {
    if (!confirm('You have unsaved changes. Leave without saving?')) return;
  }
  isDirty = false;
  updateSaveBtn();
  document.getElementById('recipe-overlay').classList.remove('visible');
}
