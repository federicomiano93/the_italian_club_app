# Bakery Calculator — PWA

## Files
```
bakery-pwa/
├── index.html      ← main app
├── manifest.json   ← PWA config
├── sw.js           ← service worker (offline + auto-update)
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

## Deploy on Netlify (free, 5 minutes)

1. Go to https://netlify.com and sign up (free)
2. Click "Add new site" → "Deploy manually"
3. Drag the entire `bakery-pwa` folder onto the page
4. Done — you get a link like `https://your-name.netlify.app`

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
1. Edit `index.html` with your changes
2. Go to Netlify → your site → "Deploys" → drag the folder again
3. All installed users see the update automatically next time they open the app
   (a banner appears at the top saying "New version available")

## Works offline
Once installed, the app works without internet connection.
