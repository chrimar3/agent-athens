/**
 * dist/_headers carries the enforced script CSP. Its hashes are derived from
 * the inline-script allowlist (never from built pages), so they must be
 * exactly the allowlisted scripts in CSP's base64 form, and every inline
 * script a template emits must be covered.
 */
import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { buildScriptCsp, CSP_SCRIPT_SOURCES, hexToCspHash, renderHeadersFile } from '../../src/generators/security-headers';
import { ALLOWED_EXTERNAL_SCRIPT_URLS } from '../../src/validators/external-script-allowlist';
import { INLINE_SCRIPT_ALLOWLIST } from '../../src/validators/inline-script-allowlist';
import { ALLOWED_SCRIPT_HOSTS } from '../../src/validators/published-artifacts';
import { renderImageFallbackScript } from '../../src/templates/image-fallback';
import { renderAnalytics } from '../../src/config/analytics';

/**
 * CSP3 host-source matching for the https sources used here: same scheme and
 * host, default port, and a path that ends in "/" matches as a prefix,
 * otherwise exactly; the query string is ignored.
 */
function cspAllows(source: string, target: string): boolean {
  const s = new URL(source);
  const t = new URL(target);
  if (t.protocol !== 'https:' || t.host !== s.host) return false;
  return s.pathname.endsWith('/') ? t.pathname.startsWith(s.pathname) : t.pathname === s.pathname;
}
const allowedByPolicy = (target: string) => CSP_SCRIPT_SOURCES.some(src => cspAllows(src, target));

const scriptSrc = () => buildScriptCsp().split('; ').find(d => d.startsWith('script-src '))!.split(' ').slice(1);

describe('enforced script CSP in _headers', () => {
  test('one rule for every path, one CSP header', () => {
    const text = renderHeadersFile();
    expect(text.split('\n')[0]).toBe('/*');
    expect(text.match(/Content-Security-Policy:/g)?.length).toBe(1);
    expect(text).not.toMatch(/Report-Only/);
  });

  test('script-src is self, the allowlisted hashes and the two GA script paths only — no unsafe-inline or unsafe-eval', () => {
    const sources = scriptSrc();
    const hashes = sources.filter(s => s.startsWith("'sha256-"));
    expect(sources[0]).toBe("'self'");
    expect(hashes.length).toBe(INLINE_SCRIPT_ALLOWLIST.length);
    expect(sources.filter(s => !s.startsWith("'sha256-") && s !== "'self'")).toEqual([...CSP_SCRIPT_SOURCES]);
    expect([...CSP_SCRIPT_SOURCES]).toEqual(['https://www.googletagmanager.com/gtag/js', 'https://www.googletagmanager.com/gtag/destination']);
    expect(buildScriptCsp()).not.toMatch(/unsafe-inline|unsafe-eval|strict-dynamic|\*/);
  });

  test('the CSP hosts equal the output gate\'s allowed script hosts', () => {
    expect([...new Set(CSP_SCRIPT_SOURCES.map(h => new URL(h).hostname))].sort()).toEqual([...ALLOWED_SCRIPT_HOSTS].sort());
  });

  test('every source is an exact path (no host-wide or prefix source), so no other container on the host is allowed', () => {
    for (const src of CSP_SCRIPT_SOURCES) {
      const u = new URL(src);
      expect({ src, path: u.pathname, search: u.search, hash: u.hash }).toEqual({ src, path: expect.stringMatching(/^\/[a-z]+\/[a-z]+$/), search: '', hash: '' });
    }
  });

  test('the policy admits the GA4 loader the output gate pins, and nothing else on that host', () => {
    expect(ALLOWED_EXTERNAL_SCRIPT_URLS.size).toBeGreaterThan(0);
    for (const url of ALLOWED_EXTERNAL_SCRIPT_URLS) expect({ url, allowed: allowedByPolicy(url) }).toEqual({ url, allowed: true });
    for (const html of [renderAnalytics()]) {
      for (const m of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) expect(allowedByPolicy(m[1])).toBe(true);
    }
    expect(allowedByPolicy('https://www.googletagmanager.com/gtag/destination?id=AW-123&l=dataLayer&cx=c')).toBe(true);
    for (const url of [
      'https://www.googletagmanager.com/gtm.js?id=GTM-EVIL',
      'https://www.googletagmanager.com/gtag/js/extra',
      'https://www.googletagmanager.com/gtag/jsx?id=G-1',
      'https://www.googletagmanager.com/debug/bootstrap?id=G-1',
      'https://www.googletagmanager.com/',
      'http://www.googletagmanager.com/gtag/js?id=G-1',
      'https://googletagmanager.com/gtag/js?id=G-1',
    ]) expect({ url, allowed: allowedByPolicy(url) }).toEqual({ url, allowed: false });
  });

  test('each hash is the base64 form of an allowlisted hex digest', () => {
    const fromCsp = new Set(scriptSrc().filter(s => s.startsWith("'sha256-")).map(s => Buffer.from(s.slice(8, -1), 'base64').toString('hex')));
    expect(fromCsp).toEqual(new Set(INLINE_SCRIPT_ALLOWLIST.map(e => e.sha256)));
  });

  test('a browser would accept the emitted image-fallback and GA bootstrap bodies', () => {
    for (const html of [renderImageFallbackScript(), renderAnalytics()]) {
      for (const m of html.matchAll(/<script>([\s\S]*?)<\/script\b[^>]*>/gi)) {
        const b64 = createHash('sha256').update(m[1]).digest('base64');
        expect(scriptSrc()).toContain(`'sha256-${b64}'`);
      }
    }
  });

  test('object-src none, base-uri self, frame-ancestors none, form-action self', () => {
    const csp = buildScriptCsp();
    for (const d of ["object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self'"]) expect(csp).toContain(d);
  });

  test('a malformed allowlist digest fails the build instead of emitting a broken policy', () => {
    expect(() => hexToCspHash('not-a-digest')).toThrow(/not a hex sha256/);
  });
});
