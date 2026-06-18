import { confirmDiscard } from './calculator-confirm.js';
import { recipeTotal } from './calculator-dough-math.js';

// recipeTotal now lives with the dough math; re-exported so existing importers
// (calc.js, this module) keep their import path unchanged.
export { recipeTotal };

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

// null = showing the recipe picker (Level 1); a tab name = editing that one
// recipe (Level 2). Editing one recipe at a time means a Save only ever writes
// the recipe on screen — the others are left exactly as they were.
let activeRecipe = null;
let isDirty = false;

function titleEl()  { return document.querySelector('#recipe-overlay .recipe-overlay-title'); }
function saveBtnEl() { return document.getElementById('recipe-save-btn'); }
function contentEl() { return document.getElementById('recipe-content'); }

function updateSaveBtn() {
  const btn = saveBtnEl();
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

// Level 1 — the three recipe boxes. No Save here: you cannot edit a recipe
// without first opening it (and confirming).
function renderRecipeList() {
  activeRecipe = null;
  isDirty = false;
  titleEl().textContent = 'Recipes';
  saveBtnEl().style.display = 'none';
  const content = contentEl();
  content.innerHTML = Object.keys(OVERLAY_FIELDS).map(tab =>
    `<button class="drill-item" type="button" data-recipe="${tab}">
       <span>${CARD_TITLES[tab]}</span>
       <span class="drill-chevron">&#8594;</span>
     </button>`).join('');
  content.querySelectorAll('.drill-item').forEach(btn =>
    btn.addEventListener('click', () => openRecipe(btn.dataset.recipe)));
}

// Open a recipe for editing. No confirmation on entry (the recipe is still
// protected by the save confirmation and the unsaved-changes guard on exit).
function openRecipe(tab) {
  activeRecipe = tab;
  isDirty = false;
  titleEl().textContent = CARD_TITLES[tab];
  saveBtnEl().style.display = '';
  renderRecipeForm(tab);
  updateSaveBtn();
}

// Level 2 — the ingredient amounts for one recipe, plus its live total.
function renderRecipeForm(tab) {
  const fields = OVERLAY_FIELDS[tab];
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
  contentEl().innerHTML = `<div class="recipe-card">
      ${rows}
      <div class="recipe-total-row">
        <span class="recipe-total-label">Total</span>
        <span class="recipe-total-val" id="ri-total-${tab}">${Math.round(total * 10) / 10} g</span>
      </div>
    </div>`;
  fields.forEach(f =>
    document.getElementById('ri-' + tab + '-' + f.key)
      .addEventListener('input', () => onRecipeInput(tab)));
}

export function openRecipes() {
  renderRecipeList();
  document.getElementById('recipe-overlay').classList.add('visible');
}

export function saveRecipes() {
  if (!activeRecipe) return;                 // nothing to save from the picker
  if (!confirm('Save changes to the ' + CARD_TITLES[activeRecipe] + ' recipe?')) return;
  const tab = activeRecipe;
  OVERLAY_FIELDS[tab].forEach(f => {
    RECIPES[tab][f.key] = +document.getElementById('ri-' + tab + '-' + f.key).value || 0;
  });
  localStorage.setItem('bakery-recipes', JSON.stringify(RECIPES));
  isDirty = false;
  updateSaveBtn();
  document.dispatchEvent(new CustomEvent('recipes-saved'));
}

// Contextual "back": from an open recipe go back to the picker (guarding unsaved
// edits); from the picker close the overlay, revealing the Settings hub beneath.
export function closeRecipes() {
  if (activeRecipe) {
    if (!confirmDiscard(isDirty)) return;
    renderRecipeList();
    return;
  }
  document.getElementById('recipe-overlay').classList.remove('visible');
}

// Jump straight to the home screen, guarding unsaved edits (isDirty is false on
// the picker, so it only ever prompts while a recipe is open and changed).
export function goHomeFromRecipes() {
  if (!confirmDiscard(isDirty)) return;
  window.location.href = 'index.html';
}
