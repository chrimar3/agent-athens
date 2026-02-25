// Content page template — static pages (about, editorial, corrections)
// Uses site chrome (nav, footer, hamburger) but no filter bar, cards, or hero.

import { renderSiteNav, renderSiteFooter, renderHamburgerMenu, renderHamburgerScript } from './site-chrome';

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
  <meta property="og:url" content="https://agentathens.netlify.app/${slug}/">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="el_GR">
  <meta name="view-transition" content="same-origin">
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
