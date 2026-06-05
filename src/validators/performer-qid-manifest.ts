/**
 * Performer QID Manifest Gate (S179 — paired validator for
 * config/performer-sameAs.json)
 *
 * Root-corruption class this closes: LLM-fabricated Wikidata QIDs committed
 * to config without entity resolution (3rd surface — neighborhood-geodata,
 * city-geodata, performer-sameAs; 27/52 performer QIDs were fabricated, see
 * specs/performer-sameas-audit-S177.md).
 *
 * Invariant: every wikidata QID in the performer cache must have a matching
 * record in config/performer-qid-verification.json — which is written ONLY by
 * the resolver (scripts/audit-performer-qids.ts --apply or
 * scripts/lookup-performer-sameAs.ts), where the QID is derived from a
 * Wikipedia wikibase_item pageprop or a uniqueness-gated exact-label match
 * and verified label-vs-owner. A QID hand-edited into the cache has no
 * record → build FAILs. Without this gate, the S179 data fix lasts exactly
 * until the next unverified write.
 *
 * This check is OFFLINE (cache↔manifest consistency only). Online
 * re-verification — ownership AND label-uniqueness drift — is the audit
 * script re-run; see specs/performer-sameas-audit-S177.md.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export interface PerformerQidGateReport {
  failures: string[];
  warnings: string[];
  passed: number;
}

interface CacheShape {
  performers: Record<string, { type: string; sameAs: string[] } | null>;
}

interface ManifestShape {
  verified: Record<
    string,
    { qid: string; method: string; anchor: string; matchCount?: number }
  >;
}

const QID_RE = /wikidata\.org\/wiki\/(Q\d+)/;

/** Compare URLs percent-encoding-insensitively (cache may store either form). */
function urlEquals(a: string, b: string): boolean {
  try {
    return decodeURIComponent(a) === decodeURIComponent(b);
  } catch {
    return a === b;
  }
}

/** Pure check — exported for tests. */
export function validatePerformerQidManifest(
  cache: CacheShape,
  manifest: ManifestShape,
): PerformerQidGateReport {
  const failures: string[] = [];
  const warnings: string[] = [];
  let passed = 0;

  for (const [name, entry] of Object.entries(cache.performers)) {
    if (entry === null) continue;
    const wikidataUrls = entry.sameAs.filter(u => QID_RE.test(u));
    if (wikidataUrls.length === 0) continue; // no QID — nothing to verify
    if (wikidataUrls.length > 1) {
      failures.push(`${name}: ${wikidataUrls.length} wikidata URIs in one entry`);
      continue;
    }

    const qid = wikidataUrls[0].match(QID_RE)![1];
    const record = manifest.verified[name];

    if (!record) {
      failures.push(
        `${name}: QID ${qid} has no verification record — QIDs enter config only via the resolver (run scripts/audit-performer-qids.ts --apply)`,
      );
      continue;
    }
    if (record.qid !== qid) {
      failures.push(`${name}: cache QID ${qid} ≠ verified QID ${record.qid} — re-run the resolver`);
      continue;
    }
    if (record.method === 'wikipedia-pageprops') {
      const wikipediaUrls = entry.sameAs.filter(u => /wikipedia\.org\/wiki\//.test(u));
      if (!wikipediaUrls.some(u => urlEquals(u, record.anchor))) {
        failures.push(
          `${name}: verified anchor ${record.anchor} is not in sameAs — the QID is only verified against THAT article`,
        );
        continue;
      }
    } else if (record.method === 'wikidata-label') {
      if (record.matchCount !== 1) {
        failures.push(
          `${name}: wikidata-label record without matchCount=1 — uniqueness is the guard for label-derived QIDs`,
        );
        continue;
      }
    } else {
      failures.push(`${name}: unknown verification method "${record.method}"`);
      continue;
    }

    passed++;
  }

  // Orphan records are stale, not dangerous (nothing emits from them)
  for (const name of Object.keys(manifest.verified)) {
    const entry = cache.performers[name];
    if (!entry || !entry.sameAs.some(u => QID_RE.test(u))) {
      warnings.push(`manifest record for "${name}" has no QID-bearing cache entry (stale)`);
    }
  }

  return { failures, warnings, passed };
}

/** Load both config files and validate (build-time entry point). */
export function validatePerformerQidConfig(): PerformerQidGateReport {
  const root = join(import.meta.dir, '../../config');
  const cache = JSON.parse(readFileSync(join(root, 'performer-sameAs.json'), 'utf-8'));
  let manifest: ManifestShape;
  try {
    manifest = JSON.parse(readFileSync(join(root, 'performer-qid-verification.json'), 'utf-8'));
  } catch {
    manifest = { verified: {} }; // missing manifest → every QID fails, by design
  }
  return validatePerformerQidManifest(cache, manifest);
}
