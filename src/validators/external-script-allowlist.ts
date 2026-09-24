/**
 * The exact external script URLs a published page may load (security loop
 * round 6).
 *
 * A host-wide allowlist (any <script src> on www.googletagmanager.com) lets a
 * page load ANY container from that host — /gtm.js?id=GTM-<someone else's>
 * runs arbitrary tag code on the site. The only external script the templates
 * emit is the GA4 loader in src/config/analytics.ts, so the gate allows exactly
 * that URL: host and path are pinned HERE (a protected file); only the
 * measurement id comes from analytics.ts, and only in the GA4 id shape. A
 * different id, path, scheme, extra query parameter or fragment fails.
 *
 * Same-origin scripts are not external and are not judged here.
 */

import he from 'he';
import { GA_MEASUREMENT_ID } from '../config/analytics';
import { BASE_URL } from '../config/site-url';

/** The gtag loader as renderAnalytics() emits it, minus the id. */
const GTAG_LOADER = 'https://www.googletagmanager.com/gtag/js';
/** A GA4 measurement id ("G-" + upper-case alphanumerics). */
const GA4_ID = /^G-[A-Z0-9]{4,20}$/;
const SITE_ORIGIN = new URL(BASE_URL).origin;
const FIX = 'fix: the only external scripts allowed are ALLOWED_EXTERNAL_SCRIPT_URLS in src/validators/external-script-allowlist.ts (the GA4 loader built from GA_MEASUREMENT_ID); remove the tag, or change the allowlist after review';

/** The loader URL for a GA4 id, exactly as the template emits it; null for anything that is not a GA4 id. */
export function gtagLoaderUrl(id: string): string | null {
  return GA4_ID.test(id) ? `${GTAG_LOADER}?id=${id}` : null;
}

/** Every external script URL a page may load, compared as WHATWG-normalised hrefs. */
export const ALLOWED_EXTERNAL_SCRIPT_URLS: ReadonlySet<string> = new Set(
  [gtagLoaderUrl(GA_MEASUREMENT_ID)]
    .filter((u): u is string => u !== null)
    .map(u => new URL(u).href),
);

/**
 * Null when a <script src> (or SVG <script href>) value is same-origin or
 * exactly an allowlisted URL; otherwise the issue text. `decoded`: the value
 * was already entity-decoded by an HTML parser (false for raw attribute text).
 * The value is resolved the way the browser resolves it on the live site, so
 * "//host/x" counts as https://host/x.
 */
export function externalScriptSrcIssue(src: string, decoded = true): string | null {
  const value = (decoded ? src : he.decode(src, { isAttributeValue: true })).replace(/[\t\n\r]/g, '').trim();
  let url: URL;
  try {
    url = new URL(value, `${SITE_ORIGIN}/`);
  } catch {
    return `unparseable <script src> "${value.slice(0, 80)}" (${FIX})`;
  }
  if (url.origin === SITE_ORIGIN || ALLOWED_EXTERNAL_SCRIPT_URLS.has(url.href)) return null;
  const shown = url.protocol === 'http:' || url.protocol === 'https:' ? url.href : `${url.protocol} URL`;
  return `external script ${shown.slice(0, 160)} is not an allowed script URL (${FIX})`;
}
