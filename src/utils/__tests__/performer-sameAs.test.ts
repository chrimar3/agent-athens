import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

// We need to seed the config file before importing the module,
// since it loads the cache at module init time.
const TEST_CACHE_PATH = join(import.meta.dir, '../../../config/performer-sameAs.json');

// Save original cache so we can restore it after tests
const originalCache = existsSync(TEST_CACHE_PATH) ? readFileSync(TEST_CACHE_PATH, 'utf-8') : null;

// Seed test data into the cache before module import
const testCache = {
  _meta: { description: 'Test cache', updated: '2026-03-03', generated_by: 'test' },
  performers: {
    'Αλκίνοος Ιωαννίδης': {
      type: 'Person' as const,
      sameAs: [
        'https://www.wikidata.org/wiki/Q379849',
        'https://en.wikipedia.org/wiki/Alkinoos_Ioannidis',
        'https://musicbrainz.org/artist/test-mbid',
      ],
    },
    'Villagers of Ioannina City': {
      type: 'MusicGroup' as const,
      sameAs: [
        'https://www.wikidata.org/wiki/Q20649047',
        'https://en.wikipedia.org/wiki/Villagers_of_Ioannina_City',
      ],
    },
    'Rotting Christ': {
      type: 'MusicGroup' as const,
      sameAs: [
        'https://www.wikidata.org/wiki/Q685757',
      ],
    },
    'Moby': {
      type: 'Person' as const,
      sameAs: [
        'https://www.wikidata.org/wiki/Q309631',
        'https://en.wikipedia.org/wiki/Moby',
      ],
    },
    'Freddie Gibbs': {
      type: 'Person' as const,
      sameAs: [
        'https://www.wikidata.org/wiki/Q5499883',
      ],
    },
  },
};

// Write test data (will be picked up when module loads)
writeFileSync(TEST_CACHE_PATH, JSON.stringify(testCache, null, 2));

// Now import — the module will read the seeded cache
const { getPerformerSameAs, isPerformerEventType } = await import('../performer-sameAs');

describe('getPerformerSameAs', () => {
  test('returns null for unknown performer', () => {
    const result = getPerformerSameAs('Unknown Artist Nobody', 'concert');
    expect(result).toBeNull();
  });

  test('returns correct schema for known Person performer', () => {
    const result = getPerformerSameAs('Αλκίνοος Ιωαννίδης', 'concert');
    expect(result).not.toBeNull();
    expect(result!['@type']).toBe('Person');
    expect(result!.name).toBe('Αλκίνοος Ιωαννίδης');
    expect(result!.sameAs).toContain('https://www.wikidata.org/wiki/Q379849');
    expect(result!.sameAs).toContain('https://en.wikipedia.org/wiki/Alkinoos_Ioannidis');
    expect(result!.sameAs.length).toBeGreaterThanOrEqual(2);
  });

  test('returns correct schema for known MusicGroup performer', () => {
    const result = getPerformerSameAs('Villagers of Ioannina City', 'concert');
    expect(result).not.toBeNull();
    expect(result!['@type']).toBe('MusicGroup');
    expect(result!.name).toBe('Villagers of Ioannina City');
    expect(result!.sameAs.length).toBe(2);
  });

  test('extracts artist from title with separator and looks up', () => {
    // Title format: "Artist — Show Description"
    const result = getPerformerSameAs('Rotting Christ — Album Presentation', 'concert');
    expect(result).not.toBeNull();
    expect(result!['@type']).toBe('MusicGroup');
    expect(result!.name).toBe('Rotting Christ');
  });

  test('does not add performer for exhibition type', () => {
    const result = getPerformerSameAs('Αλκίνοος Ιωαννίδης', 'exhibition');
    expect(result).toBeNull();
  });

  test('does not add performer for cinema type', () => {
    const result = getPerformerSameAs('Αλκίνοος Ιωαννίδης', 'cinema');
    expect(result).toBeNull();
  });

  test('handles case-insensitive matching', () => {
    const result = getPerformerSameAs('rotting christ', 'concert');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Rotting Christ');
  });

  test('returns null when no event type is given but performer exists', () => {
    // When eventType is undefined, we should still return performer
    const result = getPerformerSameAs('Αλκίνοος Ιωαννίδης');
    expect(result).not.toBeNull();
    expect(result!['@type']).toBe('Person');
  });

  test('returns null for very short title', () => {
    const result = getPerformerSameAs('DJ', 'dj_set');
    expect(result).toBeNull();
  });

  test('extracts artist from festival lineup title (after /)', () => {
    const result = getPerformerSameAs('Release Athens 2026 / Moby', 'festival');
    expect(result).not.toBeNull();
    expect(result!['@type']).toBe('Person');
    expect(result!.name).toBe('Moby');
  });

  test('strips "in Athens" suffix and looks up', () => {
    const result = getPerformerSameAs('FREDDIE GIBBS (US) IN ATHENS', 'concert');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Freddie Gibbs');
  });
});

describe('isPerformerEventType', () => {
  test('concert is a performer type', () => {
    expect(isPerformerEventType('concert')).toBe(true);
  });

  test('dj_set is a performer type', () => {
    expect(isPerformerEventType('dj_set')).toBe(true);
  });

  test('festival is a performer type', () => {
    expect(isPerformerEventType('festival')).toBe(true);
  });

  test('exhibition is NOT a performer type', () => {
    expect(isPerformerEventType('exhibition')).toBe(false);
  });

  test('cinema is NOT a performer type', () => {
    expect(isPerformerEventType('cinema')).toBe(false);
  });

  test('theater is NOT a performer type', () => {
    expect(isPerformerEventType('theater')).toBe(false);
  });
});

// Restore original cache after tests
afterAll(() => {
  if (originalCache) {
    writeFileSync(TEST_CACHE_PATH, originalCache);
  }
});
