// firebase-orders.js — Firestore data layer for the Orders system.
//
// Reuses the Firebase app + anonymous auth already initialized by js/firebase.js
// (imported here only for its config and init side effect). js/firebase.js is
// never modified — we import its exported firebaseConfig and attach to the same
// default app, so the Orders pages share the one anonymous session.
//
// Collections (every document carries bakery: "main", forward-compatible with a
// future per-bakery split):
//   suppliers/{id} · ingredients/{id} · drafts/{id} · orders-history/{id}

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
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Reuse the default app if firebase.js already created it; otherwise create it.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
export const db = getFirestore(app);

// Bakery id stamped on every document. Hardcoded for now; becomes dynamic when
// real authentication and per-bakery isolation land.
export const BAKERY = 'main';

// Collection names, in one place so the feature modules never hardcode strings.
export const COLLECTIONS = {
  suppliers: 'suppliers',
  ingredients: 'ingredients',
  drafts: 'drafts',
  history: 'orders-history',
};

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

// Stamp the current bakery id on a document payload.
function withBakery(data) {
  return { ...data, bakery: BAKERY };
}

// Subscribe to a collection in real time. onChange receives an array of
// documents ({ id, ...data }). Returns the unsubscribe function.
export async function watchCollection(name, onChange) {
  await authReady;
  return onSnapshot(
    collection(db, name),
    snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => console.error(`watchCollection(${name}) failed:`, err),
  );
}

// One-off read of a collection. Returns an array of { id, ...data }.
export async function getCollection(name) {
  await authReady;
  const snap = await getDocs(collection(db, name));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Create or merge a document. The bakery field is always stamped server-side
// of the client (rules also enforce bakery == 'main').
export async function saveDoc(name, id, data) {
  await authReady;
  return setDoc(doc(db, name, id), withBakery(data), { merge: true });
}

// Delete a document (only permitted by the rules for drafts).
export async function removeDoc(name, id) {
  await authReady;
  return deleteDoc(doc(db, name, id));
}

// One-off read of a single document. Returns { id, ...data } or null.
export async function getDocOnce(name, id) {
  await authReady;
  const snap = await getDoc(doc(db, name, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Subscribe to a single document in real time. onChange receives { id, ...data }
// or null when the document does not exist. Returns the unsubscribe function.
export async function watchDoc(name, id, onChange) {
  await authReady;
  return onSnapshot(
    doc(db, name, id),
    snap => onChange(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    err => console.error(`watchDoc(${name}/${id}) failed:`, err),
  );
}
