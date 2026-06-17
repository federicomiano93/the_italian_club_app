// firebase.example.js — Firebase setup template
//
// Copy this file to js/firebase.js and replace the placeholder config values
// with your real Firebase keys (from the Firebase Console).
// js/firebase.js IS committed to Git: Firebase web API keys are public config
// (sent to every visitor's browser), not secrets. Security comes from Firestore
// Security Rules + API key restrictions, never from hiding this file.
//
// This module:
//   1. Initializes Firebase and signs the user in anonymously
//   2. Mirrors the `log` collection in real time into window.firestoreLog
//      and notifies the app via a `firestore-log-updated` event
//   3. Exports helpers to persist / remove log and daily-log entries
//
// Public API consumed by the rest of the app:
//   - saveLogToFirestore(record)      → js/log.js
//   - deleteLogFromFirestore(dough)   → js/log.js
//   - saveDailyEntry(entry)           → js/log.js
//   - watchCalculatorConfig(onChange) → js/calculator-config-store.js
//   - saveCalculatorConfig(config)    → js/calculator-config-store.js
//   - side-effect `import './firebase.js'` for init → js/app.js

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── Configuration (placeholders only — fill these in js/firebase.js) ──────────
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// ── Initialization ────────────────────────────────────────────────────────────
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Firestore Security Rules require an authenticated user (request.auth != null),
// so we sign in anonymously and only start reading once auth is ready.
signInAnonymously(auth).catch(err => {
  console.error('Anonymous sign-in failed:', err);
});

// Resolves once an authenticated user exists. Config read/write awaits this so
// it never hits Firestore before request.auth is set (rules would reject it).
const authReady = new Promise(resolve => {
  const unsub = onAuthStateChanged(auth, user => {
    if (user) { unsub(); resolve(user); }
  });
});

// ── Real-time log listener ──────────────────────────────────────────────────
// Mirrors the `log` collection into window.firestoreLog and notifies the app.
// Each document id is the lowercase dough name ('focaccia' | 'brioche' | 'sourdough')
// and holds { dough, date, time, text } — see firestore.rules.
onAuthStateChanged(auth, user => {
  if (!user) return;
  onSnapshot(
    collection(db, 'log'),
    snapshot => {
      window.firestoreLog = snapshot.docs.map(d => d.data());
      document.dispatchEvent(new CustomEvent('firestore-log-updated'));
    },
    err => { console.error('Log listener failed:', err); }
  );
});

// ── Write helpers ─────────────────────────────────────────────────────────────

// Current-session log: one document per dough type, overwritten on each confirm.
// record = { dough: 'Focaccia' | 'Brioche' | 'Sourdough', date, time, text }
export function saveLogToFirestore(record) {
  const id = record.dough.toLowerCase();
  return setDoc(doc(db, 'log', id), record)
    .catch(err => { console.error('saveLogToFirestore failed:', err); });
}

// Removes the current-session log entry for a dough type.
// dough = 'Focaccia' | 'Brioche' | 'Sourdough'
export function deleteLogFromFirestore(dough) {
  const id = dough.toLowerCase();
  return deleteDoc(doc(db, 'log', id))
    .catch(err => { console.error('deleteLogFromFirestore failed:', err); });
}

// Daily production log: one document per day (entry.date_iso, 'YYYY-MM-DD'),
// keyed by dough type so confirming one dough never overwrites the others.
// Re-confirming the same dough on the same day updates its sub-entry (merge).
// entry = buildDailyEntry(...) from js/log.js (includes entry.dough + entry.date_iso)
export function saveDailyEntry(entry) {
  const key = entry.dough.toLowerCase();
  return setDoc(
    doc(db, 'daily-logs', entry.date_iso),
    { [key]: entry },
    { merge: true }
  ).catch(err => { console.error('saveDailyEntry failed:', err); });
}

// ── Calculator configuration (single client address book) ────────────────────
// One shared document: config/calculator. Shared across the team like the log,
// under Anonymous Auth. Shape:
//   { clients: [ { id, name, products: [ { id, name, dough, weight, kind,
//                    crate: { show: bool, perBox: number } } ] } ],
//     groups:  [ { id, title, clientIds: [...] } ],
//     extraDough:      { focaccia: bool, brioche: bool, sourdough: bool },
//     divisorIncluded: { focaccia: [ids], brioche: [ids], sourdough: [ids] } }
// Each product knows its dough (focaccia|brioche|sourdough); the dough tabs are
// filtered views of `clients`. product.kind is the input widget: number|dropdown|kg.
// product.crate optionally shows a per-product "crate box" (how many crates the order
// fills) bound to the product, not its name. `groups` are saved WhatsApp order lists
// referencing clients by id. `extraDough` toggles the per-tab extra-dough box.
// `divisorIncluded` lists products kept IN each tab's divisor box (opt-in: empty = no
// product is split). Legacy
// per-tab documents are migrated on read by normalizeConfig in js/calculator-config.js.
// See firestore.rules.

// Subscribe to the config document in real time. onChange receives the raw data
// object, or null when the document does not exist yet (fresh project).
export function watchCalculatorConfig(onChange) {
  authReady.then(() => {
    onSnapshot(
      doc(db, 'config', 'calculator'),
      snap => onChange(snap.exists() ? snap.data() : null),
      err => { console.error('Config listener failed:', err); },
    );
  });
}

// Persist the whole config document (overwrite). bakery is stamped for
// forward-compatibility with a future per-bakery split, like the orders system.
export function saveCalculatorConfig(config) {
  return authReady
    .then(() => setDoc(doc(db, 'config', 'calculator'), { ...config, bakery: 'main' }))
    .catch(err => { console.error('saveCalculatorConfig failed:', err); throw err; });
}

// ── Orders system (js/orders/*) ──────────────────────────────────────────────
// The supplier-order feature has its own data layer, js/orders/firebase-orders.js,
// which reuses THIS app + anonymous auth (it imports firebaseConfig from here).
// It adds NO export here. Firestore collections it uses, every document carrying
// bakery: "main" (validated in firestore.rules):
//   - suppliers/{id}          { name, category, deliveryDays[], phone, email,
//                               notifyHoursBefore, active }
//   - ingredients/{id}        { name, supplierId, category, unit, active }
//   - drafts/current          { weekId, entries:{ id:{ qty, stock } }, updatedAt }
//   - orders-history/{weekId} { weekStart, createdAt, quantities:{id:qty}, stock:{id:qty} }
//
// ── Push notifications (Firebase Cloud Messaging) — FUTURE / server step ──────
// Client-side alerts (js/orders/notifications.js) already work while the app is
// OPEN. Pushing to staff with the app CLOSED needs the server step, deferred for
// now. When adding it:
//   1. Firebase Console → Cloud Messaging: enable it and create a Web Push
//      certificate (VAPID key pair); keep the PUBLIC vapid key for the client.
//   2. Add a service worker firebase-messaging-sw.js (background receive) that
//      initializes this firebaseConfig and uses getMessaging()/onBackgroundMessage.
//   3. Client: getToken(messaging, { vapidKey }) and store it in a Firestore
//      collection (e.g. fcm-tokens/{token} with bakery:"main") + a matching rule.
//   4. Server (Cloud Functions, Blaze plan) on a schedule: send the order-due,
//      bank-holiday and delivery-conflict messages to the stored tokens.
