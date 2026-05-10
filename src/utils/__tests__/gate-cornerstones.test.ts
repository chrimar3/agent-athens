// S127 — Cornerstone content-hash gating tests.
// Helper extracted from generate-site.ts to make the gating wiring testable.
// Contract: same events → preserved date, changed events → today, manifest mutated.

import { describe, test, expect } from 'bun:test';
import { gateCornerstoneHashes } from '../gate-cornerstones';
import type { ContentHashManifest } from '../../sitemap/content-hasher';
import type { Event } from '../../types';
import { DateTime } from 'luxon';

function makeEvent(overrides: Partial<Event>): Event {
  return {
    '@context': 'https://schema.org',
    '@type': 'MusicEvent',
    id: 'evt-' + Math.random().toString(36).substring(7),
    title: 'Test Event',
    description: 'A test event',
    startDate: '2026-05-15T20:00:00.000Z',
    type: 'concert',
    genres: [],
    tags: [],
    venue: { name: 'Test Venue', address: 'Athens' },
    price: { type: 'open' },
    source: 'test',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    language: 'el',
    hasNativeGreek: false,
    ticketUrlResolved: null,
    ...overrides,
  };
}

function emptyManifest(): ContentHashManifest {
  return { version: 1, generatedAt: '', entries: {} };
}

const todayIso = DateTime.now().setZone('Europe/Athens').toISODate()!;

