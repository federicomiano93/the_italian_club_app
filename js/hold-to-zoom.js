// hold-to-zoom.js — momentary "hold to magnify", applied to every .zoom-area on
// the page (loaded on Home, Calculator, Orders and Catalogue).
//
// The browser's own pinch-zoom stays where you leave it; this gives a momentary
// magnify instead: pinch with two fingers to zoom a .zoom-area while you hold,
// and it springs back to normal the instant a finger lifts. It only reacts while
// TWO fingers are down, so one-finger scrolling and taps are untouched, and it
// preventDefaults then so the OS pinch can't fight it. Each .zoom-area also
// carries `touch-action: pan-y` (see the stylesheet) so the browser never starts
// its own pinch-zoom on that content.

const MAX_SCALE = 3;          // never magnify past 3×
const SNAP_BACK_MS = 200;     // spring-back duration on release

function fingerDistance(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

// Attach the gesture to one element, with its own independent state.
function attachZoom(el) {
  let pinching = false;
  let startDist = 0;

  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 2) return;
    e.preventDefault();                     // claim the two-finger gesture
    pinching = true;
    startDist = fingerDistance(e.touches[0], e.touches[1]) || 1;
    // Zoom toward the point between the fingers, in the element's own coordinate
    // space (rect.top is negative when the content is scrolled down).
    const r = el.getBoundingClientRect();
    const ox = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
    const oy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
    el.style.transformOrigin = `${ox}px ${oy}px`;
    el.style.transition = 'none';           // follow the fingers with no lag
  }, { passive: false });

  el.addEventListener('touchmove', (e) => {
    if (!pinching || e.touches.length !== 2) return;
    e.preventDefault();
    const ratio = fingerDistance(e.touches[0], e.touches[1]) / startDist;
    el.style.transform = `scale(${Math.min(MAX_SCALE, Math.max(1, ratio))})`;
  }, { passive: false });

  const release = (e) => {
    if (!pinching || e.touches.length >= 2) return; // still pinching with 2 fingers
    pinching = false;
    el.style.transition = `transform ${SNAP_BACK_MS}ms ease`;
    el.style.transform = 'scale(1)';        // spring back to normal
  };
  el.addEventListener('touchend', release);
  el.addEventListener('touchcancel', release);
}

document.querySelectorAll('.zoom-area').forEach(attachZoom);
