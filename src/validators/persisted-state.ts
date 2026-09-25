/**
 * Schema checks for the state files the build writes and reads back on the
 * next build. dist/ and data/ persist between runs and are writable by the
 * scrape container, so every value read back is treated as untrusted input:
 * each loader keeps only well-formed entries and reports how many it dropped.
 *
 *   dist/.slug-history.json   event id → previous slugs   → _redirects rules
 *   dist/.og-cache.json       slug → render hash          → OG image skip
 *   data/content-hashes.json  url → {hash, lastModified}  → sitemap <lastmod>
 *   data/event-set-hashes.json  (same format)             → JSON-LD dates
 *   data/build-aria-aggregate.json  per-template counts   → build report
 *   previous dist JSON timestamps (search-index, datafeed) → carried forward
 */

/**
 * Event slug shape: `${id.slice(0, 8)}-${venueSlug}-${titleSlug}`, where the
 * two slugify() parts are [a-z0-9-] and at most 60 characters each
 * (src/utils/normalize-greek.ts), so real slugs are at most 130 characters.
 */
export const SLUG_PATTERN = /^[a-z0-9-]{1,160}$/;

export function isSafeSlug(value: unknown): value is string {
  return typeof value === 'string' && SLUG_PATTERN.test(value);
}

export interface Loaded<T> {
  value: T;
  dropped: number;
}

/** Keeps entries whose key is a non-empty id and whose slugs match SLUG_PATTERN (max 3 per id). */
export function parseSlugHistory(raw: unknown): Loaded<Map<string, string[]>> {
  const value = new Map<string, string[]>();
  let dropped = 0;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { value, dropped: raw === undefined || raw === null ? 0 : 1 };
  }
  for (const [id, slugs] of Object.entries(raw as Record<string, unknown>)) {
    if (!id || id.length > 200 || !Array.isArray(slugs)) {
      dropped++;
      continue;
    }
    const valid = slugs.filter(isSafeSlug);
    dropped += slugs.length - valid.length;
    if (valid.length > 0) value.set(id, valid.slice(0, 3));
  }
  return { value, dropped };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const HASH = /^[0-9a-f]{8,64}$/;

export interface HashManifest {
  version: 1;
  generatedAt: string;
  entries: Record<string, { hash: string; lastModified: string }>;
}

/** content-hasher manifest: keeps entries with a hex hash and a YYYY-MM-DD date. */
export function sanitizeHashManifest(raw: unknown): Loaded<HashManifest> {
  const value: HashManifest = { version: 1, generatedAt: '', entries: {} };
  let dropped = 0;
  const entries = raw && typeof raw === 'object' ? (raw as { entries?: unknown }).entries : undefined;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
    return { value, dropped: raw ? 1 : 0 };
  }
  const generatedAt = (raw as { generatedAt?: unknown }).generatedAt;
  if (typeof generatedAt === 'string' && isIsoTimestamp(generatedAt)) value.generatedAt = generatedAt;
  for (const [key, entry] of Object.entries(entries as Record<string, unknown>)) {
    const e = entry as { hash?: unknown; lastModified?: unknown } | null;
    if (e && typeof e === 'object' && typeof e.hash === 'string' && HASH.test(e.hash)
      && typeof e.lastModified === 'string' && ISO_DAY.test(e.lastModified)) {
      value.entries[key] = { hash: e.hash, lastModified: e.lastModified };
    } else {
      dropped++;
    }
  }
  return { value, dropped };
}

/** OG render cache: slug → short alphanumeric hash. */
export function sanitizeOgCache(raw: unknown): Loaded<Record<string, string>> {
  const value: Record<string, string> = {};
  let dropped = 0;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { value, dropped: raw ? 1 : 0 };
  for (const [slug, hash] of Object.entries(raw as Record<string, unknown>)) {
    if (isSafeSlug(slug) && typeof hash === 'string' && /^[0-9a-z]{1,32}$/.test(hash)) value[slug] = hash;
    else dropped++;
  }
  return { value, dropped };
}

/** ISO-8601 date-time as the build writes it (toISOString or Luxon toISO). */
export function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

const ARIA_BUCKET_KEYS = ['total', 'pass', 'warn', 'fail', 'info'] as const;
type AriaCounts = Record<(typeof ARIA_BUCKET_KEYS)[number], number>;
export interface AriaAggregateShape {
  hub_template: AriaCounts;
  event_template: AriaCounts;
  meta?: { lastUpdate?: string };
}

function ariaCounts(raw: unknown): AriaCounts | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (!ARIA_BUCKET_KEYS.every(k => Number.isInteger(c[k]) && (c[k] as number) >= 0)) return null;
  return Object.fromEntries(ARIA_BUCKET_KEYS.map(k => [k, c[k] as number])) as AriaCounts;
}

/**
 * build-aria-aggregate.json (scripts/audit-aria.ts): both template buckets
 * must be non-negative integer counts and meta.lastUpdate an ISO timestamp;
 * a malformed bucket falls back to the zero aggregate.
 */
export function sanitizeAriaAggregate(raw: unknown, fallback: AriaAggregateShape): Loaded<AriaAggregateShape> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { value: fallback, dropped: raw ? 1 : 0 };
  const r = raw as Record<string, unknown>;
  let dropped = 0;
  const hub = ariaCounts(r.hub_template);
  const event = ariaCounts(r.event_template);
  if (!hub) dropped++;
  if (!event) dropped++;
  const value: AriaAggregateShape = { hub_template: hub ?? fallback.hub_template, event_template: event ?? fallback.event_template };
  const lastUpdate = (r.meta as { lastUpdate?: unknown } | undefined)?.lastUpdate;
  if (lastUpdate !== undefined) {
    if (isIsoTimestamp(lastUpdate)) value.meta = { lastUpdate };
    else dropped++;
  }
  return { value, dropped };
}
