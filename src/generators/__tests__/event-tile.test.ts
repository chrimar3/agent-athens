import { describe, test, expect } from 'bun:test';
import {
  generateEventTile,
  DEFAULT_TILE_OPTS,
  uniquifySvgIds,
  precomputeEventTiles,
  getEventTile,
  clearEventTileCache,
} from '../event-tile';
import type { Event } from '../../types';

// S161 — Imageless event tile generator (Satori → SVG).
// Tests gate on: valid SVG, exact dimensions, DN-ruling color tokens resolved
// to literal hex, distinct titles → distinct SVGs, smoke on the worst-case
// Greek title. Text-content assertions are width-of-glyph-paths in spirit
// because Satori vectorizes text into <path> nodes (no <text> nodes to grep).

const concertEvent = {
  title: 'Συναυλία Κλασικής Μουσικής',
  venue: { name: 'Μέγαρο Μουσικής' },
  startDate: '2026-06-20',
};

const longGreekEvent = {
  title: 'Χριστουγεννιάτικη Συναυλία της Κρατικής Ορχήστρας Αθηνών',
  venue: { name: 'Μέγαρο Μουσικής Αθηνών' },
  startDate: '2026-12-23',
};

const englishEvent = {
  title: 'Jazz Live',
  venue: { name: 'Half Note' },
  startDate: '2026-07-04',
};

