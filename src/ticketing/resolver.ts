/**
 * Ticket URL Resolver — tiered cascade
 *
 * Takes an event, returns where users should go to buy tickets. Each tier has
 * a confidence score and a provenance string for observability.
 *
 * Tiers in rough reliability order (the USER writes the actual priority):
 *   1  direct            — scrapers already captured a valid ticket host URL
 *   1b detail_page       — fetch event.url and extract outbound ticket link
 *   2  venue_registry    — athens-venues.json ticketing.{url|search_pattern}
 *   3  platform_search   — construct search URL on more.com / ticketservices
 *   3b crossref          — Jaccard similarity against more.com-scraped events
 *   4  ai_discovered     — populated passively by batch-enrich-session.ts
 *   5  venue_fallback    — venue.website → drives "Check venue website" CTA
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { getVenueByName, normalizeVenueKey } from './venue-registry';
import { isTicketDomain, hostOf } from './validator';

// D11: formalized ticket_url_status values.
export type TicketUrlStatus =
  | 'direct'
  | 'detail_page'
  | 'venue_registry'           // legacy (pre-D11), accepted on read, not emitted by resolver
  | 'venue_registry_direct'
  | 'venue_registry_search'
  | 'crossref'
  | 'platform_search'
  | 'ai_discovered'
  | 'venue_fallback'
  | 'door_only'
  | 'expired'
  | 'unresolved'
  | 'open_entry';

/**
 * F2b generalization of the Tier-1 rule: a REAL end_date governs the past
 * check for ANY type — a theater run through June 30 is still selling tickets
 * after opening night, so suppressing its CTA by start_date was the same
 * defect class as dropping running exhibitions. NULL end_date keeps the
 * start_date check (no presumption here: presumption affects status/indexing,
 * never "is this still sellable" — err short on CTAs).
 */
function isPastEvent(event: ResolverEvent): boolean {
  const today = new Date().toISOString().slice(0, 10); // ISO date, naive-local per CLAUDE.md
  const ref = event.end_date || event.start_date;
  if (!ref) return false;
  return ref.slice(0, 10) < today;
}

export interface ResolverEvent {
  id: string;
  title: string;
  venue_name: string | null;
  start_date: string | null;
  /** Exhibitions use end_date for past-event check (Tier 1 rule). */
  end_date?: string | null;
  /** Event type drives isPastEvent's exhibition branch. */
  type?: string | null;
  source: string | null;
  url: string | null;
  ticket_url: string | null;
  ticket_url_status: string | null;
  price_type: string | null;
}

export interface ResolvedTicket {
  url: string | null;
  status: TicketUrlStatus;
  /** 0..1; higher = more reliable. Used by the user-written cascade for scoring. */
  confidence: number;
  /** Tier that produced the result (1, 1b→1.5, 2, 3, 3b→3.5, 4, 5; 0 = unresolved). */
  tier: number;
  /** Human-readable provenance string for logs/debugging. */
  source: string;
}

/**
 * Pre-loaded candidate for Tier 3b Jaccard crossref. Backfill script loads
 * these once (e.g. RA + more.com + ticketservices events) and passes in;
 * resolver does no DB work in-function (keeps it pure/fast). Site-gen omits
 * (backfill already persisted verdicts). See D4.
 */
export interface CrossrefCandidate {
  title: string;
  venue: string;
  url: string;
}

export interface ResolverContext {
  /**
   * Optional open Database instance (bun:sqlite). Reserved for future tier
   * expansion; not currently required. Pass from the backfill script if needed.
   */
  db?: unknown;
  /** Skip tiers that issue network requests (Tier 1b). Inverse of plan's `allowHttp`. */
  skipNetwork?: boolean;
  /**
   * Pre-loaded crossref candidates (D4). Tier 3b matches event.title+venue_name
   * against these via Jaccard. Backfill pre-loads; site-gen passes [] or omits.
   */
  crossrefEvents?: readonly CrossrefCandidate[];
}

export const UNRESOLVED: ResolvedTicket = {
  url: null,
  status: 'unresolved',
  confidence: 0,
  tier: 0,
  source: '',
};

// ============================================================================
// TIER 1 — trust the scraper, but reject known pollution
// ============================================================================

export function tier1_fromScraper(event: ResolverEvent): ResolvedTicket | null {
  const url = event.ticket_url;
  if (!url) return null;
  const host = hostOf(url);
  if (!host) return null;

  // Pollution guard: validate-ticket-urls.ts generateMissingUrls() copied many
  // athinorama.gr listing URLs into ticket_url. Athinorama is editorial, not
  // a ticket vendor — never trust it as a Tier 1 result.
  if (host === 'athinorama.gr') return null;

  if (!isTicketDomain(url)) return null;

  return {
    url,
    status: 'direct',
    confidence: 0.95,
    tier: 1,
    source: `scraper:${event.source ?? 'unknown'}`,
  };
}

