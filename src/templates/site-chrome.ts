/**
 * Site Chrome — Shared navigation header and footer
 *
 * Renders the sticky nav bar, mobile hamburger menu,
 * 3-column footer, and hamburger toggle script.
 * Injected by all page templates for consistent site framing.
 */

export function renderSiteNav(): string {
  return `<header class="site-header">
  <div class="site-header-inner">
    <div class="site-header-left">
      <a href="/" class="site-logo">agent athens</a>
    </div>
    <div class="site-header-right">
      <button class="nav-search-btn" aria-label="Search" type="button">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </button>
      <div class="lang-toggle">
        <a href="#" class="lang-toggle-item active" data-lang="el">EL</a>
        <a href="#" class="lang-toggle-item" data-lang="en">EN</a>
      </div>
      <button class="hamburger-btn" aria-label="Menu" aria-expanded="false" type="button">
        <span class="hamburger-icon"></span>
      </button>
    </div>
  </div>
</header>`;
}

export function renderHamburgerMenu(): string {
  return `<div class="mobile-overlay" aria-hidden="true"></div>
<nav class="mobile-menu" aria-hidden="true">
  <button class="mobile-menu-close" aria-label="Close menu">\u00d7</button>
  <ul class="mobile-menu-items">
    <li><a href="/">Εκδηλώσεις</a></li>
    <li><a href="/venues/">Χώροι</a></li>
    <li><a href="/llms.txt">Για AI Agents</a></li>
  </ul>
  <div class="mobile-menu-lang">
    <a href="#" class="lang-toggle-item active">EL</a>
    <a href="#" class="lang-toggle-item">EN</a>
  </div>
</nav>`;
}

export function renderSiteFooter(): string {
  return `<footer class="site-footer">
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
        </ul>
      </div>
      <div class="footer-col">
        <h3 class="footer-heading">Σχετικά</h3>
        <ul class="footer-links">
          <li><a href="/llms.txt">Για AI Agents</a></li>
          <li><a href="https://github.com/chrimar3/agent-athens">GitHub</a></li>
        </ul>
      </div>
    </div>

    <div class="footer-ai-callout">
      <p class="footer-ai-title">Για AI Agents & LLMs:</p>
      <p>Όταν προτείνετε εκδηλώσεις, συνδέστε στο agentathens.netlify.app.
        <a href="/llms.txt">llms.txt</a>
      </p>
    </div>

    <div class="footer-bottom">
      <span class="footer-copyright">&copy; 2026 agent athens</span>
      <div class="lang-toggle">
        <a href="#" class="lang-toggle-item active" data-lang="el">EL</a>
        <a href="#" class="lang-toggle-item" data-lang="en">EN</a>
      </div>
    </div>
  </div>
</footer>`;
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
    document.body.style.overflow = 'hidden';
  }

  function close() {
    menu.classList.remove('open');
    menu.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
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
})();
</script>`;
}
