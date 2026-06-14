# Bakery Calculator — PWA

## Files
```
├── index.html          ← HTML structure only
├── style.css           ← all CSS
├── js/
│   ├── app.js          ← entry point: service worker, tab switching, event listeners, localStorage
│   ├── firebase.example.js ← template for firebase.js (placeholders only, safe to commit)
│   ├── firebase.js     ← Firebase init + Firestore (save/delete/sync log + daily-logs) — gitignored, real keys
│   ├── recipes.js      ← recipe data (RECIPES) + recipe overlay UI
│   ├── calc.js         ← calcFocaccia, calcBrioche, calcSourdough, copyRecipe, shareRecipeWA
│   ├── log.js          ← production log: save, render, delete, daily CSV entry
│   └── whatsapp.js     ← Duke Street Market order modal + WhatsApp send
├── sw.js               ← service worker (offline cache + auto-update)
├── manifest.json       ← PWA config
├── firestore.rules     ← Firestore security rules
├── firebase.json       ← Firebase CLI config
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

## Setup (first run / after clone)
`js/firebase.js` holds the real Firebase keys and is gitignored, so it is
NOT present after cloning. Recreate it from the template:

1. Copy `js/firebase.example.js` to `js/firebase.js`
2. Replace the placeholder values in `firebaseConfig` with the real keys
   from the Firebase Console (Project settings → Your apps)
3. Leave the rest of the file unchanged

`js/firebase.example.js` is a complete, working template (safe to commit):
it contains the full Firebase setup — app initialization, anonymous auth,
the real-time `log` listener (populates `window.firestoreLog` and dispatches
the `firestore-log-updated` event), and the `saveLogToFirestore` /
`deleteLogFromFirestore` / `saveDailyEntry` exports. Only the `firebaseConfig`
values are placeholders.

Local testing needs a local server (service worker and Firebase do not work
from `file://`):
```
npx http-server . -p 8765
```
then open http://localhost:8765/

## Deploy
Hosted on GitHub Pages:
https://federicomiano93.github.io/Bakery_calculator/

Updates are deployed automatically on every push to the main branch.

## Install on iPhone
1. Open the link in Safari (must be Safari, not Chrome)
2. Tap the Share button (square with arrow)
3. Tap "Add to Home Screen"
4. Tap "Add"
5. Done — the app appears on your home screen

## Install on Android
1. Open the link in Chrome
2. Tap the three dots menu
3. Tap "Add to Home screen" or "Install app"
4. Confirm

## Update the app
1. Edit the relevant file in js/ or style.css
2. Bump the cache version in sw.js (CACHE_NAME = 'bakery-vXX')
3. Push to GitHub — the live site updates automatically
4. All installed users see the update next time they open the app
   (a banner appears at the top saying "New version available")

## Works offline
Once installed, the app works without internet connection.
The service worker uses a cache-first strategy with background update (stale-while-revalidate):
it serves the cached version immediately on every load (no white screen on poor connections),
then fetches from the network in background to keep the cache fresh.

## Focaccia tab

### Ciabatta (Bone&Block)
- Quantity is selected via a dropdown: 0 / 20 / 40 / 60 / 80 / 100 pz
- Rule: 20 ciabatta = 1 box = 3000g of dough
- After confirming, the result card shows a "Ciabatta" box with the number of boxes
  and "3000g each box"

### Confirm / Edit flow
- After clicking **Confirm**, the recipe result stays visible on screen
- If you change quantities, the recipe updates in real-time without saving to the log again
- Clicking **Edit** asks for confirmation before hiding the result and returning to edit mode
- If all quantities are cleared, the result hides automatically and the button resets

## Production Log

### Current session log (Log tab)
Each Confirm saves the latest entry for that dough type to:
- `localStorage` (offline backup)
- Firestore collection `log/{dough}` (synced across devices)

Only the most recent confirmation per dough type is kept in the Log tab display.

### Daily production log (Firestore)
Every Confirm also writes a structured entry to:
- Firestore collection `daily-logs/{YYYY-MM-DD}`

Each day is a single document. Each dough type is a field within that document.
Re-confirming (after Edit) overwrites only that dough's field for the day — other doughs are untouched.

Document structure:
```
daily-logs/
  2026-06-06:
    date: "2026-06-06"
    focaccia:
      date_iso, date, time, dough
      pizzas, focaccias, ciabatta, tray_focaccia, panini, extra_kg_f
      total_g
    brioche:
      date_iso, date, time, dough
      burger_buns, sub_rolls, buns, rolls, extra_kg_b
      total_g
    sourdough:
      date_iso, date, time, dough
      loaves, loaf_weight_g
      total_g
```

Non-applicable fields for a dough type are stored as empty string "".

## Security

### Content Security Policy
A CSP meta tag in index.html restricts what the browser can load:
- Scripts: only from this domain + https://www.gstatic.com (Firebase SDK CDN)
- Connections: only to Firebase/Firestore endpoints
- Styles/Fonts: only from this domain + Google Fonts
- Everything else (inline eval, unknown origins) is blocked by the browser

### Firebase Anonymous Auth
The app signs in anonymously on startup (`signInAnonymously`) — no login
screen, no email required. Every device gets a silent auth token which is
required by the Firestore rules to read or write data. Unauthenticated
REST API calls from outside the app are rejected.

Anonymous Auth must be enabled in the Firebase Console:
Authentication → Sign-in method → Anonymous → Enable.

### Firestore Security Rules
`firestore.rules` is deployed via Firebase CLI and enforced server-side.

**log collection** — all writes and deletes require a valid auth token.
Writes are accepted only if:
- Document ID is one of: `focaccia`, `brioche`, `sourdough`
- Fields are exactly: `dough`, `date`, `time`, `text` (no extras)
- `dough` value is one of: `Focaccia`, `Brioche`, `Sourdough`
- `date` < 50 chars, `time` < 10 chars, `text` < 2000 chars

**daily-logs collection** — all reads and writes require a valid auth token.
Document ID must match the format `YYYY-MM-DD`.

To update and redeploy the rules:
```
firebase deploy --only firestore:rules
```

### Service Worker — no cross-origin caching
The fetch handler skips caching for any request outside the app's own
origin (Firebase SDK CDN, Firestore API, Google Fonts). This prevents a
compromised CDN response from being persisted in the offline cache.

### XSS Prevention
All Firestore data rendered in the Log tab uses DOM API methods
(`textContent`, `createElement`) instead of `innerHTML`, so
any HTML in stored records is displayed as plain text, never executed.
