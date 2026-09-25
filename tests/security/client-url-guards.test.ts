/**
 * Client-rendered pages put values from JSON into href/src. The build
 * sanitises those JSON fields, and the page scripts check them again, so a
 * stale or hostile /api/*.json or search-index.json cannot produce a
 * javascript:, data: or protocol-relative link. The guard functions are taken
 * from the shipped script text and run here against hostile values.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderSearchScript } from '../../src/templates/search-overlay';

const TONIGHT = readFileSync(join(import.meta.dir, '../../static/root-files/tonight.html'), 'utf-8');

function extractFunction(source: string, name: string): (v: unknown) => unknown {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) {
      return new Function(`${source.slice(start, i + 1)}; return ${name};`)() as (v: unknown) => unknown;
    }
  }
  throw new Error(`function ${name} not closed`);
}

const HOSTILE = [
  'javascript:alert(1)', ' javascript:alert(1)', 'JaVaScRiPt:alert(1)', '\tjavascript:alert(1)', 'java\nscript:alert(1)',
  'data:text/html,<script>alert(1)</script>', 'vbscript:x', '//evil.example/', '/\\evil.example/', '\\\\evil.example',
  'https:evil.example', 'https:///evil', '"><img src=x onerror=alert(1)>', 'mailto:x@y', 42, null, undefined, { toString: () => 'javascript:x' },
];
const SAFE = ['https://www.viva.gr/tickets/x/?a=1&b=2', 'http://example.com/', '/images/events/a.webp', '/events/x/'];

describe('tonight.html safeUrl', () => {
  const safeUrl = extractFunction(TONIGHT, 'safeUrl');
  for (const v of HOSTILE) test(`drops ${String(JSON.stringify(v) ?? v).slice(0, 40)}`, () => expect(safeUrl(v)).toBe(''));
  for (const v of SAFE) test(`keeps ${v}`, () => expect(safeUrl(v)).toBe(v));
  test('every href/src the page sets goes through safeUrl', () => {
    expect(TONIGHT).toContain("var url = safeUrl(event.url) || '#';");
    expect(TONIGHT).toContain('var img = safeUrl(event.imageLocal) || safeUrl(event.imageUrl);');
    expect(TONIGHT).not.toMatch(/setAttribute\(\s*'on/);
  });
});

describe('search overlay guards', () => {
  for (const locale of ['el', 'en'] as const) {
    const script = renderSearchScript(locale);
    const safeSrc = extractFunction(script, 'safeSrc');
    const isPlainSlug = extractFunction(script, 'isPlainSlug');
    test(`${locale}: thumb guard drops every hostile value`, () => {
      for (const v of HOSTILE) expect({ v, out: safeSrc(v) }).toEqual({ v, out: '' });
      for (const v of SAFE) expect(safeSrc(v)).toBe(v);
    });
    test(`${locale}: category slug guard refuses protocol-relative and path tricks`, () => {
      for (const v of ['/evil.example', 'x/../../y', 'javascript:x', 'A', '']) expect(isPlainSlug(v)).toBe(false);
      expect(isPlainSlug('concerts')).toBe(true);
    });
    test(`${locale}: thumbs and category links use the guards`, () => {
      expect(script).toContain('var thumb = safeSrc(e.thumb);');
      expect(script).toContain("el.href = isPlainSlug(c.slug) ? '/' + c.slug + '/' : '#';");
    });
  }
});
