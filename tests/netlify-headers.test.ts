/**
 * tests/netlify-headers.test.ts — the site-wide security headers in netlify.toml.
 *
 * netlify.toml is the only place the published site gets its response headers
 * (the site is deployed with `netlify deploy --no-build`), so a header dropped
 * from the file is dropped from production with no other signal. These tests
 * parse the real file and pin:
 *   - the `/*` rule carries HSTS, Permissions-Policy, COOP, nosniff,
 *     X-Frame-Options and Referrer-Policy, and no rule carries the obsolete
 *     X-XSS-Protection;
 *   - the ENFORCED Content-Security-Policy holds only directives that cannot
 *     block a resource the pages load (no fetch directives), so it cannot break
 *     rendering;
 *   - the REPORT-ONLY policy lists every third-party host the templates load a
 *     script, stylesheet or frame from. The host inventory is taken from the
 *     template sources, so adding a new third-party loader without updating the
 *     policy fails here.
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');

type HeaderRule = { for: string; values: Record<string, string> };
const toml = Bun.TOML.parse(readFileSync(join(ROOT, 'netlify.toml'), 'utf-8')) as { headers?: HeaderRule[] };
const rules: HeaderRule[] = toml.headers ?? [];
const siteWide = rules.find((r) => r.for === '/*');

/** Header lookup is case-insensitive, like HTTP. */
function header(rule: HeaderRule | undefined, name: string): string | undefined {
  if (!rule) return undefined;
  const key = Object.keys(rule.values).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : String(rule.values[key]);
}

/** Parse a CSP string into directive → source list. */
function parseCsp(policy: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const part of policy.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    out.set(tokens[0].toLowerCase(), tokens.slice(1));
  }
  return out;
}

const FETCH_DIRECTIVES = [
  'default-src', 'script-src', 'script-src-elem', 'script-src-attr', 'style-src', 'style-src-elem',
  'style-src-attr', 'img-src', 'font-src', 'connect-src', 'media-src', 'frame-src', 'child-src',
  'worker-src', 'manifest-src', 'prefetch-src',
];

describe('netlify.toml — site-wide security headers', () => {
  test('a /* header rule exists', () => {
    expect(siteWide).toBeDefined();
  });

  test('Strict-Transport-Security: at least one year, includeSubDomains', () => {
    const v = header(siteWide, 'Strict-Transport-Security');
    expect(v).toBeDefined();
    const maxAge = Number(/max-age=(\d+)/i.exec(v!)?.[1] ?? 0);
    expect(maxAge).toBeGreaterThanOrEqual(31536000);
    expect(v!.toLowerCase()).toContain('includesubdomains');
  });

  test('Permissions-Policy denies camera, microphone and geolocation', () => {
    const v = header(siteWide, 'Permissions-Policy');
    expect(v).toBeDefined();
    for (const feature of ['camera', 'microphone', 'geolocation']) {
      expect(v!).toContain(`${feature}=()`);
    }
    // The share button (src/templates/action-bar.ts) uses navigator.share.
    expect(v!).not.toContain('web-share=()');
  });

  test('X-Frame-Options, nosniff, Referrer-Policy and COOP are set', () => {
    expect(header(siteWide, 'X-Frame-Options')).toBe('DENY');
    expect(header(siteWide, 'X-Content-Type-Options')).toBe('nosniff');
    expect(header(siteWide, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(header(siteWide, 'Cross-Origin-Opener-Policy')).toBe('same-origin');
  });

  test('no rule sends the obsolete X-XSS-Protection header', () => {
    for (const r of rules) expect(header(r, 'X-XSS-Protection')).toBeUndefined();
  });
});

describe('netlify.toml — enforced Content-Security-Policy', () => {
  const csp = parseCsp(header(siteWide, 'Content-Security-Policy') ?? '');

  test('carries the non-breaking hardening directives', () => {
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'self'"]);
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.get('form-action')).toEqual(["'self'"]);
    expect(csp.has('upgrade-insecure-requests')).toBe(true);
  });

  test('holds no fetch directive, so it cannot block a resource the pages load', () => {
    // Tightening script-src/style-src etc. belongs in the Report-Only policy
    // first; move a directive here only after the report-only policy is clean.
    for (const d of FETCH_DIRECTIVES) expect(csp.has(d)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Report-Only policy vs. what the templates actually load.
// ---------------------------------------------------------------------------

/** Non-test .ts files under the HTML-producing source dirs, plus static HTML. */
function templateSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === '__tests__') continue;
        walk(p);
      } else if (/\.(ts|html)$/.test(name) && !/\.test\.ts$/.test(name)) {
        out.push(p);
      }
    }
  };
  for (const d of ['src/templates', 'src/generators', 'src/config', 'static']) walk(join(ROOT, d));
  return out;
}

/** Origins of external <script src>, <iframe src> and stylesheet <link href> in the sources. */
function loadedOrigins(): { script: Set<string>; frame: Set<string>; style: Set<string> } {
  const script = new Set<string>();
  const frame = new Set<string>();
  const style = new Set<string>();
  for (const f of templateSources()) {
    const src = readFileSync(f, 'utf-8');
    for (const m of src.matchAll(/<script\b[^>]*\bsrc="(https?:\/\/[^/"$]+)/g)) script.add(m[1]);
    for (const m of src.matchAll(/<iframe\b[^>]*\bsrc="(https?:\/\/[^/"$]+)/g)) frame.add(m[1]);
    for (const m of src.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*\bhref="(https?:\/\/[^/"$]+)/g)) style.add(m[1]);
  }
  return { script, frame, style };
}

