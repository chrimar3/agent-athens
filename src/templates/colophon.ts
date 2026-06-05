/**
 * Colophon — "About me" surface, two render destinations from one source.
 *
 * Single content constant (COLOPHON_CONTENT / renderColophonContent) is consumed by:
 *   1. renderColophonDialog() — pop-up dialog, emitted on every page via site-chrome.ts
 *      (Option A: dialog+script live inside shared chrome, coextensive with the trigger
 *      by construction).
 *   2. The /en/colophon/ mirror page — registered in generate-site.ts contentPagePairs.
 *
 * The dialog and the page share the SAME content string. Editing the "over 3,800"
 * floor claim updates both surfaces at once — no drift possible.
 *
 * The dialog markup has no id attributes inside the shared content block so the mirror
 * page can render the same content inside <main> without duplicate-ID violations.
 * aria-labelledby on the dialog targets a heading defined ONLY in the dialog wrapper.
 */

import { renderColophonStats, getColophonStats } from './colophon-stats';

// S155 (2026-05-25): name heading is <h2>, NOT <h1>. The colophon dialog rides
// into every page via site-chrome.ts → renderSiteNav, so an <h1> here makes
// every page emit two H1s — Bing flagged this on /en/this-weekend/ (the demo
// cornerstone) as "Duplicate H1." Single-H1 semantic-uniqueness rule. The
// dialog's heading hierarchy starts at <h2> below the page's own <h1>.
// Coordination note for the colophon owner: specs/colophon-h1-handoff-2026-05-25.md.
//
// S103 (2026-06-05): the static prose lives in COLOPHON_CONTENT; the build-time
// engine stats are appended at render time by renderColophonContent() from the
// build-stats singleton (set once in generate-site.ts). Keeping COLOPHON_CONTENT
// a const preserves the "edit once, both surfaces update" property for the prose.
export const COLOPHON_CONTENT = `<header class="colophon-content-header">
  <h2 class="colophon-name">Christos Maragkoudakis</h2>
  <p class="colophon-tagline">AI systems, built end to end · Economics + LLMs · Athens</p>
  <p class="colophon-one-liner">I study by building. This site is one of the builds.</p>
</header>

<section class="colophon-section">
  <p>When someone asks an AI what's on in Athens tonight, why isn't there a source built to answer? I built one. Agent Athens — an AI-native events platform for Athens, built end to end.</p>
</section>

<section class="colophon-section">
  <p>Agent Athens is over 3,800 static pages, generated daily and unattended: 10 scrapers feed a SQLite store, an AI enrichment layer rewrites raw data into editor-quality copy, and the whole thing redeploys on a schedule with zero human touch — and zero external API cost, because the enrichment runs inside Claude rather than calling out to one.</p>
  <p>The architecture is the actual bet. Instead of chasing traditional SEO, the system is engineered to be cited by answer engines — ChatGPT, Perplexity, Claude — as the authoritative source on Athens culture: structured data, entity linking, enrichment that reads like a person wrote it. It's a working argument about where discovery is going, not just an events list.</p>
</section>

<section class="colophon-section colophon-open-to-work">
  <p>Open to AI roles — automation, or putting LLMs to work on real problems. I prefer elegant solutions and ship scrappy ones when it counts.</p>
</section>

<ul class="colophon-links">
  <li><a href="https://github.com/chrimar3" rel="me">GitHub</a></li>
  <li><a href="https://linkedin.com/in/christosmarag" rel="me">LinkedIn</a></li>
  <li><a href="mailto:cmarag8@gmail.com">cmarag8@gmail.com</a></li>
</ul>

<p class="colophon-cv">
  <a href="/cv.pdf" download>Download CV</a>
</p>`;

export function renderColophonContent(): string {
  // Build-time stats append after the static prose. The singleton is shared by
  // both surfaces, so the dialog and the mirror emit byte-identical stat markup.
  const stats = renderColophonStats(getColophonStats());
  return stats ? `${COLOPHON_CONTENT}\n\n${stats}` : COLOPHON_CONTENT;
}

export function renderColophonTrigger(): string {
  return `<button class="colophon-trigger nav-colophon-btn" type="button" aria-label="About me — open colophon" aria-haspopup="dialog" aria-controls="colophon-dialog" data-colophon-open data-colophon-href="/en/colophon/">About</button>
<noscript><a href="/en/colophon/" class="colophon-trigger-noscript">About</a></noscript>`;
}

export function renderColophonDialog(): string {
  return `<div id="colophon-dialog" class="colophon-dialog colophon-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="colophon-dialog-heading" aria-hidden="true">
  <div class="colophon-dialog-backdrop" data-colophon-close></div>
  <div class="colophon-dialog-panel" role="document">
    <h2 id="colophon-dialog-heading" class="sr-only">About me</h2>
    <button class="colophon-dialog-close" aria-label="Close" type="button" data-colophon-close>&times;</button>
    <div class="colophon-dialog-content">
      ${renderColophonContent()}
    </div>
  </div>
</div>`;
}

export function renderColophonScript(): string {
  return `<script>
(function() {
  var dialog = document.querySelector('.colophon-dialog');
  var trigger = document.querySelector('.colophon-trigger');
  if (!dialog || !trigger) return;

  var returnFocus = null;

  function open(e) {
    if (e && e.preventDefault) e.preventDefault();
    returnFocus = document.activeElement;
    dialog.classList.add('is-open');
    dialog.setAttribute('aria-hidden', 'false');
    document.body.classList.add('scroll-locked');
    var closeBtn = dialog.querySelector('.colophon-dialog-close');
    if (closeBtn) setTimeout(function() { closeBtn.focus(); }, 50);
  }

  function close() {
    dialog.classList.remove('is-open');
    dialog.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('scroll-locked');
    if (returnFocus) { try { returnFocus.focus(); } catch (e) {} }
    returnFocus = null;
  }

  trigger.addEventListener('click', open);
  dialog.querySelectorAll('[data-colophon-close]').forEach(function(el) {
    el.addEventListener('click', close);
  });

  document.addEventListener('keydown', function(e) {
    if (!dialog.classList.contains('is-open')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') {
      var focusable = dialog.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
      var arr = Array.from(focusable).filter(function(el) { return el.offsetParent !== null; });
      if (arr.length === 0) return;
      var first = arr[0];
      var last = arr[arr.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
  });
})();
</script>`;
}
