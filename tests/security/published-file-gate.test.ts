/**
 * The published-output gate checks every file Netlify would deploy from
 * dist/, not only HTML: _redirects, _headers, copied scripts, SVG, JSON, XML,
 * CSS, iCalendar, images and PDFs, and it fails on any other file type.
 * Round-2 judges found _redirects, .js, .svg and the JSON API unchecked.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  scanCss, scanIcs, scanJson, scanRedirects, scanSvg, scanXml, validatePublishedArtifacts,
} from '../../src/validators/published-artifacts';
import { renderHeadersFile } from '../../src/generators/security-headers';

const REPO = join(import.meta.dir, '../..');
const GENERATED_REDIRECTS = [
  'https://agentathens.netlify.app/*  https://agentathens.com/:splat  301!',
  '/sitemap.xml  /sitemap-index.xml  301',
  '/en  /en/today  302',
  '/en/  /en/today  302',
  '',
  '/events/abc12345-gazarte-old-title/* /events/abc12345-gazarte-new-title/:splat 301!',
  '',
  '# archive-410 (GEO Ruling 2 — bounded 45–90d band; event pages only)',
  '/events/def67890-venue-title/ /410.html 410!',
  '',
].join('\n');

describe('_redirects', () => {
  test('the generator\'s rule families pass', () => expect(scanRedirects(GENERATED_REDIRECTS)).toEqual([]));

  for (const [name, line] of [
    ['site-wide splat to another origin', '/* https://attacker.example/:splat 302!'],
    ['injected rule after a slug', '/events/old /x 200'],
    ['external target on a slug rule', '/events/abc/* https://attacker.example/:splat 301!'],
    ['200 rewrite of every event', '/events/* /evil.html 200!'],
    ['protocol-relative target', '/events/abc/* //attacker.example/:splat 301!'],
    ['condition field (country/role)', '/events/abc/* /events/def/:splat 301! Country=gr'],
    ['query-parameter match', '/events/abc/ id=:id /events/def/ 301!'],
    ['uppercase slug', '/events/ABC/* /events/def/:splat 301!'],
    ['proxy to canonical host with other path', 'https://agentathens.netlify.app/* https://agentathens.com/x/:splat 301!'],
    ['two-field rule', '/events/abc/ /events/def/'],
  ]) {
    test(`fails: ${name}`, () => expect(scanRedirects(`${GENERATED_REDIRECTS}${line}\n`).length).toBeGreaterThan(0));
  }
});

describe('SVG', () => {
  test('the favicon passes', () => expect(scanSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#111"/><text x="16" y="24">a</text></svg>')).toEqual([]));
  for (const bad of [
    '<svg><script>alert(1)</script></svg>',
    '<svg><svg:script>alert(1)</svg:script></svg>',
    '<svg onload="alert(1)"></svg>',
    '<svg><a href="javascript:alert(1)"><text>x</text></a></svg>',
    '<svg><image xlink:href="data:image/svg+xml,<svg onload=alert(1)>"/></svg>',
    '<svg><foreignObject><div>x</div></foreignObject></svg>',
  ]) test(`fails: ${bad.slice(0, 50)}`, () => expect(scanSvg(bad).length).toBeGreaterThan(0));
});

describe('JSON', () => {
  test('clean API JSON passes; prose keys may hold anything but tags', () => {
    expect(scanJson(JSON.stringify({
      events: [{ url: 'https://www.viva.gr/x/', ticketUrl: '', imageLocal: '/images/events/a.webp', imageSource: 'scraped: listing', ticketUrlStatus: 'direct', title: 'Rock: live', '@id': 'https://agentathens.com/#org' }],
      meta: { apiUrl: '/api/today.json' },
    }))).toEqual([]);
  });
  for (const [name, value] of [
    ['javascript: url', { url: 'javascript:alert(1)' }],
    ['javascript: with leading control chars', { imageUrl: '\u0001 javascript:alert(1)' }],
    ['data: image', { imageLocal: 'data:image/svg+xml,<svg onload=alert(1)>' }],
    ['protocol-relative ticketUrl', { ticketUrl: '//evil.example/' }],
    ['nested JSON-LD url', { offers: [{ url: 'vbscript:x' }] }],
    ['markup in a url', { ticketUrlResolved: '"><x-pwn>' }],
    ['thumb in search index', { events: [{ thumb: 'javascript:alert(1)' }] }],
  ] as const) {
    test(`fails: ${name}`, () => expect(scanJson(JSON.stringify(value)).length).toBeGreaterThan(0));
  }
  test('fails: "<script" or "<!--" in the file text, even inside prose', () => {
    expect(scanJson('{"title":"</script><script>alert(1)</script>"}').length).toBeGreaterThan(0);
    expect(scanJson('{"title":"<!-- x"}').length).toBeGreaterThan(0);
    expect(scanJson('{"title":"\\u003cscript>"}')).toEqual([]);
  });
  test('fails: unparseable JSON', () => expect(scanJson('{"a":').length).toBeGreaterThan(0));
});

describe('XML', () => {
  const sitemap = (inner: string, ns = '') => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${ns}>${inner}</urlset>`;
  test('sitemaps with hreflang links pass', () => {
    expect(scanXml(sitemap('<url><loc>https://agentathens.com/x/</loc><lastmod>2026-09-23</lastmod><xhtml:link rel="alternate" hreflang="en" href="https://agentathens.com/en/x/"/></url>', ' xmlns:xhtml="http://www.w3.org/1999/xhtml"'))).toEqual([]);
  });
  for (const [name, xml] of [
    ['javascript: loc', sitemap('<url><loc>javascript:alert(1)</loc></url>')],
    ['XHTML script', sitemap('<h:script xmlns:h="http://www.w3.org/1999/xhtml">alert(1)</h:script>')],
    ['xhtml element other than link', sitemap('<xhtml:iframe src="https://x/"/>', ' xmlns:xhtml="http://www.w3.org/1999/xhtml"')],
    ['stylesheet PI', `<?xml-stylesheet type="text/xsl" href="https://evil.example/x.xsl"?>${sitemap('')}`],
    ['SVG namespace', sitemap('<s:svg xmlns:s="http://www.w3.org/2000/svg" onload="alert(1)"/>')],
    ['relative href', sitemap('<xhtml:link rel="alternate" href="/x/"/>', ' xmlns:xhtml="http://www.w3.org/1999/xhtml"')],
  ]) test(`fails: ${name}`, () => expect(scanXml(xml).length).toBeGreaterThan(0));
});

describe('CSS, iCalendar', () => {
  test('ordinary CSS passes (scroll-behavior is not IE behavior)', () => {
    expect(scanCss('body{background:url(/images/a.webp)} html{scroll-behavior:smooth} @import url("/styles/x.css");')).toEqual([]);
  });
  for (const bad of ['a{background:url(javascript:alert(1))}', 'a{width:expression(alert(1))}', 'a{behavior:url(x.htc)}', '@import url("https://evil.example/x.css");']) {
    test(`fails: ${bad}`, () => expect(scanCss(bad).length).toBeGreaterThan(0));
  }
  test('ICS URL properties must be http(s)', () => {
    expect(scanIcs('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nURL:https://agentathens.com/events/x/\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n')).toEqual([]);
    expect(scanIcs('BEGIN:VCALENDAR\r\nURL:javascript:alert(1)\r\nEND:VCALENDAR\r\n').length).toBeGreaterThan(0);
  });
});

describe('validatePublishedArtifacts walks every deployed file', () => {
  let dir: string;
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aa-file-gate-'));
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    mkdirSync(join(dir, 'images/events'), { recursive: true });
    writeFileSync(join(dir, 'index.html'), '<!doctype html><html><head></head><body><a href="/x/">x</a></body></html>');
    writeFileSync(join(dir, '_redirects'), GENERATED_REDIRECTS);
    writeFileSync(join(dir, '_headers'), renderHeadersFile());
    copyFileSync(join(REPO, 'node_modules/fuse.js/dist/fuse.mjs'), join(dir, 'scripts/fuse.mjs'));
    writeFileSync(join(dir, 'images/events/a.png'), PNG);
    writeFileSync(join(dir, 'search-index.json'), '{"events":[]}');
    writeFileSync(join(dir, 'robots.txt'), 'User-agent: *\n');
    writeFileSync(join(dir, '.slug-history.json'), '{}');
    copyFileSync(join(REPO, 'static/root-files/cv.pdf'), join(dir, 'cv.pdf'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const failures = () => validatePublishedArtifacts(dir).failures.map(f => `${f.file}: ${f.issues[0]}`);

  test('a clean dist passes and every type is counted', () => {
    const report = validatePublishedArtifacts(dir);
    expect(report.failures).toEqual([]);
    expect(report.byType).toEqual({ '.html': 1, _redirects: 1, _headers: 1, '.mjs': 1, '.png': 1, '.json': 1, '.txt': 1, '.pdf': 1 });
  });

  const cases: [string, () => void, RegExp][] = [
    ['an unknown script file', () => writeFileSync(join(dir, 'scripts/x.js'), 'alert(1)'), /scripts\/x\.js: script file not on the copied-script allowlist/],
    ['a modified copied script', () => writeFileSync(join(dir, 'scripts/fuse.mjs'), 'export default 1;alert(1)'), /scripts\/fuse\.mjs: script file content changed/],
    ['an unknown file type', () => writeFileSync(join(dir, 'payload.wasm'), 'x'), /payload\.wasm: file type ".wasm" is not on the published-file allowlist/],
    ['an extensionless file', () => writeFileSync(join(dir, 'events/README'.replace('events/', '')), 'x'), /README: file type "README"/],
    ['a tampered _headers', () => writeFileSync(join(dir, '_headers'), '/*\n  Content-Security-Policy: script-src *\n'), /_headers: _headers differs/],
    ['an injected _redirects rule', () => writeFileSync(join(dir, '_redirects'), `${GENERATED_REDIRECTS}/* https://attacker.example/:splat 302!\n`), /_redirects: _redirects line \d+/],
    ['HTML saved as .png', () => writeFileSync(join(dir, 'images/events/b.png'), '<html><script>alert(1)</script>'), /b\.png: content is not PNG data/],
    ['a JSON javascript: URL', () => writeFileSync(join(dir, 'api.json'), '{"url":"javascript:alert(1)"}'), /api\.json: url: "javascript:alert\(1\)" is not an http\(s\)/],
    ['an unexpected hidden file', () => writeFileSync(join(dir, '.htaccess'), 'x'), /\.htaccess: unexpected hidden file/],
    ['a PDF that is not a static copy', () => writeFileSync(join(dir, 'x.pdf'), '%PDF-1.4 /JS (alert)'), /x\.pdf: PDF that is not a static\/root-files copy/],
    ['a symlink', () => symlinkSync('/etc/passwd', join(dir, 'passwd.txt')), /passwd\.txt: not a regular file/],
    ['an SVG with script', () => writeFileSync(join(dir, 'logo.svg'), '<svg><script>alert(1)</script></svg>'), /logo\.svg: <script> in SVG/],
  ];
  for (const [name, plant, expected] of cases) {
    test(`fails on ${name}`, () => {
      plant();
      expect(failures().join('\n')).toMatch(expected);
    });
  }
});
