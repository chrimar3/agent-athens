/**
 * dist/_headers: the enforced script Content-Security-Policy.
 *
 * netlify.toml is a protected path, so the build ships the script policy in
 * Netlify's _headers file instead. The policy allows scripts from this origin,
 * the GA4 loader host, and exactly the inline scripts on the template
 * allowlist (src/validators/inline-script-allowlist.ts): each allowlisted hex
 * sha256 is converted to the base64 form CSP uses. Nothing is hashed from the
 * build output, so an inline script that is not on the allowlist is blocked
 * by the browser even if it reached a page.
 *
 * GA4: gtag.js loads from www.googletagmanager.com; its beacons go to
 * *.google-analytics.com, which is connect-src/img-src, not script-src, and is
 * not restricted by this policy.
 *
 * frame-ancestors and form-action repeat the netlify.toml enforced policy, so
 * the page stays protected whether Netlify merges the two headers (both
 * policies enforced) or lets _headers replace the netlify.toml value.
 */
import { INLINE_SCRIPT_ALLOWLIST } from '../validators/inline-script-allowlist';

/** External script hosts; must equal ALLOWED_SCRIPT_HOSTS in published-artifacts.ts. */
export const CSP_SCRIPT_HOSTS = ['https://www.googletagmanager.com'] as const;

/** CSP source expression for a hex sha256 digest. */
export function hexToCspHash(hex: string): string {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error(`inline-script allowlist entry is not a hex sha256: "${hex}"`);
  return `'sha256-${Buffer.from(hex, 'hex').toString('base64')}'`;
}

export function buildScriptCsp(): string {
  const hashes = INLINE_SCRIPT_ALLOWLIST.map(e => hexToCspHash(e.sha256));
  return [
    `script-src 'self' ${hashes.join(' ')} ${CSP_SCRIPT_HOSTS.join(' ')}`,
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