describe('gateCornerstoneHashes', () => {
  test('populates el and en dicts for each input', () => {
    const events = [makeEvent({ id: 'a', title: 'A' }), makeEvent({ id: 'b', title: 'B' })];
    const manifest = emptyManifest();

    const { el, en } = gateCornerstoneHashes(
      [{ slug: 'today', events }, { slug: 'this-month', events }],
      manifest,
    );

    expect(Object.keys(el).sort()).toEqual(['this-month', 'today']);
    expect(Object.keys(en).sort()).toEqual(['this-month', 'today']);
    expect(el.today).toBe(todayIso);
    expect(en.today).toBe(todayIso);
  });

  test('preserves prior date when hash unchanged', () => {
    const events = [makeEvent({ id: 'a', title: 'A' })];
    // Compute the hash that this fixture produces, seed the manifest with an old date
    const manifest: ContentHashManifest = {
      version: 1,
      generatedAt: '2026-05-01T08:00:00+03:00',
      entries: {},
    };
    // First pass: bootstrap manifest with today's date
    gateCornerstoneHashes([{ slug: 'today', events }], manifest);
    const seededHash = manifest.entries['today'].hash;

    // Re-seed with an older date but the same hash — simulates a previous build
    manifest.entries['today'] = { hash: seededHash, lastModified: '2026-04-15' };
    manifest.entries['en/today'] = { hash: seededHash, lastModified: '2026-04-15' };

    // Second pass: same events → same hash → preserved date
    const { el, en } = gateCornerstoneHashes([{ slug: 'today', events }], manifest);

    expect(el.today).toBe('2026-04-15');
    expect(en.today).toBe('2026-04-15');
  });

  test('returns today when event set changes (hash advances)', () => {
    const eventsV1 = [makeEvent({ id: 'a', title: 'A' })];
    const eventsV2 = [makeEvent({ id: 'a', title: 'A-renamed' })]; // title change → hash change
    const manifest = emptyManifest();

    // Seed with V1's hash + an old date
    gateCornerstoneHashes([{ slug: 'today', events: eventsV1 }], manifest);
    manifest.entries['today'].lastModified = '2026-04-15';
    manifest.entries['en/today'].lastModified = '2026-04-15';

    // V2 → different hash → today's date
    const { el, en } = gateCornerstoneHashes([{ slug: 'today', events: eventsV2 }], manifest);

    expect(el.today).toBe(todayIso);
    expect(en.today).toBe(todayIso);
  });

  test('writes manifest entries for both el and en/<slug>', () => {
    const events = [makeEvent({ id: 'a', title: 'A' })];
    const manifest = emptyManifest();

    gateCornerstoneHashes([{ slug: 'this-month', events }], manifest);

    expect(manifest.entries['this-month']).toBeDefined();
    expect(manifest.entries['en/this-month']).toBeDefined();
    expect(manifest.entries['this-month'].hash).toMatch(/^[0-9a-f]{16}$/);
    expect(manifest.entries['en/this-month'].hash).toBe(manifest.entries['this-month'].hash);
  });

  test('greek and english share the same hash for the same event set', () => {
    const events = [makeEvent({ id: 'a', title: 'A' }), makeEvent({ id: 'b', title: 'B' })];
    const manifest = emptyManifest();

    gateCornerstoneHashes([{ slug: 'open', events }], manifest);

    expect(manifest.entries['open'].hash).toBe(manifest.entries['en/open'].hash);
  });

  test('hash is order-independent (sort applied before hashing)', () => {
    const a = makeEvent({ id: 'a', title: 'Alpha', startDate: '2026-05-15T20:00:00Z' });
    const b = makeEvent({ id: 'b', title: 'Beta', startDate: '2026-05-16T21:00:00Z' });
    const m1 = emptyManifest();
    const m2 = emptyManifest();

    gateCornerstoneHashes([{ slug: 'today', events: [a, b] }], m1);
    gateCornerstoneHashes([{ slug: 'today', events: [b, a] }], m2);

    expect(m1.entries['today'].hash).toBe(m2.entries['today'].hash);
  });

  test('empty inputs produce empty overrides and untouched manifest', () => {
    const manifest: ContentHashManifest = {
      version: 1,
      generatedAt: '2026-05-01T08:00:00+03:00',
      entries: { 'pre-existing': { hash: 'deadbeefcafebabe', lastModified: '2026-04-01' } },
    };

    const { el, en } = gateCornerstoneHashes([], manifest);

    expect(el).toEqual({});
    expect(en).toEqual({});
    expect(manifest.entries['pre-existing']).toEqual({ hash: 'deadbeefcafebabe', lastModified: '2026-04-01' });
  });

  test('manifest entries from other slugs are preserved unchanged', () => {
    const events = [makeEvent({ id: 'a', title: 'A' })];
    const manifest: ContentHashManifest = {
      version: 1,
      generatedAt: '2026-05-01T08:00:00+03:00',
      entries: {
        'this-weekend': { hash: 'b5fcea71f87f34d1', lastModified: '2026-04-20' },
        'en/this-weekend': { hash: 'b5fcea71f87f34d1', lastModified: '2026-04-20' },
      },
    };

    gateCornerstoneHashes([{ slug: 'today', events }], manifest);

    expect(manifest.entries['this-weekend']).toEqual({ hash: 'b5fcea71f87f34d1', lastModified: '2026-04-20' });
    expect(manifest.entries['en/this-weekend']).toEqual({ hash: 'b5fcea71f87f34d1', lastModified: '2026-04-20' });
    expect(manifest.entries['today']).toBeDefined();
    expect(manifest.entries['en/today']).toBeDefined();
  });

  test('greek and english can drift independently when one was cached and the other was not', () => {
    const events = [makeEvent({ id: 'a', title: 'A' })];
    const manifest = emptyManifest();
    // Bootstrap to capture the computed hash
    gateCornerstoneHashes([{ slug: 'today', events }], manifest);
    const stableHash = manifest.entries['today'].hash;

    // Simulate: only Greek had a prior entry; English is new
    manifest.entries['today'] = { hash: stableHash, lastModified: '2026-04-15' };
    delete manifest.entries['en/today'];

    const { el, en } = gateCornerstoneHashes([{ slug: 'today', events }], manifest);

    expect(el.today).toBe('2026-04-15'); // preserved
    expect(en.today).toBe(todayIso);     // freshly computed
  });
});
