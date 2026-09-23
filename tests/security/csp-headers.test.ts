/**
 * dist/_headers carries the enforced script CSP. Its hashes are derived from
 * the inline-script allowlist (never from built pages), so they must be
 * exactly the allowlisted scripts in CSP's base64 form, and every inline
 * script a template emits must be covered.
 */
import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { buildScriptCsp, CSP_SCRIPT_HOSTS, hexToCspHash, renderHeadersFile } from '../../src/generators/security-headers';
import { INLINE_SCRIPT_ALLOWLIST } from '../../src/validators/inline-script-allowlist';
import { ALLOWED_SCRIPT_HOSTS } from '../../src/validators/published-artifacts';
import { renderImageFallbackScript } from '../../src/templates/image-fallback';
import { renderAnalytics } from '../../src/config/analytics';

const scriptSrc = () => buildScriptCsp().split('; ').find(d => d.startsWith('script-src '))!.split(' ').slice(1);

describe('enforced script CSP in _headers', () => {
  test('one rule for every path, one CSP header', () => {
    const text = renderHeadersFile();
    expect(text.split('\n')[0]).toBe('/*');
    expect(text.match(/Content-Security-Policy:/g)?.length).toBe(1);
    expect(text).not.toMatch(/Report-Only/);
  });

  test('script-src is self, the allowlisted hashes and the GA host only — no unsafe-inline or unsafe-eval', () => {
    const sources = scriptSrc();
    const hashes = sources.filter(s => s.startsWith("'sha256-"));
    expect(sources[0]).toBe("'self'");
    expect(hashes.length).toBe(INLINE_SCRIPT_ALLOWLIST.length);
    expect(sources.filter(s => !s.startsWith("'sha256-") && s !== "'self'")).toEqual([...CSP_SCRIPT_HOSTS]);
    expect(buildScriptCsp()).not.toMatch(/unsafe-inline|unsafe-eval|strict-dynamic|\*/);
  });

  test('the CSP hosts equal the output gate\'s allowed script hosts', () => {
    expect(CSP_SCRIPT_HOSTS.map(h => new URL(h).hostname).sort()).toEqual([...ALLOWED_SCRIPT_HOSTS].sort());
  });

  test('each hash is the base64 form of an allowlisted hex digest', () => {
    const fromCsp = new Set(scriptSrc().filter(s => s.startsWith("'sha256-")).map(s => Buffer.from(s.slice(8, -1), 'base64').toString('hex')));
    expect(fromCsp).toEqual(new Set(INLINE_SCRIPT_ALLOWLIST.map(e => e.sha256)));
  });

  test('a browser would accept the emitted image-fallback and GA bootstrap bodies', () => {
    for (const html of [renderImageFallbackScript(), renderAnalytics()]) {
      for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
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
