// calculator-zoom.js — "hold to magnify" on the Calculator content.
//
// The browser's own pinch-zoom stays where you leave it; Federico wants a
// MOMENTARY magnify instead: pinch with two fingers to zoom the calculator
// content while you hold, and the instant you lift a finger it springs back to
// normal. Implemented as a custom two-finger gesture over #zoom-wrap — we scale
// that element from the pinch's centre point and animate back to 1× on release.
//
// One-finger scrolling and taps are untouched: we only react while TWO fingers
// are down, and only then call preventDefault (so the OS pinch can't fight ours).
// #zoom-wrap also carries `touch-action: pan-y` so the browser never starts its
// own pinch-zoom on that content.

const MAX_SCALE = 3;            // never magnify past 3×
const SNAP_BACK_MS = 200;      // spring-back duration on release
const wrap = document.getElementById('zoom-wrap');

let pinching = false;
let startDist = 0;

function fingerDistance(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function onStart(e) {
  if (e.touches.length !== 2) return;
  e.preventDefault();                       // claim the two-finger gesture
  pinching = true;
  startDist = fingerDistance(e.touches[0], e.touches[1]) || 1;
  // Zoom toward the point between the fingers: set the origin there, in the
  // element's own coordinate space (rect.top is negative when scrolled down).
  const r = wrap.getBoundingClientRect();
  const ox = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
  const oy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
  wrap.style.transformOrigin = `${ox}px ${oy}px`;
  wrap.style.transition = 'none';           // follow the fingers with no lag
}

function onMove(e) {
  if (!pinching || e.touches.length !== 2) return;
  e.preventDefault();
  const ratio = fingerDistance(e.touches[0], e.touches[1]) / startDist;
  const scale = Math.min(MAX_SCALE, Math.max(1, ratio));
  wrap.style.transform = `scale(${scale})`;
}

function onEnd(e) {
  if (!pinching || e.touches.length >= 2) return; // still pinching with 2 fingers
  pinching = false;
  wrap.style.transition = `transform ${SNAP_BACK_MS}ms ease`;
  wrap.style.transform = 'scale(1)';        // spring back to normal
}

if (wrap) {
  // passive:false so preventDefault can suppress the OS pinch during the gesture.
  wrap.addEventListener('touchstart', onStart, { passive: false });
  wrap.addEventListener('touchmove', onMove, { passive: false });
  wrap.addEventListener('touchend', onEnd);
  wrap.addEventListener('touchcancel', onEnd);
}