describe('netlify.toml — Content-Security-Policy-Report-Only (target strict policy)', () => {
  const raw = header(siteWide, 'Content-Security-Policy-Report-Only');
  const ro = parseCsp(raw ?? '');
  const origins = loadedOrigins();

  test('exists with a self-only default and no unsafe-eval', () => {
    expect(raw).toBeDefined();
    expect(ro.get('default-src')).toEqual(["'self'"]);
    expect(raw!).not.toContain("'unsafe-eval'");
    expect(ro.get('object-src')).toEqual(["'none'"]);
    expect(ro.get('frame-ancestors')).toEqual(["'none'"]);
  });

  test('script-src is self plus exact hosts only — no inline, no wildcard scheme', () => {
    const s = ro.get('script-src') ?? [];
    expect(s).toContain("'self'");
    expect(s).not.toContain("'unsafe-inline'");
    expect(s).not.toContain('https:');
    expect(s).not.toContain('*');
  });

  test('the source scan finds the known loaders (precondition: the scan is not vacuous)', () => {
    expect(origins.script.has('https://www.googletagmanager.com')).toBe(true);
    expect(origins.style.has('https://fonts.googleapis.com')).toBe(true);
    expect(origins.frame.has('https://www.openstreetmap.org')).toBe(true);
  });

  test('every external script host in the templates is allowed by script-src', () => {
    const s = ro.get('script-src') ?? [];
    for (const o of origins.script) expect(s).toContain(o);
  });

  test('every external stylesheet host is allowed by style-src, and fonts by font-src', () => {
    const s = ro.get('style-src') ?? [];
    for (const o of origins.style) expect(s).toContain(o);
    expect(ro.get('font-src') ?? []).toContain('https://fonts.gstatic.com');
  });

  test('every external iframe host is allowed by frame-src', () => {
    const s = ro.get('frame-src') ?? [];
    for (const o of origins.frame) expect(s).toContain(o);
  });

  test('GA4 beacons are allowed by connect-src', () => {
    const c = ro.get('connect-src') ?? [];
    expect(c).toContain("'self'");
    expect(c.some((h) => h.includes('google-analytics.com'))).toBe(true);
  });
});
