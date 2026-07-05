// firebase-catalogue.js — Firestore data layer for the Recipe catalogue.
//
// Reuses the Firebase app + anonymous auth already initialized by js/firebase.js
// by importing ONLY its exported firebaseConfig (the single sanctioned cross-file
// bridge) and attaching to the same default app — so the catalogue shares the one
// anonymous session and inherits the localhost emulator switch + App Check.
// js/firebase.js is never modified.
//
// Collection: recipes/{id} — one document per recipe (scales to 500+). Every
// document carries bakery: "main" (rules enforce it), forward-compatible with a
// future per-bakery split.

import { firebaseConfig } from '../firebase.js';
import {
  getApps,
  getApp,
  initializeApp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  onSnapshot,
  runTransaction,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Reuse the default app if firebase.js already created it; otherwise create it.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
export const db = getFirestore(app);

export const BAKERY = 'main';
const RECIPES = 'recipes';

// Resolves once anonymous auth is ready. Firestore rules require
// request.auth != null, so every read/write awaits this first.
export const authReady = new Promise(resolve => {
  const unsub = onAuthStateChanged(auth, user => {
    if (user) {
      unsub();
      resolve(user);
    }
  });
});

// Stamp the bakery id on a document payload (usageCount is local-only and never
// written here — it lives in localStorage per device).
function withBakery(data) {
  return { ...data, bakery: BAKERY };
}

// Subscribe to the whole recipes collection in real time. onChange receives an
// array of { id, ...data }. Returns the unsubscribe function. Attach this only
// when the catalogue page is open (not at app boot) to avoid an unbounded read.
export async function watchRecipes(onChange) {
  await authReady;
  return onSnapshot(
    collection(db, RECIPES),
    snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => console.error('watchRecipes failed:', err),
  );
}

// One-off read of the recipes collection. Returns an array of { id, ...data }.
export async function getRecipesOnce() {
  await authReady;
  const snap = await getDocs(collection(db, RECIPES));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Create or merge a recipe document.
export async function saveRecipeDoc(id, data) {
  await authReady;
  return setDoc(doc(db, RECIPES, id), withBakery(data), { merge: true });
}

// Create a recipe with an auto-generated id. Returns the new id.
export async function createRecipeDoc(data) {
  await authReady;
  const ref = await addDoc(collection(db, RECIPES), withBakery(data));
  return ref.id;
}

// Delete a recipe document.
export async function removeRecipeDoc(id) {
  await authReady;
  return deleteDoc(doc(db, RECIPES, id));
}

// Atomically read-modify-write the shared config/calculator document. applyFn
// receives the current raw config data (or null when the doc doesn't exist yet)
// and must return the full new document to write. Used ONLY by the Calculator
// import so a whole-document overwrite can't clobber a concurrent Calculator save
// (runTransaction re-reads and retries on conflict). Returns whatever applyFn built.
export async function updateConfigInTransaction(applyFn) {
  await authReady;
  const ref = doc(db, 'config', 'calculator');
  let built;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    built = applyFn(snap.exists() ? snap.data() : null);
    tx.set(ref, built);
  });
  return built;
}
