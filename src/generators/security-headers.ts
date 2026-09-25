/**
 * dist/_headers: the enforced script Content-Security-Policy.
 *
 * netlify.toml is a protected path, so the build ships the script policy in
 * Netlify's _headers file instead. The policy allows scripts from this origin,
 * the two GA4 script paths below, and exactly the inline scripts on the template
 * allowlist (src/validators/inline-script-allowlist.ts): each allowlisted hex
 * sha256 is converted to the base64 form CSP uses. Nothing is hashed from the
 * build output, so an inline script that is not on the allowlist is blocked
 * by the browser even if it reached a page.
 *
 * GA4 (security loop round 7): script-src names exact paths, not the host. A
 * host source would let a page load any container on www.googletagmanager.com
 * (/gtm.js?id=GTM-<someone else's> runs arbitrary tag code). A CSP source
 * whose path does not end in "/" matches exactly that path, and CSP ignores
 * the query string, so:
 *   - /gtag/js          the loader the templates emit (src/config/analytics.ts;
 *                       the published-output gate pins the full URL, id
 *                       included, in src/validators/external-script-allowlist.ts);
 *   - /gtag/destination the script gtag.js itself injects for destinations
 *                       linked to the tag in the Google tag / GA admin
 *                       (e.g. a linked Google Ads account). Those links are
 *                       set in Google's UI, not in this repo, so they cannot
 *                       be ruled out here; without this path they would fail
 *                       with a CSP violation.
 * GA4's beacons go to *.google-analytics.com (connect-src/img-src, not
 * script-src, not restricted by this policy).
 *
 * frame-ancestors and form-action repeat the netlify.toml enforced policy, so
 * the page stays protected whether Netlify merges the two headers (both
 * policies enforced) or lets _headers replace the netlify.toml value.
 */
import { INLINE_SCRIPT_ALLOWLIST } from '../validators/inline-script-allowlist';

/**
 * External script sources, as exact paths. Their hosts must equal
 * ALLOWED_SCRIPT_HOSTS in published-artifacts.ts, and every URL of
 * ALLOWED_EXTERNAL_SCRIPT_URLS (external-script-allowlist.ts) must match one.
 */
export const CSP_SCRIPT_SOURCES = [
  'https://www.googletagmanager.com/gtag/js',
  'https://www.googletagmanager.com/gtag/destination',
] as const;

/** CSP source expression for a hex sha256 digest. */
export function hexToCspHash(hex: string): string {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error(`inline-script allowlist entry is not a hex sha256: "${hex}"`);
  return `'sha256-${Buffer.from(hex, 'hex').toString('base64')}'`;
}

export function buildScriptCsp(): string {
  const hashes = INLINE_SCRIPT_ALLOWLIST.map(e => hexToCspHash(e.sha256));
  return [
    `script-src 'self' ${hashes.join(' ')} ${CSP_SCRIPT_SOURCES.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}

/** Full _headers file content: one rule for every path. */
export function renderHeadersFile(): string {
  return `/*\n  Content-Security-Policy: ${buildScriptCsp()}\n`;
}
