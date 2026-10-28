/**
 * Live smoke test: runs all four tools through the real MCP HTTP handler
 * against the live site's feed and prints counts and samples.
 *
 *   bun run scripts/smoke.ts                 # https://agentathens.com
 *   FEED_ORIGIN=http://localhost:8888 bun run scripts/smoke.ts
 *
 * The match_artists run uses only performer names that are in the live feed.
 * Exit 0 = every call answered without a tool or RPC error.
 */
import { CATEGORIES, httpFeedSource, type IndexedEvent } from '../src/feed';
import { handleHttp } from '../src/mcp';
import { athensToday } from '../src/tools';

const origin = process.env.FEED_ORIGIN ?? 'https://agentathens.com';
const feed = httpFeedSource(origin);

function fail(what: string, next: string): never {
  console.error(`smoke: FAILED — ${what}\n  next: ${next}`);
  process.exit(1);
}

let rpcId = 0;
async function call(name: string, args: object): Promise<any> {
  const req = new Request('http://smoke.local/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }),
  });
  const res = await handleHttp(req, { feed });
  if (res.status !== 200) fail(`${name} → HTTP ${res.status}`, 'run `bun test test/` to see whether the handler itself is broken');
  const body: any = await res.json().catch(() => null);
  if (!body) fail(`${name} → HTTP 200 without a JSON body`, 'run `bun test test/` to see whether the handler itself is broken');
  if (body.error) fail(`${name} → RPC error ${body.error.code} ${body.error.message}`, 'check the tool name and arguments in this script');
  if (body.result.isError) fail(`${name} → tool error: ${body.result.content[0].text}`, `check that ${origin}/api/events.json loads`);
  return body.result.structuredContent;
}

const el = await feed('el').catch((e) => fail(`could not load ${origin}/api/events.json (${e.message})`, 'check the network, or set FEED_ORIGIN'));
const en = await feed('en').catch((e) => fail(`could not load ${origin}/api/en/events.json (${e.message})`, 'check the network, or set FEED_ORIGIN'));
const today = athensToday();
const ageDays = el.dateModified ? Math.floor((Date.parse(today) - Date.parse(el.dateModified.slice(0, 10))) / 86_400_000) : null;

console.log(`origin           ${origin}`);
console.log(`today (Athens)   ${today}`);
console.log(`feed updated     el ${el.dateModified}  en ${en.dateModified}  (${ageDays ?? '?'} days before today)`);
console.log(`events           el ${el.events.length}  en-only feed ${en.events.length}  with an en record ${el.events.filter((e) => en.byId.has(e.id)).length}`);
const notEnded = (e: IndexedEvent) => (e._endDay ?? '9999-12-31') >= today;
console.log(`not ended today  ${el.events.filter(notEnded).length}`);

const perCat = Object.fromEntries(CATEGORIES.map((c) => [c, el.events.filter((e) => e.category === c).length]));
console.log('per category    ', JSON.stringify(perCat));
const withQid = el.events.filter((e) => e.performer?.wikidata);
console.log(`performer total  ${el.events.filter((e) => e.performer).length}  with performer.wikidata ${withQid.length}`);

// search_events: the default window (today + 29 days), English view.
const s = await call('search_events', { lang: 'en', limit: 3 });
console.log(`\nsearch_events    lang en, next 30 days: total ${s.total}, returned ${s.returned}`);
for (const e of s.events) console.log(`  ${e.start}  ${e.name}  @ ${e.venue.name}  ${e.url}`);
const wk = await call('search_events', { lang: 'en', when: 'this_weekend' });
console.log(`search_events    lang en, this_weekend ${wk.window.from}..${wk.window.to}: total ${wk.total}`);

// get_event: the first search hit, or the first event in the feed.
const firstId = s.events[0]?.id ?? el.events[0]?.id;
if (!firstId) fail('the feed has no events at all', `open ${origin}/api/events.json and check dataFeedElement`);
const g = await call('get_event', { id: firstId, lang: 'en' });
if (!g.found) fail(`get_event could not find id ${firstId}`, 'ids come from slugFromUrl(); check the event url format');
console.log(`\nget_event        ${firstId} → found, description ${g.event.description.length} chars, url ${g.event.url}`);

const v = await call('list_venues', { limit: 5 });
console.log(`\nlist_venues      next 30 days: ${v.total} venues; top ${v.venues.length}:`);
for (const x of v.venues) console.log(`  ${x.upcoming_events}  ${x.name}  [${x.categories.join(', ')}]`);

// match_artists: only names (and QIDs) that the live feed itself carries.
const performers = [...new Map(el.events.filter((e) => e.performer).map((e) => [e.performer!.name, e.performer!])).values()];
if (performers.length === 0) {
  console.log('\nmatch_artists    skipped: the live feed has no performer entries to match against');
} else {
  // match_artists takes at most 200 artists per call.
  const artists = performers.flatMap((p) => [p.name, ...(p.wikidata ? [{ wikidata: p.wikidata }] : [])]).slice(0, 200);
  const m = await call('match_artists', { artists, date_from: '2000-01-01', date_to: '2099-12-31', lang: 'en' });
  const upcoming = await call('match_artists', { artists, lang: 'en' });
  console.log(`\nmatch_artists    input (from the live feed): ${JSON.stringify(artists)}`);
  console.log(`  any date:     ${m.matches.length} matches, unmatched ${JSON.stringify(m.unmatched)}`);
  for (const x of m.matches) console.log(`    ${x.confidence.padEnd(13)} ${x.artist} → ${x.event.start} ${x.event.name} ${x.event.url}`);
  console.log(`  default window ${upcoming.window.from}..${upcoming.window.to}: ${upcoming.matches.length} matches`);
}

console.log('\nsmoke: OK — all four tools answered');
