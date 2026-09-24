import { describe, test, expect } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  generateEventTile,
  DEFAULT_TILE_OPTS,
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

// ─── WCAG 4.1.1 / F77 — no tile ids in the page ──────────────────────────────
//
// Satori emits fixed internal ids (satori_om-id, satori_bc-id, …) in every SVG.
// Inlined, they collided across cards (and mask/clipPath resolution is
// per-document, so a tile could resolve against ANOTHER tile's mask). Since
// round 2 each tile is a separate file loaded as an image — its own document —
// so the page carries no tile ids at all and each file's references resolve
// within that file.

/** Extract declared ids / url(#) refs / href="#" refs from an SVG string. */
const idsOf = (svg: string) => new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const urlRefsOf = (svg: string) => [...svg.matchAll(/url\(#([^)]+)\)/g)].map(m => m[1]);
const hrefRefsOf = (svg: string) => [...svg.matchAll(/\bhref="#([^"]+)"/g)].map(m => m[1]);

describe('precomputeEventTiles keeps Satori ids out of the page', () => {
  const asEvent = (id: string, title: string): Event =>
    ({
      id,
      title,
      venue: { name: 'Μέγαρο Μουσικής' },
      startDate: '2026-06-20',
      // imageless: none of imageLocal / imageUrl / venueImage set
    }) as unknown as Event;

  test('card markup declares no ids; each tile file resolves its own refs', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'event-tile-ids-'));
    try {
      clearEventTileCache();
      const evA = asEvent('11112222-aaaa-bbbb', 'Συναυλία Κλασικής Μουσικής');
      const evB = asEvent('33334444-cccc-dddd', 'Jazz Live');
      await precomputeEventTiles([evA, evB], { outDir });

      for (const ev of [evA, evB]) {
        const markup = getEventTile(ev.id)!;
        expect(markup).toBeDefined();
        expect(idsOf(markup).size).toBe(0);
        const file = markup.match(/href="\/tiles\/([^"]+)"/)![1];
        const svg = readFileSync(join(outDir, 'tiles', file), 'utf-8');
        const ids = idsOf(svg);
        // Precondition: real Satori output DOES contain internal ids — if it
        // ever stops, this test would go vacuous, so fail loudly instead.
        expect(ids.size).toBeGreaterThan(0);
        for (const ref of [...urlRefsOf(svg), ...hrefRefsOf(svg)]) {
          expect(ids.has(ref)).toBe(true);
        }
      }
    } finally {
      clearEventTileCache();
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
