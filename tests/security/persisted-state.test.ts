/**
 * State files the build reads back from dist/ and data/ are untrusted input
 * (src/validators/persisted-state.ts). A hostile dist/.slug-history.json must
 * not add a _redirects rule: slugs are checked on load and again on emission.
 */
import { describe, expect, test } from 'bun:test';
import {
  isIsoTimestamp, isSafeSlug, parseSlugHistory, sanitizeAriaAggregate, sanitizeHashManifest, sanitizeOgCache, SLUG_PATTERN,
} from '../../src/validators/persisted-state';
import { generateArchiveGoneRules, generateEventSlug, generateRedirects } from '../../src/generators/event-page';
import { scanRedirects } from '../../src/validators/published-artifacts';
import { sampleConcert } from '../fixtures/events';

const INJECTION = 'old /x 200\n/* https://attacker.example/:splat 302!\n/y';

describe('slug shape', () => {
  test('real generated slugs match SLUG_PATTERN, including the longest title and venue', () => {
    const long = { ...sampleConcert, id: 'f0e1d2c3b4a5968778695a4b3c2d1e0f', title: 'Ω'.repeat(200) + ' ' + 'x'.repeat(200), venue: { ...sampleConcert.venue, name: 'Θέατρο '.repeat(40) } };
    for (const e of [sampleConcert, long]) expect(generateEventSlug(e)).toMatch(SLUG_PATTERN);
  });
  for (const bad of [INJECTION, 'a b', 'UPPER', '../x', 'x/*', 'x:splat', '', 'a'.repeat(161), 'ö']) {
    test(`rejects ${JSON.stringify(bad).slice(0, 30)}`, () => expect(isSafeSlug(bad)).toBe(false));
  }
});

describe('parseSlugHistory', () => {
  test('keeps well-formed slugs and counts every dropped value', () => {
    const { value, dropped } = parseSlugHistory({
      a: ['good-slug', INJECTION, 'also-good', 'third-good', 'fourth-good'],
      b: '/* https://attacker.example/ 302!',
      c: [{ slug: 'x' }, 42],
      d: ['only-good'],
    });
    expect([...value.entries()]).toEqual([['a', ['good-slug', 'also-good', 'third-good']], ['d', ['only-good']]]);
    expect(dropped).toBe(1 /* INJECTION */ + 1 /* b */ + 2 /* c */);
  });
  test('non-object JSON yields an empty history', () => {
    for (const raw of [[], 'x', 7, null]) expect(parseSlugHistory(raw).value.size).toBe(0);
  });
});

describe('redirect emission re-checks slugs', () => {
  test('generateRedirects drops a hostile previous or current slug; valid ones still redirect', () => {
    const current = new Map([['e1', 'e1-venue-new'], ['e2', 'e2-venue-new'], ['e3', 'BAD CURRENT']]);
    const history = new Map([['e1', ['e1-venue-new', 'e1-venue-old']], ['e2', [INJECTION]], ['e3', ['e3-old']]]);
    const rules = generateRedirects(current, history);
    expect(rules).toEqual(['/events/e1-venue-old/* /events/e1-venue-new/:splat 301!']);
    expect(scanRedirects(rules.join('\n'))).toEqual([]);
  });

  test('generateArchiveGoneRules drops an event whose slug would break the rule', () => {
    const old = { ...sampleConcert, id: 'ID WITH SPACE /* https://x', startDate: '2026-01-01T20:00:00', endDate: undefined };
    const rules = generateArchiveGoneRules([old]);
    expect(rules.every(r => /^\/events\/[a-z0-9-]+\/ \/410\.html 410!$/.test(r))).toBe(true);
    expect(rules.join('\n')).not.toContain('https://x');
  });
});

describe('manifests, caches and aggregates', () => {
  test('hash manifests keep only {hex hash, YYYY-MM-DD}', () => {
    const { value, dropped } = sanitizeHashManifest({
      version: 1,
      generatedAt: '<x-pwn>',
      entries: {
        ok: { hash: '0123456789abcdef', lastModified: '2026-09-22' },
        badDate: { hash: '0123456789abcdef', lastModified: '</lastmod><x-pwn/>' },
        badHash: { hash: 'zz"<', lastModified: '2026-09-22' },
        notObject: 'x',
      },
    });
    expect(value).toEqual({ version: 1, generatedAt: '', entries: { ok: { hash: '0123456789abcdef', lastModified: '2026-09-22' } } });
    expect(dropped).toBe(3);
  });
  test('OG cache keeps slug → alphanumeric hash', () => {
    expect(sanitizeOgCache({ 'good-slug': 'abc123', '../x': 'abc', 'ok': '</script>' })).toEqual({ value: { 'good-slug': 'abc123' }, dropped: 2 });
  });
  test('aria aggregate keeps integer counts and an ISO lastUpdate', () => {
    const zero = { total: 0, pass: 0, warn: 0, fail: 0, info: 0 };
    const fallback = { hub_template: zero, event_template: zero };
    const good = { total: 3, pass: 3, warn: 0, fail: 0, info: 0 };
    expect(sanitizeAriaAggregate({ hub_template: good, event_template: { ...good, fail: '<x>' }, meta: { lastUpdate: '2026-05-21T22:16:08.620Z' } }, fallback))
      .toEqual({ value: { hub_template: good, event_template: zero, meta: { lastUpdate: '2026-05-21T22:16:08.620Z' } }, dropped: 1 });
  });
  test('carried-forward timestamps must be ISO', () => {
    expect(isIsoTimestamp('2026-09-22T10:01:41.433+03:00')).toBe(true);
    expect(isIsoTimestamp('2026-09-22T07:01:41.433Z')).toBe(true);
    for (const bad of ['<script>', '2026-09-22', '2026-13-45T99:99:99Z', 7]) expect(isIsoTimestamp(bad)).toBe(false);
  });
});
