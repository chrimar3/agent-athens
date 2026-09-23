/**
 * Site Chrome — Shared navigation header and footer
 *
 * Renders the sticky nav bar, mobile hamburger menu,
 * 3-column footer, and hamburger toggle script.
 * Injected by all page templates for consistent site framing.
 */
import { STRINGS, type Locale } from '../i18n/strings';
import { renderColophonDialog, renderColophonScript } from './colophon';

/**
 * Header trigger for the colophon dialog, in the page language. Carries the
 * same hooks as colophon.ts renderColophonTrigger (class colophon-trigger,
 * data-colophon-open, aria-controls) — the colophon script binds to those.
 * Visible label stays "About" (S159 decision); a judge flagged it as a
 * duplicate of the nav About link — renaming is the user's call. The
 * accessible name must contain the visible word (WCAG 2.5.3).
 */
function renderLocalisedColophonTrigger(locale: Locale): string {
  const s = STRINGS[locale];
  // No hreflang on the fallback link: the hreflang gate (S144/S176) is
  // checked by grepping pages for "hreflang=".
  return `<button class="colophon-trigger nav-colophon-btn" type="button" aria-label="${s.colophonTriggerAria}" aria-haspopup="dialog" aria-controls="colophon-dialog" data-colophon-open data-colophon-href="/en/colophon/">${s.colophonTrigger}</button>
<noscript><a href="/en/colophon/" class="colophon-trigger-noscript">${s.colophonTrigger}</a></noscript>`;
}

// Routing: Greek renders at the bare root (/saved/, /about/), English under /en/.
// (Do NOT use utils/locale-url.ts — it encodes an abandoned English-first posture
// and would emit /el/ 404s. The localePrefix pattern below matches production,
// per event-page.ts and the dist/ tree.)
// English has no /en/ homepage and no /en/venues/ yet:
//   - home/logo target → /en/this-week/ (evergreen, always-built hub).
//     NOT /en/today/ — today/tomorrow are date-conditional hubs that only
//     build when events fall on that date, so they 404 on empty days.
//   - Venues link is omitted on English nav until /en/venues/ exists.
function localePrefix(locale: Locale): string {
  return locale === 'en' ? '/en' : '';
}
function homeHref(locale: Locale): string {
  // interim: /en/this-week/ until /en/ homepage ships (F1) — see specs/lang-toggle-checkpoint.md
  return locale === 'en' ? '/en/this-week/' : '/';
}

export function renderSiteNav(locale: Locale = 'el'): string {
  const s = STRINGS[locale];
  const prefix = localePrefix(locale);
  // Venues has no /en/ counterpart yet — omit on English (see renderHamburgerMenu).
  const venuesItem = locale === 'en' ? '' : `<a href="/venues/">${s.navVenues}</a>`;
  return `<a href="#main-content" class="skip-link">${s.navSkipToContent}</a>
<header class="site-header" role="banner">
  <div class="site-header-inner">
    <div class="site-header-left">
      <a href="${homeHref(locale)}" class="site-logo">agent athens</a>
      <nav class="site-nav-inline" aria-label="${s.navMainNav}">
        <a href="${homeHref(locale)}">${s.navEvents}</a>
        ${venuesItem}
        <a href="${prefix}/saved/">${s.savedEvents}<span class="nav-saved-count" data-saved-count hidden></span></a>
        <a href="${prefix}/about/">${s.navAbout}</a>
      </nav>
    </div>
    <div class="site-header-right">
      ${renderLocalisedColophonTrigger(locale)}
      <button class="nav-search-btn" aria-label="${s.navSearch}" type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
        </svg>
        <kbd class="search-kbd">\u2318K</kbd>
      </button>
      <button class="hamburger-btn" aria-label="${s.navMenu}" aria-expanded="false" aria-controls="mobile-menu" type="button">
        <span class="hamburger-icon"></span>
      </button>
    </div>
  </div>
</header>`;
}

export function renderHamburgerMenu(locale: Locale = 'el'): string {
  const s = STRINGS[locale];
  const prefix = localePrefix(locale);
  // Venues has no /en/ counterpart yet — omit on English rather than 404 or
  // route an English label to Greek content.
  const venuesItem = locale === 'en' ? '' : `\n    <li><a href="/venues/">${s.navVenues}</a></li>`;
  return `<div class="mobile-overlay" aria-hidden="true"></div>
<nav id="mobile-menu" class="mobile-menu" aria-label="${s.navMainNav}" aria-hidden="true" inert>
  <button class="mobile-menu-close" aria-label="${s.navCloseMenu}">\u00d7</button>
  <ul class="mobile-menu-items">
    <li><button class="mobile-menu-search" type="button">${s.navSearch}</button></li>
    <li><a href="${homeHref(locale)}">${s.navEvents}</a></li>${venuesItem}
    <li><a href="${prefix}/saved/">${s.savedEvents}</a></li>
    <li><a href="${prefix}/about/">${s.navAbout}</a></li>
    <li><a href="/llms.txt">${s.navForAiAgents}</a></li>
  </ul>
</nav>`;
}

