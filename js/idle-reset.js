// Idle reset: after the app has been in the background longer than the limit,
// send the user back to the home screen on return. Keeps navigation predictable
// after a real break, while a quick app switch leaves the page where it was.
// Saved data (confirmed recipe, autosaved orders) is untouched — only navigation resets.

const IDLE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes
const STORAGE_KEY = 'lastHiddenAt';
const HOME_URL = 'index.html';

function markHidden() {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch (e) {
    // localStorage may be unavailable (private mode/quota) — fail safe: do nothing.
  }
}

function resetIfIdle() {
  let hiddenAt;
  try {
    hiddenAt = Number(localStorage.getItem(STORAGE_KEY));
  } catch (e) {
    return; // storage unreadable — leave the page as is
  }
  if (!hiddenAt) return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // ignore
  }

  if (Date.now() - hiddenAt > IDLE_LIMIT_MS) {
    // replace() so the stale page is not left in history (no "back" to it)
    location.replace(HOME_URL);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    markHidden();
  } else if (document.visibilityState === 'visible') {
    resetIfIdle();
  }
});

// iOS standalone PWAs restore from the back/forward cache on resume — pageshow
// with persisted=true catches the cases visibilitychange can miss.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) resetIfIdle();
});
