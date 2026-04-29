/**
 * Tests for src/ticketing/resolver.ts — resolveTicketUrl cascade.
 *
 * Validates:
 *   D1 — tier composition (door_only / price guards / past event / 1 / 2 / 3b / 3 / 5 / 1b)
 *   D2 — cascade strategy (short-circuit on Tier 1; pick max-confidence cheap;
 *        escalate to HTTP only if best cheap < 0.7 and skipNetwork=false)
 *   D4 — Tier 3b uses ctx.crossrefEvents (in-memory, no DB)
 *
 * Tier 1b is stubbed by SOURCES_WITH_OUTBOUND_LINKS being empty (deliberate);
 * we verify it's gated by skipNetwork without exercising real HTTP.
 *
 * Real venue names from config/athens-venues.json + config/ticketing-mapping.json
 * are used so tests reflect the live config shape (integration-ish at the registry
 * boundary). Future date used to keep events live as time advances.
 */

import { describe, test, expect } from 'bun:test';
import {
  resolveTicketUrl,
  tier1_fromScraper,
  tier2_venueRegistry,
  tier3_platformSearch,
  tier3b_crossref,
  tier5_venueFallback,
  type ResolverEvent,
  type CrossrefCandidate,
} from '../../src/ticketing/resolver';

const FUTURE_DATE = '2027-06-15'; // Far enough in the future to stay live across sessions.

function mkEvent(overrides: Partial<ResolverEvent>): ResolverEvent {
  return {
    id: overrides.id ?? 'test-id',
    title: overrides.title ?? 'Test Event',
    venue_name: overrides.venue_name ?? 'Test Venue',
    start_date: overrides.start_date ?? FUTURE_DATE,
    end_date: overrides.end_date ?? null,
    type: overrides.type ?? 'concert',
    source: overrides.source ?? 'more.com',
    url: overrides.url ?? null,
    ticket_url: overrides.ticket_url ?? null,
    ticket_url_status: overrides.ticket_url_status ?? null,
    price_type: overrides.price_type ?? 'with-ticket',
  };
}

// ============================================================================
// TIER 0 GUARDS
// ============================================================================

describe('resolveTicketUrl — Tier 0 guards', () => {
  test('door_only event short-circuits to door_only @ tier 0', async () => {
    const r = await resolveTicketUrl(
      mkEvent({ ticket_url_status: 'door_only', ticket_url: 'https://more.com/x' })
    );
    expect(r.status).toBe('door_only');
    expect(r.url).toBeNull();
    expect(r.tier).toBe(0);
  });

  test('price=open short-circuits to open_entry @ tier 0', async () => {
    const r = await resolveTicketUrl(
      mkEvent({ price_type: 'open', ticket_url: 'https://more.com/x' })
    );
    expect(r.status).toBe('open_entry');
    expect(r.url).toBeNull();
    expect(r.tier).toBe(0);
  });

  test('price=donation short-circuits to open_entry', async () => {
    const r = await resolveTicketUrl(mkEvent({ price_type: 'donation' }));
    expect(r.status).toBe('open_entry');
    expect(r.tier).toBe(0);
  });

  test('past event (non-exhibition) short-circuits via past_event guard', async () => {
    const r = await resolveTicketUrl(
      mkEvent({ start_date: '2020-01-01', ticket_url: 'https://more.com/x' })
    );
    expect(r.status).toBe('unresolved');
    // Distinguish guard-fired-past from cascade-fallthrough by source string.
    expect(r.source).toContain('past_event');
  });

  test('past start_date but future end_date on exhibition is NOT past', async () => {
    // Exhibition that started in 2020 but runs until 2027 — should NOT be flagged past.
    const r = await resolveTicketUrl(
      mkEvent({
        type: 'exhibition',
        start_date: '2020-01-01',
        end_date: FUTURE_DATE,
        venue_name: 'Some Venue With No Registry Entry',
      })
    );
    // Past-event guard does NOT fire — falls through cascade to unresolved.
    // Distinguished from guard-past by source not containing 'past_event'.
    expect(r.source).not.toContain('past_event');
  });
});

// ============================================================================
// TIER 1 — scraper-captured allowlisted URL
// ============================================================================

