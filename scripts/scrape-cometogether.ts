/**
 * cometogether.live scraper (Phase 2B, spec §5.4 — operator-mandated source).
 *
 * Verified 2026-08-11: the /el listing is server-rendered (Next.js) — plain
 * fetch suffices, no Puppeteer. robots.txt allows event/listing pages and
 * declares a sitemap; /api/* and /buytickets/* are disallowed — never fetch
 * those. Class names are hashed (cttheme-*) — parsing anchors on STRUCTURE
 * (href pattern, aria-label, Greek date tokens, € prices), never on classes.
 *
 * Identity = md5('cometogether:' + numeric event id) — date-independent from
 * day one (the athinorama phantom-row lesson). Venue names pass through as
 * printed; the downstream location filter owns Athens membership (a
 * Thessaloniki listing becomes rejected_non_athens — by design).
 */
import { createHash } from 'crypto';

// Minimal structural copy of scrape-all's ScrapedEvent (importing scrape-all
// here would pull the whole scraper graph into anything importing this file).
export interface CometogetherEvent {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date?: string | null;
  time: string;
  type: string;
  genres: string;
  venue_name: string;
  url: string;
  price_type: string;
  price_amount: number | null;
  price_range: string | null;
  source: string;
}

export function cometogetherId(eventId: string): string {
  return createHash('md5').update(`cometogether:${eventId}`).digest('hex').substring(0, 16);
}

const GREEK_MONTHS: Record<string, number> = {
  Ιαν: 1, Φεβ: 2, Μαρ: 3, Απρ: 4, Μαϊ: 5, Μαι: 5, Ιουν: 6,
  Ιουλ: 7, Αυγ: 8, Σεπ: 9, Οκτ: 10, Νοε: 11, Δεκ: 12,
};

const DATE_RE = /(?:Δευ|Τρι|Τετ|Πεμ|Παρ|Σαβ|Κυρ),?\s*(\d{1,2})\s+(Ιαν|Φεβ|Μαρ|Απρ|Μαϊ|Μαι|Ιουν|Ιουλ|Αυγ|Σεπ|Οκτ|Νοε|Δεκ)/;

// Genre tag → EventType; unmapped → 'other' (the categorizer decides later,
// same convention as athinorama mixed venues).
const TYPE_BY_TAG: Record<string, string> = {
  Ηλεκτρονική: 'dj_set', House: 'dj_set', Techno: 'dj_set',
  Συναυλία: 'concert', Live: 'concert', Ροκ: 'concert', Ραπ: 'concert',
  Θέατρο: 'theater', Φεστιβάλ: 'festival', 'Stand-up': 'show',
};

function inferDate(day: number, month: number, ref: Date): string | null {
  const y = ref.getFullYear();
  const m0 = ref.getMonth() + 1;
  let year = y;
  if (month < m0 || (month === m0 && day < ref.getDate())) year = y + 1;
  // Same 10-month sanity window as athinorama's rollover guard: a "next-year"
  // date nearly a year out on a listings page is a parse artifact, not a booking.
  const windowEnd = new Date(ref);
  windowEnd.setMonth(windowEnd.getMonth() + 10);
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return new Date(`${iso}T12:00:00Z`) <= windowEnd ? iso : null;
}

export function parseCometogetherListing(html: string, refDate: Date): CometogetherEvent[] {
  const events: CometogetherEvent[] = [];
  const seen = new Set<string>();
  // Split on event anchors; each chunk (until the next anchor) is one card.
  const parts = html.split(/href="(\/el\/event\/(\d+)\/[a-z0-9-]*)"/);
  // parts: [pre, href1, id1, chunk1, href2, id2, chunk2, …]
  for (let i = 1; i + 2 < parts.length + 1; i += 3) {
    const href = parts[i];
    const eventId = parts[i + 1];
    const chunk = (parts[i + 2] ?? '').slice(0, 4000);
    if (!href || !eventId || seen.has(eventId)) continue;

    const titleM = chunk.match(/aria-label="([^"]+)"/);
    const title = (titleM?.[1] ?? '').replace(/\s+/g, ' ').trim();
    if (!title) continue;

    const dateM = chunk.match(DATE_RE);
    if (!dateM) continue;
    const startDate = inferDate(parseInt(dateM[1]), GREEK_MONTHS[dateM[2]], refDate);
    if (!startDate) continue;

    const priceM = chunk.match(/από\s*€\s*(\d+(?:[.,]\d+)?)/);
    const free = /Δωρεάν|Free entry|Ελεύθερη είσοδος/i.test(chunk);
    const priceAmount = priceM ? parseFloat(priceM[1].replace(',', '.')) : null;

    // Venue: the span immediately after the date|price row closes —
    // "…από €8</span></div><span class="…">VENUE</span>" (structure-anchored).
    const venueM = chunk.match(/<\/span><\/div><span[^>]*>([^<]{2,80})<\/span>/);
    const venue = venueM?.[1].replace(/\s+/g, ' ').trim() ?? 'TBA';

    const tags = [...chunk.matchAll(/data-tag="true"[^>]*>([^<]{2,30})</g)].map((m) => m[1].trim());
    const type = tags.map((t) => TYPE_BY_TAG[t]).find(Boolean) ?? 'other';

    seen.add(eventId);
    events.push({
      id: cometogetherId(eventId),
      title,
      description: '',
      start_date: startDate,
      end_date: null,
      time: '',
      type,
      genres: [...new Set(tags)].join(','),
      venue_name: venue,
      url: `https://cometogether.live${href}`,
      price_type: priceAmount !== null ? 'with-ticket' : free ? 'open' : 'tba',
      price_amount: priceAmount,
      price_range: priceM ? `από €${priceM[1]}` : null,
      source: 'cometogether',
    });
  }
  return events;
}

export async function scrapeCometogether(fetchFn: typeof fetch = fetch): Promise<CometogetherEvent[]> {
  const res = await fetchFn('https://cometogether.live/el', {
    headers: { 'User-Agent': 'AgentAthens/1.0 (+https://agentathens.com/colophon)' },
  });
  if (!res.ok) throw new Error(`cometogether listing fetch failed: HTTP ${res.status}`);
  const html = await res.text();
  return parseCometogetherListing(html, new Date());
}
