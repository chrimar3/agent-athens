#!/usr/bin/env bun
/**
 * Cornerstone + Hub Hash Stats
 *
 * Reports % of cornerstones+hubs whose lastModified bumped vs. held within
 * a given window. Feeds GEO's weekly self-validation metric.
 *
 * Reads data/content-hashes.json (gitignored, regenerated each build).
 * Compare-window mode requires a prior snapshot saved via --snapshot.
 *
 * Usage:
 *   bun run scripts/cornerstone-hash-stats.ts --snapshot       Save today's manifest as a snapshot
 *   bun run scripts/cornerstone-hash-stats.ts <days>           Stats vs. <days>-ago snapshot (default 7)
 */

import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { DateTime } from 'luxon';
import { loadManifest } from '../src/sitemap/content-hasher';

const ROOT = resolve(import.meta.dir, '..');
const MANIFEST = join(ROOT, 'data/content-hashes.json');
const SNAPSHOT_DIR = join(ROOT, 'data/content-hash-snapshots');

const CORNERSTONES = new Set(['today', 'this-week', 'this-weekend', 'open', 'this-month']);
const HUB_RE = /^(concerts|theater|exhibitions|cinema|dance|classical-music|nightlife|festivals|comedy|greek-music|kids|with-ticket)$/;

function isCornerstoneOrHub(key: string): boolean {
  const k = key.replace(/^en\//, '');
  return CORNERSTONES.has(k) || HUB_RE.test(k);
}

function snapshotPath(isoDate: string): string {
  return join(SNAPSHOT_DIR, `${isoDate}.json`);
}

function todayAthens(): string {
  return DateTime.now().setZone('Europe/Athens').toISODate()!;
}

function takeSnapshot(): void {
  if (!existsSync(MANIFEST)) {
    console.error(`Manifest not found: ${MANIFEST}. Run a site build first.`);
    process.exit(1);
  }
  const target = snapshotPath(todayAthens());
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(MANIFEST, target);
  console.log(`Snapshot saved: ${target}`);
}

function computeStats(daysAgo: number): void {
  const target = DateTime.now().setZone('Europe/Athens').minus({ days: daysAgo }).toISODate()!;
  const snapPath = snapshotPath(target);
  if (!existsSync(snapPath)) {
    console.error(`No snapshot found for ${target}. Run --snapshot daily to accumulate history.`);
    process.exit(1);
  }

  const current = loadManifest(MANIFEST);
  const previous = loadManifest(snapPath);

  let bumped = 0;
  let held = 0;
  const bumpedKeys: string[] = [];

  for (const [key, entry] of Object.entries(current.entries)) {
    if (!isCornerstoneOrHub(key)) continue;
    const prev = previous.entries[key];
    if (!prev) continue; // new URL, not bump-vs-hold
    if (entry.lastModified !== prev.lastModified) {
      bumped++;
      bumpedKeys.push(key);
    } else {
      held++;
    }
  }

  const total = bumped + held;
  const bumpRate = total > 0 ? bumped / total : 0;
  const result = { totalCornerstonesAndHubs: total, bumped, held, bumpRate, bumpedKeys };

  console.log(JSON.stringify(result, null, 2));
  console.log(
    `\n${(bumpRate * 100).toFixed(1)}% of ${total} cornerstones+hubs bumped over last ${daysAgo} day(s).`
  );
  console.log(
    '(Healthy: low daily bump rate + clean bumps on substantive updates + quarterly refresh. Calibration band TBD post-May 22 from observed baseline.)'
  );
}

const arg = process.argv[2];
if (arg === '--snapshot') {
  takeSnapshot();
} else {
  const days = arg ? Number(arg) : 7;
  if (!Number.isFinite(days) || days < 1) {
    console.error(`Invalid days argument: ${arg}. Pass a positive integer or --snapshot.`);
    process.exit(1);
  }
  computeStats(days);
}