describe('resolveTicketUrl — Tier 1', () => {
  test('allowlisted more.com URL → direct @ 0.95', () => {
    const r = tier1_fromScraper(
      mkEvent({ ticket_url: 'https://more.com/tickets/abc' })
    );
    expect(r).not.toBeNull();
    expect(r!.status).toBe('direct');
    expect(r!.confidence).toBe(0.95);
    expect(r!.tier).toBe(1);
  });

  test('allowlisted ra.co URL → direct @ 0.95 (D5: RA promoted)', () => {
    const r = tier1_fromScraper(
      mkEvent({ ticket_url: 'https://ra.co/events/12345' })
    );
    expect(r).not.toBeNull();
    expect(r!.status).toBe('direct');
  });

  test('athinorama self-link is rejected (continues cascade)', () => {
    const r = tier1_fromScraper(
      mkEvent({ ticket_url: 'https://www.athinorama.gr/music/gig/x' })
    );
    expect(r).toBeNull();
  });

  test('non-allowlisted host is rejected (e.g. random venue site)', () => {
    const r = tier1_fromScraper(
      mkEvent({ ticket_url: 'https://random-venue.gr/events/x' })
    );
    expect(r).toBeNull();
  });

  test('cascade: Tier 1 hit short-circuits — Tier 2/3/5 do not run', async () => {
    // Half Note IS in venue_registry (Tier 2 would hit) AND in athens-venues.json
    // (Tier 5 would hit). Tier 1 should win because confidence 0.95 ≥ 0.95.
    const r = await resolveTicketUrl(
      mkEvent({
        venue_name: 'Half Note Jazz Club',
        ticket_url: 'https://more.com/tickets/half-note-show',
      })
    );
    expect(r.status).toBe('direct');
    expect(r.tier).toBe(1);
    expect(r.url).toBe('https://more.com/tickets/half-note-show');
  });
});

// ============================================================================
// TIER 2 — venue registry (D1 split: direct vs search)
// ============================================================================

describe('resolveTicketUrl — Tier 2 (venue_registry split)', () => {
  test('venue with ticketing.url → venue_registry_direct @ 0.85', () => {
    // Half Note Jazz Club has ticketing.url=https://www.halfnote.gr/programma/
    const r = tier2_venueRegistry(mkEvent({ venue_name: 'Half Note Jazz Club' }));
    expect(r).not.toBeNull();
    expect(r!.status).toBe('venue_registry_direct');
    expect(r!.confidence).toBe(0.85);
    expect(r!.url).toBe('https://www.halfnote.gr/programma/');
  });

  test('venue with ticketing.search_pattern → venue_registry_search @ 0.6', () => {
    // Ίλιον Plus has search_pattern with {title} substitution
    const r = tier2_venueRegistry(
      mkEvent({ venue_name: 'Ίλιον Plus', title: 'Lah Porella' })
    );
    expect(r).not.toBeNull();
    expect(r!.status).toBe('venue_registry_search');
    expect(r!.confidence).toBe(0.6);
    expect(r!.url).toContain('Lah%20Porella'); // title was URL-encoded
  });

  test('venue not in registry → null', () => {
    const r = tier2_venueRegistry(mkEvent({ venue_name: 'Nonexistent Venue 12345' }));
    expect(r).toBeNull();
  });
});

// ============================================================================
// TIER 3 — platform search from ticketing-mapping.json
// ============================================================================

describe('resolveTicketUrl — Tier 3 (platform_search)', () => {
  test('Gazarte (mapped to more.com) → more.com search URL @ 0.5', () => {
    // Gazarte → more.com per config/ticketing-mapping.json venue_to_platform
    const r = tier3_platformSearch(
      mkEvent({ venue_name: 'Gazarte', title: 'Some Concert' })
    );
    expect(r).not.toBeNull();
    expect(r!.status).toBe('platform_search');
    expect(r!.confidence).toBe(0.5);
    expect(r!.tier).toBe(3);
    expect(r!.url).toContain('more.com');
    expect(r!.url).toContain('search');
    expect(r!.url).toContain('Some%20Concert');
  });

  test('venue not in venue_to_platform → null', () => {
    const r = tier3_platformSearch(mkEvent({ venue_name: 'Random Unknown Venue' }));
    expect(r).toBeNull();
  });
});

// ============================================================================
// TIER 3b — title-Jaccard with venue prefilter (D4)
// ============================================================================

