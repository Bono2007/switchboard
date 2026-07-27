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

  // Text baked into index.html. Titles are handled lazily by the tooltip layer,
  // which translates them on first hover; this covers the rest.
  //
  // Walks text nodes and substitutes only those whose exact trimmed content is a
  // key in the catalogue. Deliberately not a list of element ids — maintaining
  // one means every new label silently ships untranslated until someone notices,
  // which is exactly how "Select a session from the sidebar to begin." got
  // missed. Matching on known keys can't touch dynamic content, since a string
  // has to be in the catalogue to be replaced at all.
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'SVG', 'TEXTAREA', 'CODE', 'PRE']);

  function translateStaticDom(root) {
    const scope = root || document;
    const cat = catalogue();
    const walker = document.createTreeWalker(scope.body || scope, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (SKIP_TAGS.has(node.parentNode && node.parentNode.nodeName)) return NodeFilter.FILTER_REJECT;
        const text = node.nodeValue.trim();
        return text && cat[text] ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const pending = [];
    while (walker.nextNode()) pending.push(walker.currentNode);
    for (const node of pending) {
      // Preserve the surrounding whitespace, which carries the HTML formatting.
      node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), cat[node.nodeValue.trim()]);
    }
    for (const el of (scope.querySelectorAll ? scope.querySelectorAll('[placeholder]') : [])) {
      const p = el.getAttribute('placeholder');
      if (p) el.setAttribute('placeholder', t(p));
    }
  }

  window.registerLocale = registerLocale;
  window.t = t;
  window.i18nLocale = locale;
  window.translateStaticDom = translateStaticDom;
})();
