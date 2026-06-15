// install-guide.js — drives the device-first install guide (install-guide.html).
// Shows the OS choice first, then only the matching install steps. CSP-safe:
// external script, no inline handlers.

(function () {
  const select = document.getElementById('screen-select');
  const steps = document.getElementById('screen-steps');
  if (!select || !steps) return;

  const blocks = steps.querySelectorAll('.steps');

  function showSteps(os) {
    blocks.forEach(b => { b.hidden = b.dataset.os !== os; });
    select.hidden = true;
    steps.hidden = false;
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('[data-os-btn]').forEach(btn => {
    btn.addEventListener('click', () => showSteps(btn.dataset.osBtn));
  });

  const change = document.getElementById('change-device');
  if (change) {
    change.addEventListener('click', () => {
      steps.hidden = true;
      select.hidden = false;
      window.scrollTo(0, 0);
    });
  }

  // Mark the most likely device so the user can pick it in one tap.
  const ua = navigator.userAgent;
  let detected = 'desktop';
  if (/iPhone|iPad|iPod/.test(ua)) detected = 'ios';
  else if (/Android/.test(ua)) detected = 'android';

  const suggestedBtn = document.querySelector(`[data-os-btn="${detected}"]`);
  if (suggestedBtn) {
    const tag = document.createElement('span');
    tag.className = 'suggested';
    tag.textContent = 'your device';
    suggestedBtn.appendChild(tag);
  }
})();
