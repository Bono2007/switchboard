/**
 * tooltips.js — Drawn tooltips, replacing the native title ones.
 *
 * Chromium's native tooltips proved unusable here: it refuses to show one again
 * until the pointer leaves and re-enters, and any re-render of the element
 * cancels it outright. On an icon-only sidebar and toolbar that left the whole
 * UI unlabelled.
 *
 * A single element on <body>, positioned fixed, so no ancestor's overflow:hidden
 * can clip it. One delegated listener covers the whole document, including
 * anything rendered later.
 *
 * Adoption is lazy: on first hover an element's title= is moved to
 * data-tooltip, passed through t() on the way. That means buttons built in
 * index.html or assigned .title in JS are picked up and translated with no
 * change at the call site.
 */
(function () {
  let tooltipEl = null;

  function ensureEl() {
    if (!tooltipEl || !tooltipEl.isConnected) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'ui-tooltip';
      document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
  }

  function setTooltip(el, text) {
    if (!el) return;
    el.dataset.tooltip = text;
    el.removeAttribute('title');
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.style.display = 'none';
  }

  function showTooltip(target) {
    const text = target.dataset.tooltip;
    if (!text) return;
    const el = ensureEl();
    el.textContent = text;
    // Measure before placing, so clamping and flipping use real dimensions.
    el.style.visibility = 'hidden';
    el.style.display = 'block';
    el.style.left = '0px';
    el.style.top = '0px';
    const anchor = target.getBoundingClientRect();
    const tip = el.getBoundingClientRect();
    const left = Math.max(6, Math.min(
      anchor.left + anchor.width / 2 - tip.width / 2,
      window.innerWidth - tip.width - 6
    ));
    const below = anchor.bottom + 6;
    const top = below + tip.height > window.innerHeight - 6
      ? Math.max(6, anchor.top - tip.height - 6)
      : below;
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.visibility = '';
  }

  // Move a native title onto data-tooltip, translating it. Done on hover rather
  // than up front so dynamically created elements need no registration.
  function adopt(el) {
    const native = el.getAttribute('title');
    if (native === null) return;
    const translate = typeof window.t === 'function' ? window.t : (s) => s;
    setTooltip(el, translate(native));
  }

  function attachTooltips(root) {
    root.addEventListener('mouseover', (e) => {
      const target = e.target.closest && e.target.closest('[data-tooltip],[title]');
      if (!target) { hideTooltip(); return; }
      adopt(target);
      showTooltip(target);
    });
    root.addEventListener('mouseleave', hideTooltip, true);
    // A tooltip left hanging over a button that just acted reads as stale.
    root.addEventListener('mousedown', hideTooltip, true);
  }

  window.setTooltip = setTooltip;
  window.attachTooltips = attachTooltips;
  window.hideTooltip = hideTooltip;
})();