// ============================================================================
// TIER 1b — fetch event.url and look for outbound ticket host links
// ============================================================================

/**
 * Sources whose detail pages carry outbound ticket links worth extracting.
 * Athinorama deliberately excluded — 2026-04-24 investigation confirmed its
 * detail pages contain no more.com / viva / ticketservices outbound links.
 *
 * TODO: expand as we observe which scrapers carry outbound links. Start
 * empty-ish; add sources only when confirmed.
 */
const SOURCES_WITH_OUTBOUND_LINKS = new Set<string>([
  // 'clubber.gr',  // enable once verified
  // 'ra.co',       // enable once verified
]);

export async function tier1b_detailPage(
  event: ResolverEvent,
  opts: ResolverContext
): Promise<ResolvedTicket | null> {
  if (opts.skipNetwork) return null;
  if (!event.url) return null;
  if (!event.source || !SOURCES_WITH_OUTBOUND_LINKS.has(event.source)) return null;

  // TODO: port scripts/extract-ticket-urls.ts fetchPage() + extractTicketUrl()
  // logic here once we have at least one source in SOURCES_WITH_OUTBOUND_LINKS.
  // Key regex: /https?:\/\/(?:www\.)?(more\.com|ticketservices\.gr|viva\.gr)\/[^"'\s>]+/i
  return null;
}

// ============================================================================
// TIER 2 — venue registry lookup (the high-leverage fix)
// ============================================================================

export function tier2_venueRegistry(event: ResolverEvent): ResolvedTicket | null {
  const venue = getVenueByName(event.venue_name);
  if (!venue?.ticketing) return null;

  // D1: deep-link direct URL → venue_registry_direct @ 0.85
  if (venue.ticketing.url) {
    return {
      url: venue.ticketing.url,
      status: 'venue_registry_direct',
      confidence: 0.85,
      tier: 2,
      source: `registry:${venue.canonical_name}:url`,
    };
  }

  // D1: search pattern → venue_registry_search @ 0.6 (lower — lands on results, not event)
  if (venue.ticketing.search_pattern) {
    const url = venue.ticketing.search_pattern
      .replace('{title}', encodeURIComponent(event.title))
      .replace('{venue}', encodeURIComponent(venue.canonical_name));
    return {
      url,
      status: 'venue_registry_search',
      confidence: 0.6,
      tier: 2,
      source: `registry:${venue.canonical_name}:pattern`,
    };
  }

  return null;
}

// ============================================================================
// TIER 3 — platform search URL from ticketing-mapping.json
// ============================================================================

interface TicketingMapping {
  platforms?: Record<string, { base_url?: string; search_pattern?: string }>;
  venue_to_platform?: Record<string, { platform: string }>;
}

let ticketingMappingCache: TicketingMapping | null = null;

function loadTicketingMapping(): TicketingMapping {
  if (ticketingMappingCache) return ticketingMappingCache;
  const path = join(import.meta.dir, '..', '..', 'config', 'ticketing-mapping.json');
  ticketingMappingCache = JSON.parse(readFileSync(path, 'utf-8')) as TicketingMapping;
  return ticketingMappingCache;
}

/** Test-only: reset the cache so tests can mutate and re-read the config. */
export function _resetTicketingMappingCache() {
  ticketingMappingCache = null;
}

export function tier3_platformSearch(event: ResolverEvent): ResolvedTicket | null {
  if (!event.venue_name) return null;
  const mapping = loadTicketingMapping();
  const venueEntry =
    mapping.venue_to_platform?.[event.venue_name] ??
    mapping.venue_to_platform?.[event.venue_name.trim()];
  if (!venueEntry) return null;

  const platform = mapping.platforms?.[venueEntry.platform];
  if (!platform?.base_url || !platform.search_pattern) return null;

  const url = platform.base_url + platform.search_pattern + encodeURIComponent(event.title);
  return {
    url,
    status: 'platform_search',
    confidence: 0.5,
    tier: 3,
    source: `platform:${venueEntry.platform}:search`,
  };
}

// ============================================================================
// TIER 3b — Jaccard cross-reference against more.com-scraped events in DB
// ============================================================================

/** Jaccard similarity over lowercased word tokens (min length 3, alnum only). */
function jaccardSimilarity(a: string, b: string): number {
  const tokenize = (s: string): Set<string> => {
    const tokens = s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3);
    return new Set(tokens);
  };
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const CROSSREF_TITLE_THRESHOLD = 0.3;

function venuesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase().trim() === b.toLowerCase().trim();
}