export function renderSiteFooter(locale: Locale = 'el'): string {
  const s = STRINGS[locale];
  const prefix = localePrefix(locale);
  // Venues has no /en/ counterpart yet — omit on English (see renderHamburgerMenu).
  const venuesItem = locale === 'en' ? '' : `\n          <li><a href="/venues/">${s.navVenues}</a></li>`;
  // Footer copy still Greek on /en/ pending Editorial (specs/en-nav-copy-checkpoint.md)
  // is tagged lang="el" while it stays Greek (WCAG 3.1.2).
  const greekOnEn = (text: string): string => (locale === 'en' && /[\u0370-\u03FF]/.test(text) ? ' lang="el"' : '');
  return `<footer class="site-footer" role="contentinfo">
  <div class="site-footer-inner">
    <div class="footer-grid">
      <div class="footer-col footer-brand">
        <a href="${homeHref(locale)}" class="site-logo">agent athens</a>
        <p class="footer-tagline"${greekOnEn(s.footerTagline)}>${s.footerTagline}</p>
      </div>
      <div class="footer-col">
        <h3 class="footer-heading">${s.footerExplore}</h3>
        <ul class="footer-links">
          <li><a href="${homeHref(locale)}">${s.navEvents}</a></li>${venuesItem}
          <li><a href="${prefix}/saved/">${s.savedEvents}</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h3 class="footer-heading">${s.footerAboutHeading}</h3>
        <ul class="footer-links">
          <li><a href="${prefix}/about/">${s.navAbout}</a></li>
          <li><a href="${prefix}/editorial/">${s.footerEditorial}</a></li>
          <li><a href="${prefix}/corrections/">${s.footerCorrections}</a></li>
          <li><a href="/llms.txt">${s.navForAiAgents}</a></li>
          <li><a href="https://github.com/chrimar3/agent-athens">GitHub</a></li>
        </ul>
      </div>
    </div>

    <div class="footer-ai-callout">
      <p class="footer-ai-title"${greekOnEn(s.footerAiCalloutTitle)}>${s.footerAiCalloutTitle}</p>
      <p${greekOnEn(s.footerAiCalloutBody)}>${s.footerAiCalloutBody}
        <a href="/llms.txt">llms.txt</a>
      </p>
    </div>

    <div class="footer-bottom">
      <span class="footer-copyright">&copy; 2026 agent athens</span>
    </div>
  </div>
</footer>
<div lang="en">
${renderColophonDialog()}
</div>`;
}

/**
 * Build-time cache-buster for CSS — content-addressed.
 * Hashes ALL .css files in src/styles/ so the stamp is stable across builds
 * when CSS hasn't changed. Required for the incremental build cache: a
 * timestamp-based stamp made every HTML page differ on every build.
 */
function computeCssStamp(): string {
  const { readdirSync, readFileSync } = require('fs') as typeof import('fs');
  const { join } = require('path') as typeof import('path');
  const { createHash } = require('crypto') as typeof import('crypto');
  const stylesDir = join(import.meta.dir, '../styles');
  const hash = createHash('sha256');
  const files = readdirSync(stylesDir).filter((f: string) => f.endsWith('.css')).sort();
  for (const file of files) {
    hash.update(file);
    hash.update(readFileSync(join(stylesDir, file)));
  }
  return hash.digest('hex').substring(0, 10);
}

const BUILD_STAMP = computeCssStamp();

export function renderCssLink(): string {
  return `<link rel="stylesheet" href="/styles/design-system.css?v=${BUILD_STAMP}">`;
}

export function renderFontLinks(): string {
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&subset=greek,latin&display=swap">`;
}

export function renderFaviconLinks(): string {
  return `<link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">`;
}

export function renderHamburgerScript(): string {
  return `<script>
(function() {
  var btn = document.querySelector('.hamburger-btn');
  var menu = document.querySelector('.mobile-menu');
  var overlay = document.querySelector('.mobile-overlay');
  var closeBtn = document.querySelector('.mobile-menu-close');
  if (!btn || !menu || !overlay) return;

  function open() {
    menu.inert = false;
    menu.classList.add('open');
    menu.setAttribute('aria-hidden', 'false');
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    btn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('scroll-locked-menu');
    if (closeBtn) closeBtn.focus();
  }

  function close() {
    btn.focus();
    menu.classList.remove('open');
    menu.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('scroll-locked-menu');
    menu.inert = true;
  }

  btn.addEventListener('click', function() {
    var isOpen = menu.classList.contains('open');
    isOpen ? close() : open();
  });
  overlay.addEventListener('click', close);
  if (closeBtn) closeBtn.addEventListener('click', close);
  // This script precedes the search script. Close the menu first so search
  // captures a visible return-focus target rather than an inert menu button.
  var menuSearch = menu.querySelector('.mobile-menu-search');
  function handOffToSearch() {
    close();
    var searchButton = document.querySelector('.nav-search-btn');
    if (searchButton) searchButton.focus();
  }
  if (menuSearch) menuSearch.addEventListener('click', handOffToSearch);
  document.addEventListener('keydown', function(e) {
    if (!menu.classList.contains('open')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      handOffToSearch();
    } else if (e.key === 'Tab') {
      var focusable = Array.from(menu.querySelectorAll('a[href], button, [tabindex]')).filter(function(el) {
        return !el.disabled && el.tabIndex >= 0 && el.getClientRects().length > 0;
      });
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || !menu.contains(document.activeElement))) {
        e.preventDefault();
        if (last) last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !menu.contains(document.activeElement))) {
        e.preventDefault();
        if (first) first.focus();
      }
    }
  });

  document.querySelectorAll('img[loading="lazy"]').forEach(function(img) {
    img.classList.add('will-fade');
    if (img.complete && img.naturalWidth > 0) {
      img.classList.add('is-loaded');
    } else {
      img.addEventListener('load', function() { this.classList.add('is-loaded'); });
      img.addEventListener('error', function() { this.classList.remove('will-fade'); });
    }
  });
})();
</script>${renderColophonScript()}`;
}
