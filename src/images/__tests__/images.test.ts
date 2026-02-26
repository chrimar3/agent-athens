import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { getReferer } from '../download-image';
import { optimizeImage } from '../optimize-image';
import { processEventImage } from '../image-pipeline';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

// ─── Referer selection ───────────────────────────────────

describe('getReferer', () => {
  test('returns correct Referer for athinorama', () => {
    expect(getReferer('athinorama')).toBe('https://www.athinorama.gr/');
  });

  test('returns correct Referer for more.com', () => {
    expect(getReferer('more.com')).toBe('https://www.more.com/');
    expect(getReferer('more')).toBe('https://www.more.com/');
  });

  test('returns correct Referer for ra.co', () => {
    expect(getReferer('ra.co')).toBe('https://ra.co/');
    expect(getReferer('ra')).toBe('https://ra.co/');
  });

  test('returns correct Referer for megaron', () => {
    expect(getReferer('megaron')).toBe('https://www.megaron.gr/');
  });

  test('returns correct Referer for ticketservices', () => {
    expect(getReferer('ticketservices')).toBe('https://www.ticketservices.gr/');
    expect(getReferer('ticketservices.gr')).toBe('https://www.ticketservices.gr/');
  });

  test('returns correct Referer for halfnote', () => {
    expect(getReferer('halfnote')).toBe('https://www.halfnote.net/');
  });

  test('returns undefined for unknown source', () => {
    expect(getReferer('unknown-source')).toBeUndefined();
  });

  test('matches partial source names', () => {
    expect(getReferer('athinorama.gr')).toBe('https://www.athinorama.gr/');
  });
});

// ─── Sharp optimize ──────────────────────────────────────

describe('optimizeImage', () => {
  const testDir = join(import.meta.dir, '../../../data/images');

  test('converts buffer to WebP file', async () => {
    const sharp = (await import('sharp')).default;
    const testBuffer = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } }
    }).png().toBuffer();

    const result = await optimizeImage(testBuffer, 'test-optimize-event');

    expect(result).toBe('/images/events/test-optimize-event.webp');

    const filePath = join(testDir, 'test-optimize-event.webp');
    expect(existsSync(filePath)).toBe(true);

    const metadata = await sharp(filePath).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBeLessThanOrEqual(800);

    unlinkSync(filePath);
  });

  test('does not enlarge small images', async () => {
    const sharp = (await import('sharp')).default;
    const testBuffer = await sharp({
      create: { width: 200, height: 150, channels: 3, background: { r: 0, g: 255, b: 0 } }
    }).png().toBuffer();

    await optimizeImage(testBuffer, 'test-small-image');

    const filePath = join(testDir, 'test-small-image.webp');
    const metadata = await sharp(filePath).metadata();

    expect(metadata.width).toBe(200);
    expect(metadata.height).toBe(150);

    unlinkSync(filePath);
  });

  test('resizes large images to max 800px wide', async () => {
    const sharp = (await import('sharp')).default;
    const testBuffer = await sharp({
      create: { width: 1600, height: 1200, channels: 3, background: { r: 0, g: 0, b: 255 } }
    }).png().toBuffer();

    await optimizeImage(testBuffer, 'test-large-image');

    const filePath = join(testDir, 'test-large-image.webp');
    const metadata = await sharp(filePath).metadata();

    expect(metadata.width).toBe(800);
    expect(metadata.height).toBe(600);

    unlinkSync(filePath);
  });
});

// ─── Full pipeline with in-memory DB ─────────────────────

describe('processEventImage', () => {
  let db: Database;

  beforeAll(() => {
    db = new Database(':memory:');
    db.run(`
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        title TEXT,
        image_url TEXT,
        image_local TEXT,
        source TEXT,
        updated_at TEXT
      )
    `);
    db.prepare(`
      INSERT INTO events (id, title, image_url, source, updated_at)
      VALUES ('test-pipeline-1', 'Test Concert', 'https://example.com/image.jpg', 'athinorama', datetime('now'))
    `).run();
  });

  afterAll(() => {
    db.close();
    const testPath = join(import.meta.dir, '../../../data/images/test-pipeline-1.webp');
    if (existsSync(testPath)) unlinkSync(testPath);
  });

  test('returns null and leaves DB unchanged on failed download', async () => {
    const result = await processEventImage(
      'test-pipeline-1',
      'https://httpbin.org/status/404',
      'unknown',
      db
    );

    expect(result).toBeNull();

    const row = db.prepare('SELECT image_local FROM events WHERE id = ?').get('test-pipeline-1') as any;
    expect(row.image_local).toBeNull();
  });
});
