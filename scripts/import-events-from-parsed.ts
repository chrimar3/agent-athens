#!/usr/bin/env bun
/**
 * Import events from data/parsed/events.json into database
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { upsertEvent, getEventStats } from '../src/db/database';
import type { Event } from '../src/types';
import crypto from 'crypto';

const PARSED_FILE = join(import.meta.dir, '../data/parsed/events.json');

interface RawParsedEvent {
  title: string;
  date: string;
  time?: string;
  venue: string;
  type: string;
  genre: string;
  price: string;
  url?: string;
  short_description?: string;
  source_name?: string;
  source_file?: string;
}

/**
 * Generate unique event ID
 */
function generateEventId(title: string, date: string, venue: string): string {
  const normalized = `${title.toLowerCase().trim()}|${date}|${venue.toLowerCase().trim()}`;
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Normalize event type
 */
function normalizeEventType(type: string): 'concert' | 'exhibition' | 'cinema' | 'theater' | 'performance' | 'workshop' | 'other' {
  const normalized = type.toLowerCase().trim();

  if (normalized.includes('concert') || normalized.includes('music')) return 'concert';
  if (normalized.includes('exhibition') || normalized.includes('art')) return 'exhibition';
  if (normalized.includes('cinema') || normalized.includes('film')) return 'cinema';
  if (normalized.includes('theater') || normalized.includes('theatre')) return 'theater';
  if (normalized.includes('performance') || normalized.includes('dance')) return 'performance';
  if (normalized.includes('workshop') || normalized.includes('class')) return 'workshop';

  return 'other';
}

/**
 * Convert raw parsed event to Event object
 */
function convertToEvent(raw: RawParsedEvent): Event {
  const id = generateEventId(raw.title, raw.date, raw.venue);
  const now = new Date().toISOString();

  // Create ISO datetime (Athens timezone is UTC+2 or UTC+3)
  let startDate = raw.date;
  if (raw.time) {
    startDate = `${raw.date}T${raw.time}:00+02:00`;
  } else {
    // Default to 20:00 if no time specified
    startDate = `${raw.date}T20:00:00+02:00`;
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    id,
    title: raw.title,
    description: raw.short_description || '',
    startDate,
    endDate: undefined,
    type: normalizeEventType(raw.type),
    genres: raw.genre ? [raw.genre] : [],
    tags: [],
    venue: {
      name: raw.venue,
      address: raw.venue,
      neighborhood: undefined,
      coordinates: undefined,
      capacity: undefined,
    },
    price: {
      type: raw.price === 'free' || raw.price === 'open' ? 'free' : 'paid',
      amount: undefined,
      currency: 'EUR',
      range: undefined,
    },
    url: raw.url,
    source: raw.source_name || raw.source_file || 'parsed-events',
    createdAt: now,
    updatedAt: now,
    language: 'en',
  };
}

async function main() {
  console.log('📥 Importing parsed events from data/parsed/events.json\n');

  // Get initial stats
  const initialStats = getEventStats();
  console.log(`📊 Initial database: ${initialStats.total} events\n`);

  // Load parsed events
  const rawEvents: RawParsedEvent[] = JSON.parse(readFileSync(PARSED_FILE, 'utf-8'));
  console.log(`📋 Found ${rawEvents.length} parsed events\n`);

  // Import stats
  let added = 0;
  let updated = 0;
  let rejected = 0;
  let errors = 0;

  console.log('🔄 Importing events...\n');

  for (let i = 0; i < rawEvents.length; i++) {
    const raw = rawEvents[i];

    try {
      const event = convertToEvent(raw);
      const result = upsertEvent(event);

      if (result.success) {
        if (result.isNew) {
          added++;
          if (added % 100 === 0) {
            console.log(`  ✅ Added ${added} events...`);
          }
        } else {
          updated++;
        }
      } else {
        rejected++;
      }
    } catch (error) {
      errors++;
      console.error(`❌ Error importing event ${i + 1}: ${raw.title}`, error);
    }
  }

  // Final stats
  const finalStats = getEventStats();

  console.log('\n' + '='.repeat(60));
  console.log('📊 IMPORT SUMMARY');
  console.log('='.repeat(60));
  console.log(`\n📥 Events Processed: ${rawEvents.length}`);
  console.log(`   ✅ New events added: ${added}`);
  console.log(`   🔄 Events updated: ${updated}`);
  console.log(`   🚫 Non-Athens rejected: ${rejected}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log(`\n💾 Database Status:`);
  console.log(`   Before: ${initialStats.total} events`);
  console.log(`   After: ${finalStats.total} events`);
  console.log(`   Change: +${finalStats.total - initialStats.total} events`);

  console.log('\n📊 Events by Type:');
  Object.entries(finalStats.byType).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`);
  });

  console.log('\n📊 Events by Price:');
  Object.entries(finalStats.byPriceType).forEach(([priceType, count]) => {
    console.log(`   ${priceType}: ${count}`);
  });

  console.log('\n✅ Import complete!\n');
}

main().catch(console.error);
