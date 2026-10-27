/**
 * Feed contract: does the public DataFeed still have the shape toRecord()
 * relies on? Violations fail; optional fields missing on more than 5% of
 * events are reported as counts, because the server passes absence through.
 *
 *   bun run scripts/feed-contract.ts                  # both live feeds
 *   bun run scripts/feed-contract.ts path/to/feed.json
 */
import { toRecord } from '../src/feed';

/** Field paths toRecord() reads. The first three are required. */
export const FIELDS: [string, (e: any) => unknown][] = [
  ['name', (e) => e.name],
  ['url', (e) => e.url],
  ['startDate', (e) => e.startDate],
  ['@type', (e) => e['@type']],
  ['description', (e) => e.description],
  ['endDate', (e) => e.endDate],
  ['eventStatus', (e) => e.eventStatus],
  ['isAccessibleForFree', (e) => e.isAccessibleForFree],
  ['location.name', (e) => e.location?.name],
  ['location.address.streetAddress', (e) => e.location?.address?.streetAddress],
  ['location.containedInPlace.name', (e) => e.location?.containedInPlace?.name],
  ['location.geo', (e) => e.location?.geo],
  ['offers', (e) => e.offers],
  ['offers.price', (e) => (Array.isArray(e.offers) ? e.offers[0] : e.offers)?.price],
  ['offers.url', (e) => (Array.isArray(e.offers) ? e.offers[0] : e.offers)?.url],
  ['image', (e) => e.image],
  ['performer', (e) => e.performer],
];

export const FLAG_SHARE = 0.05;

export interface ContractReport {
  elements: number;
  violations: string[];
  missing: Record<string, number>;
  flagged: string[];
  dateModified?: string;
}

export function checkFeedContract(doc: any): ContractReport {
  if (!doc || doc['@type'] !== 'DataFeed' || !Array.isArray(doc.dataFeedElement)) {
    return { elements: 0, violations: ['document is not a Schema.org DataFeed with dataFeedElement[]'], missing: {}, flagged: [] };
  }
  const els: any[] = doc.dataFeedElement;
  const violations: string[] = [];
  const seen = new Map<string, number>();
  els.forEach((raw, i) => {
    const rec = toRecord(raw);
    if (!rec) {
      violations.push(`element ${i}: toRecord() returned null (needs string name, url and startDate)`);
      return;
    }
    if (!/^https:\/\/agentathens\.com\//.test(rec.url)) violations.push(`element ${i}: ${rec.url} is not an agentathens.com url`);
    const prev = seen.get(rec.id);
    if (prev !== undefined) violations.push(`element ${i}: duplicate id ${rec.id} (also element ${prev})`);
    else seen.set(rec.id, i);
  });
  const missing = Object.fromEntries(FIELDS.map(([f, get]) => [f, els.filter((e) => get(e) == null || get(e) === '').length]));
  const flagged = FIELDS.map(([f]) => f).filter((f) => els.length > 0 && missing[f] / els.length > FLAG_SHARE);
  return { elements: els.length, violations, missing, flagged, dateModified: doc.dateModified };
}

if (import.meta.main) {
  const origin = process.env.FEED_ORIGIN ?? 'https://agentathens.com';
  const targets = process.argv.length > 2 ? process.argv.slice(2) : [`${origin}/api/events.json`, `${origin}/api/en/events.json`];
  let failed = false;
  for (const t of targets) {
    let doc: unknown;
    try {
      doc = /^https?:/.test(t) ? await (await fetch(t, { headers: { accept: 'application/json' } })).json() : await Bun.file(t).json();
    } catch (err) {
      console.error(`feed-contract: FAILED — could not load ${t} (${(err as Error).message})\n  next: check the network or the path, then run again`);
      process.exit(1);
    }
    const r = checkFeedContract(doc);
    console.log(`\n${t}\n  elements ${r.elements}, dateModified ${r.dateModified}, violations ${r.violations.length}`);
    for (const v of r.violations.slice(0, 20)) console.log(`  VIOLATION ${v}`);
    console.log(`  missing (count / ${r.elements}, * = over ${FLAG_SHARE * 100}%):`);
    for (const [f] of FIELDS) {
      const n = r.missing[f];
      console.log(`  ${r.flagged.includes(f) ? '*' : ' '} ${f.padEnd(34)} ${String(n).padStart(5)}  ${r.elements ? ((100 * n) / r.elements).toFixed(1) : '0.0'}%`);
    }
    if (r.violations.length) failed = true;
  }
  if (failed) {
    console.error('\nfeed-contract: FAILED — the feed has elements the MCP server cannot read or link\n  next: fix the feed builder (src/generators/datafeed.ts), or adapt toRecord() if the change is intended');
    process.exit(1);
  }
  console.log('\nfeed-contract: OK');
}
