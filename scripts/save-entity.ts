#!/usr/bin/env bun
/**
 * Save Entity Knowledge
 *
 * UPSERTs to entity_knowledge table. Creates or updates entity records
 * for artists, venues, festivals, and promoters.
 *
 * Usage:
 *   bun run scripts/save-entity.ts --type=artist --name="Indira Paganotto" --genre='["techno"]' --bio="..."
 *   bun run scripts/save-entity.ts --type=venue --name="Gazarte" --bio="Multi-space venue in Gazi"
 *   bun run scripts/save-entity.ts --type=artist --name="Test" --source=manual --confidence=high
 */

import Database from 'bun:sqlite';

const DB_PATH = 'data/events.db';

interface EntityInput {
  type: string;
  name: string;
  bio?: string;
  genre?: string;
  notableWorks?: string;
  careerHighlights?: string;
  activeSince?: number;
  athensContext?: string;
  funFacts?: string;
  source?: string;
  sourceUrl?: string;
  confidence?: string;
}

function parseArgs(): EntityInput {
  const args = process.argv.slice(2);
  const get = (key: string): string | undefined => {
    const arg = args.find(a => a.startsWith(`--${key}=`));
    return arg?.split('=').slice(1).join('='); // rejoin in case value contains =
  };

  const type = get('type');
  const name = get('name');

  if (!type || !name) {
    console.error('Usage: bun run scripts/save-entity.ts --type=<type> --name=<name> [options]');
    console.error('');
    console.error('Required:');
    console.error('  --type=<artist|venue|festival|promoter>');
    console.error('  --name=<entity name>');
    console.error('');
    console.error('Optional:');
    console.error('  --bio="Biography text"');
    console.error('  --genre=\'["techno", "house"]\'  (JSON array)');
    console.error('  --notable-works="Work 1, Work 2"');
    console.error('  --career-highlights="Highlight text"');
    console.error('  --active-since=2015');
    console.error('  --athens-context="Athens-specific notes"');
    console.error('  --fun-facts="Interesting facts"');
    console.error('  --source=<manual|web_search|generic>');
    console.error('  --source-url=<url>');
    console.error('  --confidence=<high|medium|low>');
    process.exit(1);
  }

  const validTypes = ['artist', 'venue', 'festival', 'promoter'];
  if (!validTypes.includes(type)) {
    console.error(`Invalid type: ${type}. Must be one of: ${validTypes.join(', ')}`);
    process.exit(1);
  }

  const activeSinceStr = get('active-since');

  return {
    type,
    name,
    bio: get('bio'),
    genre: get('genre'),
    notableWorks: get('notable-works'),
    careerHighlights: get('career-highlights'),
    activeSince: activeSinceStr ? parseInt(activeSinceStr, 10) : undefined,
    athensContext: get('athens-context'),
    funFacts: get('fun-facts'),
    source: get('source') || 'manual',
    sourceUrl: get('source-url'),
    confidence: get('confidence') || 'medium',
  };
}

function main(): void {
  const entity = parseArgs();
  const canonicalName = entity.name.toLowerCase().trim();

  console.log(`\nSaving entity: ${entity.type} / ${entity.name}`);

  const db = new Database(DB_PATH);
  db.run('PRAGMA journal_mode = WAL;');
  db.run('PRAGMA foreign_keys = ON;');

  // Ensure entity_knowledge table exists
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='entity_knowledge'"
  ).get();

  if (!tableExists) {
    console.error('entity_knowledge table does not exist. Run migration first:');
    console.error('  bun run scripts/run-enrichment-v4-migration.ts');
    db.close();
    process.exit(1);
  }

  try {
    const result = db.prepare(`
      INSERT INTO entity_knowledge (
        entity_type, name, canonical_name, bio, genre, notable_works,
        career_highlights, active_since, athens_context, fun_facts,
        source, source_url, confidence, last_verified, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(entity_type, canonical_name) DO UPDATE SET
        name = excluded.name,
        bio = COALESCE(excluded.bio, bio),
        genre = COALESCE(excluded.genre, genre),
        notable_works = COALESCE(excluded.notable_works, notable_works),
        career_highlights = COALESCE(excluded.career_highlights, career_highlights),
        active_since = COALESCE(excluded.active_since, active_since),
        athens_context = COALESCE(excluded.athens_context, athens_context),
        fun_facts = COALESCE(excluded.fun_facts, fun_facts),
        source = excluded.source,
        source_url = COALESCE(excluded.source_url, source_url),
        confidence = excluded.confidence,
        last_verified = datetime('now'),
        updated_at = datetime('now')
    `).run(
      entity.type,
      entity.name,
      canonicalName,
      entity.bio || null,
      entity.genre || null,
      entity.notableWorks || null,
      entity.careerHighlights || null,
      entity.activeSince || null,
      entity.athensContext || null,
      entity.funFacts || null,
      entity.source || 'manual',
      entity.sourceUrl || null,
      entity.confidence || 'medium',
    );

    const action = result.changes > 0 ? 'Saved' : 'No changes';
    console.log(`${action}: ${entity.type}/${canonicalName}`);

    // Show current record
    const saved = db.prepare(
      "SELECT * FROM entity_knowledge WHERE entity_type = ? AND canonical_name = ?"
    ).get(entity.type, canonicalName) as any;

    if (saved) {
      console.log(`  ID: ${saved.id}`);
      console.log(`  Confidence: ${saved.confidence}`);
      console.log(`  Last verified: ${saved.last_verified}`);
      if (saved.bio) console.log(`  Bio: ${saved.bio.substring(0, 80)}...`);
    }
  } finally {
    db.close();
  }

  console.log('');
}

main();
