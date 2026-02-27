import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { generateSearchIndex } from '../search-index';
import { sampleConcert, sampleFreeExhibition, sampleTheaterPerformance, sampleWorkshop, allSampleEvents } from '../../../tests/fixtures/events';

const DIST_DIR = join(import.meta.dir, '../../../dist');

describe('generateSearchIndex', () => {
  beforeAll(() => {
    mkdirSync(DIST_DIR, { recursive: true });
  });

  test('generates valid JSON index file', () => {
    generateSearchIndex(allSampleEvents);
    const indexPath = join(DIST_DIR, 'search-index.json');
    expect(existsSync(indexPath)).toBe(true);

    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    expect(index).toHaveProperty('events');
    expect(index).toHaveProperty('venues');
    expect(index).toHaveProperty('categories');
    expect(index).toHaveProperty('generated');
  });

  test('includes all events with required fields', () => {
    generateSearchIndex(allSampleEvents);
    const index = JSON.parse(readFileSync(join(DIST_DIR, 'search-index.json'), 'utf-8'));

    expect(index.events).toHaveLength(allSampleEvents.length);

    const first = index.events[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('title');
    expect(first).toHaveProperty('titleN');
    expect(first).toHaveProperty('type');
    expect(first).toHaveProperty('venue');
    expect(first).toHaveProperty('venueN');
    expect(first).toHaveProperty('date');
    expect(first).toHaveProperty('slug');
    expect(first).toHaveProperty('price');
  });

  test('titleN correctly strips Greek accents', () => {
    const greekEvent = {
      ...sampleConcert,
      id: 'greek-test-1',
      title: 'Μουσική Βραδιά',
    };
    generateSearchIndex([greekEvent]);
    const index = JSON.parse(readFileSync(join(DIST_DIR, 'search-index.json'), 'utf-8'));

    expect(index.events[0].titleN).toBe('μουσικη βραδια');
  });

  test('deduplicates venues by slug', () => {
    const event1 = { ...sampleConcert, id: 'test-1' };
    const event2 = {
      ...sampleConcert,
      id: 'test-2',
      title: 'Another Night',
      venue: { ...sampleConcert.venue }, // Same venue
    };
    generateSearchIndex([event1, event2]);
    const index = JSON.parse(readFileSync(join(DIST_DIR, 'search-index.json'), 'utf-8'));

    // Two events at Half Note Jazz Club should produce one venue record
    expect(index.venues.filter((v: any) => v.name === 'Half Note Jazz Club')).toHaveLength(1);
    expect(index.venues.find((v: any) => v.name === 'Half Note Jazz Club').eventCount).toBe(2);
  });

  test('categories include expected entries with counts', () => {
    generateSearchIndex(allSampleEvents);
    const index = JSON.parse(readFileSync(join(DIST_DIR, 'search-index.json'), 'utf-8'));

    expect(index.categories.length).toBeGreaterThan(0);
    // All categories should have slug, title, titleN, count
    for (const cat of index.categories) {
      expect(cat).toHaveProperty('slug');
      expect(cat).toHaveProperty('title');
      expect(cat).toHaveProperty('titleN');
      expect(typeof cat.count).toBe('number');
    }
  });

  test('empty events array produces valid but empty index', () => {
    generateSearchIndex([]);
    const index = JSON.parse(readFileSync(join(DIST_DIR, 'search-index.json'), 'utf-8'));

    expect(index.events).toHaveLength(0);
    expect(index.venues).toHaveLength(0);
    // Categories still exist (from config) but with 0 counts
    expect(index.categories.length).toBeGreaterThan(0);
    for (const cat of index.categories) {
      expect(cat.count).toBe(0);
    }
  });

  test('price field maps correctly', () => {
    generateSearchIndex([sampleConcert, sampleFreeExhibition]);
    const index = JSON.parse(readFileSync(join(DIST_DIR, 'search-index.json'), 'utf-8'));

    const concert = index.events.find((e: any) => e.id === sampleConcert.id);
    const exhibition = index.events.find((e: any) => e.id === sampleFreeExhibition.id);
    expect(concert.price).toBe('with-ticket');
    expect(exhibition.price).toBe('open');
  });
});
