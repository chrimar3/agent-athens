#!/usr/bin/env bun
/**
 * Auto-Verify Venues - Interactive Workflow Tool
 *
 * This script works WITH Claude Code's interactive session:
 * 1. --list: Shows unverified venues that need web search
 * 2. --apply-results: Applies verification results from a JSON file
 * 3. --export: Exports current unverified venues to JSON for processing
 *
 * Workflow:
 *   1. bun run scripts/auto-verify-venues.ts --export > venues-to-verify.json
 *   2. Claude Code uses WebSearch to look up each venue
 *   3. Claude Code creates a results file with findings
 *   4. bun run scripts/auto-verify-venues.ts --apply-results=results.json
 *
 * Or interactively:
 *   1. bun run scripts/auto-verify-venues.ts --list
 *   2. Claude Code searches each venue and updates DB directly
 */

import Database from 'bun:sqlite';
import { readFileSync, existsSync } from 'fs';

const db = new Database('data/events.db');

// Athens metro area cities/neighborhoods (for decision logic)
const ATHENS_METRO = new Set([
  'αθήνα', 'athens', 'αθηνα',
  'πειραιάς', 'piraeus', 'πειραιας',
  'καλλιθέα', 'kallithea', 'καλλιθεα',
  'νέα σμύρνη', 'nea smyrni', 'νεα σμυρνη',
  'γλυφάδα', 'glyfada', 'γλυφαδα',
  'μαρούσι', 'marousi', 'maroussi', 'μαρουσι',
  'κηφισιά', 'kifisia', 'κηφισια',
  'χαλάνδρι', 'chalandri', 'χαλανδρι',
  'νέα ιωνία', 'nea ionia', 'νεα ιωνια',
  'περιστέρι', 'peristeri', 'περιστερι',
  'αιγάλεω', 'egaleo', 'αιγαλεω',
  'ίλιον', 'ilion', 'ιλιον',
  'νίκαια', 'nikaia', 'νικαια',
  'κερατσίνι', 'keratsini', 'κερατσινι',
  'αγία παρασκευή', 'agia paraskevi',
  'χολαργός', 'cholargos', 'holargos',
  'ψυχικό', 'psychiko', 'ψυχικο',
  'φιλοθέη', 'filothei',
  'παλαιό φάληρο', 'palaio faliro', 'παλαιο φαληρο',
  'άλιμος', 'alimos', 'αλιμος',
  'ελληνικό', 'elliniko', 'ελληνικο',
  'αργυρούπολη', 'argyroupoli',
  'ηλιούπολη', 'ilioupoli',
  'βύρωνας', 'vyronas', 'βυρωνας',
  'δάφνη', 'dafni', 'δαφνη',
  'ζωγράφου', 'zografou', 'ζωγραφου',
  'γαλάτσι', 'galatsi', 'γαλατσι',
  'κυψέλη', 'kypseli', 'κυψελη',
  'πατήσια', 'patisia', 'πατησια',
  'αμπελόκηποι', 'ambelokipoi',
  'αττική', 'attica', 'αττικη',
  'κολωνάκι', 'kolonaki', 'κολωνακι',
  'εξάρχεια', 'exarchia', 'εξαρχεια',
  'μοναστηράκι', 'monastiraki',
  'πλάκα', 'plaka', 'πλακα',
  'κουκάκι', 'koukaki', 'κουκακι',
  'γκάζι', 'gazi', 'γκαζι',
  'μεταξουργείο', 'metaxourgeio',
  'ταύρος', 'tavros', 'ταυρος',
  'ρέντης', 'rentis', 'ρεντης'
]);

// Known non-Athens cities
const NON_ATHENS_CITIES = new Set([
  'θεσσαλονίκη', 'thessaloniki', 'θεσσαλονικη',
  'πάτρα', 'patras', 'πατρα',
  'ηράκλειο', 'heraklion', 'ηρακλειο', 'crete', 'κρήτη',
  'λάρισα', 'larissa', 'λαρισα',
  'βόλος', 'volos', 'βολος',
  'ιωάννινα', 'ioannina',
  'κομοτηνή', 'komotini',
  'ρόδος', 'rhodes', 'ροδος',
  'κέρκυρα', 'corfu', 'κερκυρα',
  'μύκονος', 'mykonos', 'μυκονος',
  'σαντορίνη', 'santorini',
  'χανιά', 'chania', 'χανια',
  'αλεξανδρούπολη', 'alexandroupoli',
  'καβάλα', 'kavala', 'καβαλα',
  'σέρρες', 'serres', 'σερρες',
  'χαλκιδική', 'halkidiki', 'chalkidiki',
  'αμφισσα', 'amfissa', 'amphissa',
  'βέροια', 'veria', 'βεροια',
  'κοζάνη', 'kozani',
  'τρίκαλα', 'trikala',
  'καλαμάτα', 'kalamata',
  'επίδαυρος', 'epidaurus'
]);

interface VenueToVerify {
  venue_name: string;
  event_count: number;
  sample_titles: string[];
}

interface VerificationResult {
  venue_name: string;
  decision: 'verify' | 'reject' | 'skip';
  city?: string;
  address?: string;
  neighborhood?: string;
  reason: string;
}

