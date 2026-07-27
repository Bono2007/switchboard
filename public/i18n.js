/**
 * i18n.js — Minimal translation layer for the renderer.
 *
 * The renderer has no bundler: every script is a plain <script> sharing the
 * global scope, so this is a global t() plus a dictionary registered by each
 * locale file. No dependency, no build step, no fetch (which file:// blocks
 * anyway).
 *
 * Keys ARE the English source strings. A missing translation therefore falls
 * back to readable English rather than a blank or a raw key, which matters for
 * a retrofit where coverage is partial by design.
 *
 * Language follows the system: Electron reports the OS locale through
 * navigator.language. Override for testing with localStorage.setItem('lang', 'fr').
 */
(function () {
  const catalogues = Object.create(null);

  function registerLocale(tag, entries) {
    catalogues[tag] = Object.assign(catalogues[tag] || Object.create(null), entries);
  }

  // 'fr-CA' should use the 'fr' catalogue; an exact regional match wins if present.
  function resolveLocale() {
    const forced = (() => {
      try { return localStorage.getItem('lang'); } catch { return null; }
    })();
    const tag = forced || navigator.language || 'en';
    if (catalogues[tag]) return tag;
    const base = String(tag).split('-')[0];
    return catalogues[base] ? base : 'en';
  }

  let active = null;
  function catalogue() {
    if (active === null) active = resolveLocale();
    return catalogues[active] || Object.create(null);
  }

  /**
   * Translate. Placeholders are {name}, substituted from vars.
   *   t('Delete {name}?', { name: 'plan.md' })
   */
  function t(text, vars) {
    const translated = catalogue()[text] || text;
    if (!vars) return translated;
    return translated.replace(/\{(\w+)\}/g, (whole, key) =>
      Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole
    );
  }

  // Date/number formatting should follow the same locale as the text.
  function locale() {
    if (active === null) active = resolveLocale();
    return active === 'en' ? 'en-US' : active;
  }

  window.registerLocale = registerLocale;
  window.t = t;
  window.i18nLocale = locale;
})();
