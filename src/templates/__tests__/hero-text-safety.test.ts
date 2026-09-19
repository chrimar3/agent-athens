import { describe, expect, test } from 'bun:test';
import { load } from 'cheerio';
import { renderHeroSection } from '../card-variants';
import { sampleConcert } from '../../../tests/fixtures/events';

const description = '<img src=x onerror=alert(1)> & literal description';
const venue = '<svg onload=alert(2)> & literal venue';

describe('hero untrusted text', () => {
  for (const field of ['fullDescription', 'description'] as const) {
    test(`${field} and featured/pick venues stay literal text`, () => {
      const event = {
        ...sampleConcert, fullDescription: undefined, description: '', [field]: description,
        venue: { ...sampleConcert.venue, name: venue, neighborhood: undefined },
      };
      const $ = load(renderHeroSection([event, { ...event, id: 'pick' }], 'today'));
      expect($('.hero-card-desc').text()).toBe(description);
      expect($('.hero-card-desc').children().length).toBe(0);
      expect($('.hero-card .card-venue').length).toBe(2);
      $('.hero-card .card-venue').each((_, el) => {
        expect($(el).text()).toBe(venue);
        expect($(el).children().length).toBe(0);
      });
    });
  }
});
