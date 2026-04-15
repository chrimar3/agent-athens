#!/usr/bin/env bun
/**
 * Wikidata SPARQL Batch Lookup for Performer sameAs Links
 *
 * Queries Wikidata for performer names extracted from visible events,
 * finds Wikidata Q-IDs, Wikipedia URLs, and MusicBrainz IDs.
 * Writes results to config/performer-sameAs.json.
 *
 * Usage:
 *   bun run scripts/lookup-performer-sameAs.ts              # Full run
 *   bun run scripts/lookup-performer-sameAs.ts --dry-run    # Preview only
 *   bun run scripts/lookup-performer-sameAs.ts --limit=20   # Limit lookups
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import Database from 'bun:sqlite';

const DB_PATH = 'data/events.db';
const CACHE_PATH = join(import.meta.dir, '../config/performer-sameAs.json');
const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const PERFORMER_TYPES = ['concert', 'dj_set', 'festival', 'performance', 'show', 'dance'];

// Rate limit: 1 request per 2 seconds (conservative for Wikidata)
const DELAY_MS = 2000;

interface PerformerEntry {
  type: 'Person' | 'MusicGroup';
  sameAs: string[];
}

interface PerformerCache {
  _meta: { description: string; updated: string; generated_by: string };
  performers: Record<string, PerformerEntry>;
}

interface WikidataResult {
  item: { value: string };
  itemLabel: { value: string };
  instanceLabel?: { value: string };
  wp?: { value: string };
  mb?: { value: string };
}

// ============================================================================
// Artist Extraction (inline to avoid DB-connected artist-lookup import)
// ============================================================================

function extractArtist(title: string): string | null {
  let cleaned = title;

  // Remove location suffixes (e.g. "in Athens", "in Greece", "(US)")
  cleaned = cleaned
    .replace(/\s+in\s+(Athens|Greece)\s*!?\s*$/gi, '')
    .replace(/\s*\([A-Z]{2}\)\s*/g, ' ')
    .replace(/\s*@\s+.+$/, '');

  const noisePatterns = [
    /\bpresents?\b/gi,
    /\blive\b/gi,
    /\bconcert\b/gi,
    /\bperformance\b/gi,
    /\s+\d{4}\s*$/g,
  ];
  for (const pattern of noisePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // For festival lineups ("Release Athens 2026 / Artist"), extract headliner
  const slashParts = cleaned.split(' / ').map(p => p.trim()).filter(Boolean);
  if (slashParts.length >= 2) {
    const firstLower = slashParts[0].toLowerCase();
    const isFestival = /release|ejekt|festival|athens/i.test(firstLower);
    if (isFestival) {
      cleaned = slashParts[1];
    } else {
      cleaned = slashParts[0];
    }
  }

  const separators = [':', '–', '—', ' - ', ' | '];
  for (const sep of separators) {
    if (cleaned.includes(sep)) {
      cleaned = cleaned.split(sep)[0].trim();
      break;
    }
  }

  cleaned = cleaned
    .replace(/["""''«»‹›]/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length < 3 || cleaned.length > 80 || /^\d+$/.test(cleaned)) {
    return null;
  }

  return cleaned;
}

// ============================================================================
// Wikidata SPARQL
// ============================================================================

function buildSparqlQuery(name: string): string {
  // Try Greek label first, then English
  // Look for humans (Q5) or music groups (Q215380)
  const escaped = name.replace(/"/g, '\\"');
  return `
SELECT ?item ?itemLabel ?instanceLabel ?wp ?mb WHERE {
  {
    ?item rdfs:label "${escaped}"@el .
  } UNION {
    ?item rdfs:label "${escaped}"@en .
  }
  ?item wdt:P31 ?instance .
  FILTER(?instance IN (wd:Q5, wd:Q215380, wd:Q2088357))
  OPTIONAL {
    ?wp schema:about ?item ;
        schema:isPartOf <https://en.wikipedia.org/> .
  }
  OPTIONAL { ?item wdt:P434 ?mb }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "el,en" .
  }
}
LIMIT 3
  `.trim();
}

async function querySparql(name: string): Promise<WikidataResult[]> {
  const query = buildSparqlQuery(name);
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/sparql-results+json',
      'User-Agent': 'AgentAthens/1.0 (https://agentathens.com; cultural events calendar)',
    },
  });

  if (!response.ok) {
    if (response.status === 429) {
      console.log(`  Rate limited, waiting 10s...`);
      await Bun.sleep(10000);
      return querySparql(name);
    }
    throw new Error(`SPARQL query failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.results?.bindings || [];
}

function resultsToEntry(results: WikidataResult[]): PerformerEntry | null {
  if (results.length === 0) return null;

  const first = results[0];
  const qid = first.item.value.replace('http://www.wikidata.org/entity/', '');

  // Determine type from instance
  const instanceLabel = first.instanceLabel?.value?.toLowerCase() || '';
  const type: 'Person' | 'MusicGroup' =
    instanceLabel.includes('band') || instanceLabel.includes('group') || instanceLabel.includes('duo')
      ? 'MusicGroup'
      : 'Person';

  const sameAs: string[] = [`https://www.wikidata.org/wiki/${qid}`];

  // Add Wikipedia URL if found
  if (first.wp?.value) {
    sameAs.push(first.wp.value);
  }

  // Add MusicBrainz URL if found
  if (first.mb?.value) {
    sameAs.push(`https://musicbrainz.org/artist/${first.mb.value}`);
  }

  return { type, sameAs };
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : Infinity;

  console.log(`\n=== Performer sameAs Wikidata Lookup ${dryRun ? '(DRY RUN)' : ''} ===\n`);

  // Load existing cache
  let cache: PerformerCache;
  try {
    cache = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
  } catch {
    cache = {
      _meta: { description: 'Performer sameAs links cache', updated: '', generated_by: 'scripts/lookup-performer-sameAs.ts' },
      performers: {},
    };
  }

  const existingNames = new Set(Object.keys(cache.performers).map(n => n.toLowerCase()));

  // Extract unique artist names from performer-eligible events
  const db = new Database(DB_PATH);
  const rows = db.prepare(`
    SELECT DISTINCT title FROM events
    WHERE type IN (${PERFORMER_TYPES.map(() => '?').join(',')})
      AND location_status IN ('verified_athens', 'pass_through')
  `).all(...PERFORMER_TYPES) as { title: string }[];
  db.close();

  // Extract and deduplicate artist names
  const artistNames = new Map<string, string>(); // lowercase -> original
  for (const row of rows) {
    const name = extractArtist(row.title);
    if (name && !existingNames.has(name.toLowerCase()) && !artistNames.has(name.toLowerCase())) {
      artistNames.set(name.toLowerCase(), name);
    }
  }

  console.log(`Events scanned: ${rows.length}`);
  console.log(`Unique new artists to look up: ${artistNames.size}`);
  console.log(`Already cached: ${existingNames.size}`);

  if (dryRun) {
    const names = [...artistNames.values()].slice(0, 30);
    console.log(`\nPreview (first 30):`);
    for (const name of names) {
      console.log(`  - ${name}`);
    }
    return;
  }

  // Query Wikidata for each artist
  let found = 0;
  let notFound = 0;
  let errors = 0;
  let processed = 0;

  for (const [, name] of artistNames) {
    if (processed >= limit) break;

    try {
      const results = await querySparql(name);
      const entry = resultsToEntry(results);

      if (entry) {
        cache.performers[name] = entry;
        found++;
        console.log(`  + ${name} → ${entry.type}, ${entry.sameAs.length} links`);
      } else {
        cache.performers[name] = null as any; // Mark as looked-up, no match
        notFound++;
        console.log(`  - ${name} → not found`);
      }
    } catch (err) {
      errors++;
      console.log(`  ! ${name} → error: ${(err as Error).message}`);
    }

    processed++;

    // Rate limiting
    if (processed < artistNames.size) {
      await Bun.sleep(DELAY_MS);
    }
  }

  // Save updated cache
  cache._meta.updated = new Date().toISOString().split('T')[0];
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n', 'utf-8');

  console.log(`\n=== Summary ===`);
  console.log(`Found: ${found}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total cached: ${Object.keys(cache.performers).length}`);
  console.log(`Saved to: ${CACHE_PATH}`);
}

main().catch(console.error);
