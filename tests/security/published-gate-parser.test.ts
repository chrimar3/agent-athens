/**
 * Round-3 judge probes against the published-output gate:
 *   - an unclosed `<script src="//evil…">` passed (the regex needed </script>
 *     and read "//evil" as a relative URL);
 *   - a dist/ without _headers passed, although the enforced script CSP lives
 *     only there;
 *   - a search-engine ownership-verification file (google<id>.html,
 *     BingSiteAuth.xml, .well-known/…) passed as plain HTML/XML/TXT.
 * The gate now parses pages with an HTML5 parser (as a browser builds them),
 * treats "//host" as that external host, requires _headers, and refuses
 * ownership proofs that are not on src/validators/verification-allowlist.ts.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { scanHtmlForArtifacts, validatePublishedArtifacts } from '../../src/validators/published-artifacts';
import { VERIFICATION_FILE_ALLOWLIST, VERIFICATION_META_ALLOWLIST } from '../../src/validators/verification-allowlist';
import { renderHeadersFile } from '../../src/generators/security-headers';
import { renderAnalytics } from '../../src/config/analytics';

const REPO = join(import.meta.dir, '../..');
const page = (body: string, head = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const issues = (html: string) => scanHtmlForArtifacts(html);

describe('malformed markup is judged as the browser parses it', () => {
  for (const [name, html] of [
    ['unclosed protocol-relative script (judge C probe)', page('<p>x</p><script src="//evil.example/x.js">')],
    ['unclosed script at end of file', '<!doctype html><html><body><p>x</p><script src="//evil.example/x.js">'],
    ['unclosed https script', page('<script src="https://evil.example/x.js"><p>rest of page</p>')],
    ['script src with no quotes and a slash', page('<script/src=//evil.example/x.js></script>')],
    ['backslash host', page('<script src="/\\evil.example/x.js"></script>')],
    ['SVG script href', page('<svg><script href="//evil.example/x.js"></script></svg>')],
    ['SVG script xlink:href', page('<svg><script xlink:href="https://evil.example/x.js"></script></svg>')],
    ['noscript breakout (mXSS)', page('<noscript><p title="</noscript><script src=//evil.example/x.js>">x</p></noscript>')],
    ['protocol-relative iframe', page('<iframe src="//evil.example/"></iframe>')],
    ['unclosed iframe', page('<iframe src="https://evil.example/">')],
    ['iframe inside noscript (no-JS visitors)', page('<noscript><iframe src="https://evil.example/"></iframe></noscript>')],
    ['protocol-relative stylesheet', page('', '<link rel="stylesheet" href="//evil.example/x.css">')],
    ['https stylesheet from an unlisted host', page('', '<link rel=stylesheet href=https://evil.example/x.css>')],
    ['modulepreload from an unlisted host', page('', '<link rel="modulepreload" href="//evil.example/x.js">')],
    ['injected verification meta', page('', '<meta name="google-site-verification" content="attacker-token">')],
    ['Bing verification meta with another token', page('', '<meta name="msvalidate.01" content="0000">')],
  ] as const) {
    test(`fails: ${name}`, () => expect(issues(html).length).toBeGreaterThan(0));
  }

  test('an unclosed external script is named with its host', () => {
    expect(issues(page('<script src="//evil.example/x.js">')).join('\n')).toMatch(/script from unlisted source https:\/\/evil\.example/);
  });

  for (const [name, html] of [
    ['same-origin script and the analytics loader', page('<script src="/scripts/site.js"></script>', renderAnalytics())],
    ['protocol-relative script on an allowlisted host', page('<script async src="//www.googletagmanager.com/gtag/js?id=G-G7Y6RQ6RF9"></script>')],
    ['same-origin absolute script', page('<script src="https://agentathens.com/scripts/site.js"></script>')],
    ['the webfont and site stylesheets, preconnects, canonical and alternates', page('', [
      '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500&amp;display=swap">',
      '<link rel="stylesheet" href="/styles/design-system.css?v=1"><link rel="icon" href="/favicon.svg" type="image/svg+xml">',
      '<link rel="canonical" href="https://agentathens.com/today/"><link rel="alternate" hreflang="en" href="https://agentathens.com/en/today/">',
    ].join(''))],
    ['protocol-relative OpenStreetMap embed', page('<iframe src="//www.openstreetmap.org/export/embed.html?bbox=1,2,3,4"></iframe>')],
    ['the allowlisted Bing verification meta', page('', `<meta name="msvalidate.01" content="${VERIFICATION_META_ALLOWLIST[0].content}">`)],
    ['script-like text in a noscript fallback', page('<noscript><a href="/en/colophon/" class="colophon-trigger-noscript">About</a></noscript>')],
    ['markup-looking text in an attribute', page('<a href="/x/" title="<script src=//evil.example/x.js></script>">x</a>')],
  ] as const) {
    test(`passes: ${name}`, () => expect(issues(html)).toEqual([]));
  }
});

describe('validatePublishedArtifacts: _headers is required, ownership proofs are allowlisted', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aa-gate-parser-'));
    writeFileSync(join(dir, 'index.html'), page('<a href="/x/">x</a>'));
    writeFileSync(join(dir, '_headers'), renderHeadersFile());
    copyFileSync(join(REPO, 'static/root-files/googled03df0efd969df1f.html'), join(dir, 'googled03df0efd969df1f.html'));
    writeFileSync(join(dir, 'a2f6526d99faa4a216d36574c34694a0.txt'), 'a2f6526d99faa4a216d36574c34694a0');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const failures = () => validatePublishedArtifacts(dir).failures.map(f => `${f.file}: ${f.issues.join('; ')}`).join('\n');

  test('a clean dist with the allowlisted proofs passes', () => expect(failures()).toBe(''));

  test('a dist without _headers fails', () => {
    rmSync(join(dir, '_headers'));
    expect(failures()).toMatch(/^_headers: missing/m);
  });

  test('a page with an unclosed external script fails the walk', () => {
    writeFileSync(join(dir, 'x.html'), page('<script src="//evil.example/x.js">'));
    expect(failures()).toMatch(/^x\.html: .*script from unlisted source/m);
  });

  for (const [path, content] of [
    ['google0123456789abcdef.html', 'google-site-verification: google0123456789abcdef.html'],
    ['BingSiteAuth.xml', '<?xml version="1.0"?><users><user>ABCDEF</user></users>'],
    ['yandex_0123456789abcdef.html', '<html><body>Verification: 0123456789abcdef</body></html>'],
    ['.well-known/assetlinks.json', '[]'],
    ['.well-known/security.txt', 'Contact: mailto:x@evil.example'],
    ['events/google0123456789abcdef.html', 'google-site-verification: google0123456789abcdef.html'],
    ['0123456789abcdef0123456789abcdef.txt', '0123456789abcdef0123456789abcdef'],
  ] as const) {
    test(`fails: planted ownership proof ${path}`, () => {
      mkdirSync(join(dir, path, '..'), { recursive: true });
      writeFileSync(join(dir, path), content);
      expect(failures()).toContain(`${path}: ownership-verification file not on the allowlist`);
    });
  }

  test('fails: the allowlisted Google path with another token', () => {
    writeFileSync(join(dir, 'googled03df0efd969df1f.html'), 'google-site-verification: google0000000000000000.html');
    expect(failures()).toMatch(/googled03df0efd969df1f\.html: ownership-verification file content differs/);
  });

  test('the allowlist matches static/root-files and config/indexnow.json', () => {
    const indexNow = JSON.parse(readFileSync(join(REPO, 'config/indexnow.json'), 'utf-8'));
    expect(VERIFICATION_FILE_ALLOWLIST.find(e => e.path.startsWith('google'))!.content)
      .toBe(readFileSync(join(REPO, 'static/root-files/googled03df0efd969df1f.html'), 'utf-8'));
    expect(VERIFICATION_FILE_ALLOWLIST.find(e => e.path === `${indexNow.indexnow_key}.txt`)?.content).toBe(indexNow.indexnow_key);
    expect(VERIFICATION_META_ALLOWLIST.find(e => e.name === 'msvalidate.01')?.content).toBe(indexNow.bing_wmt_verification);
  });
});