describe('generateEventTile', () => {
  test('returns valid SVG matching default dimensions (200×267)', async () => {
    const svg = await generateEventTile(concertEvent);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain(`width="${DEFAULT_TILE_OPTS.width}"`);
    expect(svg).toContain(`height="${DEFAULT_TILE_OPTS.height}"`);
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  test('respects custom dimensions (detail-hero wider canvas)', async () => {
    const svg = await generateEventTile(concertEvent, { width: 600, height: 800 });
    expect(svg).toContain('width="600"');
    expect(svg).toContain('height="800"');
  });

  test('emits DN-ruling color tokens as literal hex (no unresolved --var)', async () => {
    const svg = await generateEventTile(concertEvent);
    // --bg-elevated (#151515, aligned to media slots), --accent-primary spine/date,
    // --text-primary, --text-tertiary — redesign loop 20260707
    expect(svg).toContain('#151515');
    expect(svg.toLowerCase()).toContain('#f5e642');
    expect(svg).toContain('#f0f0f0');
    expect(svg.toLowerCase()).toMatch(/#888(888)?/);
    // No unresolved CSS custom properties leaked
    expect(svg).not.toContain('var(--');
  });

  test('distinct titles produce distinct SVGs (titles ARE rendered, just as glyph paths)', async () => {
    const a = await generateEventTile(concertEvent);
    const b = await generateEventTile(englishEvent);
    expect(a).not.toBe(b);
  });

  test('long Greek title renders without throwing (autofit + truncation path)', async () => {
    const svg = await generateEventTile(longGreekEvent);
    expect(svg.startsWith('<svg')).toBe(true);
    // Satori emits ONE <path> per text run (it batches all glyphs of a run into
    // a single compound `d` attribute). With title + date + venue, expect ≥3.
    const pathCount = (svg.match(/<path/g) || []).length;
    expect(pathCount).toBeGreaterThanOrEqual(3);
    // Substantial glyph data confirms text was actually rendered (not skipped).
    expect(svg.length).toBeGreaterThan(5000);
  });

  test('XML-special characters in title do not break the SVG', async () => {
    const svg = await generateEventTile({
      title: 'Q & A < > " session',
      venue: { name: 'Test' },
      startDate: '2026-06-15',
    });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
  });
});

// ─── WCAG 4.1.1 / F77 — per-tile unique internal ids ─────────────────────────
//
// Satori emits fixed internal ids (satori_om-id, satori_bc-id, …) in every SVG.
// With multiple tiles inlined on one page those ids collide, and because
// mask/clipPath resolution is per-document, a colliding tile can silently
// resolve against ANOTHER tile's mask. uniquifySvgIds suffixes every id and
// every url(#…)/href="#…" reference with the event-id prefix.

/** Extract declared ids / url(#) refs / href="#" refs from an SVG string. */
const idsOf = (svg: string) => new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const urlRefsOf = (svg: string) => [...svg.matchAll(/url\(#([^)]+)\)/g)].map(m => m[1]);
const hrefRefsOf = (svg: string) => [...svg.matchAll(/\bhref="#([^"]+)"/g)].map(m => m[1]);

describe('uniquifySvgIds', () => {
  // Synthetic fixture exercising ALL THREE reference forms. Live Satori output
  // currently emits no href="#…" — a fixture built from live output would leave
  // that form unguarded (vacuous-fixture rule).
  const fixture =
    '<svg><defs>' +
    '<mask id="satori_om-id"><rect/></mask>' +
    '<clipPath id="satori_cp-id"><rect/></clipPath>' +
    '<path id="satori_bc-id" d="M0 0"/>' +
    '</defs>' +
    '<g mask="url(#satori_om-id)" clip-path="url(#satori_cp-id)">' +
    '<use href="#satori_bc-id"/>' +
    '</g></svg>';

  test('fixture precondition: contains all three reference forms', () => {
    // If this fails the fixture went vacuous and the tests below assert nothing.
    expect(idsOf(fixture).size).toBeGreaterThanOrEqual(3);
    expect(urlRefsOf(fixture).length).toBeGreaterThanOrEqual(2);
    expect(hrefRefsOf(fixture).length).toBeGreaterThanOrEqual(1);
  });

  test('suffixes id="…", url(#…) and href="#…" with the event-id prefix', () => {
    const out = uniquifySvgIds(fixture, 'abcdef1234567890');
    expect(out).toContain('id="satori_om-id-abcdef12"');
    expect(out).toContain('id="satori_cp-id-abcdef12"');
    expect(out).toContain('id="satori_bc-id-abcdef12"');
    expect(out).toContain('url(#satori_om-id-abcdef12)');
    expect(out).toContain('url(#satori_cp-id-abcdef12)');
    expect(out).toContain('href="#satori_bc-id-abcdef12"');
  });

  test('every reference still resolves after the rewrite (no dangling url/href)', () => {
    // Guards against the half-done rewrite: suffixing ids but not their
    // references would leave url(#satori_om-id) pointing at a renamed id.
    const out = uniquifySvgIds(fixture, 'abcdef1234567890');
    const ids = idsOf(out);
    for (const ref of [...urlRefsOf(out), ...hrefRefsOf(out)]) {
      expect(ids.has(ref)).toBe(true);
    }
    // And no unsuffixed original id survives anywhere in the output.
    expect(out).not.toContain('"satori_om-id"');
    expect(out).not.toContain('(#satori_om-id)');
  });

  test('two different eventIds yield disjoint id sets', () => {
    const a = idsOf(uniquifySvgIds(fixture, 'aaaaaaaa-1111'));
    const b = idsOf(uniquifySvgIds(fixture, 'bbbbbbbb-2222'));
    expect(a.size).toBeGreaterThan(0);
    expect(b.size).toBeGreaterThan(0);
    for (const id of a) expect(b.has(id)).toBe(false);
  });
});

describe('precomputeEventTiles applies uniquifySvgIds per event', () => {
  const asEvent = (id: string, title: string): Event =>
    ({
      id,
      title,
      venue: { name: 'Μέγαρο Μουσικής' },
      startDate: '2026-06-20',
      // imageless: none of imageLocal / imageUrl / venueImage set
    }) as unknown as Event;

  test('two cached tiles on one page share NO internal id, and refs resolve within each tile', async () => {
    clearEventTileCache();
    const evA = asEvent('11112222-aaaa-bbbb', 'Συναυλία Κλασικής Μουσικής');
    const evB = asEvent('33334444-cccc-dddd', 'Jazz Live');
    await precomputeEventTiles([evA, evB]);

    const tileA = getEventTile(evA.id)!;
    const tileB = getEventTile(evB.id)!;
    expect(tileA).toBeDefined();
    expect(tileB).toBeDefined();

    const idsA = idsOf(tileA);
    const idsB = idsOf(tileB);
    // Precondition: real Satori output DOES contain internal ids — if it ever
    // stops, this test would go vacuous, so fail loudly instead.
    expect(idsA.size).toBeGreaterThan(0);
    expect(idsB.size).toBeGreaterThan(0);

    // Disjoint id sets across tiles (the WCAG F77 collision).
    for (const id of idsA) expect(idsB.has(id)).toBe(false);

    // Each tile's url(#)/href refs resolve within THAT tile (mask integrity).
    for (const ref of [...urlRefsOf(tileA), ...hrefRefsOf(tileA)]) {
      expect(idsA.has(ref)).toBe(true);
    }
    for (const ref of [...urlRefsOf(tileB), ...hrefRefsOf(tileB)]) {
      expect(idsB.has(ref)).toBe(true);
    }
    clearEventTileCache();
  });
});
