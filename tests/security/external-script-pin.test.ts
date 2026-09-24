/**
 * Security loop round 6 — the analytics script is pinned to its exact URL.
 *
 * The published-artifact gate used to have no rule for external scripts (the
 * regular branch allowed any <script src> on www.googletagmanager.com). A
 * host-wide allowance lets a page load any container from that host, e.g.
 * /gtm.js?id=GTM-<someone else's>, which runs arbitrary tag code on the site.
 * src/validators/external-script-allowlist.ts now allows exactly the GA4
 * loader the template emits (src/config/analytics.ts): host and path pinned in
 * the protected module, id taken from GA_MEASUREMENT_ID in the GA4 shape.
 */
import { describe, expect, test, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { GA_MEASUREMENT_ID, renderAnalytics } from '../../src/config/analytics';
import { ALLOWED_EXTERNAL_SCRIPT_URLS, externalScriptSrcIssue, gtagLoaderUrl } from '../../src/validators/external-script-allowlist';
import { scanHtmlForArtifacts } from '../../src/validators/published-artifacts';

const ROOT = join(import.meta.dir, '..', '..');
const REAL = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
const page = (head: string) => `<!doctype html><html><head>${head}</head><body><p>Concert tonight</p></body></html>`;
const tag = (src: string) => `<script async src="${src}"></script>`;

const cleanup: string[] = [];
afterAll(() => { for (const d of cleanup) rmSync(d, { recursive: true, force: true }); });

describe('the allowlist is exactly what the template emits', () => {
  test('one URL: the GA4 loader for GA_MEASUREMENT_ID (host + path + id, as emitted)', () => {
    expect(GA_MEASUREMENT_ID).toMatch(/^G-[A-Z0-9]+$/);
    expect([...ALLOWED_EXTERNAL_SCRIPT_URLS]).toEqual([REAL]);
  });

  test('drift pin: the src renderAnalytics() emits is on the allowlist, and the rendered snippet passes the gate', () => {
    const srcs = [...renderAnalytics().matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]);
    expect(srcs).toEqual([REAL]);
    for (const s of srcs) expect(ALLOWED_EXTERNAL_SCRIPT_URLS.has(s)).toBe(true);
    expect(scanHtmlForArtifacts(page(renderAnalytics()))).toEqual([]);
  });

  test('gtagLoaderUrl accepts only a GA4 id (nothing that could add a path or parameter)', () => {
    expect(gtagLoaderUrl('G-ABC123')).toBe('https://www.googletagmanager.com/gtag/js?id=G-ABC123');
    for (const bad of ['', 'GTM-ABC123', 'G-abc123', 'G-ABC123&l=x', 'G-ABC/../../gtm.js', 'UA-1234-1', 'G-ABC123#x']) {
      expect(gtagLoaderUrl(bad)).toBeNull();
    }
  });
});

describe('externalScriptSrcIssue / scanHtmlForArtifacts', () => {
  test('the real emitted URL passes (also protocol-relative: the browser resolves it to the same https URL)', () => {
    expect(externalScriptSrcIssue(REAL)).toBeNull();
    expect(externalScriptSrcIssue(REAL.replace('https:', ''))).toBeNull();
    expect(scanHtmlForArtifacts(page(tag(REAL)))).toEqual([]);
  });

  test('same-origin scripts are not external (relative and absolute on the site)', () => {
    expect(externalScriptSrcIssue('/search.js')).toBeNull();
    expect(externalScriptSrcIssue('https://agentathens.com/search.js')).toBeNull();
  });

  const BAD: [string, string][] = [
    ['a different GA4 id', 'https://www.googletagmanager.com/gtag/js?id=G-EVIL0000'],
    ['another path on the host (GTM container)', 'https://www.googletagmanager.com/gtm.js?id=GTM-EVIL'],
    ['an extra parameter', `${REAL}&l=dataLayer2`],
    ['an extra parameter first', `https://www.googletagmanager.com/gtag/js?l=x&id=${GA_MEASUREMENT_ID}`],
    ['a repeated id parameter', `${REAL}&id=G-EVIL0000`],
    ['a fragment', `${REAL}#x`],
    ['plain http', REAL.replace('https:', 'http:')],
    ['no id', 'https://www.googletagmanager.com/gtag/js'],
    ['a look-alike host', `https://www.googletagmanager.com.evil.example/gtag/js?id=${GA_MEASUREMENT_ID}`],
    ['another host', 'https://evil.example/gtag/js'],
    ['a data: URL', 'data:text/javascript,alert(1)'],
  ];
  for (const [what, src] of BAD) {
    test(`fails with a clear message: ${what}`, () => {
      const issue = externalScriptSrcIssue(src);
      expect(issue).not.toBeNull();
      expect(issue!).toContain('not an allowed script URL');
      expect(issue!).toContain('external-script-allowlist.ts');
      const issues = scanHtmlForArtifacts(page(tag(src)));
      expect(issues.length).toBe(1);
      expect(issues[0]).toContain('not an allowed script URL');
    });
  }

  test('entity-encoded extra parameters are judged after decoding, as the browser sees them', () => {
    expect(scanHtmlForArtifacts(page(`<script async src="${REAL}&amp;l=x"></script>`))).toHaveLength(1);
    expect(externalScriptSrcIssue(`${REAL}&amp;l=x`, false)).not.toBeNull();
  });

  test('SVG <script href> / xlink:href and malformed markup are parsed like a browser', () => {
    expect(scanHtmlForArtifacts(page('<svg><script href="https://evil.example/x.js"></script></svg>'))).toHaveLength(1);
    expect(scanHtmlForArtifacts(page('<svg><script xlink:href="https://evil.example/y.js"></script></svg>'))).toHaveLength(1);
    // A quoted ">" before src does not end the tag for the parser:
    expect(scanHtmlForArtifacts(page('<script data-x=">" src="https://www.googletagmanager.com/gtm.js?id=GTM-EVIL"></script>'))).toHaveLength(1);
    expect(scanHtmlForArtifacts(page('<SCRIPT SRC="https://www.googletagmanager.com/gtm.js?id=GTM-EVIL"></SCRIPT>'))).toHaveLength(1);
  });

  test('the standalone CLI (publish mode re-check) fails a dist/ with a pinned-out script, naming the page', () => {
    const d = mkdtempSync(join(tmpdir(), 'aa-script-pin-'));
    cleanup.push(d);
    writeFileSync(join(d, 'index.html'), page(renderAnalytics()));
    writeFileSync(join(d, 'evil.html'), page(tag('https://www.googletagmanager.com/gtm.js?id=GTM-EVIL')));
    const r = Bun.spawnSync(['bun', 'run', join(ROOT, 'scripts/check-published-artifacts.ts'), d]);
    expect(r.exitCode).toBe(1);
    const err = r.stderr.toString();
    expect(err).toContain('evil.html');
    expect(err).not.toContain('index.html');
    expect(err).toContain('not an allowed script URL');
  });
});
