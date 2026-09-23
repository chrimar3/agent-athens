/**
 * Round-2 move 7 — imageless-card tiles are cached files, not inline markup.
 *
 * Before: every card inlined its ~28 KB Satori SVG, so the homepage carried
 * ~254 KB of tile glyph paths (9 tiles, 425 KB page, 2026-09-23 build) and no
 * page could reuse another page's tile. After: each tile is written once to
 * <outDir>/tiles/<content-hash>.svg and cards reference it by URL.
 *
 * Every test writes to a temp dir, never the real dist/.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, existsSync, utimesSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import {
  generateEventTile,
  precomputeEventTiles,
  getEventTile,
  clearEventTileCache,
} from '../event-tile';
import { renderEventCard } from '../../templates/page';
import { renderEventCardList, renderHeroSection } from '../../templates/card-variants';
import { sampleConcert } from '../../../tests/fixtures/events';
import type { Event } from '../../types';

const imageless = (id: string, title: string, venue = 'Κύτταρο', startDate = '2026-10-02T21:00:00'): Event => ({
  ...sampleConcert,
  id,
  title,
  startDate,
  venue: { ...sampleConcert.venue, name: venue },
  imageUrl: undefined,
  imageLocal: undefined,
  venueImage: undefined,
});

const TILE_REF = /<image href="\/tiles\/([0-9a-f]{16}\.svg)" width="200" height="267"\/>/;

let OUT: string;
beforeEach(() => {
  OUT = mkdtempSync(join(tmpdir(), 'event-tile-files-'));
  clearEventTileCache();
});
afterEach(() => {
  clearEventTileCache();
  rmSync(OUT, { recursive: true, force: true });
});

describe('precomputeEventTiles writes tile files', () => {
  test('fixture precondition: the fixtures are imageless', () => {
    const e = imageless('a1', 'Ροκ Συναυλία');
    expect(e.imageUrl || e.imageLocal || e.venueImage).toBeFalsy();
  });

  test('the card markup references a file; the file holds the Satori SVG', async () => {
    const e = imageless('a1b2c3d4-1', 'Ροκ Συναυλία');
    await precomputeEventTiles([e], { outDir: OUT });
    const markup = getEventTile(e.id)!;
    const m = markup.match(TILE_REF);
    expect(m).not.toBeNull();
    const file = join(OUT, 'tiles', m![1]);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf-8')).toBe(await generateEventTile(e));
  });

  test('no glyph paths are inlined in the card', async () => {
    const e = imageless('a1b2c3d4-2', 'Χριστουγεννιάτικη Συναυλία της Κρατικής Ορχήστρας Αθηνών');
    await precomputeEventTiles([e], { outDir: OUT });
    const markup = getEventTile(e.id)!;
    expect(markup).not.toContain('<path');
    expect(markup).not.toContain('<mask');
    expect(Buffer.byteLength(markup)).toBeLessThan(400);
  });

  test('the reference keeps the tile box and stays decorative', async () => {
    const e = imageless('a1b2c3d4-3', 'Jazz Live', 'Half Note');
    await precomputeEventTiles([e], { outDir: OUT });
    const markup = getEventTile(e.id)!;
    // An <svg> root keeps every existing `.…-image-wrapper > svg` CSS rule
    // (absolute fill, mobile 96×128 thumb, pointer-events:none) in force.
    expect(markup.startsWith('<svg width="200" height="267" viewBox="0 0 200 267"')).toBe(true);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toMatch(/\bid="/);
  });

  test('identical tiles share one file; different tiles get different files', async () => {
    const a = imageless('aaaa0000-1', 'Ροκ Συναυλία');
    const b = imageless('bbbb0000-2', 'Ροκ Συναυλία'); // same title, venue, date
    const c = imageless('cccc0000-3', 'Jazz Live');
    await precomputeEventTiles([a, b, c], { outDir: OUT });
    const ref = (id: string) => getEventTile(id)!.match(TILE_REF)![1];
    expect(ref(a.id)).toBe(ref(b.id));
    expect(ref(a.id)).not.toBe(ref(c.id));
    expect(readdirSync(join(OUT, 'tiles')).sort()).toEqual([ref(a.id), ref(c.id)].sort());
  });

  test('a rebuild with unchanged events does not rewrite the file', async () => {
    const e = imageless('a1b2c3d4-4', 'Ροκ Συναυλία');
    await precomputeEventTiles([e], { outDir: OUT });
    const file = join(OUT, 'tiles', getEventTile(e.id)!.match(TILE_REF)![1]);
    const past = new Date('2020-01-01T00:00:00Z');
    utimesSync(file, past, past);
    clearEventTileCache();
    await precomputeEventTiles([e], { outDir: OUT });
    expect(getEventTile(e.id)!.match(TILE_REF)![1]).toBe(file.split('/').pop()!);
    expect(statSync(file).mtimeMs).toBe(past.getTime());
  });

  test('imaged events get no tile and no file', async () => {
    const e = { ...imageless('a1b2c3d4-5', 'With Image'), imageUrl: 'https://example.com/x.jpg' };
    expect(await precomputeEventTiles([e], { outDir: OUT })).toBe(0);
    expect(getEventTile(e.id)).toBeUndefined();
    expect(existsSync(join(OUT, 'tiles'))).toBe(false);
  });

  test('the default output dir is dist/ beside src/ (what generate-site deploys)', async () => {
    const { DEFAULT_TILE_OUT_DIR } = await import('../event-tile');
    expect(resolve(DEFAULT_TILE_OUT_DIR)).toBe(resolve(join(import.meta.dir, '../../../dist')));
  });
});

describe('card renderers reference tile files that exist', () => {
  test('grid card, list row and hero all point at written files', async () => {
    const events = [
      imageless('dddd0000-1', 'Ροκ Συναυλία', 'Gagarin 205', '2026-10-01T21:00:00'),
      imageless('eeee0000-2', 'Jazz Live', 'Half Note', '2026-10-02T21:00:00'),
      imageless('ffff0000-3', 'Φεστιβάλ Κινηματογράφου', 'Τριανόν', '2026-10-03T21:00:00'),
    ];
    await precomputeEventTiles(events, { outDir: OUT });
    const html = [
      ...events.map(e => renderEventCard(e)),
      ...events.map(e => renderEventCardList(e)),
      renderHeroSection(events, 'coming-days'),
    ].join('\n');
    const refs = [...html.matchAll(new RegExp(TILE_REF.source, 'g'))].map(m => m[1]);
    // Precondition: every renderer path emitted a reference.
    expect(refs.length).toBeGreaterThanOrEqual(events.length * 2 + 3);
    for (const r of refs) expect(existsSync(join(OUT, 'tiles', r))).toBe(true);
    expect(html).not.toContain('satori_');
  });
});
