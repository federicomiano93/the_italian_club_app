// Splash gate: show the Home splash logo only on the FIRST Home load of a
// browsing session. On every later return to Home (from a feature page) we add
// the `no-splash` class synchronously — before first paint — so the logo never
// flashes. Must load as a render-blocking classic <script> in <head> (not a
// module, not deferred) so the class is on <html> before <body> is painted.
try {
  if (sessionStorage.getItem('splashShown')) {
    document.documentElement.classList.add('no-splash');
  } else {
    // First Home load this session: let the splash show, remember it for later.
    sessionStorage.setItem('splashShown', '1');
  }
} catch (e) {
  // sessionStorage blocked (rare private-mode cases) → fall through and show the
  // splash as before. Harmless: worst case the logo appears when it need not.
}
