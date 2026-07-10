// catalogue-editor.js — add / edit / delete a catalogue recipe.
//
// Clones the safe editing pattern from js/recipes.js: work on a COPY, explicit
// confirm-gated Save, required-field validation before saving (jump + highlight),
// low-key Delete with a confirm, discard protection for unsaved edits, and an
// ingredient-name autocomplete built from the other recipes. Persists per document
// to recipes/{id} via the store (not into config).

import { el } from './dom.js';
import { findInvalidRecipe, unitOf, CATALOGUE_UNITS } from './catalogue-model.js';

const TRASH_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';

export function renderEditor({ recipe, allRecipes, app }) {
  // Working copy — nothing touches the stored recipe until Save.
  const working = recipe
    ? { id: recipe.id, name: recipe.name, ingredients: recipe.ingredients.map(i => ({ label: i.label, grams: i.grams, unit: unitOf(i) })) }
    : { id: null, name: '', ingredients: [{ label: '', grams: '', unit: 'g' }] };

  let dirty = false;
  let showErrors = false;
  let busy = false; // guards against re-entrant Save/Delete while a confirm is open
  const markDirty = () => { dirty = true; };

  // Autocomplete pool: distinct ingredient names across the catalogue.
  const names = new Set();
  for (const r of allRecipes) {
    for (const ing of (r.ingredients || [])) {
      const n = String(ing.label || '').trim();
      if (n) names.add(n);
    }
  }
  const datalist = el('datalist', { id: 'cat-ingredient-names' },
    [...names].sort((a, b) => a.localeCompare(b)).map(n => el('option', { value: n })));

  const nameInput = el('input', {
    class: 'cat-name-input', type: 'text', placeholder: 'Recipe name', value: working.name,
    'aria-label': 'Recipe name',
    oninput: (e) => { working.name = e.target.value; markDirty(); if (showErrors) validateUI(); },
  });

  const rowsContainer = el('div', { class: 'cat-ing-editrows' });

  function renderIngredientRows() {
    rowsContainer.replaceChildren();
    working.ingredients.forEach((ing, idx) => {
      const labelInput = el('input', {
        class: 'cat-lbl', type: 'text', placeholder: 'Ingredient', value: ing.label,
        list: 'cat-ingredient-names', 'aria-label': 'Ingredient name',
        oninput: (e) => { ing.label = e.target.value; markDirty(); if (showErrors) validateUI(); },
      });
      const gramsInput = el('input', {
        class: 'cat-grm', type: 'number', min: '0', step: 'any', inputmode: 'decimal',
        placeholder: '0', value: ing.grams === '' || ing.grams === undefined ? '' : ing.grams,
        'aria-label': 'Amount',
        oninput: (e) => { ing.grams = e.target.value; markDirty(); },
      });
      // Per-ingredient unit (g by default). Reuses the model's whitelist so the
      // editor and the scaling/import logic can never drift apart.
      const unitSelect = el('select', {
        class: 'cat-unit', 'aria-label': 'Unit',
        onchange: (e) => { ing.unit = e.target.value; markDirty(); },
      }, CATALOGUE_UNITS.map(u => el('option', { value: u }, u)));
      unitSelect.value = unitOf(ing);
      const delIcon = el('button', {
        class: 'cat-del-icon', type: 'button', 'aria-label': 'Remove ingredient', icon: TRASH_SVG,
        onclick: () => {
          working.ingredients.splice(idx, 1);
          if (!working.ingredients.length) working.ingredients.push({ label: '', grams: '', unit: 'g' });
          markDirty();
          renderIngredientRows();
          if (showErrors) validateUI();
        },
      });
      rowsContainer.appendChild(el('div', { class: 'cat-ing-editrow' }, [labelInput, gramsInput, unitSelect, delIcon]));
    });
  }

  // Highlight the empty required fields (name, and every ingredient missing a label).
  function validateUI() {
    nameInput.classList.toggle('cat-invalid', showErrors && !String(working.name || '').trim());
    const labelInputs = rowsContainer.querySelectorAll('.cat-lbl');
    working.ingredients.forEach((ing, i) => {
      if (labelInputs[i]) {
        labelInputs[i].classList.toggle('cat-invalid', showErrors && !String(ing.label || '').trim());
      }
    });
  }

  // Trim labels, coerce grams to non-negative numbers, drop rows with no name.
  function cleanWorking() {
    return {
      id: working.id,
      name: String(working.name || '').trim(),
      ingredients: working.ingredients
        .map(i => ({ label: String(i.label || '').trim(), grams: Math.max(0, Number(i.grams) || 0), unit: unitOf(i) }))
        .filter(i => i.label),
    };
  }

  async function onSave() {
    if (busy) return;
    const clean = cleanWorking();
    const problem = findInvalidRecipe(clean);
    if (problem) {
      showErrors = true;
      renderIngredientRows();
      validateUI();
      if (problem === 'name') nameInput.focus();
      app.toast(
        problem === 'name' ? 'Please enter a recipe name.'
          : problem === 'weight' ? 'Enter an amount for at least one ingredient.'
            : 'Add at least one ingredient with a name.',
      );
      return;
    }
    busy = true;
    const ok = await app.confirm({ title: 'Save recipe?', message: 'Save these changes?', okLabel: 'Save' });
    if (!ok) { busy = false; return; }
    dirty = false;
    // Local-first: the store updates the list instantly and syncs in the background;
    // a rejected write is rolled back and surfaced by the store (no freeze here).
    app.saveRecipe(clean);
    app.toast(recipe ? 'Recipe saved.' : 'Recipe added.');
    app.showList();
  }

  async function onDelete() {
    if (busy) return;
    busy = true;
    // Route through the shared guard so the editor and the detail view share the
    // same confirm + Calculator-link warning. It deletes and navigates on success.
    const done = await app.confirmAndDelete(recipe);
    if (done) dirty = false;   // deleted + navigated away
    else busy = false;         // cancelled — stay in the editor
  }

  // Discard protection: Back with unsaved edits asks first.
  app.setLeaveGuard(async () => {
    if (!dirty) return true;
    return app.confirm({ title: 'Discard changes?', message: 'You have unsaved changes. Discard them?', okLabel: 'Discard' });
  });

  const addRowBtn = el('button', {
    class: 'cat-add-row', type: 'button', text: '+ Add ingredient',
    onclick: () => { working.ingredients.push({ label: '', grams: '', unit: 'g' }); markDirty(); renderIngredientRows(); if (showErrors) validateUI(); },
  });

  const actions = el('div', { class: 'cat-editor-actions' }, [
    el('button', { class: 'cat-save-btn', type: 'button', text: 'Save', onclick: onSave }),
    recipe ? el('button', { class: 'cat-del-btn', type: 'button', onclick: onDelete }, [
      el('span', { icon: TRASH_SVG, 'aria-hidden': 'true' }),
      'Delete',
    ]) : null,
  ]);

  renderIngredientRows();

  return el('div', { class: 'cat-view cat-editor' }, [
    datalist,
    el('label', { text: 'Recipe name' }),
    nameInput,
    el('label', { text: 'Ingredients' }),
    rowsContainer,
    addRowBtn,
    actions,
  ]);
}
