---
name: bump-sw
description: Bump the service worker cache version and keep the precache list complete. Use whenever any cached file (HTML, CSS, JS under js/, icons, manifest) has been added, edited, or removed in The Italian Club, before committing. Installed PWAs keep serving the old cache until CACHE_NAME changes, so always run this when finishing a change that touches a file listed in sw.js.
---

# Bump the service worker

The PWA precaches the files listed in `sw.js`. Installed apps keep serving the
old cached copy until `CACHE_NAME` changes, so every change to a cached file
needs a version bump and the precache list must stay complete.

## When to use
After adding, editing, or removing any file the app serves: any *.html,
style.css, orders.css, anything under js/, manifest.json, or icons.

## Steps
1. Open `sw.js`.
2. In the `ASSETS` array, ensure every served file is listed. Add any new file
   with the `./` prefix (e.g. `'./js/orders/new-module.js'`). Remove entries for
   deleted files.
3. Find `const CACHE_NAME = 'theitalianclub-vNN';` and increment the number by
   one (e.g. v104 → v105).
4. Tell the user the new CACHE_NAME value and any ASSETS lines added or removed.

## Notes
- Bump once per batch of changes, not once per file.
- Never touch the cache-first fetch logic or the cross-origin skip — only the
  version string and the ASSETS list.
