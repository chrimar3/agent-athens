import { describe, test, expect } from 'bun:test';
import { hubFilterToExcludedDimension } from '../hub-identity';
import type { HubFilter } from '../../types';

describe('hubFilterToExcludedDimension', () => {
  test('date hub → time', () => {
    const filter: HubFilter = { type: 'date', value: 'today' };
    expect(hubFilterToExcludedDimension(filter)).toBe('time');
  });

  test('event_type hub → type', () => {
    const filter: HubFilter = { type: 'event_type', value: 'concert' };
    expect(hubFilterToExcludedDimension(filter)).toBe('type');
  });

  test('event_types hub → type', () => {
    const filter: HubFilter = { type: 'event_types', values: ['theater', 'performance'] };
    expect(hubFilterToExcludedDimension(filter)).toBe('type');
  });

  test('price_type hub → price', () => {
    const filter: HubFilter = { type: 'price_type', value: 'open' };
    expect(hubFilterToExcludedDimension(filter)).toBe('price');
  });

  test('tag hub → null (no Filters dimension to exclude)', () => {
    const filter: HubFilter = { type: 'tag', values: ['Child-friendly', 'Families'] };
    expect(hubFilterToExcludedDimension(filter)).toBe(null);
  });
});
