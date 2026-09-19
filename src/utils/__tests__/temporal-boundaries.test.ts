import { afterEach, beforeEach, describe, expect, setSystemTime, test } from 'bun:test';
import { load } from 'cheerio';
import { filterEvents, isCurrentlyOpen } from '../filters';
import { formatGreekTime } from '../i18n';
import { formatSchemaDate, getAthensTimezone } from '../../enrichment/quality-gates';
import { generateInlinePractical, generatePracticalBlock } from '../../generators/practical-block';
import { renderEventDetailPage } from '../../generators/event-page';
import { sampleConcert } from '../../../tests/fixtures/events';
import type { Event } from '../../types';

const event = (startDate: string, overrides: Partial<Event> = {}): Event => ({
  ...sampleConcert, id: startDate, startDate, endDate: undefined, ...overrides,
});

beforeEach(() => setSystemTime(new Date('2026-09-20T12:00:00+03:00')));
afterEach(() => setSystemTime());

// Run this suite in separate TZ=UTC and TZ=Europe/Athens processes. Bun/Intl
// can cache the host timezone, so changing process.env.TZ mid-test is insufficient.
describe('Athens calendar windows', () => {

    for (const today of ['2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']) {
      test('current Friday–Sunday stays this weekend on ' + today, () => {
        setSystemTime(new Date(today + 'T12:00:00+03:00'));
        const input = ['2026-09-17T23:59:59', '2026-09-18T00:00:00', '2026-09-20T23:59:59', '2026-09-21T00:00:00', '2026-09-25T21:00:00'].map(date => event(date));
        expect(filterEvents(input, { time: 'this-weekend' }).map(e => e.startDate)).toEqual(['2026-09-18T00:00:00', '2026-09-20T23:59:59']);
      });
    }

    test('Monday advances to the coming Friday', () => {
      setSystemTime(new Date('2026-09-21T00:00:00+03:00'));
      const input = ['2026-09-20T21:00:00', '2026-09-25T21:00:00', '2026-09-27T23:59:59', '2026-09-28T00:00:00'].map(date => event(date));
      expect(filterEvents(input, { time: 'this-weekend' }).map(e => e.startDate)).toEqual(['2026-09-25T21:00:00', '2026-09-27T23:59:59']);
    });

    test('this month includes the last date and evening but excludes next midnight', () => {
      const input = ['2026-09-19T23:59:59', '2026-09-30', '2026-09-30T23:59:59', '2026-10-01T00:00:00'].map(date => event(date));
      expect(filterEvents(input, { time: 'this-month' }).map(e => e.startDate)).toEqual(['2026-09-30', '2026-09-30T23:59:59']);
    });

    test('next month includes its last evening and excludes the following midnight', () => {
      const input = ['2026-09-30T23:59:59', '2026-10-01T00:00:00', '2026-10-31T23:59:59', '2026-11-01T00:00:00'].map(date => event(date));
      expect(filterEvents(input, { time: 'next-month' }).map(e => e.startDate)).toEqual(['2026-10-01T00:00:00', '2026-10-31T23:59:59']);
    });

    test('month boundaries handle December rollover and leap-day evenings', () => {
      setSystemTime(new Date('2026-12-20T12:00:00+02:00'));
      expect(filterEvents([event('2027-01-31T23:59:59'), event('2027-02-01')], { time: 'next-month' }).map(e => e.startDate)).toEqual(['2027-01-31T23:59:59']);
      setSystemTime(new Date('2028-02-20T12:00:00+02:00'));
      expect(filterEvents([event('2028-02-29T23:59:59'), event('2028-03-01')], { time: 'this-month' }).map(e => e.startDate)).toEqual(['2028-02-29T23:59:59']);
    });

    test('Athens midnight determines today, tomorrow and month even when UTC is still yesterday', () => {
      setSystemTime(new Date('2026-09-30T21:30:00Z'));
      const input = ['2026-09-30T23:59:59', '2026-10-01T00:15:00', '2026-10-02T00:15:00'].map(date => event(date));
      expect(filterEvents(input, { time: 'today' }).map(e => e.startDate)).toEqual(['2026-10-01T00:15:00']);
      expect(filterEvents(input, { time: 'tomorrow' }).map(e => e.startDate)).toEqual(['2026-10-02T00:15:00']);
      expect(filterEvents(input, { time: 'this-month' }).map(e => e.startDate)).toEqual(['2026-10-01T00:15:00', '2026-10-02T00:15:00']);
    });

    test('running exhibition overlap stays inclusive but tomorrow-only exhibition is absent today', () => {
      const running = event('2026-09-01', { type: 'exhibition', endDate: '2026-09-20' });
      const tomorrow = event('2026-09-21', { type: 'exhibition', endDate: '2026-10-01' });
      expect(filterEvents([running, tomorrow], { time: 'today' }).map(e => e.startDate)).toEqual(['2026-09-01']);
    });

    test('no clock time is fabricated for date-only event practical information', () => {
      for (const date of ['2026-09-25', '2026-01-25']) {
        expect(formatGreekTime(date)).toBe('');
        const $ = load(generatePracticalBlock(event(date), null, 'en'));
        expect($('.practical-table th').map((_, cell) => $(cell).text()).get()).not.toContain('Time');
        expect(generateInlinePractical(event(date))).not.toMatch(/, \d{2}:\d{2}/);
      }
    });

    test('explicit midnight remains a real time in practical information', () => {
      const midnight = event('2026-09-25T00:00:00');
      const $ = load(generatePracticalBlock(midnight, null, 'en'));
      const timeRow = $('tr').filter((_, row) => $(row).find('th').text() === 'Time');
      expect(timeRow.find('td').text()).toBe('00:00');
      expect(generateInlinePractical(midnight)).toContain(', 00:00 |');
      expect(formatGreekTime('2026-09-25T21:30:00')).toBe('21:30');
    });

    test('unknown-end exhibition closes its badge after the inclusive 90-day presumption', () => {
      const exhibition = event('2026-06-22', { type: 'exhibition' });
      expect(isCurrentlyOpen(exhibition, new Date('2026-09-20T23:59:59+03:00'))).toBe(true);
      expect(isCurrentlyOpen(exhibition, new Date('2026-09-21T00:00:00+03:00'))).toBe(false);
      const reference = new Date('2026-09-20T12:34:56+03:00');
      isCurrentlyOpen(exhibition, reference);
      expect(reference.toISOString()).toBe('2026-09-20T09:34:56.000Z');
    });

    test('malformed dates cannot create a currently-open badge', () => {
      expect(isCurrentlyOpen(event('2026-01-01', { type: 'exhibition', endDate: 'not-a-date' }))).toBe(false);
      expect(isCurrentlyOpen(event('not-a-date', { type: 'exhibition' }))).toBe(false);
    });

    test('cooling event page never combines ended and open badges', () => {
      const expired = event('2026-06-21', { type: 'exhibition' });
      const $ = load(renderEventDetailPage(expired, [], 'en'));
      expect($('.event-passed-banner').length).toBe(1);
      expect($('.edp-open-badge, .open-now-badge').length).toBe(0);
      expect(isCurrentlyOpen(event('2026-09-21', { type: 'exhibition' }))).toBe(false);
      expect(isCurrentlyOpen(event('2026-01-01', { type: 'exhibition', endDate: '2026-09-20' }))).toBe(true);
      expect(isCurrentlyOpen(event('2026-01-01', { type: 'exhibition', endDate: '2026-09-19' }))).toBe(false);
    });
});

