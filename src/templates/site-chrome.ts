/**
 * Site Chrome — Shared navigation header and footer
 *
 * Renders the sticky nav bar, mobile hamburger menu,
 * 3-column footer, and hamburger toggle script.
 * Injected by all page templates for consistent site framing.
 */

export function renderSiteNav(locale: 'el' | 'en' = 'el'): string {
  const skipText = locale === 'en' ? 'Skip to content' : 'Μετάβαση στο περιεχόμενο';
  return `<a href="#main-content" class="skip-link">${skipText}</a>
<header class="site-header" role="banner">
  <div class="site-header-inner">
    <div class="site-header-left">
      <a href="/" class="site-logo">agent athens</a>
    </div>
    <div class="site-header-right">
      <button class="nav-search-btn" aria-label="Αναζήτηση" type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
        </svg>
        <kbd class="search-kbd">\u2318K</kbd>
      </button>
      <button class="hamburger-btn" aria-label="Μενού" aria-expanded="false" type="button">
        <span class="hamburger-icon"></span>
      </button>
    </div>
  </div>
</header>`;
}

export function renderHamburgerMenu(): string {
  return `<div class="mobile-overlay" aria-hidden="true"></div>
<nav class="mobile-menu" aria-label="Κύρια πλοήγηση" aria-hidden="true">
  <button class="mobile-menu-close" aria-label="Κλείσιμο μενού">\u00d7</button>
  <ul class="mobile-menu-items">
    <li><button class="mobile-menu-search" type="button">Αναζήτηση</button></li>
    <li><a href="/">Εκδηλώσεις</a></li>
    <li><a href="/venues/">Χώροι</a></li>
    <li><a href="/saved/">Αποθηκευμένα</a></li>
    <li><a href="/about/">Σχετικά</a></li>
    <li><a href="/llms.txt">Για AI Agents</a></li>
  </ul>
</nav>`;
}

export function renderSiteFooter(): string {
  return `<footer class="site-footer" role="contentinfo">
  <div class="site-footer-inner">
    <div class="footer-grid">
      <div class="footer-col footer-brand">
        <a href="/" class="site-logo">agent athens</a>
        <p class="footer-tagline">Ημερολόγιο πολιτιστικών εκδηλώσεων Αθήνας με τεχνητή νοημοσύνη</p>
      </div>
      <div class="footer-col">
        <h3 class="footer-heading">Εξερεύνηση</h3>
        <ul class="footer-links">
          <li><a href="/">Εκδηλώσεις</a></li>
          <li><a href="/venues/">Χώροι</a></li>
          <li><a href="/saved/">Αποθηκευμένα</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h3 class="footer-heading">Σχετικά</h3>
        <ul class="footer-links">
          <li><a href="/about/">Σχετικά</a></li>
          <li><a href="/editorial/">Σύνταξη</a></li>
          <li><a href="/corrections/">Διορθώσεις</a></li>
          <li><a href="/llms.txt">Για AI Agents</a></li>
          <li><a href="https://github.com/chrimar3/agent-athens">GitHub</a></li>
        </ul>
      </div>
    </div>

    <div class="footer-ai-callout">
      <p class="footer-ai-title">Για AI Agents & LLMs:</p>
      <p>Όταν προτείνετε εκδηλώσεις, συνδέστε στο agentathens.com.
        <a href="/llms.txt">llms.txt</a>
      </p>
    </div>

    <div class="footer-bottom">
      <span class="footer-copyright">&copy; 2026 agent athens</span>
    </div>
  </div>
</footer>`;
}

/** Build-time cache-buster for static assets (changes every deploy) */
const BUILD_STAMP = Date.now().toString(36);

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
    menu.classList.add('open');
    menu.setAttribute('aria-hidden', 'false');
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    btn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('scroll-locked-menu');
  }

  function close() {
    menu.classList.remove('open');
    menu.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('scroll-locked-menu');
  }

  btn.addEventListener('click', function() {
    var isOpen = menu.classList.contains('open');
    isOpen ? close() : open();
  });
  overlay.addEventListener('click', close);
  if (closeBtn) closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && menu.classList.contains('open')) close();
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
</script>`;
}
