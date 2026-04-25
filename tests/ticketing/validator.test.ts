/**
 * Tests for src/ticketing/validator.ts — isHomepageRedirect heuristic.
 *
 * Validates decisions.md D6's 6-step algorithm:
 *   1. isVenueHost=true → false (Tier 5 intent, preserve)
 *   2. Parse; count segments (split on /, filter empty — handles trailing slashes)
 *   3. finalSegments.length === 0 → true (bare root, regardless of query)
 *   4. isTicketHost AND non-empty query AND finalSegments >= 1 → false (search page)
 *   5. finalSegments.length < originalSegments.length → true (segments lost)
 *   6. Else → false
 */

import { describe, test, expect } from 'bun:test';
import { isHomepageRedirect } from '../../src/ticketing/validator';

describe('isHomepageRedirect', () => {
  // D6 step 1: Tier 5 intent — venue homepage is intentional fallback, preserve it
  test('venue homepage is NOT redirect when isVenueHost=true', () => {
    expect(
      isHomepageRedirect({
        originalUrl: 'https://gazarte.gr/',
        finalUrl: 'https://gazarte.gr/',
        isTicketHost: false,
        isVenueHost: true,
      })
    ).toBe(false);
  });

  // D6 step 3: bare root → redirect, even if we started deeper
  test('bare root is redirect when original had segments', () => {
    expect(
      isHomepageRedirect({
        originalUrl: 'https://more.com/tickets/lah-porella-123',
        finalUrl: 'https://more.com/',
        isTicketHost: true,
        isVenueHost: false,
      })
    ).toBe(true);
  });

  // D6 step 3: bare root + tracking params is still bare root semantically
  test('bare root with tracking params is still redirect', () => {
    expect(
      isHomepageRedirect({
        originalUrl: 'https://more.com/tickets/abc',
        finalUrl: 'https://more.com/?utm_source=x',
        isTicketHost: true,
        isVenueHost: false,
      })
    ).toBe(true);
  });

  // D6 step 4: /search?query=... on ticket host is a legitimate landing page
  test('search results page on ticket host is NOT redirect', () => {
    expect(
      isHomepageRedirect({
        originalUrl: 'https://more.com/search?query=lah+porella',
        finalUrl: 'https://more.com/search?query=lah+porella',
        isTicketHost: true,
        isVenueHost: false,
      })
    ).toBe(false);
  });

  // D6 step 5: event-specific URL demoted to category is a redirect
  // original has 3 segments, final has 1 — segments lost → redirect
  test('category redirect (segments lost) is redirect', () => {
    expect(
      isHomepageRedirect({
        originalUrl: 'https://ticketservices.gr/event/music/specific-abc',
        finalUrl: 'https://ticketservices.gr/category/',
        isTicketHost: true,
        isVenueHost: false,
      })
    ).toBe(true);
  });

  // D6 step 6: same URL, same depth — no redirect happened semantically
  test('same-depth resolution is NOT redirect', () => {
    expect(
      isHomepageRedirect({
        originalUrl: 'https://more.com/tickets/music/lah',
        finalUrl: 'https://more.com/tickets/music/lah/',
        isTicketHost: true,
        isVenueHost: false,
      })
    ).toBe(false);
  });

  // Edge case: original URL was already root → staying at root is not a redirect
  test('originally-root URL staying at root is NOT redirect', () => {
    expect(
      isHomepageRedirect({
        originalUrl: 'https://gazarte.gr/',
        finalUrl: 'https://gazarte.gr/',
        isTicketHost: false,
        isVenueHost: false,
      })
    ).toBe(false);
  });

  // Extra guard: non-ticket-host bare root redirect (not covered by step 1, step 3 still fires)
  test('bare root on non-ticket-host is still redirect when original had depth', () => {
    expect(
      isHomepageRedirect({
        originalUrl: 'https://randomsite.gr/events/concert-xyz',
        finalUrl: 'https://randomsite.gr/',
        isTicketHost: false,
        isVenueHost: false,
      })
    ).toBe(true);
  });

  // Extra guard: search URL on non-ticket-host does not get step 4 protection
  test('search-style path on non-ticket-host is NOT treated as search protection', () => {
    // Per D6 step 4, isTicketHost must be true for search protection.
    // Here: same-depth, same URL, non-ticket-host → falls through to step 6 (false).
    expect(
      isHomepageRedirect({
        originalUrl: 'https://randomsite.gr/search?q=foo',
        finalUrl: 'https://randomsite.gr/search?q=foo',
        isTicketHost: false,
        isVenueHost: false,
      })
    ).toBe(false);
  });
});
