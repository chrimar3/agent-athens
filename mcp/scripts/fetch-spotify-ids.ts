/**
 * Build-time lookup: Wikidata QIDs of known performers → Spotify artist IDs.
 *
 * Reads the QIDs in config/performer-sameAs.json (read-only), asks the
 * Wikidata Query Service for property P1902 (Spotify artist ID), and writes
 * mcp/data/performer-ids.json. Every value comes from Wikidata; nothing is
 * guessed from names. The Worker only reads the file; it never calls Wikidata.
 *
 *   bun run scripts/fetch-spotify-ids.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export const ENDPOINT = 'https://query.wikidata.org/sparql';
export const USER_AGENT = 'AgentAthensMCP/0.1 (https://agentathens.com; build-time Spotify artist ID lookup for the Agent Athens MCP server)';
export const BATCH = 200;
const SPOTIFY_ID = /^[0-9A-Za-z]{22}$/;

export const SPARQL_TEMPLATE = 'SELECT ?item ?spotify WHERE { VALUES ?item { $QIDS } ?item wdt:P1902 ?spotify . }';

export interface IdFile {
  _meta: { source: string; query: string; retrieved_at: string; count: number; qids_queried: number };
  byQid: Record<string, { spotify: string[] }>;
}

export function qidsFromConfig(config: { performers?: Record<string, { sameAs?: string[] } | null> }): string[] {
  const qids = new Set<string>();
  for (const p of Object.values(config.performers ?? {})) {
    for (const u of p?.sameAs ?? []) {
      const m = u.match(/^https?:\/\/www\.wikidata\.org\/wiki\/(Q\d+)$/);
      if (m) qids.add(m[1]);
    }
  }
  return [...qids].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

export function batches<T>(xs: T[], size = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

export function sparqlFor(qids: string[]): string {
  return SPARQL_TEMPLATE.replace('$QIDS', qids.map((q) => `wd:${q}`).join(' '));
}

type Binding = { item: { value: string }; spotify: { value: string } };

export function buildIdFile(bindings: Binding[], meta: { query: string; retrieved_at: string; qids_queried: number }): IdFile {
  const byQid: Record<string, Set<string>> = {};
  for (const b of bindings) {
    const qid = b.item.value.match(/\/entity\/(Q\d+)$/)?.[1];
    if (!qid) throw new Error(`unexpected item URI from Wikidata: ${b.item.value}`);
    if (!SPOTIFY_ID.test(b.spotify.value)) throw new Error(`${qid}: "${b.spotify.value}" is not a Spotify artist ID (22 base62 characters)`);
    (byQid[qid] ??= new Set()).add(b.spotify.value);
  }
  const sorted = Object.keys(byQid).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return {
    _meta: { source: `Wikidata Query Service (${ENDPOINT}), property P1902`, ...meta, count: sorted.length },
    byQid: Object.fromEntries(sorted.map((q) => [q, { spotify: [...byQid[q]].sort() }])),
  };
}

function fail(what: string, next: string): never {
  console.error(`fetch-spotify-ids: FAILED — ${what}\n  next: ${next}`);
  process.exit(1);
}

if (import.meta.main) {
  const configPath = join(import.meta.dir, '..', '..', 'config', 'performer-sameAs.json');
  let config: any;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (err) {
    fail(`could not read ${configPath} (${(err as Error).message})`, 'run from a full checkout of the repo');
  }
  const qids = qidsFromConfig(config);
  if (qids.length === 0) fail('no Wikidata QIDs found in config/performer-sameAs.json', 'check the file still has performers[*].sameAs links');

  const bindings: Binding[] = [];
  for (const [i, batch] of batches(qids).entries()) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'user-agent': USER_AGENT, accept: 'application/sparql-results+json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ query: sparqlFor(batch) }),
    }).catch((err) => fail(`batch ${i + 1}: ${ENDPOINT} unreachable (${err.message})`, 'check the network and run again'));
    if (!res.ok) {
      fail(`batch ${i + 1}: HTTP ${res.status} from ${ENDPOINT}`, res.status === 429 ? `wait ${res.headers.get('retry-after') ?? 'a minute'} seconds and run again` : 'run again later; the query service may be overloaded');
    }
    const json: any = await res.json();
    bindings.push(...json.results.bindings);
  }

  let file: IdFile;
  try {
    file = buildIdFile(bindings, { query: SPARQL_TEMPLATE, retrieved_at: new Date().toISOString(), qids_queried: qids.length });
  } catch (err) {
    fail((err as Error).message, 'inspect that Wikidata statement; do not edit the output by hand');
  }
  const out = join(import.meta.dir, '..', 'data', 'performer-ids.json');
  mkdirSync(join(import.meta.dir, '..', 'data'), { recursive: true });
  writeFileSync(out, JSON.stringify(file, null, 2) + '\n');
  console.log(`QIDs queried ${qids.length}, with a Spotify ID ${file._meta.count}, Spotify IDs ${Object.values(file.byQid).reduce((n, v) => n + v.spotify.length, 0)}`);
  console.log(`wrote ${out}`);
}
