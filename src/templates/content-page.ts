// Content page template — static pages (about, editorial, corrections)
// Uses site chrome (nav, footer, hamburger) but no filter bar, cards, or hero.
// Supports locale for bilingual E-E-A-T pages (el + en).

import { renderSiteNav, renderSiteFooter, renderHamburgerMenu, renderHamburgerScript, renderFaviconLinks, renderFontLinks, renderCssLink } from './site-chrome';
import { renderSearchOverlay, renderSearchScript } from './search-overlay';

import { BASE_URL } from '../config/site-url';
import { renderAnalytics } from '../config/analytics';

interface ContentPageOptions {
  metaDescription?: string;
  schemaJson?: string;
  locale?: 'el' | 'en';
  /** Slug of the alternate-language version (for hreflang) */
  alternateSlug?: string;
  noindex?: boolean;
  extraScripts?: string;
}

/**
 * Renders a static content page with clean URL: dist/{slug}/index.html
 */
export function renderContentPage(
  slug: string,
  title: string,
  bodyHtml: string,
  options?: ContentPageOptions
): string {
  const locale = options?.locale ?? 'el';
  const ogLocale = locale === 'en' ? 'en_US' : 'el_GR';
  const defaultDesc = locale === 'en'
    ? `${title} — agent athens, daily Athens cultural events calendar`
    : `${title} — agent athens, ημερολόγιο πολιτιστικών εκδηλώσεων Αθήνας`;
  const metaDesc = options?.metaDescription || defaultDesc;

  const schemaBlock = options?.schemaJson
    ? `\n  <script type="application/ld+json">\n  ${options.schemaJson}\n  </script>`
    : '';

  // Canonical-to-root posture (2026-05-14 GEO decision): /en/<slug> content
  // pages canonicalize to their root counterparts. Strip locale prefix from
  // slug to derive root URL for canonical, og:url. Self/alt URLs for hreflang
  // discovery keep the locale-specific paths (search engines reconcile).
  const rootSlug = slug.replace(/^en\//, '');
  const canonicalUrl = `${BASE_URL}/${rootSlug}/`;

  // Hreflang links between Greek ↔ English
  let hreflangHtml = '';
  if (options?.alternateSlug) {
    const altLocale = locale === 'el' ? 'en' : 'el';
    const selfUrl = `${BASE_URL}/${slug}/`;
    const altUrl = `${BASE_URL}/${options.alternateSlug}/`;
    const enUrl = locale === 'en' ? selfUrl : altUrl;
    hreflangHtml = `
  <link rel="alternate" hreflang="el" href="${locale === 'el' ? selfUrl : altUrl}">
  <link rel="alternate" hreflang="en" href="${locale === 'en' ? selfUrl : altUrl}">
  <link rel="alternate" hreflang="x-default" href="${enUrl}">`;
  }

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${title} | agent-athens</title>
  <meta name="description" content="${metaDesc}">
  <link rel="canonical" href="${canonicalUrl}">${options?.noindex ? '\n  <meta name="robots" content="noindex">' : ''}${hreflangHtml}
  <meta property="og:title" content="${title} | agent-athens">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="${ogLocale}">
  <meta property="og:site_name" content="agent-athens">
  <meta property="og:image" content="${BASE_URL}/images/og/agentathens-default.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title} | agent-athens">
  <meta name="twitter:description" content="${metaDesc}">
  <meta name="twitter:image" content="${BASE_URL}/images/og/agentathens-default.png">${schemaBlock}
  <meta name="view-transition" content="same-origin">
  ${renderFaviconLinks()}
  ${renderFontLinks()}
  ${renderCssLink()}
${renderAnalytics()}
</head>
<body>
  ${renderSiteNav()}
  ${renderHamburgerMenu()}
  ${renderSearchOverlay()}

  <main class="content-page-body" id="main-content" tabindex="-1">
    ${bodyHtml}
  </main>

  ${renderSiteFooter()}
  ${renderHamburgerScript()}
  ${renderSearchScript()}
  ${options?.extraScripts || ''}
</body>
</html>`;
}
