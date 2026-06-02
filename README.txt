# Bakery Calculator — PWA

## Files
```
├── index.html          ← HTML structure only
├── style.css           ← all CSS
├── js/
│   ├── app.js          ← entry point: service worker, tab switching, event listeners
│   ├── firebase.js     ← Firebase init + Firestore (save/delete/sync log)
│   ├── recipes.js      ← recipe data (RECIPES) + recipe overlay UI
│   ├── calc.js         ← calcFocaccia, calcBrioche, calcSourdough, copyRecipe
│   ├── log.js          ← production log: save, render, delete
│   └── whatsapp.js     ← Duke Street Market WhatsApp order
├── sw.js               ← service worker (offline cache + auto-update)
├── manifest.json       ← PWA config
├── firestore.rules     ← Firestore security rules
├── firebase.json       ← Firebase CLI config
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

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
2. Bump the cache version in sw.js (CACHE_NAME = 'bakery-vXX') and update the comment in index.html
3. Push to GitHub — the live site updates automatically
4. All installed users see the update next time they open the app
   (a banner appears at the top saying "New version available")

## Works offline
Once installed, the app works without internet connection.
The service worker uses a network-first strategy and pre-caches all JS and CSS files on install.

## Security

### Content Security Policy
A CSP meta tag in index.html restricts what the browser can load:
- Scripts: only from this domain + https://www.gstatic.com (Firebase SDK CDN)
- Connections: only to Firebase/Firestore endpoints
- Styles/Fonts: only from this domain + Google Fonts
- Everything else (inline eval, unknown origins) is blocked by the browser

### Firestore Security Rules
`firestore.rules` is deployed via Firebase CLI and enforced server-side.
Writes to the `log` collection are accepted only if:
- Document ID is one of: `focaccia`, `brioche`, `sourdough`
- Fields are exactly: `dough`, `date`, `time`, `text` (no extras)
- `dough` value is one of: `Focaccia`, `Brioche`, `Sourdough`
- `date` < 50 chars, `time` < 10 chars, `text` < 2000 chars

To update and redeploy the rules:
```
firebase deploy --only firestore:rules
```

### XSS Prevention
All Firestore data rendered in the Log tab uses DOM API methods
(`textContent`, `createElement`) instead of `innerHTML`, so
any HTML in stored records is displayed as plain text, never executed.
