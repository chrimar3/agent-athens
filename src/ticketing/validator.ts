/**
 * Ticket URL Validator
 *
 * HEAD-checks a candidate URL, follows redirects, and classifies the outcome.
 * Used by resolver.ts (to filter tier candidates) and scripts/backfill-ticket-urls.ts
 * (to verify persisted URLs).
 *
 * Replaces the over-aggressive homepage heuristic in scripts/validate-ticket-urls.ts
 * which is responsible for a chunk of the 10,648 `ticket_url_status='generated'`
 * pollution currently in the DB.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import type { VenueRecord } from './venue-registry';

export type ValidationOutcome =
  | 'valid'             // 2xx, path meaningful, not a homepage redirect
  | 'homepage_redirect' // resolved to bare homepage / catch-all category
  | 'expired'           // 4xx/5xx or network error indicating dead URL
  | 'unverified';       // transient failure (timeout); don't punish the URL

export interface ValidationResult {
  outcome: ValidationOutcome;
  finalUrl: string | null;
  /** Final hostname after redirects, lowercased. */
  finalHost: string | null;
  error?: string;
}

const TICKETING_MAPPING_PATH = join(
  import.meta.dir,
  '..',
  '..',
  'config',
  'ticketing-mapping.json'
);

let ticketHostCache: Set<string> | null = null;

/**
 * Hostnames of known ticket-platform domains, derived from
 * config/ticketing-mapping.json `platforms` + hard-coded Greek venue direct-sell
 * hosts we've observed in the DB (halfnote.gr, megaron.gr).
 */
export function getTicketHosts(): Set<string> {
  if (ticketHostCache) return ticketHostCache;
  const raw = readFileSync(TICKETING_MAPPING_PATH, 'utf-8');
  const data = JSON.parse(raw) as {
    platforms?: Record<string, { base_url?: string }>;
  };
  const hosts = new Set<string>();
  for (const [key, cfg] of Object.entries(data.platforms ?? {})) {
    hosts.add(key.toLowerCase());
    if (cfg.base_url) {
      try {
        hosts.add(new URL(cfg.base_url).hostname.replace(/^www\./, '').toLowerCase());
      } catch {
        /* ignore malformed base_url */
      }
    }
  }
  // Legacy / known-good hosts not always present in the JSON.
  hosts.add('viva.gr');
  hosts.add('more.com');
  hosts.add('ticketservices.gr');
  hosts.add('ticketmaster.gr');
  // D5: RA is the authoritative ticketing source for underground/electronic Athens venues
  // (IT Athens, Six D.O.G.S., Temple, Romantso, Death Disco). Promoted from scraper-only.
  hosts.add('ra.co');
  hosts.add('residentadvisor.net');
  ticketHostCache = hosts;
  return hosts;
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

export function isTicketDomain(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  const hosts = getTicketHosts();
  if (hosts.has(host)) return true;
  // Allow subdomains: "tickets.onassis.org" when "onassis.org" is a known host.
  for (const known of hosts) {
    if (host.endsWith('.' + known)) return true;
  }
  return false;
}

export function isVenueWebsiteHost(url: string, venue?: VenueRecord | null): boolean {
  if (!venue?.website) return false;
  const a = hostOf(url);
  const b = hostOf(venue.website);
  return !!a && !!b && a === b;
}

// ============================================================================
// HOMEPAGE REDIRECT HEURISTIC
// ============================================================================

export interface HomepageRedirectContext {
  /** The URL we asked for (before redirects). */
  originalUrl: string;
  /** The URL we ended up at after following redirects. */
  finalUrl: string;
  /** Final hostname is a known ticket-platform (more.com, ticketservices.gr, …). */
  isTicketHost: boolean;
  /** Final hostname matches the expected venue.website hostname. */
  isVenueHost: boolean;
}

/**
 * Return TRUE when the candidate URL "resolved to a useless homepage" and the
 * caller should mark it `homepage_redirect`. Return FALSE when the final URL
 * is legitimately acceptable.
 *
 * Algorithm (decisions.md D6, 6 steps):
 *   1. isVenueHost → false (Tier 5 intent, preserve)
 *   2. Parse URLs; segments = split('/').filter(Boolean) — naturally handles trailing slashes
 *   3. finalSegments.length === 0 AND origSegments.length > 0 → true (bare root, segments lost)
 *   4. isTicketHost AND non-empty query AND finalSegments >= 1 → false (legitimate search page)
 *   5. finalSegments.length < originalSegments.length → true (segments lost)
 *   6. Else → false
 *
 * Step 3 refinement note: D6 as originally written says "finalSegments.length === 0 → true
 * regardless of query". That overfires when the original URL was itself bare root (nothing
 * was lost). Step 3 here preserves D6 intent — bare-root-with-tracking-params still fires
 * because original had segments — while letting "root → root" through as not-a-redirect.
 */
export function isHomepageRedirect(ctx: HomepageRedirectContext): boolean {
  if (ctx.isVenueHost) return false;

  const origParsed = new URL(ctx.originalUrl);
  const finalParsed = new URL(ctx.finalUrl);

  const origSegments = origParsed.pathname.split('/').filter(Boolean);
  const finalSegments = finalParsed.pathname.split('/').filter(Boolean);

  if (finalSegments.length === 0 && origSegments.length > 0) return true;

  if (ctx.isTicketHost && finalParsed.search.length > 0 && finalSegments.length >= 1) {
    return false;
  }

  if (finalSegments.length < origSegments.length) return true;

  return false;
}

// ============================================================================
// VALIDATION ENTRY POINT
// ============================================================================

export interface ValidateOptions {
  /** Venue record for Tier 5 intent classification (keep-venue-homepage logic). */
  venue?: VenueRecord | null;
  /** Override the 10s default HEAD timeout. */
  timeoutMs?: number;
  /** User-Agent header; defaults to AgentAthens identifier. */
  userAgent?: string;
}

/**
 * HEAD-check a URL, follow redirects, classify outcome.
 * Never throws — always returns a ValidationResult.
 */
export async function validateUrl(
  url: string,
  opts: ValidateOptions = {}
): Promise<ValidationResult> {
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': opts.userAgent ?? 'Mozilla/5.0 (compatible; AgentAthens/1.0)',
      },
    });
    clearTimeout(timer);

    const finalUrl = response.url || url;
    const finalHost = hostOf(finalUrl);

    if (response.status === 404) {
      return { outcome: 'expired', finalUrl, finalHost, error: 'HTTP 404' };
    }
    if (!response.ok) {
      return { outcome: 'expired', finalUrl, finalHost, error: `HTTP ${response.status}` };
    }

    const ctx: HomepageRedirectContext = {
      originalUrl: url,
      finalUrl,
      isTicketHost: isTicketDomain(finalUrl),
      isVenueHost: isVenueWebsiteHost(finalUrl, opts.venue),
    };

    if (isHomepageRedirect(ctx)) {
      return {
        outcome: 'homepage_redirect',
        finalUrl,
        finalHost,
        error: 'Resolved to homepage',
      };
    }

    return { outcome: 'valid', finalUrl, finalHost };
  } catch (error) {
    clearTimeout(timer);
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('abort') || msg.includes('timeout')) {
      return { outcome: 'unverified', finalUrl: null, finalHost: null, error: 'Timeout' };
    }
    return { outcome: 'expired', finalUrl: null, finalHost: null, error: msg };
  }
}
