// catalogue-main.js — entry point / orchestrator for the Recipe catalogue page.
// Owns the view routing (list ↔ detail ↔ editor), the header controls, the shared
// confirm dialog and toast, and the live-list subscription. Feature-local only:
// imports firebaseConfig indirectly (via the data layer) and the pure Calculator
// data model only inside import-to-calculator.js — never from js/orders/.

import {
  initCatalogue, getRecipes, getUsage, bumpUsage, saveRecipe, deleteRecipe,
} from './catalogue-store.js';
import { renderList } from './catalogue-list.js';
import { renderDetail } from './catalogue-detail.js';
import { renderEditor } from './catalogue-editor.js';
import { importRecipeIntoCalculator } from './import-to-calculator.js';

const screen = document.getElementById('catScreen');
const titleEl = document.getElementById('catTitle');
const subEl = document.getElementById('catSub');
const homeBtn = document.getElementById('catHome');
const backBtn = document.getElementById('catBack');
const addBtn = document.getElementById('catAdd');
const editBtn = document.getElementById('catEdit');

let view = 'list';        // 'list' | 'detail' | 'editor'
let searchQuery = '';
let activeList = null;     // { root, refresh } while the list is shown
let currentRecipe = null;  // the recipe shown in detail (for the header Edit button)
let leaveGuard = null;     // async () => boolean; blocks Back when there are unsaved edits

// ── Header + view helpers ───────────────────────────────────────────────────────

function setHeader({ title, sub, back, add, edit = false }) {
  titleEl.textContent = title;
  subEl.textContent = sub;
  homeBtn.hidden = back;   // Home shows only on the list; Back replaces it elsewhere
  backBtn.hidden = !back;
  addBtn.hidden = !add;
  editBtn.hidden = !edit;
}

function swap(node) {
  screen.replaceChildren(node);
  screen.scrollTop = 0;
}

function showList() {
  view = 'list';
  leaveGuard = null;
  setHeader({ title: 'Recipes', sub: 'Recipe catalogue', back: false, add: true });
  activeList = renderList({
    recipes: getRecipes(),
    usageMap: getUsage(),
    initialQuery: searchQuery,
    onQueryChange: (q) => { searchQuery = q; },
    onOpen: openDetail,
  });
  swap(activeList.root);
}

function openDetail(recipe) {
  view = 'detail';
  activeList = null;
  currentRecipe = recipe;
  leaveGuard = null;
  bumpUsage(recipe.id);
  setHeader({ title: recipe.name || 'Recipe', sub: 'Recipe', back: true, add: false, edit: true });
  swap(renderDetail({ recipe, app }));
}

function openEditor(recipe) {
  view = 'editor';
  activeList = null;
  setHeader({
    title: recipe ? 'Edit recipe' : 'New recipe',
    sub: 'Recipe catalogue', back: true, add: false,
  });
  swap(renderEditor({ recipe, allRecipes: getRecipes(), app }));
}

async function handleBack() {
  if (leaveGuard) {
    const ok = await leaveGuard();
    if (!ok) return;
  }
  leaveGuard = null;
  showList();
}

// ── Shared confirm dialog (resolves true/false) ─────────────────────────────────

function confirmDialog({ title = 'Confirm', message = '', okLabel = 'OK' }) {
  const backdrop = document.getElementById('catConfirm');
  document.getElementById('catConfirmTitle').textContent = title;
  document.getElementById('catConfirmText').textContent = message;
  const okBtn = document.getElementById('catConfirmOk');
  const cancelBtn = document.getElementById('catConfirmCancel');
  okBtn.textContent = okLabel;
  backdrop.hidden = false;
  return new Promise((resolve) => {
    const cleanup = () => {
      backdrop.hidden = true;
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onBackdrop);
    };
    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    const onBackdrop = (e) => { if (e.target === backdrop) { cleanup(); resolve(false); } };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onBackdrop);
  });
}

function toast(msg) {
  const t = document.getElementById('catToast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2600);
}

// ── The app object handed to the detail/editor views ────────────────────────────

const app = {
  confirm: confirmDialog,
  toast,
  showList,
  openEditor,
  saveRecipe,
  deleteRecipe,
  bumpUsage,
  setLeaveGuard: (fn) => { leaveGuard = fn; },
  async importRecipe(recipe) {
    const ok = await confirmDialog({
      title: 'Import into Calculator?',
      message: `Copy "${recipe.name}" into the Calculator? You can then tweak it there without changing the catalogue.`,
      okLabel: 'Import',
    });
    if (!ok) return;
    try {
      const { action } = await importRecipeIntoCalculator(recipe);
      bumpUsage(recipe.id);
      toast(action === 'updated'
        ? `"${recipe.name}" updated in the Calculator.`
        : `"${recipe.name}" added to the Calculator.`);
    } catch (err) {
      console.error('Import into Calculator failed:', err);
      toast('Import failed — check your connection and try again.');
    }
  },
};

// ── Wire up ─────────────────────────────────────────────────────────────────────

backBtn.addEventListener('click', handleBack);
addBtn.addEventListener('click', () => openEditor(null));
editBtn.addEventListener('click', () => { if (currentRecipe) openEditor(currentRecipe); });

// Start the live sync; when the collection changes and the list is showing, refresh
// its cards in place (without rebuilding the search box).
initCatalogue(() => {
  if (view === 'list' && activeList) activeList.refresh(getRecipes(), getUsage());
});

showList();