/**
 * D4: match event.title against pre-loaded candidates via title-only Jaccard,
 * gated by exact venue-name match. Two-stage filter avoids false positives
 * where venue tokens dominate the score (observed: same-venue events with
 * unrelated titles scored ≥0.45 on a combined title+venue Jaccard because
 * venue tokens were 80% of both inputs). Title-only after venue prefilter
 * gives semantically correct matching: "same venue, similar title."
 *
 * `ctx.crossrefEvents` omitted or [] short-circuits (site-gen path). Pure
 * in-memory — no DB, no network.
 */
export async function tier3b_crossref(
  event: ResolverEvent,
  ctx: ResolverContext
): Promise<ResolvedTicket | null> {
  const candidates = ctx.crossrefEvents;
  if (!candidates || candidates.length === 0) return null;

  let best: { url: string; score: number } | null = null;
  for (const c of candidates) {
    if (!venuesMatch(event.venue_name, c.venue)) continue;
    const score = jaccardSimilarity(event.title ?? '', c.title);
    if (score >= CROSSREF_TITLE_THRESHOLD && (!best || score > best.score)) {
      best = { url: c.url, score };
    }
  }

  if (!best) return null;
  return {
    url: best.url,
    status: 'crossref',
    confidence: 0.7,
    tier: 3, // 3b collapses to tier 3 bucket in scoring; source string distinguishes
    source: `crossref:title_jaccard=${best.score.toFixed(2)}`,
  };
}

// ============================================================================
// TIER 5 — venue website fallback (drives "Check venue website" CTA)
// ============================================================================

export function tier5_venueFallback(event: ResolverEvent): ResolvedTicket | null {
  const venue = getVenueByName(event.venue_name);
  if (!venue?.website) return null;
  return {
    url: venue.website,
    status: 'venue_fallback',
    confidence: 0.3,
    tier: 5,
    source: `venue_fallback:${venue.canonical_name}`,
  };
}

// ============================================================================
// TOP-LEVEL CASCADE — LEARNING MODE DECISION #1
// ============================================================================

/**
 * Resolve the best ticket URL for an event per decisions.md D1 + D2.
 *
 * Cascade:
 *   Tier 0 guards — short-circuit on door_only / price=open|donation / past event.
 *   Tier 1       — short-circuit on scraper-captured allowlisted URL (≥ 0.95).
 *   Cheap tiers  — collect candidates from Tier 2, 3b, 3, 5. Pick max-confidence.
 *                  If best ≥ 0.7 → return it.
 *   Tier 1b      — escalate to HTTP if ctx.skipNetwork=false. Returns on hit (0.9).
 *   Fallback     — return best cheap (often venue_fallback @ 0.3), else UNRESOLVED.
 *
 * ctx.crossrefEvents — pre-loaded candidates for Tier 3b (D4). Site-gen omits;
 * backfill passes the full RA + more.com + ticketservices future-event set.
 */
export async function resolveTicketUrl(
  event: ResolverEvent,
  ctx: ResolverContext = {}
): Promise<ResolvedTicket> {
  // Tier 0 guards — no cascade work needed if any of these fires.
  if (event.ticket_url_status === 'door_only') {
    return { url: null, status: 'door_only', confidence: 1, tier: 0, source: 'guard:door_only' };
  }
  if (event.price_type === 'open' || event.price_type === 'donation') {
    return {
      url: null,
      status: 'open_entry',
      confidence: 1,
      tier: 0,
      source: `guard:price=${event.price_type}`,
    };
  }
  if (isPastEvent(event)) {
    return {
      url: null,
      status: 'unresolved',
      confidence: 0,
      tier: 0,
      source: 'guard:past_event',
    };
  }

  // Tier 1 short-circuit: trust the scraper when it landed on an allowlisted host.
  const t1 = tier1_fromScraper(event);
  if (t1 && t1.confidence >= 0.95) return t1;

  // Collect cheap candidates (sync, no network, no DB).
  const candidates: ResolvedTicket[] = [];
  const t2 = tier2_venueRegistry(event);
  if (t2) candidates.push(t2);

  const t3b = await tier3b_crossref(event, ctx);
  if (t3b) candidates.push(t3b);

  const t3 = tier3_platformSearch(event);
  if (t3) candidates.push(t3);

  const t5 = tier5_venueFallback(event);
  if (t5) candidates.push(t5);

  let best: ResolvedTicket | null = null;
  for (const c of candidates) {
    if (!best || c.confidence > best.confidence) best = c;
  }

  // If cheap-tier best is confident enough, return without HTTP work.
  if (best && best.confidence >= 0.7) return best;

  // HTTP escalation: only runs when network is allowed AND no high-confidence cheap hit.
  if (!ctx.skipNetwork) {
    const t1b = await tier1b_detailPage(event, ctx);
    if (t1b) return t1b;
  }

  // Fallback: return best cheap (typically venue_fallback @ 0.3) or UNRESOLVED.
  return best ?? UNRESOLVED;
}
