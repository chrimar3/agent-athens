/**
 * CTA Resolution — map resolver output to what the event page renders.
 *
 * Consumed by:
 *   - src/generators/practical-block.ts (Tickets row in the practical block)
 *   - src/generators/event-page.ts      (hero CTA button)
 *
 * Keeping the policy here means both call sites stay in lockstep.
 */
import type { Event } from '../types';
import type { UIStrings } from '../i18n/strings';
import { hostOf } from './validator';

export type CtaKind = 'tickets' | 'venue' | 'door' | 'none';

export interface CtaResult {
  kind: CtaKind;
  /** Localized button/link text. */
  label: string;
  /** Destination URL; null for 'door' / 'none'. */
  href: string | null;
  /** Optional secondary line (e.g., hostname shown beneath "Check venue website"). */
  subLabel?: string;
  /**
   * D8 secondary venue link: present when the primary CTA points at a search
   * URL (platform_search or venue_registry_search) AND the event's venue has
   * a different-host website. Renderer shows "Or visit {venueHost}" below
   * the primary CTA. null/undefined means no secondary link.
   */
  secondaryHref?: string;
  /** Display host for the secondary link (e.g. "gazarte.gr"). */
  secondaryHost?: string;
}

export const CTA_NONE: CtaResult = { kind: 'none', label: '', href: null };

/** Small helper: extract "megaron.gr" from "https://www.megaron.gr/en/…". */
export function prettyHost(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return hostOf(url) ?? undefined;
}

// ============================================================================
// CTA POLICY — implements decisions.md D7 + D8
// ============================================================================

// Status groups per D7. Declared as readonly arrays with `as const` so the
// types propagate (rather than widening to string[]).
const BUY_TICKETS_STATUSES = [
  'direct',
  'detail_page',
  'venue_registry_direct',
  'venue_registry', // legacy (pre-D11), retained for backward-compat
  'crossref',
  'ai_discovered',
] as const;

const FIND_TICKETS_STATUSES = [
  'venue_registry_search',
  'platform_search',
] as const;

/**
 * Map (ticketUrlStatus, ticketUrl, venue.website, price.type) → CtaResult.
 * Called from practical-block.ts and event-page.ts; single source of CTA truth.
 *
 * Policy order (D7):
 *   1. price=open or donation → none (suppress CTA regardless of status)
 *   2. status ∈ {direct, detail_page, venue_registry_direct, crossref, ai_discovered} + url → "Buy tickets"
 *   3. status ∈ {venue_registry_search, platform_search} + url → "Find tickets" (+ D8 secondary link)
 *   4. status = door_only → "At the door" (href=null)
 *   5. else if venue.website (covers venue_fallback / unresolved / expired / legacy undefined) → "Check venue website"
 *   6. else → none
 */
export function resolveCtaForEvent(event: Event, t: UIStrings): CtaResult {
  // D7 rule 1: price guards suppress CTA entirely (including open_entry status cases).
  if (event.price?.type === 'open' || event.price?.type === 'donation') {
    return CTA_NONE;
  }

  const venueWebsite = event.venue.website;
  const url = event.ticketUrl;
  const status = event.ticketUrlStatus;

  // D7 rule 2: high-confidence tiers get "Buy tickets".
  if (url && status && (BUY_TICKETS_STATUSES as readonly string[]).includes(status)) {
    return { kind: 'tickets', label: t.buyTicketsArrow, href: url };
  }

  // D7 rule 3 + D8: search-style URLs get "Find tickets" + optional secondary venue link.
  if (url && status && (FIND_TICKETS_STATUSES as readonly string[]).includes(status)) {
    const result: CtaResult = { kind: 'tickets', label: t.findTicketsArrow, href: url };
    // D8: secondary "Or visit {venueHost}" — only when venue.website is on a different host.
    if (venueWebsite) {
      const primaryHost = hostOf(url);
      const venueHost = hostOf(venueWebsite);
      if (primaryHost && venueHost && primaryHost !== venueHost) {
        result.secondaryHref = venueWebsite;
        result.secondaryHost = venueHost;
      }
    }
    return result;
  }

  // D7 rule 4: door_only — no URL, fixed label.
  if (status === 'door_only') {
    return { kind: 'door', label: t.doorOnly, href: null };
  }

  // D7 rule 4.5 (redesign loop 20260707): ticketed event with no trusted ticket
  // URL — the scrape-source event page is the only real booking route the site
  // knows. Emit it as a "Find tickets" CTA instead of dead-ending on the venue
  // homepage or none; every trusted tier above still wins when present.
  if (event.price?.type === 'with-ticket' && event.url) {
    return { kind: 'tickets', label: t.findTicketsArrow, href: event.url };
  }

  // D7 rule 5: venue website fallback (covers venue_fallback, unresolved, expired,
  // legacy undefined status). Key distinction from rule 2/3 is no ticketUrl trust.
  if (venueWebsite) {
    return {
      kind: 'venue',
      label: t.checkVenueArrow,
      href: venueWebsite,
      subLabel: prettyHost(venueWebsite),
    };
  }

  // D7 rule 6: nothing to show.
  return CTA_NONE;
}
