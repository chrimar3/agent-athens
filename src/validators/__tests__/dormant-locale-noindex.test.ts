import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import {
  checkDormantNoindexInvariant,
  validateDormantLocaleNoindex,
  readRobotsIsNoindex,
  type DormantNoindexFacts,
} from '../dormant-locale-noindex';

/**
 * S(this) — paired build-FAIL invariant for the dormant-locale noindex sweep.
 * Two rules:
 *   Rule 1 — in any sitemap ⟹ NOT noindex
 *   Rule 2 — has /en/ twin   ⟹ noindex AND absent from all sitemaps
 */
describe('checkDormantNoindexInvariant (pure core)', () => {
  const facts = (o: Partial<DormantNoindexFacts>): DormantNoindexFacts => ({
    page: 'today',
    hasEnTwin: false,
    isNoindex: false,
    inSitemap: false,
    ...o,
  });

  // ---- Rule 2: dormant bare-root (has en twin) ----
  test('twin + noindex + absent → PASS (the post-fix dormant state, e.g. /today)', () => {
    expect(
      checkDormantNoindexInvariant(facts({ hasEnTwin: true, isNoindex: true, inSitemap: false })),
    ).toBeNull();
  });

  test('twin + INDEXABLE + absent → FAIL (the current /today drift)', () => {
    const r = checkDormantNoindexInvariant(
      facts({ page: 'today', hasEnTwin: true, isNoindex: false, inSitemap: false }),
    );
    expect(r).not.toBeNull();
    expect(r!.rule).toBe('DORMANT_NOINDEX_DRIFT');
  });

  test('twin + noindex + IN sitemap → FAIL (saved: noindex but advertised)', () => {
    const r = checkDormantNoindexInvariant(
      facts({ page: 'saved/', hasEnTwin: true, isNoindex: true, inSitemap: true }),
    );
    expect(r).not.toBeNull();
    // Rule 1 fires first (in sitemap + noindex), which is the cleaner message.
    expect(r!.rule).toBe('NOINDEX_IN_SITEMAP');
  });

  // ---- Rule 1: sitemap membership demands indexable ----
  test('no twin + indexable + in sitemap → PASS (combo page, e.g. /concert-today)', () => {
    expect(
      checkDormantNoindexInvariant(
        facts({ page: 'concert-today', hasEnTwin: false, isNoindex: false, inSitemap: true }),
      ),
    ).toBeNull();
  });

  test('no twin + NOINDEX + in sitemap → FAIL (combo wrongly noindexed)', () => {
    const r = checkDormantNoindexInvariant(
      facts({ page: 'concert-today', hasEnTwin: false, isNoindex: true, inSitemap: true }),
    );
    expect(r).not.toBeNull();
    expect(r!.rule).toBe('NOINDEX_IN_SITEMAP');
  });

  // ---- Out-of-domain pages must NOT be flagged ----
  test('no twin + noindex + absent → PASS (404 / utility page, out of domain)', () => {
    expect(
      checkDormantNoindexInvariant(
        facts({ page: '404', hasEnTwin: false, isNoindex: true, inSitemap: false }),
      ),
    ).toBeNull();
  });

  test('no twin + indexable + absent → PASS (orphan single-locale, nothing to enforce)', () => {
    expect(
      checkDormantNoindexInvariant(
        facts({ hasEnTwin: false, isNoindex: false, inSitemap: false }),
      ),
    ).toBeNull();
  });
});

describe('readRobotsIsNoindex', () => {
  test('detects noindex and noindex, follow', () => {
    expect(readRobotsIsNoindex('<meta name="robots" content="noindex">')).toBe(true);
    expect(readRobotsIsNoindex('<meta name="robots" content="noindex, follow">')).toBe(true);
  });
  test('absent or index → false', () => {
    expect(readRobotsIsNoindex('<head></head>')).toBe(false);
    expect(readRobotsIsNoindex('<meta name="robots" content="index, follow">')).toBe(false);
  });
});

