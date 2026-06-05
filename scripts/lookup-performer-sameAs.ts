#!/usr/bin/env bun
/**
 * Performer sameAs Lookup — resolver-only (S179 rewrite)
 *
 * Looks up performer names extracted from visible events and writes verified
 * Wikidata Q-IDs, Wikipedia URLs, and MusicBrainz IDs to
 * config/performer-sameAs.json + config/performer-qid-verification.json.
 *
 * S179 QID-provenance rule: every QID comes from the resolver
 * (scripts/lib/performer-qid-resolver.ts) — Wikipedia wikibase_item pageprops
 * anchor, or uniqueness-gated exact-label match — and is verified
 * label-vs-owner before it is emitted. The previous SPARQL first-label-match
 * engine was corruption vector 1 (Catharsis → wrong same-name band); LLM
 * hand-edits to the cache were vector 2 (27/52 QIDs fabricated, see
 * specs/performer-sameas-audit-S177.md). The paired build validator
 * (src/validators/performer-qid-manifest.ts) FAILs the build on any cache QID
 * that lacks a matching manifest record, so neither vector can deploy again.
 *
 * Usage:
 *   bun run scripts/lookup-performer-sameAs.ts              # Full run
 *   bun run scripts/lookup-performer-sameAs.ts --dry-run    # Preview only
 *   bun run scripts/lookup-performer-sameAs.ts --limit=20   # Limit lookups
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import Database from 'bun:sqlite';
import {
  resolvePerformerQid,
  fetchEntity,
  schemaTypeFromP31,
  type VerificationRecord,
} from './lib/performer-qid-resolver';

const DB_PATH = 'data/events.db';
const CACHE_PATH = join(import.meta.dir, '../config/performer-sameAs.json');
const MANIFEST_PATH = join(import.meta.dir, '../config/performer-qid-verification.json');
const PERFORMER_TYPES = ['concert', 'dj_set', 'festival', 'performance', 'show', 'dance'];

interface PerformerEntry {
  type: 'Person' | 'MusicGroup';
  sameAs: string[];
}

interface PerformerCache {
  _meta: { description: string; updated: string; generated_by: string };
  performers: Record<string, PerformerEntry>;
}

interface Manifest {
  _meta: { description: string; updated: string; generated_by: string };
  verified: Record<string, VerificationRecord>;
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
// Verified lookup (resolver-only — S179)
// ============================================================================

/**
 * Resolve one artist name to a verified cache entry + manifest record.
 * Returns null when no verified entity exists (absence beats fabrication).
 */
async function lookupVerified(
  name: string,
  today: string,
): Promise<{ entry: PerformerEntry; record: VerificationRecord } | null> {
  const { resolved } = await resolvePerformerQid(name, { today });
  if (!resolved) return null;

  const ent = await fetchEntity(resolved.qid);
  if (!ent) return null;

  const sameAs: string[] = [`https://www.wikidata.org/wiki/${resolved.qid}`];
  if (resolved.wikipediaUrl) sameAs.push(resolved.wikipediaUrl);
  if (ent.musicbrainzId) sameAs.push(`https://musicbrainz.org/artist/${ent.musicbrainzId}`);

  return {
    entry: { type: schemaTypeFromP31(ent.p31), sameAs },
    record: {
      qid: resolved.qid,
      method: resolved.method,
      anchor: resolved.anchor,
      matchedLabel: resolved.matchedLabel,
      ...(resolved.matchCount !== undefined && { matchCount: resolved.matchCount }),
      verifiedAt: resolved.verifiedAt,
    },
  };
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

  // Load the verification manifest — every emitted QID gets a record here,
  // and the build validator FAILs on cache QIDs without one.
  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  } catch {
    manifest = {
      _meta: {
        description: 'Performer QID verification manifest. Written only by resolver scripts.',
        updated: '',
        generated_by: 'scripts/lookup-performer-sameAs.ts',
      },
      verified: {},
    };
  }

  // Resolve each artist through the verified pipeline (S179: resolver output
  // only — Wikipedia pageprops anchor or uniqueness-gated label match,
  // label-vs-owner checked; rate limiting lives inside the resolver)
  const today = new Date().toISOString().split('T')[0];
  let found = 0;
  let notFound = 0;
  let errors = 0;
  let processed = 0;

  for (const [, name] of artistNames) {
    if (processed >= limit) break;

    try {
      const result = await lookupVerified(name, today);

      if (result) {
        cache.performers[name] = result.entry;
        manifest.verified[name] = result.record;
        found++;
        console.log(`  + ${name} → ${result.entry.type}, ${result.record.qid} (${result.record.method}), ${result.entry.sameAs.length} links`);
      } else {
        cache.performers[name] = null as any; // Mark as looked-up, no verified match
        notFound++;
        console.log(`  - ${name} → no verified match`);
      }
    } catch (err) {
      errors++;
      console.log(`  ! ${name} → error: ${(err as Error).message}`);
    }

    processed++;
  }

  // Save updated cache + manifest together — they must move as a pair or the
  // build validator trips (by design)
  cache._meta.updated = today;
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n', 'utf-8');
  manifest._meta.updated = today;
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

  console.log(`\n=== Summary ===`);
  console.log(`Found (verified): ${found}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total cached: ${Object.keys(cache.performers).length}`);
  console.log(`Saved to: ${CACHE_PATH}`);
  console.log(`Manifest: ${MANIFEST_PATH} (${Object.keys(manifest.verified).length} records)`);
}

main().then(
  () => process.exit(0),
  err => { console.error(err); process.exit(1); },
);
