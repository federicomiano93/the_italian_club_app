---
name: smoke-test
description: Pre-merge / pre-publish checklist for The Italian Club. Use before merging a branch to main, before pushing to production, or whenever Federico asks to "smoke test" or "check before publishing". Runs the automated math tests (npm test) first, then lists the manual checks for the Calculator and Orders that automated tests do not cover. The app goes live on every push to main and has no UI tests, so this gate must pass before publishing.
---

# Smoke test — before merge / publish

The Italian Club goes live on every push to `main` and has no automated UI tests.
The automated tests cover the dough math only; everything visual must be checked
by hand. Run BOTH gates before publishing. Do not push if either fails.

## Gate 1 — Automated tests (math)
Run `npm test`. All tests must pass (green). If anything fails, STOP — do not
merge or push. The math is the core of the app; a red test means the numbers are
wrong.

## Gate 2 — Manual smoke test
Start a local server (`npx http-server . -p 8765`) and check each item by hand.

### Calculator
- The three doughs (Focaccia, Brioche, Sourdough): enter quantities and confirm
  the ingredient grams look correct (compare against a known-good order).
- Confirm → Edit works, and the Log saves / edits / deletes correctly.
- The Recipes overlay opens, a value can be changed, Save works, and the
  recalculation is correct.
- Copy recipe and the WhatsApp share button both work (the copied text matches
  the on-screen recipe).

### Orders
- Home screen shows the Orders and Calculator cards.
- Orders → supplier list loads; a supplier shows its ingredient list with badge
  and progress bar.
- Changing a quantity autosaves the draft; close and reopen → the draft is still
  there.
- Management panel: a supplier or ingredient can be added / edited.

### PWA / service worker
- If any cached file changed, confirm the service worker was bumped (see the
  `bump-sw` skill): CACHE_NAME incremented and the ASSETS list complete.

## After both gates pass
- Merge to `main` only with Federico's explicit OK (never push to main directly
  without it).
- If Firestore rules changed, deploy them separately:
  `firebase deploy --only firestore:rules` (the GitHub Pages push does NOT deploy
  rules).

## Never
- Never merge or publish with a failing `npm test`.
- Never skip the manual Calculator checks — the math tests do not cover the UI,
  the Confirm/Edit/log flow, or Copy/WhatsApp.