describe('validateDormantLocaleNoindex (IO, dist fixture)', () => {
  const dist = join(import.meta.dir, '__fixtures__', 'dist-dln');

  beforeAll(() => {
    rmSync(dist, { recursive: true, force: true });
    // Sitemaps: /today absent (dropped), /concert-today present, /saved/ present (the bug).
    mkdirSync(dist, { recursive: true });
    const sm = (locs: string[]) =>
      `<?xml version="1.0"?><urlset>${locs
        .map((l) => `<loc>https://agentathens.com/${l}</loc>`)
        .join('')}</urlset>`;
    writeFileSync(join(dist, 'sitemap-events.xml'), sm([]));
    writeFileSync(join(dist, 'sitemap-venues.xml'), sm([]));
    writeFileSync(
      join(dist, 'sitemap-editorial.xml'),
      // Note: en/dance/ is deliberately NOT in the sitemap (stale-twin case).
      sm(['concert-today', 'dance', 'en/today/', 'en/about/', 'en/saved/', 'saved/']),
    );

    // en twins on disk for today, about, saved — AND a STALE en/dance/ left over
    // from a prior build (dance dropped below the event threshold this build, so
    // its twin is no longer in the sitemap, but the file lingers). The validator
    // must key liveness off the sitemap, not disk, and NOT flag dance.
    for (const s of ['today', 'about', 'saved', 'dance']) {
      mkdirSync(join(dist, 'en', s), { recursive: true });
      writeFileSync(join(dist, 'en', s, 'index.html'), '<html></html>');
    }
    mkdirSync(join(dist, 'en', 'events'), { recursive: true }); // must be ignored

    // Bare-root pages.
    const page = (noindex: boolean) =>
      `<head>${noindex ? '<meta name="robots" content="noindex, follow">' : ''}<link rel="canonical" href="x"></head>`;
    writeFileSync(join(dist, 'today.html'), page(false));           // BUG: twin, indexable, absent
    writeFileSync(join(dist, 'concert-today.html'), page(false));    // OK: no twin, indexable, in sitemap
    writeFileSync(join(dist, 'dance.html'), page(false));            // OK: STALE disk twin, but no live (sitemap) twin → indexable + in sitemap
    mkdirSync(join(dist, 'about'), { recursive: true });
    writeFileSync(join(dist, 'about', 'index.html'), page(false));   // BUG: twin, indexable, absent
    mkdirSync(join(dist, 'saved'), { recursive: true });
    writeFileSync(join(dist, 'saved', 'index.html'), page(true));    // BUG: twin, noindex, IN sitemap
    writeFileSync(join(dist, '404.html'), page(true));               // OK: no twin, noindex, absent
  });

  afterAll(() => rmSync(dist, { recursive: true, force: true }));

  test('flags today + about (twin, indexable, absent) and saved (noindex in sitemap)', () => {
    const report = validateDormantLocaleNoindex(dist);
    const flagged = new Set(report.failures.map((f) => f.page.replace(/\/$/, '')));
    expect(flagged.has('today')).toBe(true);
    expect(flagged.has('about')).toBe(true);
    expect(flagged.has('saved')).toBe(true);
  });

  test('does NOT flag concert-today (combo) or 404', () => {
    const report = validateDormantLocaleNoindex(dist);
    const flagged = new Set(report.failures.map((f) => f.page.replace(/\/$/, '')));
    expect(flagged.has('concert-today')).toBe(false);
    expect(flagged.has('404')).toBe(false);
  });

  test('does NOT flag dance (stale disk twin, no live sitemap twin) — liveness is sitemap-keyed', () => {
    const report = validateDormantLocaleNoindex(dist);
    const flagged = new Set(report.failures.map((f) => f.page.replace(/\/$/, '')));
    expect(flagged.has('dance')).toBe(false);
  });

  test('after the fix shape (today/about noindex+absent, saved out of sitemap) → 0 failures', () => {
    // Re-write the fixture into the corrected end-state and assert green.
    writeFileSync(
      join(dist, 'sitemap-editorial.xml'),
      `<?xml version="1.0"?><urlset>${['concert-today', 'en/today/', 'en/about/', 'en/saved/']
        .map((l) => `<loc>https://agentathens.com/${l}</loc>`)
        .join('')}</urlset>`,
    );
    const ni = `<head><meta name="robots" content="noindex, follow"><link rel="canonical" href="x"></head>`;
    writeFileSync(join(dist, 'today.html'), ni);
    writeFileSync(join(dist, 'about', 'index.html'), ni);
    // saved already noindex; now removed from sitemap above.
    const report = validateDormantLocaleNoindex(dist);
    expect(report.failures).toEqual([]);
  });
});
