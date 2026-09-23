/**
 * Whole-build crawl: run the real generator over a fixture database whose
 * every template-read string column is hostile (tests/security/helpers/
 * hostile-site.ts), then parse every emitted page with a real HTML parser.
 *
 * This covers pages no hand-picked render-function list reaches: the
 * /en/this-weekend answer capsule, hub and category pages, venue pages, the
 * homepage, overflow pages, search index, JSON API files and sitemaps.
 * Properties, per page:
 *   - no element or attribute that a payload created (x-pwn, data-pwn, autofocus)
 *   - no on* handler except the shared image fallback
 *   - URL attributes are http(s), relative, fragment, mailto or tel
 *   - no <iframe> off the OpenStreetMap embed, no meta refresh, object, embed or base
 *   - every JSON-LD block parses; no executable script carries a payload
 * JSON files must parse; XML files must not gain elements.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync, rmSync } from 'fs';
import { relative } from 'path';
import { load } from 'cheerio';
import { IMG_FALLBACK_ONERROR } from '../../src/templates/image-fallback';
import { buildHostileSite, listFiles, type HostileSite } from './helpers/hostile-site';

let site: HostileSite;
let files: string[] = [];

beforeAll(() => {
  site = buildHostileSite();
  files = listFiles(site.dist);
}, 240_000);

afterAll(() => {
  if (site?.root && !process.env.KEEP_HOSTILE_SITE) rmSync(site.root, { recursive: true, force: true });
});

const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'data', 'xlink:href', 'background', 'srcset', 'cite']);
const SAFE_URL = /^(?:https?:\/\/[^\s"<>`]+|\/(?!\/)[^\s"<>`]*|#[^\s"<>`]*|\?[^\s"<>`]*|mailto:[^\s"<>`]+|tel:[^\s"<>`]+|[a-z0-9][^\s:"<>`]*|)$/i;
const OSM_EMBED = /^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?/;

function htmlProblems(html: string): string[] {
  const $ = load(html);
  const problems: string[] = [];
  // A "$'" or "$`" in data that reaches a String.replace() replacement string
  // splices a copy of the page into itself.
  for (const marker of [/<!doctype/gi, /<\/head>/g, /<\/html>/g]) {
    if ((html.match(marker) ?? []).length > 1) problems.push(`page structure duplicated (${marker.source})`);
  }
  $('x-pwn').each(() => { problems.push('<x-pwn> element'); });
  $('iframe').each((_, el) => {
    const src = $(el).attr('src') ?? '';
    if (!OSM_EMBED.test(src)) problems.push(`iframe src=${src.slice(0, 60)}`);
  });
  $('meta[http-equiv]').each((_, el) => {
    if (/refresh/i.test($(el).attr('http-equiv') ?? '')) problems.push('meta refresh');
  });
  $('object, embed, base, frame, frameset').each((_, el) => { problems.push(`<${(el as any).name}>`); });
  $('script').each((_, el) => {
    const type = ($(el).attr('type') ?? '').trim().toLowerCase();
    const body = $(el).text();
    if (type === 'application/ld+json') {
      try { JSON.parse(body); } catch { problems.push('JSON-LD does not parse'); }
    } else if (/alert\(1\)/.test(body)) {
      problems.push(`payload inside executable <script>: ${body.slice(0, 60)}`);
    }
  });
  $('*').each((_, el) => {
    const tag = (el as any).name as string;
    const attrs = ((el as any).attribs ?? {}) as Record<string, string>;
    for (const [name, value] of Object.entries(attrs)) {
      if (name.includes('pwn') || name === 'autofocus') problems.push(`<${tag} ${name}>`);
      if (name.startsWith('on') && !(tag === 'img' && name === 'onerror' && value === IMG_FALLBACK_ONERROR)) {
        problems.push(`<${tag} ${name}="${value.slice(0, 40)}">`);
      }
      if (URL_ATTRS.has(name)) {
        const candidates = name === 'srcset' ? value.split(',').map(c => c.trim().split(/\s+/)[0]) : [value.trim()];
        for (const c of candidates) if (!SAFE_URL.test(c)) problems.push(`<${tag} ${name}="${c.slice(0, 60)}">`);
      }
      if (name === 'style') {
        if (/javascript:|expression\(|@import/i.test(value)) problems.push(`<${tag} style="${value.slice(0, 40)}">`);
        for (const m of value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
          if (!/^(?:https?:\/\/|\/(?!\/))[^\s"'()<>`\\]*$/.test(m[2])) problems.push(`<${tag} style url(${m[2].slice(0, 60)})>`);
        }
      }
    }
  });
  return [...new Set(problems)];
}

describe('whole-build crawl over a hostile fixture database', () => {
  test('the build emitted every page type', () => {
    const rel = files.map(f => relative(site.dist, f));
    expect({ output: site.output.slice(-400), has: rel.includes('index.html') }).toEqual({ output: site.output.slice(-400), has: true });
    for (const expected of [
      'en/this-weekend/index.html', 'this-weekend.html', 'en/today/index.html',
      'search-index.json', 'api/events.json', 'api/en/events.json', 'sitemap-events.xml',
    ]) expect({ expected, present: rel.includes(expected) }).toEqual({ expected, present: true });
    expect(rel.some(r => /^events\/hostile-/.test(r) || /^events\/.+\/index\.html$/.test(r))).toBe(true);
    expect(rel.some(r => /^en\/events\/.+\/index\.html$/.test(r))).toBe(true);
    expect(rel.some(r => /^venues\/.+\/index\.html$/.test(r))).toBe(true);
  });

  test('the /en/this-weekend capsule was computed from the hostile titles', () => {
    const $ = load(readFileSync(`${site.dist}/en/this-weekend/index.html`, 'utf-8'));
    expect($('.answer-capsule-text').text()).toContain('from Hostile');
  });

  test('a price range carrying "€" reaches the cards', () => {
    const html = readFileSync(`${site.dist}/en/this-weekend/index.html`, 'utf-8');
    expect(load(html)('.card-price').text()).toContain('€');
  });

  test('every HTML page parses to inert data', () => {
    const bad: Record<string, string[]> = {};
    for (const f of files.filter(f => f.endsWith('.html'))) {
      const problems = htmlProblems(readFileSync(f, 'utf-8'));
      if (problems.length) bad[relative(site.dist, f)] = problems;
    }
    const sample = Object.fromEntries(Object.entries(bad).slice(0, 12));
    expect({ pages: Object.keys(bad).length, sample }).toEqual({ pages: 0, sample: {} });
  }, 120_000);

  test('every JSON file parses', () => {
    const bad: string[] = [];
    for (const f of files.filter(f => f.endsWith('.json'))) {
      try { JSON.parse(readFileSync(f, 'utf-8')); } catch { bad.push(relative(site.dist, f)); }
    }
    expect(bad).toEqual([]);
  });

  test('XML files gain no elements from data', () => {
    const bad: string[] = [];
    for (const f of files.filter(f => f.endsWith('.xml'))) {
      const $ = load(readFileSync(f, 'utf-8'), { xml: true });
      if ($('x-pwn').length || $('[data-pwn]').length) bad.push(relative(site.dist, f));
    }
    expect(bad).toEqual([]);
  });

  test('the real build passes its own published-output gate and exits 0', () => {
    expect(site.output).toContain('published-artifact invariant:');
    expect(site.output).not.toContain('Published-artifact invariant FAILED');
    expect({ exitCode: site.exitCode, tail: site.exitCode === 0 ? '' : site.output.slice(-1500) }).toEqual({ exitCode: 0, tail: '' });
  });
});