function getUnverifiedVenues(limit: number = 50): VenueToVerify[] {
  const venues = db.query(`
    SELECT
      venue_name,
      COUNT(*) as event_count,
      GROUP_CONCAT(title, ' | ') as titles
    FROM events
    WHERE location_status = 'unverified'
    GROUP BY venue_name
    ORDER BY event_count DESC
    LIMIT ?
  `).all(limit) as { venue_name: string; event_count: number; titles: string }[];

  return venues.map(v => ({
    venue_name: v.venue_name,
    event_count: v.event_count,
    sample_titles: v.titles.split(' | ').slice(0, 3)
  }));
}

function makeDecision(city: string): { decision: 'verify' | 'reject' | 'manual'; reason: string } {
  const cityLower = city.toLowerCase();

  // Check Athens metro
  for (const athensArea of ATHENS_METRO) {
    if (cityLower.includes(athensArea)) {
      return { decision: 'verify', reason: `Located in ${city} (Athens metro)` };
    }
  }

  // Check non-Athens
  for (const nonAthens of NON_ATHENS_CITIES) {
    if (cityLower.includes(nonAthens)) {
      return { decision: 'reject', reason: `Located in ${city} (not Athens)` };
    }
  }

  return { decision: 'manual', reason: `Unclear location: ${city}` };
}

function applyResults(results: VerificationResult[]): void {
  let verified = 0;
  let rejected = 0;
  let skipped = 0;

  for (const result of results) {
    if (result.decision === 'verify') {
      db.run(`UPDATE events SET location_status = 'verified_athens' WHERE venue_name = ?`, [result.venue_name]);
      console.log(`✅ Verified: ${result.venue_name} - ${result.reason}`);
      verified++;
    } else if (result.decision === 'reject') {
      // Archive to rejected_events
      const events = db.query(`SELECT * FROM events WHERE venue_name = ?`).all(result.venue_name) as any[];
      for (const event of events) {
        db.run(`
          INSERT OR IGNORE INTO rejected_events
          (original_id, title, date, venue, source, rejection_reason, location_status, rejected_at)
          VALUES (?, ?, ?, ?, ?, ?, 'rejected_non_athens', datetime('now'))
        `, [event.id, event.title, event.start_date, event.venue_name, event.source, result.reason]);
      }
      db.run(`DELETE FROM events WHERE venue_name = ?`, [result.venue_name]);
      console.log(`❌ Rejected: ${result.venue_name} - ${result.reason}`);
      rejected++;
    } else {
      console.log(`⏭️  Skipped: ${result.venue_name} - ${result.reason}`);
      skipped++;
    }
  }

  console.log(`\n📊 Summary: ${verified} verified, ${rejected} rejected, ${skipped} skipped`);
}

function printListMode(venues: VenueToVerify[]): void {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🔍 AGENT ATHENS - Unverified Venues                         ║');
  console.log('║     Use WebSearch to verify each venue location              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  if (venues.length === 0) {
    console.log('✅ No unverified venues! All venues are classified.');
    return;
  }

  console.log(`📋 ${venues.length} venues need verification:\n`);

  for (let i = 0; i < venues.length; i++) {
    const v = venues[i];
    console.log(`${i + 1}. "${v.venue_name}" (${v.event_count} events)`);
    console.log(`   Sample: ${v.sample_titles[0]}`);
    console.log(`   🔎 Search: "${v.venue_name} venue Greece address"`);
    console.log('');
  }

  console.log('─'.repeat(60));
  console.log('📝 After searching, Claude Code should:');
  console.log('   1. Update athens-venues.json for Athens venues');
  console.log('   2. Update rejected-locations.json for non-Athens venues');
  console.log('   3. Run: bun run scripts/filter-athens-only.ts');
}

function printExportMode(venues: VenueToVerify[]): void {
  // Output JSON for programmatic processing
  console.log(JSON.stringify(venues, null, 2));
}

function printHelpMode(): void {
  console.log(`
Auto-Verify Venues - Interactive Workflow Tool

USAGE:
  bun run scripts/auto-verify-venues.ts [options]

OPTIONS:
  --list              List unverified venues with search prompts (default)
  --limit=N           Limit to N venues (default: 50)
  --export            Export unverified venues as JSON
  --apply-results=F   Apply results from JSON file F
  --help              Show this help

WORKFLOW:
  1. Run with --list to see venues needing verification
  2. Use WebSearch to look up each venue's location
  3. Update config files:
     - config/athens-venues.json (for Athens venues)
     - config/rejected-locations.json (for non-Athens)
  4. Run: bun run scripts/filter-athens-only.ts

INTERACTIVE WORKFLOW (recommended):
  When Claude Code runs this script, it can directly:
  1. See unverified venues
  2. Use WebSearch tool to verify each
  3. Update config files
  4. Run location filter

EXAMPLE RESULTS FILE (for --apply-results):
  [
    {
      "venue_name": "Example Venue",
      "decision": "verify",
      "city": "Athens",
      "address": "123 Example St",
      "neighborhood": "Koukaki",
      "reason": "Confirmed Athens venue"
    },
    {
      "venue_name": "Other Place",
      "decision": "reject",
      "city": "Thessaloniki",
      "reason": "Located in Thessaloniki"
    }
  ]
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelpMode();
    return;
  }

  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 50;

  const resultsArg = args.find(a => a.startsWith('--apply-results='));
  if (resultsArg) {
    const filePath = resultsArg.split('=')[1];
    if (!existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      process.exit(1);
    }
    const results: VerificationResult[] = JSON.parse(readFileSync(filePath, 'utf-8'));
    applyResults(results);
    return;
  }

  const venues = getUnverifiedVenues(limit);

  if (args.includes('--export')) {
    printExportMode(venues);
  } else {
    printListMode(venues);
  }
}

main().catch(console.error);
