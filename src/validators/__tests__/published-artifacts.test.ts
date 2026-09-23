import { describe, test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { scanHtmlForArtifacts, validatePublishedArtifacts } from '../published-artifacts';

// Round-0 judges found these live: an escaped enrichment marker on 343–686
// event pages, "[PLACEHOLDER]" copy on 6 hubs, raw markdown tables on 44
// pages, and entity-encoded JSON-LD names. A green suite caught none of it.
const page = (body: string, ld = '{"@type":"Event","name":"Ty Segall"}') =>
  `<!doctype html><html><head><!-- build: ok --><script type="application/ld+json">${ld}</script></head><body>${body}</body></html>`;

describe('scanHtmlForArtifacts', () => {
  test('a clean page passes (real HTML comments are fine)', () => {
    expect(scanHtmlForArtifacts(page('<p>Rock at Floyd.</p>'))).toEqual([]);
  });

  test('an escaped comment rendered as text fails', () => {
    expect(scanHtmlForArtifacts(page('<p>Great night. &lt;!-- timeliness-expires: 2026-11-01 --&gt;</p>'))).toHaveLength(1);
  });

  test('a comment inside JSON-LD fails', () => {
    expect(scanHtmlForArtifacts(page('<p>x</p>', '{"@type":"Event","description":"Great <!-- timeliness-expires: x -->"}'))).toHaveLength(1);
  });

  test('placeholder copy fails, but not inside a real HTML comment', () => {
    expect(scanHtmlForArtifacts(page('<aside>[PLACEHOLDER] Athens never sleeps</aside>'))).toHaveLength(1);
    expect(scanHtmlForArtifacts(page('<!-- [PLACEHOLDER] note for editors --><p>x</p>'))).toEqual([]);
  });

  test('a markdown table separator row in the page text fails', () => {
    expect(scanHtmlForArtifacts(page('<p>| Ώρα | Χώρος |<br>| --- | --- |<br>| 21:00 | Floyd |</p>'))).toHaveLength(1);
  });

  test('an entity-encoded JSON-LD name fails; a decoded one passes', () => {
    expect(scanHtmlForArtifacts(page('<p>x</p>', '{"@type":"Event","name":"Play &amp; No Name Dogs"}'))).toHaveLength(1);
    expect(scanHtmlForArtifacts(page('<p>x</p>', '{"@type":"Event","name":"&#171;Κάρμεν&#187;"}'))).toHaveLength(1);
    expect(scanHtmlForArtifacts(page('<p>x</p>', '{"@type":"Event","name":"Play & No Name Dogs"}'))).toEqual([]);
    // The site's JSON-LD serialiser escapes "&" as \u0026 — the live leak reads \u0026amp;
    expect(scanHtmlForArtifacts(page('<p>x</p>', '{"@type":"Event","name":"PLAY \\u0026amp; NO NAME DOGS"}'))).toHaveLength(1);
    expect(scanHtmlForArtifacts(page('<p>x</p>', '{"@type":"Event","name":"Play \\u0026 No Name Dogs"}'))).toEqual([]);
  });

  test('no false positives that would block a legitimate daily build', () => {
    expect(scanHtmlForArtifacts(page('<h1>Rock | --- | Night</h1>'))).toEqual([]);          // title with pipes
    expect(scanHtmlForArtifacts(page('<p>A |----| B | C</p>'))).toEqual([]);                 // prose, no table header row
    expect(scanHtmlForArtifacts(page('<p>x</p><script>var s = "[PLACEHOLDER]";</script>'))).toEqual([]); // script text
  });

  test('catches the misses: entity in a JSON-LD description, LD script with extra attributes', () => {
    expect(scanHtmlForArtifacts(page('<p>x</p>', '{"@type":"Event","name":"A","description":"Rock \\u0026amp; roll"}'))).toHaveLength(1);
    const extraAttr = '<!doctype html><html><head><script type="application/ld+json" id="ld">{"@type":"Event","name":"A \\u0026amp; B"}</script></head><body><p>x</p></body></html>';
    expect(scanHtmlForArtifacts(extraAttr)).toHaveLength(1);
  });

  test('an ampersand entity in normal HTML text is fine', () => {
    expect(scanHtmlForArtifacts(page('<p>Play &amp; No Name Dogs</p>'))).toEqual([]);
  });
});

describe('validatePublishedArtifacts', () => {
  test('walks every .html file and reports each offending page', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aa-artifacts-'));
    try {
      mkdirSync(join(dir, 'events', 'a'), { recursive: true });
      writeFileSync(join(dir, 'index.html'), page('<p>ok</p>'));
      writeFileSync(join(dir, 'events', 'a', 'index.html'), page('<p>&lt;!-- timeliness-expires: x --&gt;</p>'));
      writeFileSync(join(dir, 'concerts.html'), page('<aside>[PLACEHOLDER] quote</aside>'));
      const report = validatePublishedArtifacts(dir);
      expect(report.scanned).toBe(3);
      expect(report.failures.map(f => f.file).sort()).toEqual(['concerts.html', 'events/a/index.html']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
