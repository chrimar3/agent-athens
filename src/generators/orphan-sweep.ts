// Orphan-sweep utility for dist/. Layered classification:
//   1. Event HTML (dist/events/<slug>/index.html, dist/en/events/<slug>/index.html):
//      slug-membership against DB pageableEvents. In-set → keep. Out-of-set → sweep
//      (arm-by-default; correctness-safe because DB is source of truth).
//   2. Event API JSON (dist/api/<slug>.json, excluding api/categories/ and index.json):
//      in-set → keep (false-positive protection). Out-of-set → mtime fallback.
//   3. Other HTML / JSON: mtime fallback (file not touched this build → orphan).
// Non-event mtime-path sweeps require armNonEvent=true (env-driven SWEEP_ORPHANS=1
// at the call site). Slug-membership protects valid pages from incremental-build
// false positives that would have made arm-by-default unsafe.

import { readdirSync, statSync, unlinkSync, rmdirSync } from 'fs';
import { join, dirname, relative, sep } from 'path';

export interface SweepOptions {
  distDir: string;
  validEventSlugs: Set<string>;
  buildStartTime: number;
  armNonEvent: boolean;
}

export interface SweepResult {
  eventOrphansSwept: number;
  mtimeOrphansFlagged: number;
  mtimeOrphansSwept: number;
}

type PathClassification =
  | { kind: 'event-html'; slug: string }
  | { kind: 'event-json'; slug: string }
  | null;

const PROTECTED_SUBDIRS_RELATIVE = [
  'images',
  'assets',
  'scripts',
  'styles',
  join('api', 'categories'),
];

const PROTECTED_ROOTS_RELATIVE = [
  '',
  'events',
  'venues',
  'en',
  join('en', 'events'),
  join('en', 'venues'),
  'api',
];

export function findOrphanSlugs(distSlugs: string[], validSlugs: Set<string>): string[] {
  return distSlugs.filter(s => !validSlugs.has(s));
}

function extractEventSlugFromPath(distDir: string, fullPath: string): PathClassification {
  const rel = relative(distDir, fullPath).split(sep);
  // dist/events/<slug>/index.html
  if (rel[0] === 'events' && rel.length === 3 && rel[2] === 'index.html') {
    return { kind: 'event-html', slug: rel[1] };
  }
  // dist/en/events/<slug>/index.html
  if (rel[0] === 'en' && rel[1] === 'events' && rel.length === 4 && rel[3] === 'index.html') {
    return { kind: 'event-html', slug: rel[2] };
  }
  // dist/api/<slug>.json (not under api/categories/, not index.json)
  if (rel[0] === 'api' && rel.length === 2 && rel[1].endsWith('.json') && rel[1] !== 'index.json') {
    return { kind: 'event-json', slug: rel[1].slice(0, -'.json'.length) };
  }
  return null;
}

function walk(dir: string, protectedPrefixes: string[], out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // Missing dir → treat as empty (graceful).
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (protectedPrefixes.some(p => (path + sep).startsWith(p))) continue;
      walk(path, protectedPrefixes, out);
    } else if (entry.isFile()) {
      out.push(path);
    }
  }
  return out;
}

export function sweepOrphans(opts: SweepOptions): SweepResult {
  const { distDir, validEventSlugs, buildStartTime, armNonEvent } = opts;

  const protectedPrefixes = PROTECTED_SUBDIRS_RELATIVE.map(s => join(distDir, s) + sep);
  const protectedRoots = new Set(
    PROTECTED_ROOTS_RELATIVE.map(r => (r ? join(distDir, r) : distDir))
  );

  const eventOrphans: string[] = [];
  const mtimeOrphans: string[] = [];

  for (const path of walk(distDir, protectedPrefixes)) {
    const isHtml = path.endsWith('.html');
    const isApiJson =
      path.endsWith('.json') &&
      path.includes(`${distDir}${sep}api${sep}`) &&
      !path.includes(`${distDir}${sep}api${sep}categories${sep}`);
    if (!isHtml && !isApiJson) continue;

    const classification = extractEventSlugFromPath(distDir, path);

    if (classification?.kind === 'event-html') {
      if (validEventSlugs.has(classification.slug)) continue;
      eventOrphans.push(path);
      continue;
    }

    if (classification?.kind === 'event-json' && validEventSlugs.has(classification.slug)) {
      continue;
    }

    // Mtime fallback: catches stale non-event paths and event-json out of valid set.
    if (statSync(path).mtimeMs >= buildStartTime) continue;
    mtimeOrphans.push(path);
  }

  const sweptParents = new Set<string>();
  let eventOrphansSwept = 0;
  let mtimeOrphansSwept = 0;

  for (const path of eventOrphans) {
    unlinkSync(path);
    sweptParents.add(dirname(path));
    eventOrphansSwept++;
  }

  if (armNonEvent) {
    for (const path of mtimeOrphans) {
      unlinkSync(path);
      sweptParents.add(dirname(path));
      mtimeOrphansSwept++;
    }
  }

  for (const parent of sweptParents) {
    if (protectedRoots.has(parent)) continue;
    try {
      if (readdirSync(parent).length === 0) rmdirSync(parent);
    } catch {
      // Non-empty or already gone — ignore.
    }
  }

  // Two-line logging: transparent about which mechanism caught what.
  console.log(`[orphan-sweep] event-path slug-membership: removed ${eventOrphansSwept} orphan${eventOrphansSwept === 1 ? '' : 's'}`);
  if (armNonEvent) {
    console.log(`[orphan-sweep] non-event path mtime: ${mtimeOrphansSwept} swept (armed)`);
  } else {
    console.log(`[orphan-sweep] non-event path mtime: ${mtimeOrphans.length} flagged (armed=false; set SWEEP_ORPHANS=1 to delete)`);
  }

  return {
    eventOrphansSwept,
    mtimeOrphansFlagged: mtimeOrphans.length,
    mtimeOrphansSwept,
  };
}