describe('resolveTicketUrl — Tier 3b (crossref)', () => {
  test('matching candidate at same venue → crossref @ 0.7', async () => {
    const candidates: CrossrefCandidate[] = [
      {
        title: 'SoundNow with Fjushа FJUSHA party',
        venue: 'Aux Club',
        url: 'https://ra.co/events/2024-aux-soundnow',
      },
      {
        title: 'Totally Different Other Show',
        venue: 'Some Other Place',
        url: 'https://ra.co/events/other',
      },
    ];
    const r = await tier3b_crossref(
      mkEvent({
        title: 'SoundNow with Fjushа Nivk Jane Siasios',
        venue_name: 'Aux Club',
      }),
      { crossrefEvents: candidates }
    );
    expect(r).not.toBeNull();
    expect(r!.status).toBe('crossref');
    expect(r!.confidence).toBe(0.7);
    expect(r!.url).toBe('https://ra.co/events/2024-aux-soundnow');
  });

  test('candidate at SAME venue but unrelated title → null (false-positive guard)', async () => {
    // Pre-refinement: combined Jaccard would have matched these because venue
    // tokens dominated. Title-only Jaccard with venue prefilter rejects it.
    const candidates: CrossrefCandidate[] = [
      {
        title: 'Τζένη Τζένη',
        venue: 'Δημοτικό Θέατρο Πειραιά',
        url: 'https://www.more.com/gr-el/tickets/theater/tzeni-tzeni/',
      },
    ];
    const r = await tier3b_crossref(
      mkEvent({ title: 'Το μαύρο κουτί', venue_name: 'Δημοτικό Θέατρο Πειραιά' }),
      { crossrefEvents: candidates }
    );
    expect(r).toBeNull();
  });

  test('matching title but DIFFERENT venue → null (venue prefilter)', async () => {
    const candidates: CrossrefCandidate[] = [
      {
        title: 'Jazz Night',
        venue: 'Some Other Venue',
        url: 'https://ra.co/events/jazz-other',
      },
    ];
    const r = await tier3b_crossref(
      mkEvent({ title: 'Jazz Night', venue_name: 'Half Note Jazz Club' }),
      { crossrefEvents: candidates }
    );
    expect(r).toBeNull();
  });

  test('no candidates → null', async () => {
    const r = await tier3b_crossref(mkEvent({}), { crossrefEvents: [] });
    expect(r).toBeNull();
  });

  test('omitted crossrefEvents (site-gen path) → null', async () => {
    const r = await tier3b_crossref(mkEvent({}), {});
    expect(r).toBeNull();
  });
});

// ============================================================================
// TIER 5 — venue website fallback
// ============================================================================

describe('resolveTicketUrl — Tier 5 (venue_fallback)', () => {
  test('venue with website but no ticketing → venue_fallback @ 0.3', () => {
    // Onassis Stegi has website + search_pattern; Tier 5 specifically grabs the website.
    const r = tier5_venueFallback(mkEvent({ venue_name: 'Onassis Stegi' }));
    expect(r).not.toBeNull();
    expect(r!.status).toBe('venue_fallback');
    expect(r!.confidence).toBe(0.3);
    expect(r!.tier).toBe(5);
  });

  test('venue not in registry → null', () => {
    const r = tier5_venueFallback(mkEvent({ venue_name: 'Nonexistent Venue 99999' }));
    expect(r).toBeNull();
  });
});

// ============================================================================
// CASCADE COMPOSITION (D2)
// ============================================================================

describe('resolveTicketUrl — cascade composition', () => {
  test('Tier 2 direct (0.85) beats Tier 5 (0.3) when both hit', async () => {
    // Half Note has BOTH ticketing.url (Tier 2 direct) AND a website (Tier 5).
    // Tier 2 should win on confidence.
    const r = await resolveTicketUrl(mkEvent({ venue_name: 'Half Note Jazz Club' }));
    expect(r.status).toBe('venue_registry_direct');
    expect(r.confidence).toBe(0.85);
    expect(r.tier).toBe(2);
  });

  test('Tier 3b crossref (0.7) is selected over Tier 3 (0.5) and Tier 5 (0.3)', async () => {
    const candidates: CrossrefCandidate[] = [
      {
        title: 'Some Specific Concert at Gazarte',
        venue: 'Gazarte',
        url: 'https://ra.co/events/specific-gazarte',
      },
    ];
    const r = await resolveTicketUrl(
      mkEvent({ title: 'Some Specific Concert', venue_name: 'Gazarte' }),
      { crossrefEvents: candidates, skipNetwork: true }
    );
    expect(r.status).toBe('crossref');
    expect(r.confidence).toBe(0.7);
  });

  test('skipNetwork=true with only low-confidence cheap candidates returns best cheap, never Tier 1b', async () => {
    // Onassis Stegi has search_pattern (Tier 2 search @ 0.6) + website (Tier 5 @ 0.3).
    // 0.6 < 0.7 threshold for early return. With skipNetwork=true, no Tier 1b.
    // Result: Tier 2 search wins as fallback (0.6 > 0.3).
    const r = await resolveTicketUrl(
      mkEvent({ venue_name: 'Onassis Stegi', title: 'Some Show' }),
      { skipNetwork: true }
    );
    expect(r.status).toBe('venue_registry_search');
    expect(r.confidence).toBe(0.6);
  });

  test('no tiers hit → unresolved (cascade fallthrough)', async () => {
    const r = await resolveTicketUrl(
      mkEvent({
        venue_name: 'Truly Unknown Venue 99999',
        ticket_url: null,
      })
    );
    expect(r.status).toBe('unresolved');
    expect(r.url).toBeNull();
    expect(r.confidence).toBe(0);
  });
});
