#!/usr/bin/env bun
/**
 * Retroactive Gate Sweep
 *
 * Scans all existing descriptions in events.db against the improved quality gates.
 * Reports PASS/WARN/FAIL buckets with detailed breakdown.
 *
 * Usage:
 *   bun run scripts/retroactive-gate-sweep.ts
 *   bun run scripts/retroactive-gate-sweep.ts --fix   # Apply safe auto-fixes
 *
 * @see src/enrichment/quality-gates.ts
 */

import Database from 'bun:sqlite';
import {
  validateQualityGates,
  validateEnglishDescription,
  validateGreekDescription,
  detectGenericContent,
  type QualityGateResult,
  type QualityIssue,
} from '../src/enrichment/quality-gates';
import type { EventForEnrichment } from '../src/enrichment/description-generator';

const DB_PATH = 'data/events.db';

// ============================================================================
// Types
// ============================================================================

interface SweepResult {
  id: string;
  title: string;
  lang: 'EN' | 'GR';
  score: number;
  status: 'PASS' | 'WARN' | 'FAIL';
  errors: QualityIssue[];
  warnings: QualityIssue[];
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  const applyFixes = process.argv.includes('--fix');

  const db = new Database(DB_PATH);

  // Query all events with descriptions
  const rows = db.prepare(`
    SELECT id, title, type, venue_name, start_date, price_type,
           full_description_en, full_description_gr,
           enrichment_tier, time_doors, price_advance, price_door
    FROM events
    WHERE full_description_en IS NOT NULL AND full_description_en <> ''
       OR full_description_gr IS NOT NULL AND full_description_gr <> ''
  `).all() as {
    id: string;
    title: string;
    type: string;
    venue_name: string | null;
    start_date: string;
    price_type: string | null;
    full_description_en: string | null;
    full_description_gr: string | null;
    enrichment_tier: string | null;
    time_doors: string | null;
    price_advance: number | null;
    price_door: number | null;
  }[];

  const results: SweepResult[] = [];

  for (const row of rows) {
    const event: EventForEnrichment = {
      id: row.id,
      title: row.title,
      date: row.start_date,
      time: row.time_doors,
      venue: row.venue_name,
      type: row.type,
      genre: null,
      price: row.price_type,
      price_advance: row.price_advance,
      price_door: row.price_door,
    };

    const tier = (row.enrichment_tier as 'stub' | 'standard' | 'premium') || 'standard';

    // English description
    if (row.full_description_en) {
      const enResult = validateEnglishDescription(event, row.full_description_en, tier);
      const genericIssues = detectGenericContent(
        row.full_description_en,
        { title: row.title, venue: row.venue_name, type: row.type },
        tier
      );

      const allIssues = [...enResult.issues, ...genericIssues];
      const errors = allIssues.filter(i => i.severity === 'error');
      const warnings = allIssues.filter(i => i.severity === 'warning');

      let status: SweepResult['status'] = 'PASS';
      if (errors.length > 0) status = 'FAIL';
      else if (warnings.length > 0) status = 'WARN';

      results.push({
        id: row.id,
        title: row.title,
        lang: 'EN',
        score: enResult.score,
        status,
        errors,
        warnings,
      });
    }

    // Greek description
    if (row.full_description_gr) {
      const grResult = validateGreekDescription(event, row.full_description_gr, tier);

      const errors = grResult.issues.filter(i => i.severity === 'error');
      const warnings = grResult.issues.filter(i => i.severity === 'warning');

      let status: SweepResult['status'] = 'PASS';
      if (errors.length > 0) status = 'FAIL';
      else if (warnings.length > 0) status = 'WARN';

      results.push({
        id: row.id,
        title: row.title,
        lang: 'GR',
        score: grResult.score,
        status,
        errors,
        warnings,
      });
    }
  }

  // Aggregate
  const enResults = results.filter(r => r.lang === 'EN');
  const grResults = results.filter(r => r.lang === 'GR');

  const count = (arr: SweepResult[], s: SweepResult['status']) => arr.filter(r => r.status === s).length;

