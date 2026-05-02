import { describe, test, expect } from 'bun:test';
import { shouldExcludeEvent, filterInScopeEvents } from '../scope-filter';

describe('shouldExcludeEvent', () => {
  describe('sports events', () => {
    test('should exclude basketball events', () => {
      const result = shouldExcludeEvent({ title: 'AEK vs Olympiakos basketball' });
      expect(result.inScope).toBe(false);
      expect(result.reason).toContain('excluded_keyword');
    });

    test('should exclude football events', () => {
      const result = shouldExcludeEvent({ title: 'Panathinaikos - PAOK football match' });
      expect(result.inScope).toBe(false);
    });

    test('should exclude events at sports venues', () => {
      const result = shouldExcludeEvent({ title: 'Concert', venue: 'ΟΑΚΑ' });
      expect(result.inScope).toBe(false);
      expect(result.reason).toContain('excluded_venue');
    });

    test('should exclude Greek sports team events', () => {
      const result = shouldExcludeEvent({ title: 'ΑΕΚ Season Tickets 2025' });
      expect(result.inScope).toBe(false);
    });

    test('should exclude Euroleague events', () => {
      const result = shouldExcludeEvent({ title: 'Euroleague Final Four' });
      expect(result.inScope).toBe(false);
    });
  });

  describe('corporate events', () => {
    test('should exclude corporate events', () => {
      const result = shouldExcludeEvent({ title: 'Corporate networking event' });
      expect(result.inScope).toBe(false);
    });

    test('should exclude conferences', () => {
      const result = shouldExcludeEvent({ title: 'Tech conference 2025' });
      expect(result.inScope).toBe(false);
    });

    test('should exclude seminars', () => {
      const result = shouldExcludeEvent({ title: 'Business seminar Athens' });
      expect(result.inScope).toBe(false);
    });

    test('should exclude webinars', () => {
      const result = shouldExcludeEvent({ title: 'Marketing webinar' });
      expect(result.inScope).toBe(false);
    });
  });

  describe('personal events', () => {
    test('should exclude weddings', () => {
      const result = shouldExcludeEvent({ title: 'Wedding reception' });
      expect(result.inScope).toBe(false);
    });

    test('should exclude baptisms', () => {
      const result = shouldExcludeEvent({ title: 'Βάπτιση στην Αθήνα' });
      expect(result.inScope).toBe(false);
    });

    test('should exclude graduations', () => {
      const result = shouldExcludeEvent({ title: 'Graduation ceremony' });
      expect(result.inScope).toBe(false);
    });
  });

  describe('religious events', () => {
    test('should exclude religious services', () => {
      const result = shouldExcludeEvent({ title: 'Religious service' });
      expect(result.inScope).toBe(false);
    });

    test('should exclude Greek religious festivals', () => {
      const result = shouldExcludeEvent({ title: 'Πανηγύρι Αγίου Νικολάου' });
      expect(result.inScope).toBe(false);
    });
  });

  describe('allowed cultural events', () => {
    test('should allow concerts', () => {
      const result = shouldExcludeEvent({ title: 'Jazz concert at Half Note' });
      expect(result.inScope).toBe(true);
    });

    test('should allow theater', () => {
      const result = shouldExcludeEvent({ title: 'Hamlet at National Theatre' });
      expect(result.inScope).toBe(true);
    });

    test('should allow exhibitions', () => {
      const result = shouldExcludeEvent({ title: 'Contemporary art exhibition' });
      expect(result.inScope).toBe(true);
    });
  });

  describe('dance override keywords', () => {
    test('should allow tango events', () => {
      const result = shouldExcludeEvent({ title: 'Tango night at Megaron' });
      expect(result.inScope).toBe(true);
    });

    test('should allow ballet events', () => {
      const result = shouldExcludeEvent({ title: 'Swan Lake ballet performance' });
      expect(result.inScope).toBe(true);
    });

    test('should allow contemporary dance', () => {
      const result = shouldExcludeEvent({ title: 'Contemporary dance performance' });
      expect(result.inScope).toBe(true);
    });

    test('should allow flamenco', () => {
      const result = shouldExcludeEvent({ title: 'Flamenco show Athens' });
      expect(result.inScope).toBe(true);
    });

    test('dance override should take precedence over venue exclusion', () => {
      // If a dance event happens at a sports venue, it should still be allowed
      const result = shouldExcludeEvent({
        title: 'Ballet performance',
        venue: 'Some venue'
      });
      expect(result.inScope).toBe(true);
    });
  });

  describe('URL-path deny-list (excludedUrlPatterns)', () => {
    test('should exclude events whose URL matches a deny-list pattern', () => {
      const result = shouldExcludeEvent({
        title: 'ΚΟΛΟΣΣΟΣ H HOTELS COLLECTION',
        venue: 'Κλειστό Καλλιθέας',
        url: 'https://www.more.com/gr-el/tickets/sports/kolossos-h-hotels-collection-karditsa/'
      });
      expect(result.inScope).toBe(false);
      expect(result.reason).toBe('excluded_url_pattern:/tickets/sports/');
    });

    test('should allow events whose URL does not match any deny-list pattern', () => {
      const result = shouldExcludeEvent({
        title: 'Jazz concert',
        url: 'https://www.more.com/gr-el/tickets/music/some-jazz-event/'
      });
      expect(result.inScope).toBe(true);
    });

    test('URL deny-list is source-boundary policy and overrides allowedKeywordsOverride', () => {
      // A "ballet" title would normally be allowed by the dance override.
      // But if the URL says /tickets/sports/, the source has classified it as sports —
      // no content-level override should resurrect it.
      const result = shouldExcludeEvent({
        title: 'Ballet at the arena',
        url: 'https://www.more.com/gr-el/tickets/sports/some-promo/'
      });
      expect(result.inScope).toBe(false);
      expect(result.reason).toContain('excluded_url_pattern');
    });

    test('events without a url field still work (backward-compat)', () => {
      const result = shouldExcludeEvent({ title: 'Jazz concert' });
      expect(result.inScope).toBe(true);
    });

    test('should exclude events on productledhub.com (industry conference)', () => {
      // Editorial 2026-05-02: cultural participation, not professional networking.
      // Practitioner-only audience; non-practitioners would not attend for cultural enjoyment.
      const result = shouldExcludeEvent({
        title: 'Disrupt AI Summit 2026',
        url: 'https://productledhub.com/disrupt-ai-summit/'
      });
      expect(result.inScope).toBe(false);
      expect(result.reason).toBe('excluded_url_pattern:productledhub.com');
    });

    test('should exclude events on athensseo.com (industry conference)', () => {
      const result = shouldExcludeEvent({
        title: 'Athens SEO 2026',
        url: 'https://athensseo.com/'
      });
      expect(result.inScope).toBe(false);
      expect(result.reason).toBe('excluded_url_pattern:athensseo.com');
    });

    test('should NOT exclude events on cultural-venue domains (megaron.gr regression guard)', () => {
      // Megaron is a known cultural venue. Adding new deny patterns must not catch it.
      const result = shouldExcludeEvent({
        title: 'Classical concert',
        venue: 'Megaron Athens Concert Hall',
        url: 'https://www.megaron.gr/event/some-classical-concert/'
      });
      expect(result.inScope).toBe(true);
    });
  });
});

describe('filterInScopeEvents', () => {
  test('should filter out-of-scope events', () => {
    const events = [
      { title: 'Jazz concert', venue_name: 'Half Note' },
      { title: 'AEK basketball game', venue_name: 'ΟΑΚΑ' },
      { title: 'Theater performance', venue_name: 'National Theatre' },
      { title: 'Corporate meeting', venue_name: 'Hilton' }
    ];

    const { inScope, excluded } = filterInScopeEvents(events);

    expect(inScope).toHaveLength(2);
    expect(excluded).toHaveLength(2);
    expect(inScope.map(e => e.title)).toContain('Jazz concert');
    expect(inScope.map(e => e.title)).toContain('Theater performance');
    expect(excluded.map(e => e.event.title)).toContain('AEK basketball game');
    expect(excluded.map(e => e.event.title)).toContain('Corporate meeting');
  });

  test('should include exclusion reasons', () => {
    const events = [
      { title: 'Wedding party', venue_name: 'Hotel' }
    ];

    const { excluded } = filterInScopeEvents(events);

    expect(excluded[0].reason).toContain('excluded_keyword');
  });
});
