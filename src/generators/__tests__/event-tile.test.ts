import { describe, test, expect } from 'bun:test';
import { generateEventTile, DEFAULT_TILE_OPTS } from '../event-tile';

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
