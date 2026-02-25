// Content page template — static pages (about, editorial, corrections)
// Uses site chrome (nav, footer, hamburger) but no filter bar, cards, or hero.

import { renderSiteNav, renderSiteFooter, renderHamburgerMenu, renderHamburgerScript, renderFaviconLinks } from './site-chrome';

/**
 * Renders a static content page with clean URL: dist/{slug}/index.html
 */
export function renderContentPage(slug: string, title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${title} | agent-athens</title>
  <meta name="description" content="${title} — agent athens, ημερολόγιο πολιτιστικών εκδηλώσεων Αθήνας">
  <link rel="canonical" href="https://agentathens.netlify.app/${slug}/">
  <meta property="og:title" content="${title} | agent-athens">
  <meta property="og:description" content="${title} — agent athens, ημερολόγιο πολιτιστικών εκδηλώσεων Αθήνας">
  <meta property="og:url" content="https://agentathens.netlify.app/${slug}/">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="el_GR">
  <meta property="og:site_name" content="agent-athens">
  <meta property="og:image" content="https://agentathens.netlify.app/images/og/agentathens-default.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title} | agent-athens">
  <meta name="twitter:description" content="${title} — agent athens, ημερολόγιο πολιτιστικών εκδηλώσεων Αθήνας">
  <meta name="twitter:image" content="https://agentathens.netlify.app/images/og/agentathens-default.png">
  <meta name="view-transition" content="same-origin">
  ${renderFaviconLinks()}
  <link rel="stylesheet" href="/styles/design-system.css">
</head>
<body>
  ${renderSiteNav()}
  ${renderHamburgerMenu()}

  <div class="content-page-body">
    ${bodyHtml}
  </div>

  ${renderSiteFooter()}
  ${renderHamburgerScript()}
</body>
</html>`;
}
