#!/usr/bin/env bun
/**
 * Performer QID audit / re-derivation (S179, follow-up to
 * specs/performer-sameas-audit-S177.md).
 *
 * Re-derives every QID in config/performer-sameAs.json through the resolver
 * (scripts/lib/performer-qid-resolver.ts) — wikipedia-pageprops anchor first,
 * uniqueness-gated label match as fallback — and verifies label-vs-owner.
 *
 * Default: dry-run report (derived-vs-stored diff, nothing written).
 * --apply: write corrected cache + config/performer-qid-verification.json
 *          (the manifest the build-time validator gates on).
 *
 * Also serves as the periodic label-spot-check: re-running re-confirms
 * ownership AND label-uniqueness online (a future Wikidata entity sharing a
 * label flips a clean entry to ambiguous — QID-stability alone won't see it).
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  resolvePerformerQid,
  type ResolvedQid,
  type VerificationRecord,
} from './lib/performer-qid-resolver';

const CACHE_PATH = join(import.meta.dir, '../config/performer-sameAs.json');
const MANIFEST_PATH = join(import.meta.dir, '../config/performer-qid-verification.json');

/**
 * Per-entry forced drops (operator decisions, S179 session 2026-06-05):
 * ownership is ambiguous in the real world, not just in the data, so no
 * resolver outcome is trustworthy. Absence beats a 50/50 guess.
 */
const FORCED_DROPS = new Map<string, string>([
  ['Μίνως Μάτσας', 'two Greek songwriters share the name (grandfather/grandson) — needs human confirmation'],
  ['Chevy', 'ptwiki "Chevy (banda)" is a British metal band; unconfirmed that the Athens act is this band'],
]);

interface PerformerEntry {
  type: string;
  sameAs: string[];
}

const isWikidata = (u: string) => u.includes('wikidata.org/wiki/');
const isWikipedia = (u: string) => /https?:\/\/[a-z-]+\.wikipedia\.org\/wiki\//.test(u);

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const today = new Date().toISOString().split('T')[0];

  const cache = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
  const entries = Object.entries(cache.performers)
    .filter(([, e]) => e !== null) as [string, PerformerEntry][];
  const linked = entries.filter(([, e]) => e.sameAs.some(u => isWikidata(u) || isWikipedia(u)));

  console.log(`\n=== Performer QID re-derivation ${apply ? '(APPLY)' : '(dry run)'} ===`);
  console.log(`Link-bearing entries: ${linked.length} (of ${Object.keys(cache.performers).length} total)\n`);

  const manifest: Record<string, VerificationRecord> = {};
  const stats = { unchanged: 0, corrected: 0, added: 0, dropped: 0, forced: 0 };

  for (const [name, entry] of linked) {
    const storedQid = entry.sameAs.find(isWikidata)?.split('/wiki/')[1] ?? null;

    if (FORCED_DROPS.has(name)) {
      console.log(`  ⛔ ${name}: QID ${storedQid} dropped — ${FORCED_DROPS.get(name)}`);
      stats.forced++;
      if (apply) applyResolution(cache, name, entry, null);
      continue;
    }

    const wikipediaUrls = entry.sameAs.filter(isWikipedia);
    const { resolved, notes } = await resolvePerformerQid(name, { wikipediaUrls, today });

    if (resolved) {
      manifest[name] = {
        qid: resolved.qid,
        method: resolved.method,
        anchor: resolved.anchor,
        matchedLabel: resolved.matchedLabel,
        ...(resolved.matchCount !== undefined && { matchCount: resolved.matchCount }),
        verifiedAt: resolved.verifiedAt,
      };
      if (storedQid === resolved.qid) {
        console.log(`  ✓ ${name}: ${resolved.qid} confirmed (${resolved.method})`);
        stats.unchanged++;
      } else if (storedQid) {
        console.log(`  ✏ ${name}: ${storedQid} → ${resolved.qid} (${resolved.method}, "${resolved.matchedLabel}")`);
        stats.corrected++;
      } else {
        console.log(`  + ${name}: ${resolved.qid} added (${resolved.method}, "${resolved.matchedLabel}")`);
        stats.added++;
      }
    } else {
      console.log(`  − ${name}: QID ${storedQid ?? '(none)'} dropped`);
      stats.dropped++;
    }
    for (const n of notes) console.log(`      · ${n}`);

    if (apply) applyResolution(cache, name, entry, resolved);
  }

  console.log(`\n=== Summary ===`);
  console.log(`  confirmed: ${stats.unchanged}, corrected: ${stats.corrected}, added: ${stats.added}, dropped: ${stats.dropped}, forced drops: ${stats.forced}`);

  if (apply) {
    cache._meta.updated = today;
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n', 'utf-8');
    writeFileSync(
      MANIFEST_PATH,
      JSON.stringify(
        {
          _meta: {
            description:
              'Performer QID verification manifest. Every wikidata sameAs QID in performer-sameAs.json must have a record here, written ONLY by the resolver (scripts/audit-performer-qids.ts --apply or scripts/lookup-performer-sameAs.ts). The build-time validator (src/validators/performer-qid-manifest.ts) FAILs the build on any cache QID without a matching record — hand-editing QIDs into the cache will not deploy.',
            updated: today,
            generated_by: 'scripts/audit-performer-qids.ts',
          },
          verified: manifest,
        },
        null,
        2,
      ) + '\n',
      'utf-8',
    );
    console.log(`\nWrote ${CACHE_PATH}`);
    console.log(`Wrote ${MANIFEST_PATH} (${Object.keys(manifest).length} records)`);
  } else {
    console.log(`\nDry run — re-run with --apply to write cache + manifest.`);
  }
}

/** Rewrite one entry's sameAs from a resolution (null resolution = drop QID). */
function applyResolution(
  cache: any,
  name: string,
  entry: PerformerEntry,
  resolved: ResolvedQid | null,
): void {
  // Non-wiki links (MusicBrainz etc.) are out of scope for this pass — keep.
  const others = entry.sameAs.filter(u => !isWikidata(u) && !isWikipedia(u));
  const existingWikipedia = entry.sameAs.filter(isWikipedia);

  let sameAs: string[];
  if (resolved) {
    const wikipedia = resolved.wikipediaUrl
      ? [...new Set([resolved.wikipediaUrl, ...existingWikipedia])]
      : existingWikipedia;
    sameAs = [`https://www.wikidata.org/wiki/${resolved.qid}`, ...wikipedia, ...others];
  } else {
    // Drop the QID; keep any Wikipedia URL (it was the correct half of the pair)
    sameAs = [...existingWikipedia, ...others];
  }

  if (sameAs.length === 0) {
    cache.performers[name] = null; // nothing verifiable left — known not-found
  } else {
    cache.performers[name] = { ...entry, sameAs };
  }
}

main().then(
  () => process.exit(0),
  err => { console.error(err); process.exit(1); },
);