describe('Schema dates use the event wall time on DST transition days', () => {
  for (const [date, offset] of [
    ['2026-03-29T01:30:00', '+02:00'],
    ['2026-03-29T04:30:00', '+03:00'],
    ['2026-03-29T20:00:00', '+03:00'],
    ['2026-10-25T01:30:00', '+03:00'],
    ['2026-10-25T04:30:00', '+02:00'],
    ['2026-10-25T20:00:00', '+02:00'],
  ]) {
    test(date + ' carries ' + offset + ' independently of build host timezone', () => {
      expect(formatSchemaDate(date)).toBe(date + offset);
      expect(formatSchemaDate(date.slice(0, 10), date.slice(11, 16))).toBe(date + offset);
    });
  }

  test('Athens offset helper resolves actual transition instants', () => {
    expect(getAthensTimezone(new Date('2026-03-29T01:30:00Z'))).toBe('+03:00');
    expect(getAthensTimezone(new Date('2026-10-25T01:30:00Z'))).toBe('+02:00');
  });

  test('date-only values and explicit offset timestamps retain their declared shape', () => {
    expect(formatSchemaDate('2026-03-29')).toBe('2026-03-29');
    expect(formatSchemaDate('2026-10-25')).toBe('2026-10-25');
    expect(formatSchemaDate('2026-10-25T03:30:00+02:00')).toBe('2026-10-25T03:30:00+02:00');
  });
});
