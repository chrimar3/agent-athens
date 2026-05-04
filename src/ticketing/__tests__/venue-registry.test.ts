import { describe, test, expect, beforeEach } from 'bun:test';
import {
  getActiveReachableVenueKeys,
  normalizeVenueKey,
  _resetVenueRegistryCache,
} from '../venue-registry';
import type { Event, EventType } from '../../types';

function makeEvent(id: string, venueName: string): Event {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    id,
    title: `Event ${id}`,
    description: '',
    hasNativeGreek: false,
    startDate: '2026-05-15T20:00:00+03:00',
    type: 'concert' as EventType,
    genres: [],
    tags: [],
    venue: { name: venueName, address: '' },
    price: { type: 'open' },
    ticketUrlResolved: null,
    source: 'test',
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    language: 'en',
  };
}

describe('getActiveReachableVenueKeys (Q-B8b ratchet denominator)', () => {
  beforeEach(() => {
    _resetVenueRegistryCache();
  });

  test('returns Set of normalized keys for 3 events at 2 distinct registry venues', () => {
    const events = [
      makeEvent('a', 'Gazarte'),
      makeEvent('b', 'Gazarte'),
      makeEvent('c', 'Μέγαρο Μουσικής Αθηνών'),
    ];

    const keys = getActiveReachableVenueKeys(events);

    expect(keys).toBeInstanceOf(Set);
    expect(keys.size).toBe(2);
    expect(keys.has(normalizeVenueKey('Gazarte'))).toBe(true);
    expect(keys.has(normalizeVenueKey('Μέγαρο Μουσικής Αθηνών'))).toBe(true);
  });

  test('filters out events whose venue.name is not in the registry', () => {
    const events = [
      makeEvent('a', 'Gazarte'), // canonical_name match
      makeEvent('b', 'Megaro Mousikis'), // variation match (resolves to Μέγαρο record)
      makeEvent('c', 'Random Garbage Venue Xyz123'), // not in registry → dropped
    ];

    const keys = getActiveReachableVenueKeys(events);

    expect(keys.size).toBe(2);
    expect(keys.has(normalizeVenueKey('Gazarte'))).toBe(true);
    expect(keys.has(normalizeVenueKey('Megaro Mousikis'))).toBe(true);
    expect(keys.has(normalizeVenueKey('Random Garbage Venue Xyz123'))).toBe(false);
  });

  test('dedupes case/diacritic/whitespace variants via normalizeVenueKey', () => {
    const events = [
      makeEvent('a', 'Gazarte'),
      makeEvent('b', 'GAZARTE'),
      makeEvent('c', '  gazarte  '),
    ];

    const keys = getActiveReachableVenueKeys(events);

    expect(keys.size).toBe(1);
    expect(keys.has('gazarte')).toBe(true);
  });
});
