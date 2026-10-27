/**
 * Regenerates mcp/test/fixtures/events.{el,en}.json by running SYNTHETIC
 * events through the site's real DataFeed builder (src/generators/datafeed.ts),
 * so the MCP tests read exactly the shape /api/events.json ships.
 *
 * The events below are test data, not real listings: dates, prices and URLs
 * are invented. Performer names come from config/performer-sameAs.json so the
 * performer blocks (Wikidata sameAs) are emitted by the real code path.
 *
 *   bun run mcp/scripts/make-fixture.ts
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { buildDataFeed } from '../../src/generators/datafeed';
import type { Event } from '../../src/types';

const base = {
  '@context': 'https://schema.org', '@type': 'Event', genres: [], tags: [],
  hasNativeGreek: true, ticketUrlResolved: null, source: 'fixture',
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', language: 'el',
};

const ev = (e: Partial<Event> & Pick<Event, 'id' | 'title' | 'startDate' | 'type' | 'venue' | 'price'>): Event =>
  ({ ...base, description: `${e.title} — fixture description.`, fullDescriptionEn: `${e.title} — English fixture description.`, ...e } as Event);

const gazarte = { name: 'Gazarte', address: 'Βουτάδων 32-34', neighborhood: 'Gazi', coordinates: { lat: 37.978, lon: 23.714 } };
const fuzz = { name: 'Fuzz Club', address: 'Πειραιώς 209', neighborhood: 'Tavros' };
const onassis = { name: 'Στέγη Ιδρύματος Ωνάση', address: 'Λεωφ. Συγγρού 107', neighborhood: 'Neos Kosmos' };
const benaki = { name: 'Μουσείο Μπενάκη', address: 'Πειραιώς 138', neighborhood: 'Gazi' };

const events: Event[] = [
  ev({ id: 'fx-rotting', title: 'Rotting Christ', startDate: '2026-11-07T21:00:00', timeDoors: '21:00', type: 'concert', venue: fuzz,
       price: { type: 'with-ticket', amount: 25, currency: 'EUR' }, ticketUrl: 'https://www.more.com/gr-el/tickets/music/rotting-christ-fixture/' }),
  ev({ id: 'fx-alkinoos', title: 'Αλκίνοος Ιωαννίδης', startDate: '2026-11-08T21:30:00', type: 'concert', venue: gazarte,
       price: { type: 'with-ticket', amount: 18, currency: 'EUR' }, ticketUrl: 'https://www.viva.gr/tickets/music/alkinoos-fixture/' }),
  ev({ id: 'fx-tinariwen', title: 'Tinariwen', startDate: '2026-11-03T21:00:00', type: 'concert', venue: onassis,
       price: { type: 'with-ticket', amount: 30, currency: 'EUR' }, ticketUrl: 'https://www.more.com/gr-el/tickets/music/tinariwen-fixture/' }),
  ev({ id: 'fx-tribute', title: 'A Night of Dire Straits Songs with Local Band', startDate: '2026-11-04T22:00:00', type: 'concert', venue: gazarte,
       price: { type: 'open' } }),
  ev({ id: 'fx-expo', title: 'Φωτογραφία της Αθήνας 1960-1980', startDate: '2026-10-01', endDate: '2026-12-31', type: 'exhibition', venue: benaki,
       price: { type: 'with-ticket', amount: 9, currency: 'EUR' } }),
  ev({ id: 'fx-theatre', title: 'Ρωμαίος και Ιουλιέτα', startDate: '2026-11-20T20:30:00', type: 'theater', venue: onassis,
       price: { type: 'with-ticket', amount: 15, currency: 'EUR' }, ticketUrl: 'https://www.more.com/gr-el/tickets/theater/romeo-fixture/' }),
  ev({ id: 'fx-free', title: 'Open Jazz Jam', startDate: '2026-11-02T20:00:00', type: 'concert', venue: gazarte, price: { type: 'open' } }),
];

for (const locale of ['el', 'en'] as const) {
  const feed = buildDataFeed(events, locale);
  const out = { _fixture: 'SYNTHETIC TEST DATA built by mcp/scripts/make-fixture.ts — not real events', ...feed };
  writeFileSync(join(import.meta.dir, '..', 'test', 'fixtures', `events.${locale}.json`), JSON.stringify(out, null, 2) + '\n');
  console.log(locale, feed.dataFeedElement.length, 'events');
}
