/**
 * Security loop round 8 — the off-machine live-site check.
 *
 * .github/workflows/live-site-check.yml runs .github/scripts/live-site-check.sh
 * every 6 hours on GitHub's runners: the homepage and the first event page of
 * the live sitemap must answer 200 (no redirect followed) with an enforced
 * script CSP free of 'unsafe-inline' / 'unsafe-eval' and of a host-wide
 * googletagmanager.com source, HSTS max-age >= 15552000 and nosniff. A stub
 * curl (CURL_BIN) serves fixture headers; nothing touches the network.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

const ROOT = join(import.meta.dir, '..', '..');
const SCRIPT = join(ROOT, '.github', 'scripts', 'live-site-check.sh');
const WORKFLOW = join(ROOT, '.github', 'workflows', 'live-site-check.yml');
const SITE = 'https://agentathens.com';
const EVENT = `${SITE}/events/2026-10-01-some-concert/`;

const tmpDirs: string[] = [];
afterAll(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });

const GOOD_CSP = "script-src 'self' 'sha256-abc=' https://www.googletagmanager.com/gtag/js https://www.googletagmanager.com/gtag/destination; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
const TOML_CSP = "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests";

type Page = { status?: string; headers?: string[]; body?: string; exit?: number };
const headers = (over: Record<string, string | null> = {}) => {
  const base: Record<string, string | null> = {
    'content-security-policy': GOOD_CSP,
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'content-type': 'text/html',
    ...over,
  };
  return Object.entries(base).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`);
};
const SITEMAP = (loc: string) => `<?xml version="1.0"?><urlset><url><loc>${loc}</loc></url><url><loc>${SITE}/other/</loc></url></urlset>`;

function fixture(pages: { home?: Page; sitemap?: Page; event?: Page; extra?: Record<string, Page> }) {
  const dir = mkdtempSync(join(tmpdir(), 'aa-live-check-'));
  tmpDirs.push(dir);
  const all: Record<string, Page> = {
    [`${SITE}/`]: { status: '200', headers: headers(), body: '<html></html>', ...pages.home },
    [`${SITE}/sitemap-events.xml`]: { status: '200', headers: ['content-type: application/xml'], body: SITEMAP(EVENT), ...pages.sitemap },
    [EVENT]: { status: '200', headers: headers(), body: '<html></html>', ...pages.event },
    ...pages.extra,
  };
  let i = 0;
  const map: string[] = [];
  for (const [url, p] of Object.entries(all)) {
    const k = `p${i++}`;
    map.push(`${url} ${k}`);
    writeFileSync(join(dir, `${k}.h`), `HTTP/2 ${p.status ?? '200'}\r\n${(p.headers ?? []).map((l) => `${l}\r\n`).join('')}\r\n`);
    writeFileSync(join(dir, `${k}.b`), p.body ?? '');
    writeFileSync(join(dir, `${k}.s`), p.status ?? '200');
    writeFileSync(join(dir, `${k}.x`), String(p.exit ?? 0));
  }
  writeFileSync(join(dir, 'map'), map.join('\n') + '\n');
  const curl = join(dir, 'curl');
  writeFileSync(curl, `#!/bin/bash
D="${dir}"
printf '%s\\n' "$*" >> "$D/calls"
H=''; O=''; U=''; prev=''
for a in "$@"; do
  case "$prev" in -D) H="$a" ;; -o) O="$a" ;; --url) U="$a" ;; esac
  prev="$a"
done
k="$(awk -v u="$U" '$1 == u { print $2 }' "$D/map")"
if [ -z "$k" ]; then echo "curl: (6) Could not resolve host (stub: unknown url)" >&2; exit 6; fi
x="$(cat "$D/$k.x")"
if [ "$x" != 0 ]; then echo "curl: (28) Operation timed out" >&2; exit "$x"; fi
cp "$D/$k.h" "$H"; cp "$D/$k.b" "$O"; printf '%s' "$(cat "$D/$k.s")"
`);
  chmodSync(curl, 0o755);
  return { dir, curl };
}

function run(fx: { dir: string; curl: string }, env: Record<string, string> = {}) {
  const r = Bun.spawnSync(['bash', SCRIPT], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe', env: { PATH: process.env.PATH ?? '/usr/bin:/bin', CURL_BIN: fx.curl, ...env } });
  const calls = existsSync(join(fx.dir, 'calls')) ? readFileSync(join(fx.dir, 'calls'), 'utf-8').trim().split('\n') : [];
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString(), calls };
}

describe('live-site-check.sh — a healthy site passes', () => {
  test('homepage + first sitemap event page, 200 with the required headers → PASS', () => {
    const r = run(fixture({}));
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(r.out).toContain('live-site-check: PASS');
    expect(r.out).toContain(EVENT);
    expect(r.calls).toHaveLength(3);
    for (const c of r.calls) {
      expect(c).toContain("--proto =https");
      expect(c).toContain('--max-redirs 0');
      expect(c).toMatch(/--max-time \d+/);
      expect(c).not.toMatch(/(^| )-L( |$)|--location/);
    }
  });

  test('the netlify.toml policy and the _headers script policy as two headers, or merged with a comma, pass', () => {
    const two = headers({ 'content-security-policy': TOML_CSP }).concat([`content-security-policy: ${GOOD_CSP}`]);
    expect(run(fixture({ home: { headers: two }, event: { headers: two } })).code).toBe(0);
    const merged = headers({ 'content-security-policy': `${TOML_CSP}, ${GOOD_CSP}` });
    expect(run(fixture({ home: { headers: merged }, event: { headers: merged } })).code).toBe(0);
  });

  test('header names match case-insensitively; HSTS max-age exactly 15552000 passes', () => {
    const h = ['Content-Security-Policy: ' + GOOD_CSP, 'Strict-Transport-Security: max-age=15552000', 'X-Content-Type-Options: NoSniff'];
    expect(run(fixture({ home: { headers: h }, event: { headers: h } })).code).toBe(0);
  });
});

describe('live-site-check.sh — each failure fails the run', () => {
  const failsWith = (pages: Parameters<typeof fixture>[0], msg: string) => {
    const r = run(fixture(pages));
    expect(r.code).toBe(1);
    expect(r.out).not.toContain('PASS');
    expect(r.err).toContain(msg);
    return r;
  };

  test('no enforced CSP (missing, or Report-Only only)', () => {
    failsWith({ home: { headers: headers({ 'content-security-policy': null }) } }, 'no enforced Content-Security-Policy');
    failsWith({ event: { headers: headers({ 'content-security-policy': null, 'content-security-policy-report-only': GOOD_CSP }) } }, 'no enforced Content-Security-Policy');
  });

  test('a CSP that does not restrict scripts (no script-src, no default-src)', () => {
    failsWith({ home: { headers: headers({ 'content-security-policy': TOML_CSP }) } }, 'no enforced policy restricts scripts');
  });

  for (const bad of ["'unsafe-inline'", "'unsafe-eval'", "'UNSAFE-INLINE'", '*', 'https:', 'data:']) {
    test(`script-src with ${bad}`, () => {
      failsWith({ event: { headers: headers({ 'content-security-policy': GOOD_CSP.replace("script-src 'self'", `script-src 'self' ${bad}`) }) } }, 'script source');
    });
  }

  test('an unsafe source through default-src (no script-src in that policy)', () => {
    failsWith({ home: { headers: headers({ 'content-security-policy': "default-src 'self' 'unsafe-inline'" }) } }, "'unsafe-inline' is allowed");
  });

  for (const host of ['https://www.googletagmanager.com', 'https://www.googletagmanager.com/', 'www.googletagmanager.com', 'https://*.googletagmanager.com', '*.googletagmanager.com', 'https://googletagmanager.com', 'HTTPS://WWW.GOOGLETAGMANAGER.COM']) {
    test(`a host-wide googletagmanager source: ${host}`, () => {
      failsWith({ home: { headers: headers({ 'content-security-policy': `script-src 'self' ${host}` }) } }, 'whole googletagmanager.com host');
    });
  }

  test('a path-specific googletagmanager source is fine (the pinned GA4 loader)', () => {
    const h = headers({ 'content-security-policy': "script-src 'self' https://www.googletagmanager.com/gtag/js" });
    expect(run(fixture({ home: { headers: h }, event: { headers: h } })).code).toBe(0);
  });

  test('an unsafe source in a SECOND enforced policy still fails', () => {
    failsWith({ home: { headers: headers({ 'content-security-policy': `${GOOD_CSP}, script-src 'unsafe-eval'` }) } }, "'unsafe-eval' is allowed");
  });

  test('HSTS missing, too short, or without max-age', () => {
    failsWith({ home: { headers: headers({ 'strict-transport-security': null }) } }, 'no Strict-Transport-Security');
    failsWith({ event: { headers: headers({ 'strict-transport-security': 'max-age=15551999' }) } }, 'below 15552000');
    failsWith({ event: { headers: headers({ 'strict-transport-security': 'includeSubDomains' }) } }, 'max-age is missing');
  });

  test('X-Content-Type-Options missing or not nosniff', () => {
    failsWith({ home: { headers: headers({ 'x-content-type-options': null }) } }, 'X-Content-Type-Options is not nosniff');
    failsWith({ event: { headers: headers({ 'x-content-type-options': 'sniff-away' }) } }, 'X-Content-Type-Options is not nosniff');
  });

  test('a non-200 status (a redirect is not followed) or a failed request', () => {
    failsWith({ home: { status: '301', headers: ['location: https://evil.example/'] } }, 'HTTP status 301');
    failsWith({ event: { status: '404' } }, 'HTTP status 404');
    failsWith({ home: { exit: 28 } }, 'request failed (curl exit 28');
  });

  test('the sitemap\'s first <loc> must be an https URL on the site; otherwise it is not fetched', () => {
    for (const loc of ['https://evil.example/x', `http://agentathens.com/events/x/`, 'https://agentathens.com.evil.example/x', `${SITE}/x?a=b`, `javascript:alert(1)`]) {
      const r = failsWith({ sitemap: { body: SITEMAP(loc) } }, 'the first <loc> is not an https URL on');
      expect(r.calls).toHaveLength(2);
      expect(r.calls.join('\n')).not.toContain('evil');
    }
    failsWith({ sitemap: { body: '<urlset></urlset>' } }, 'no <loc> entry');
    failsWith({ sitemap: { status: '500' } }, 'HTTP status 500');
  });

  test('response text quoted in the log is made printable (no injected workflow commands)', () => {
    const r = run(fixture({ home: { headers: headers({ 'x-content-type-options': 'x\u001b[31m::error::pwn' }) } }));
    expect(r.code).toBe(1);
    expect(r.err).not.toContain('\u001b');
    for (const line of `${r.out}\n${r.err}`.split('\n')) expect(line.startsWith('::')).toBe(false);
  });

  test('a SITE that is not https://<host> is refused', () => {
    for (const site of ['http://agentathens.com', 'https://agentathens.com/path', 'https://a.com;rm']) {
      const r = run(fixture({}), { SITE: site });
      expect(r.code).toBe(1);
      expect(r.calls).toHaveLength(0);
    }
  });
});

describe('live-site-check.yml', () => {
  const raw = readFileSync(WORKFLOW, 'utf-8');
  const wf = parseYaml(raw) as { on?: Record<string, unknown>; permissions: Record<string, string>; jobs: Record<string, { permissions?: unknown; environment?: unknown; steps: Array<{ uses?: string; run?: string; env?: Record<string, string>; with?: Record<string, unknown> }> }> };
  const on = (wf.on ?? (wf as unknown as Record<string, Record<string, unknown>>)[true as unknown as string]) as Record<string, unknown>;

  test('scheduled every 6 hours and on demand; read-only token; no secrets; no job permissions', () => {
    expect(Object.keys(on).sort()).toEqual(['schedule', 'workflow_dispatch']);
    expect((on.schedule as Array<{ cron: string }>)[0].cron).toMatch(/^\d+ \*\/6 \* \* \*$/);
    expect(wf.permissions).toEqual({ contents: 'read' });
    for (const job of Object.values(wf.jobs)) {
      expect(job.permissions).toBeUndefined();
      expect(job.environment).toBeUndefined();
    }
    expect(raw).not.toContain('secrets.');
  });

  test('runs the committed script with the pinned checkout (no token persisted)', () => {
    const steps = wf.jobs['live-site-check'].steps;
    expect(steps.find((s) => s.run === 'bash .github/scripts/live-site-check.sh')).toBeDefined();
    const co = steps.find((s) => (s.uses ?? '').startsWith('actions/checkout@'))!;
    expect(co.uses).toBe('actions/checkout@11d5960a326750d5838078e36cf38b85af677262');
    expect(String(co.with?.['persist-credentials'])).toBe('false');
  });
});
