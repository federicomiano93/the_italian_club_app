// catalogue-main.js — entry point / orchestrator for the Recipe catalogue page.
// Owns the view routing (list ↔ detail ↔ editor), the header controls, the shared
// confirm dialog and toast, and the live-list subscription. Feature-local only:
// imports firebaseConfig indirectly (via the data layer) and the pure Calculator
// data model only inside import-to-calculator.js — never from js/orders/.

import {
  initCatalogue, getRecipes, getUsage, bumpUsage, saveRecipe, deleteRecipe, setSyncErrorHandler,
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
  // Move focus into the new view so keyboard/screen-reader users don't drop to the
  // top of the document on every transition. The view container itself is focused
  // (not an input) to avoid popping the mobile keyboard.
  node.setAttribute('tabindex', '-1');
  try { node.focus({ preventScroll: true }); } catch (e) { /* focus is best-effort */ }
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

let confirmOpen = false;

function confirmDialog({ title = 'Confirm', message = '', okLabel = 'OK' }) {
  if (confirmOpen) return Promise.resolve(false); // guard against re-entrant opens
  confirmOpen = true;
  const backdrop = document.getElementById('catConfirm');
  document.getElementById('catConfirmTitle').textContent = title;
  document.getElementById('catConfirmText').textContent = message;
  const okBtn = document.getElementById('catConfirmOk');
  const cancelBtn = document.getElementById('catConfirmCancel');
  okBtn.textContent = okLabel;
  const prevFocus = document.activeElement; // restore on close
  backdrop.hidden = false;
  try { okBtn.focus(); } catch (e) { /* focus is best-effort */ }
  return new Promise((resolve) => {
    const cleanup = (result) => {
      confirmOpen = false;
      backdrop.hidden = true;
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onBackdrop);
      backdrop.removeEventListener('keydown', onKey);
      if (prevFocus && typeof prevFocus.focus === 'function') { try { prevFocus.focus(); } catch (e) { /* ignore */ } }
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onBackdrop = (e) => { if (e.target === backdrop) cleanup(false); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); cleanup(false); }
      else if (e.key === 'Tab') { // trap focus between the two buttons
        e.preventDefault();
        (document.activeElement === okBtn ? cancelBtn : okBtn).focus();
      }
    };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onBackdrop);
    backdrop.addEventListener('keydown', onKey);
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

// Surface background write failures (rolled back by the store) as a toast.
setSyncErrorHandler((msg) => toast(msg));

// Start the live sync; when the collection changes and the list is showing, refresh
// its cards in place (without rebuilding the search box). If the live stream dies,
// tell the user their view may be stale.
initCatalogue(
  () => { if (view === 'list' && activeList) activeList.refresh(getRecipes(), getUsage()); },
  () => toast('Live sync interrupted — recipes may be out of date.'),
);

showList();
