#!/usr/bin/env bun
/**
 * Post-save validator (Phase 2B, spec §5.3) — the process that 8+ enrichment
 * sessions routed corrections to before it existed.
 *
 * Deterministic subset ONLY:
 *   1. URL-sibling collapse: live athinorama rows sharing a production slug
 *      are merged (reversibly — merged_into + dedup_merges, mirroring
 *      scripts/mark-duplicates.ts:249-253) onto one survivor. This clears the
 *      phantom-row backlog (Βάκχες 18 rows / Υπηρέτης 50) that the URL-keyed
 *      identity fix prevents going forward.
 *   2. Rollover-expiry proposals: events carrying a date-conflict concern
 *      whose start_date sits >10 months out get a PROPOSED correction
 *      (extracted from the concern prose when parseable) written to
 *      data/validator-proposals.json — consumed by the decisions queue,
 *      never auto-applied.
 *
 * Anything non-deterministic stays human. No DELETE anywhere, ever.
 * Usage: bun run scripts/post-save-validator.ts [--dry-run]
 */
import { Database } from 'bun:sqlite';
import { appendFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');

export interface SiblingRow {
  id: string;
  url: string;
  full_description: string | null;
  created_at: string;
}

export interface SiblingGroup {
  slug: string;
  rows: SiblingRow[];
}

const SLUG_RE = /-(\d{5,})\/?$/;

function slugOf(url: string): string | null {
  const m = url.replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '').match(SLUG_RE);
  return m ? m[1] : null;
}

export function findUrlSiblingGroups(db: Database): SiblingGroup[] {
  const rows = db
    .query(
      `SELECT id, url, full_description, created_at FROM events
       WHERE source = 'athinorama.gr' AND merged_into IS NULL AND url IS NOT NULL`,
    )
    .all() as SiblingRow[];
  const bySlug = new Map<string, SiblingRow[]>();
  for (const r of rows) {
    const slug = slugOf(r.url);
    if (!slug) continue;
    const list = bySlug.get(slug) ?? [];
    list.push(r);
    bySlug.set(slug, list);
  }
  return [...bySlug.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([slug, list]) => ({ slug, rows: list }));
}

/** Enriched row wins (its description is live work product, and enrichment
 *  sessions hand-verified its dates); among several enriched, the NEWEST —
 *  and among non-enriched, the NEWEST scrape. Newest-wins is Vector C from
 *  the event-id-stability audit (known-issues.md:326-333): the older-row
 *  preference was a documented dedup defect (stale dates/titles survived),
 *  and an old-start survivor can hide a still-running production. */
export function electSurvivor(rows: SiblingRow[]): SiblingRow {
  const newestFirst = (a: SiblingRow, b: SiblingRow) => b.created_at.localeCompare(a.created_at);
  const enriched = rows.filter((r) => (r.full_description ?? '').length > 50).sort(newestFirst);
  if (enriched.length > 0) return enriched[0];
  return [...rows].sort(newestFirst)[0];
}

/** Returns the number of rows that would be / were merged. Mirrors the
 *  mark-duplicates reversible contract exactly: merged_into + merged_at +
 *  dedup_merges audit row with loser snapshot. */
export function collapseGroups(db: Database, groups: SiblingGroup[], dryRun: boolean): number {
  let merged = 0;
  const mark = db.prepare(
    `UPDATE events SET merged_into = $survivorId, merged_at = datetime('now'), updated_at = datetime('now') WHERE id = $id`,
  );
  const audit = db.prepare(
    `INSERT INTO dedup_merges (winner_id, loser_id, confidence, match_layer, match_reason, fields_merged, loser_snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const g of groups) {
    const survivor = electSurvivor(g.rows);
    for (const row of g.rows) {
      if (row.id === survivor.id) continue;
      merged++;
      if (dryRun) continue;
      const snapshot = db.query(`SELECT * FROM events WHERE id = ?`).get(row.id);
      mark.run({ $survivorId: survivor.id, $id: row.id });
      audit.run(
        survivor.id,
        row.id,
        1.0,
        'url-sibling',
        `same athinorama production slug ${g.slug} (post-save validator)`,
        null,
        JSON.stringify(snapshot),
      );
    }
  }
  return merged;
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** Conservative date extraction from concern prose: ISO first, then
 *  "D Mon" English abbreviations with a context year. Anything else → null. */
export function extractProposedDate(text: string, contextYear: number): string | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  const dm = text.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i);
  if (dm) return `${contextYear}-${MONTHS[dm[2].toLowerCase()]}-${dm[1].padStart(2, '0')}`;
  return null;
}

if (import.meta.main) {
  const dryRun = process.argv.includes('--dry-run');
  // VALIDATOR_DB_PATH: same seam pattern as DEADMAN_DB_PATH — lets a worktree
  // dry-run point at the production DB and tests at fixtures.
  const dbPath = process.env.VALIDATOR_DB_PATH || join(ROOT, 'data', 'events.db');
  const db = new Database(dbPath, { readonly: dryRun });

  const groups = findUrlSiblingGroups(db);
  const planned = groups.reduce((s, g) => s + g.rows.length - 1, 0);
  console.log(`[validator] ${groups.length} URL-sibling group(s), ${planned} row(s) to collapse${dryRun ? ' (dry-run)' : ''}`);
  for (const g of groups.slice(0, 10)) {
    console.log(`  ${g.slug}: ${g.rows.length} rows → survivor ${electSurvivor(g.rows).id}`);
  }
  const merged = collapseGroups(db, groups, dryRun);

  // Rollover-expiry proposals (never auto-applied). Cutoff computed in TS
  // (Europe/Athens) and bound — no raw date('now') predicate in SQL, per the
  // effective-end seam guard. This is a rollover-artifact window, not a
  // lifecycle currency check, so isCurrentSql() is deliberately not used.
  const { DateTime } = await import('luxon');
  const nowAthens = DateTime.now().setZone('Europe/Athens');
  const year = nowAthens.year;
  const cutoff = nowAthens.plus({ months: 10 }).toISODate()!;
  const farOut = db
    .query(
      `SELECT e.id, e.title, e.start_date, c.concern_text FROM events e
       JOIN event_concerns c ON c.event_id = e.id AND c.concern_type = 'date-conflict-or-unparseable'
       WHERE e.merged_into IS NULL AND e.start_date > $cutoff`,
    )
    .all({ $cutoff: cutoff }) as Array<{ id: string; title: string; start_date: string; concern_text: string | null }>;
  const proposals = farOut.map((r) => ({
    event_id: r.id,
    title: r.title,
    current_start: r.start_date,
    proposed_date: r.concern_text ? extractProposedDate(r.concern_text, year) : null,
    concern: r.concern_text,
  }));
  if (!dryRun) {
    writeFileSync(join(ROOT, 'data', 'validator-proposals.json'), JSON.stringify(proposals, null, 2) + '\n');
  }
  db.close();

  const line = JSON.stringify({
    at: new Date().toISOString(),
    dryRun,
    groups: groups.length,
    merged,
    proposals: proposals.length,
  });
  if (!dryRun) appendFileSync(join(ROOT, 'data', 'validator-log.jsonl'), line + '\n');
  console.log(`[validator] merged=${merged} proposals=${proposals.length}`);
}