  console.log('\n=== RETROACTIVE GATE SWEEP ===\n');
  console.log(`English: ${enResults.length} scanned — ${count(enResults, 'PASS')} pass, ${count(enResults, 'WARN')} warn, ${count(enResults, 'FAIL')} fail`);
  console.log(`Greek:   ${grResults.length} scanned — ${count(grResults, 'PASS')} pass, ${count(grResults, 'WARN')} warn, ${count(grResults, 'FAIL')} fail`);

  // Failures
  const failures = results.filter(r => r.status === 'FAIL');
  if (failures.length > 0) {
    console.log(`\n--- FAILURES (${failures.length}) ---`);
    console.log('ID | Lang | Score | Errors');
    console.log('---|------|-------|-------');
    for (const f of failures) {
      const errorCodes = f.errors.map(e => `${e.code}: ${e.message.slice(0, 80)}`).join('; ');
      console.log(`${f.id.slice(0, 20)} | ${f.lang} | ${f.score} | ${errorCodes}`);
    }
  }

  // Warnings (top issues)
  const warned = results.filter(r => r.status === 'WARN');
  if (warned.length > 0) {
    console.log(`\n--- WARNINGS (${warned.length}) ---`);
    console.log('ID | Lang | Score | Top Warnings');
    console.log('---|------|-------|-------------');
    for (const w of warned) {
      const topWarnings = w.warnings.slice(0, 3).map(wr => wr.code).join(', ');
      console.log(`${w.id.slice(0, 20)} | ${w.lang} | ${w.score} | ${topWarnings}`);
    }
  }

  // Issue frequency summary
  const issueCounts = new Map<string, number>();
  for (const r of results) {
    for (const issue of [...r.errors, ...r.warnings]) {
      issueCounts.set(issue.code, (issueCounts.get(issue.code) || 0) + 1);
    }
  }
  console.log('\n--- ISSUE FREQUENCY ---');
  const sorted = [...issueCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [code, cnt] of sorted) {
    console.log(`  ${code}: ${cnt}`);
  }

  // Auto-fixes
  if (applyFixes) {
    console.log('\n--- APPLYING SAFE AUTO-FIXES ---');

    // Greek venue name fixes
    const venueFixMap: [string, string][] = [
      ['Megaron', 'Μέγαρο Μουσικής'],
      ['Onassis Stegi', 'Στέγη Ωνάση'],
      ['National Theatre', 'Εθνικό Θέατρο'],
      ['Technopolis', 'Τεχνόπολη'],
    ];

    let fixCount = 0;
    for (const [english, greek] of venueFixMap) {
      const stmt = db.prepare(
        `UPDATE events SET full_description_gr = REPLACE(full_description_gr, ?, ?)
         WHERE full_description_gr LIKE ? AND full_description_gr NOT LIKE ?`
      );
      const result = stmt.run(english, greek, `%${english}%`, `%${greek}%`);
      if (result.changes > 0) {
        console.log(`  Fixed ${result.changes} GR descriptions: "${english}" → "${greek}"`);
        fixCount += result.changes;
      }
    }

    if (fixCount === 0) {
      console.log('  No auto-fixable issues found.');
    }

    // Report items needing manual rewrite
    const speculationItems = results.filter(r =>
      r.errors.some(e => e.code === 'SPECULATION') || r.warnings.some(w => w.code === 'SPECULATION')
    );
    const tableItems = results.filter(r =>
      r.warnings.some(w => w.code === 'HAS_MARKDOWN_TABLE')
    );

    if (speculationItems.length > 0) {
      console.log(`\n  ${speculationItems.length} descriptions with speculation → queue for rewrite`);
      for (const s of speculationItems.slice(0, 10)) {
        console.log(`    ${s.id} (${s.lang})`);
      }
    }
    if (tableItems.length > 0) {
      console.log(`\n  ${tableItems.length} descriptions with markdown tables → queue for rewrite`);
      for (const t of tableItems.slice(0, 10)) {
        console.log(`    ${t.id} (${t.lang})`);
      }
    }
  }

  db.close();
  console.log('\n=== SWEEP COMPLETE ===\n');
}

main();
