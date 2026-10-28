/**
 * The four read-only tools. Pure functions over a FeedSnapshot, so the tests
 * run them without a network or an MCP client.
 *
 * Personalisation is deliberately NOT done here: the assistant knows the user
 * (memory, connected apps) and passes filters or an artist list. This server
 * stores nothing about anyone.
 */
import { CATEGORIES, type Category, type EventRecord, type FeedSnapshot, type IndexedEvent } from './feed';
import { containsPhrase, looseKey } from './normalize';

export const ATTRIBUTION = 'Data: Agent Athens (https://agentathens.com). Link each event to its `url`.';

// ── dates (always Europe/Athens) ────────────────────────────────────────────

export function athensToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD day. */
function weekday(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

export const WHEN = ['today', 'tomorrow', 'this_weekend', 'next_7_days', 'next_30_days'] as const;
export type When = (typeof WHEN)[number];

export function resolveWindow(args: { when?: When; date_from?: string; date_to?: string }, today: string): { from: string; to: string } {
  switch (args.when) {
    case 'today': return { from: today, to: today };
    case 'tomorrow': { const t = addDays(today, 1); return { from: t, to: t }; }
    case 'this_weekend': {
      // Saturday–Sunday; on a Sunday, just today.
      const wd = weekday(today);
      if (wd === 0) return { from: today, to: today };
      const sat = addDays(today, 6 - wd);
      return { from: sat, to: addDays(sat, 1) };
    }
    case 'next_7_days': return { from: today, to: addDays(today, 6) };
    case 'next_30_days': return { from: today, to: addDays(today, 29) };
  }
  const from = args.date_from ?? today;
  return { from, to: args.date_to ?? addDays(from, 29) };
}

function overlaps(e: IndexedEvent, from: string, to: string): boolean {
  return e._startDay <= to && (e._endDay === null || e._endDay >= from);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD that names a real calendar day: 2026-02-30 and 2026-99-99 fail. */
function isDay(v: unknown): v is string {
  if (typeof v !== 'string' || !DAY.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// ── public shapes ───────────────────────────────────────────────────────────

function publicRecord(e: IndexedEvent, full = false): EventRecord {
  const { _startDay, _endDay, _haystack, _titleKey, _performerKeys, _qid, _neighborhoodKey, ...rec } = e;
  if (!full && rec.description.length > 280) rec.description = rec.description.slice(0, 277).trimEnd() + '…';
  return rec;
}

export class ToolInputError extends Error {}

function str(v: unknown, name: string, max = 200): string | undefined {
  if (v == null) return undefined;
  if (typeof v !== 'string') throw new ToolInputError(`${name} must be a string`);
  if (v.length > max) throw new ToolInputError(`${name} is longer than ${max} characters`);
  return v;
}

function int(v: unknown, name: string, min: number, max: number, dflt: number): number {
  if (v == null) return dflt;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new ToolInputError(`${name} must be an integer ${min}–${max}`);
  return v;
}

// ── search_events ───────────────────────────────────────────────────────────

export interface SearchArgs {
  query?: string; when?: When; date_from?: string; date_to?: string;
  category?: Category | Category[]; neighborhood?: string; venue?: string;
  open_only?: boolean; max_price?: number; limit?: number; offset?: number;
}

export function searchEvents(snap: FeedSnapshot, args: SearchArgs, today: string) {
  const query = str(args.query, 'query');
  const neighborhood = str(args.neighborhood, 'neighborhood');
  const venue = str(args.venue, 'venue');
  for (const k of ['date_from', 'date_to'] as const) {
    if (args[k] != null && !isDay(args[k])) throw new ToolInputError(`${k} must be a real date as YYYY-MM-DD`);
  }
  if (args.when != null && !WHEN.includes(args.when)) throw new ToolInputError(`when must be one of ${WHEN.join(', ')}`);
  const cats = args.category == null ? null : new Set(Array.isArray(args.category) ? args.category : [args.category]);
  if (cats) for (const c of cats) if (!CATEGORIES.includes(c)) throw new ToolInputError(`category must be one of ${CATEGORIES.join(', ')}`);
  if (args.max_price != null && (typeof args.max_price !== 'number' || args.max_price < 0)) throw new ToolInputError('max_price must be a number ≥ 0');
  const limit = int(args.limit, 'limit', 1, 50, 10);
  const offset = int(args.offset, 'offset', 0, 10_000, 0);

  const { from, to } = resolveWindow(args, today);
  const tokens = query ? looseKey(query).split(' ').filter(Boolean) : [];
  const nKey = neighborhood ? looseKey(neighborhood) : null;
  const vKey = venue ? looseKey(venue) : null;

  const hits = snap.events.filter((e) =>
    e.status !== 'EventCancelled' &&
    overlaps(e, from, to) &&
    (!cats || cats.has(e.category)) &&
    (!nKey || e._neighborhoodKey === nKey) &&
    (!vKey || containsPhrase(looseKey(e.venue.name), vKey)) &&
    (!args.open_only || e.price.access === 'open') &&
    // max_price keeps open events and priced events within budget; unknown price is excluded.
    (args.max_price == null || e.price.access === 'open' || (e.price.amount != null && e.price.amount <= args.max_price)) &&
    tokens.every((t) => e._haystack.includes(t)),
  );

  // One-off events in date order first; long runs that started earlier after them.
  const sortKey = (e: IndexedEvent) => (e._startDay < from ? `1${e._startDay}` : `0${e.start}`);
  hits.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));

  return {
    window: { from, to, timezone: 'Europe/Athens' },
    total: hits.length,
    returned: Math.max(0, Math.min(limit, hits.length - offset)),
    ...(offset + limit < hits.length ? { next_offset: offset + limit } : {}),
    events: hits.slice(offset, offset + limit).map((e) => publicRecord(e)),
    feed_updated: snap.dateModified,
    attribution: ATTRIBUTION,
  };
}

// ── get_event ───────────────────────────────────────────────────────────────

export function getEvent(snap: FeedSnapshot, args: { id?: string }) {
  let id = str(args.id, 'id', 400);
  if (!id) throw new ToolInputError('id is required (the `id` from search_events, or an agentathens.com event URL)');
  const m = id.match(/\/events\/([^/?#]+)/);
  if (m) id = m[1];
  const e = snap.byId.get(id);
  if (!e) return { found: false as const, id, hint: 'Unknown id. It may have ended and left the feed; run search_events again.' };
  return { found: true as const, event: publicRecord(e, true), attribution: ATTRIBUTION };
}

// ── list_venues ─────────────────────────────────────────────────────────────

export function listVenues(snap: FeedSnapshot, args: { neighborhood?: string; category?: Category; query?: string; limit?: number }, today: string) {
  const nKey = args.neighborhood ? looseKey(str(args.neighborhood, 'neighborhood')!) : null;
  const qKey = args.query ? looseKey(str(args.query, 'query')!) : null;
  if (args.category != null && !CATEGORIES.includes(args.category)) throw new ToolInputError(`category must be one of ${CATEGORIES.join(', ')}`);
  const limit = int(args.limit, 'limit', 1, 200, 50);
  const { from, to } = resolveWindow({ when: 'next_30_days' }, today);

  const venues = new Map<string, { name: string; address?: string; neighborhood?: string; lat?: number; lon?: number; upcoming_events: number; categories: Set<Category> }>();
  for (const e of snap.events) {
    if (!overlaps(e, from, to)) continue;
    if (nKey && e._neighborhoodKey !== nKey) continue;
    if (args.category && e.category !== args.category) continue;
    if (qKey && !containsPhrase(looseKey(e.venue.name), qKey)) continue;
    const key = looseKey(e.venue.name);
    const v = venues.get(key) ?? { ...e.venue, upcoming_events: 0, categories: new Set<Category>() };
    v.upcoming_events++;
    v.categories.add(e.category);
    venues.set(key, v);
  }
  const list = [...venues.values()]
    .sort((a, b) => b.upcoming_events - a.upcoming_events || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((v) => ({ ...v, categories: [...v.categories] }));
  return { window: { from, to, timezone: 'Europe/Athens' }, total: venues.size, venues: list, attribution: ATTRIBUTION };
}

// ── match_artists ───────────────────────────────────────────────────────────

export interface ArtistInput { name?: string; wikidata?: string; spotify_id?: string }

export type MatchConfidence = 'spotify_id' | 'wikidata' | 'name' | 'title_mention';

/** Spotify artist ID → Wikidata QIDs, from mcp/data/performer-ids.json (Wikidata P1902). */
export type SpotifyIndex = Map<string, Set<string>>;

export function spotifyIndex(file: { byQid: Record<string, { spotify: string[] }> }): SpotifyIndex {
  const idx: SpotifyIndex = new Map();
  for (const [qid, v] of Object.entries(file.byQid)) {
    for (const id of v.spotify) {
      const qids = idx.get(id) ?? new Set<string>();
      qids.add(qid);
      idx.set(id, qids);
    }
  }
  return idx;
}

const SPOTIFY_ID = /^[0-9A-Za-z]{22}$/;

/**
 * Matches a list of artists (e.g. a user's top artists from Spotify, or names
 * the user mentioned) to upcoming events.
 *
 *  spotify_id     the artist's Spotify ID resolves, through Wikidata, to the
 *                 event performer's QID
 *  wikidata       the artist's QID equals the event performer's QID
 *  name           the name equals the performer's name or English Wikipedia
 *                 title, across Greek/Latin spellings
 *  title_mention  no linked performer, but the name appears as a whole phrase
 *                 in the event title; may be a tribute or support act, so the
 *                 assistant should say so
 */
export function matchArtists(snap: FeedSnapshot, args: { artists?: unknown; date_from?: string; date_to?: string; include_title_mentions?: boolean }, today: string, spotify: SpotifyIndex = new Map()) {
  if (!Array.isArray(args.artists) || args.artists.length === 0) throw new ToolInputError('artists must be a non-empty array of names or {name, wikidata, spotify_id} objects');
  if (args.artists.length > 200) throw new ToolInputError('artists: at most 200 per call');
  const inputs: ArtistInput[] = args.artists.map((a, i) => {
    if (typeof a === 'string') return { name: str(a, `artists[${i}]`) };
    if (a && typeof a === 'object') {
      const o = a as Record<string, unknown>;
      const wikidata = str(o.wikidata, `artists[${i}].wikidata`, 20);
      if (wikidata && !/^Q\d+$/.test(wikidata)) throw new ToolInputError(`artists[${i}].wikidata must look like Q12345`);
      const spotify_id = str(o.spotify_id, `artists[${i}].spotify_id`, 40);
      if (spotify_id && !SPOTIFY_ID.test(spotify_id)) throw new ToolInputError(`artists[${i}].spotify_id must be the 22-character artist ID (the part after open.spotify.com/artist/)`);
      return { name: str(o.name, `artists[${i}].name`), wikidata, spotify_id };
    }
    throw new ToolInputError(`artists[${i}] must be a string or an object`);
  });
  for (const k of ['date_from', 'date_to'] as const) {
    if (args[k] != null && !isDay(args[k])) throw new ToolInputError(`${k} must be a real date as YYYY-MM-DD`);
  }
  const from = args.date_from ?? today;
  const to = args.date_to ?? addDays(from, 179);
  const allowTitle = args.include_title_mentions !== false;

  const pool = snap.events.filter((e) => e.status !== 'EventCancelled' && overlaps(e, from, to));
  const matches: { artist: string; confidence: MatchConfidence; event: EventRecord }[] = [];
  const unmatched: string[] = [];

  for (const a of inputs) {
    const label = a.name ?? a.spotify_id ?? a.wikidata ?? '';
    const key = a.name ? looseKey(a.name) : '';
    const viaSpotify = a.spotify_id ? spotify.get(a.spotify_id) : undefined;
    let found = false;
    for (const e of pool) {
      let conf: MatchConfidence | null = null;
      if (viaSpotify && e._qid && viaSpotify.has(e._qid)) conf = 'spotify_id';
      else if (a.wikidata && e._qid === a.wikidata) conf = 'wikidata';
      else if (key && e._performerKeys.includes(key)) conf = 'name';
      // Title mentions only for names long enough not to collide with words.
      else if (allowTitle && key.length >= 4 && !e._qid && e.category !== 'exhibition' && containsPhrase(e._titleKey, key)) conf = 'title_mention';
      if (conf) {
        matches.push({ artist: label, confidence: conf, event: publicRecord(e) });
        found = true;
      }
    }
    if (!found) unmatched.push(label);
  }

  const rank: Record<MatchConfidence, number> = { spotify_id: 0, wikidata: 1, name: 2, title_mention: 3 };
  matches.sort((x, y) => rank[x.confidence] - rank[y.confidence] || (x.event.start < y.event.start ? -1 : 1));
  return { window: { from, to, timezone: 'Europe/Athens' }, matches, unmatched, attribution: ATTRIBUTION };
}
