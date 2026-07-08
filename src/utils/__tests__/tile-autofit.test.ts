import { describe, test, expect } from 'bun:test';
import { computeTileFit, measureLineCount, DEFAULT_TILE_FIT_OPTS } from '../tile-autofit';

// S161 — Imageless tile auto-fit.
// Per Design Navigator ruling 2026-06-03: Manrope Bold 700, fontSize ∈ [18, 30],
// lineHeight 1.2, 4-line cap with ellipsis, maxWidth 168px (200px card − 16×2 padding).
// Satori-as-oracle: tests gate on the algorithm reproducing the load-bearing case
// and on the algorithm's invariants (bounds, monotonicity, no-throw).

const LONG_GREEK = 'Χριστουγεννιάτικη Συναυλία της Κρατικής Ορχήστρας Αθηνών';
const LONG_ENGLISH_EQUIV = 'Christmas Concert of the Athens State Orchestra';

describe('computeTileFit', () => {
  test('load-bearing anchor: long Greek title overflows 4-line floor → truncated at sizeMin', async () => {
    const fit = await computeTileFit(LONG_GREEK);
    expect(fit.fontSize).toBe(18);
    expect(fit.lineCount).toBeLessThanOrEqual(4);
    expect(fit.truncated).toBe(true);
    expect(fit.displayTitle.endsWith('…')).toBe(true);
    expect(fit.displayTitle.length).toBeLessThan(LONG_GREEK.length);
  });

  test('short title (≤4 words) renders at ceiling fontSize, single line, untruncated', async () => {
    const fit = await computeTileFit('Jazz Live');
    expect(fit.fontSize).toBe(30);
    expect(fit.lineCount).toBe(1);
    expect(fit.truncated).toBe(false);
    expect(fit.displayTitle).toBe('Jazz Live');
  });

  test('single unbreakable word: wraps within bounds; no throw', async () => {
    // wordBreak:'break-word' (redesign loop 20260707) lets Satori wrap inside
    // a single long word instead of clipping it at the tile edge — the probe
    // mirrors the tile style, so the fit reflects the wrap. The old premise
    // ("renders 1 line at any size") asserted the overflow defect.
    const fit = await computeTileFit('Χριστουγεννιάτικη');
    expect(fit.lineCount).toBeGreaterThanOrEqual(1);
    expect(fit.lineCount).toBeLessThanOrEqual(DEFAULT_TILE_FIT_OPTS.lineCap);
    expect(fit.fontSize).toBeGreaterThanOrEqual(DEFAULT_TILE_FIT_OPTS.sizeMin);
    expect(fit.fontSize).toBeLessThanOrEqual(DEFAULT_TILE_FIT_OPTS.sizeMax);
    expect(fit.truncated).toBe(false);
  });

  test('empty string returns sensible default without throwing', async () => {
    const fit = await computeTileFit('');
    expect(fit.fontSize).toBe(30);
    expect(fit.displayTitle).toBe('');
    expect(fit.truncated).toBe(false);
    expect(fit.lineCount).toBe(0);
  });

  test('English equivalent fits at fontSize ≥ Greek (shorter glyphs, more headroom)', async () => {
    const greek = await computeTileFit(LONG_GREEK);
    const english = await computeTileFit(LONG_ENGLISH_EQUIV);
    expect(english.fontSize).toBeGreaterThanOrEqual(greek.fontSize);
  });

  test('smoke: medium-length Greek title stays in [sizeMin, sizeMax] and ≤ lineCap lines', async () => {
    const fit = await computeTileFit('Συναυλία Κλασικής Μουσικής στο Μέγαρο');
    expect(fit.fontSize).toBeGreaterThanOrEqual(DEFAULT_TILE_FIT_OPTS.sizeMin);
    expect(fit.fontSize).toBeLessThanOrEqual(DEFAULT_TILE_FIT_OPTS.sizeMax);
    expect(fit.lineCount).toBeLessThanOrEqual(DEFAULT_TILE_FIT_OPTS.lineCap);
  });

  test('measureLineCount is monotonic: larger fontSize ⇒ more lines (or equal)', async () => {
    const small = await measureLineCount(LONG_GREEK, 18);
    const large = await measureLineCount(LONG_GREEK, 30);
    expect(large).toBeGreaterThanOrEqual(small);
  });
});
