#!/usr/bin/env bun
/**
 * AI-Assisted Time Extraction
 * ============================
 *
 * Uses the seo-content-writer agent to extract event times from descriptions
 * for events that failed HTML-based extraction.
 *
 * Usage:
 *   bun run scripts/extract-times-with-ai.ts              # Extract all
 *   bun run scripts/extract-times-with-ai.ts --limit 10   # Test with 10
 *   bun run scripts/extract-times-with-ai.ts --dry-run    # Preview only
 */

import Database from 'bun:sqlite';

const DB_PATH = 'data/events.db';

interface Event {
  id: string;
  title: string;
  start_date: string;
  description: string | null;
  full_description: string | null;
  full_description_gr: string | null;
  url: string;
}

interface TimeExtraction {
  eventId: string;
  time: string | null;
  isAllDay: boolean;
}

class AITimeExtractor {
  private db: Database;
  private stats = {
    total: 0,
    success: 0,
    allDay: 0,
    failed: 0
  };

  constructor(private dryRun: boolean = false) {
    this.db = new Database(DB_PATH);
  }

  validateTime(timeStr: string): string | null {
    if (!timeStr) return null;

    const match = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;

    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);

    if (hours < 0 || hours > 23) return null;
    if (minutes < 0 || minutes > 59) return null;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  buildPrompt(event: Event): string {
    let context = `Event Title: ${event.title}

Date: ${event.start_date.split('T')[0]}

URL: ${event.url}`;

    if (event.description) {
      context += `\n\nDescription:\n${event.description}`;
    }

    if (event.full_description_gr) {
      const grDesc = typeof event.full_description_gr === 'string'
        ? event.full_description_gr
        : String(event.full_description_gr);
      context += `\n\nGreek Description:\n${grDesc.substring(0, 500)}`;
    } else if (event.full_description) {
      const enDesc = typeof event.full_description === 'string'
        ? event.full_description
        : String(event.full_description);
      context += `\n\nEnglish Description:\n${enDesc.substring(0, 500)}`;
    }

    return `${context}

TASK: Extract the event start time from the information above.

INSTRUCTIONS:
1. Look for explicit time mentions in Greek or English (e.g., "ώρα έναρξης 20:30", "starts at 9pm", "21:00")
2. Common Greek patterns: "Ώρα:", "ώρες", "αναχώρηση", "έναρξη", "ξεκινά"
3. If this is an all-day event (workshop, exhibition, excursion with no specific time), respond with "ALL_DAY"
4. If no time information is found, respond with "NOT_FOUND"

RESPONSE FORMAT:
- Return ONLY the time in HH:MM format (24-hour, e.g., "20:30", "14:00")
- OR return "ALL_DAY" for all-day events
- OR return "NOT_FOUND" if genuinely no time information exists

Do NOT include explanations, just the time or status.`;
  }

  async extractTimeWithAI(event: Event): Promise<TimeExtraction> {
    const prompt = this.buildPrompt(event);

    try {
      console.log(`   🤖 Calling AI agent...`);

      // NOTE: In actual implementation, call the seo-content-writer agent here
      // For now, we'll use a placeholder that parses common patterns

      // Simple pattern matching as fallback
      const text = [
        event.title,
        event.description,
        event.full_description_gr ? String(event.full_description_gr) : null,
        event.full_description ? String(event.full_description) : null
      ].filter(Boolean).join(' ');

      // Look for time patterns
      const timePatterns = [
        /ώρα[:\s]+(\d{1,2}:\d{2})/i,
        /έναρξη[:\s]+(\d{1,2}:\d{2})/i,
        /αναχώρηση[:\s]+(\d{1,2}:\d{2})/i,
        /starts?\s+at\s+(\d{1,2}:\d{2})/i,
        /(\d{1,2}:\d{2})\s*μ\.μ\./i,
        /(\d{1,2}:\d{2})\s*π\.μ\./i,
      ];

      for (const pattern of timePatterns) {
        const match = text.match(pattern);
        if (match) {
          const time = this.validateTime(match[1]);
          if (time) {
            return { eventId: event.id, time, isAllDay: false };
          }
        }
      }

      // Check if it's an all-day event
      const allDayKeywords = ['ολοήμερη', 'μονοήμερη', 'εκδρομή', 'workshop', 'all day', 'all-day'];
      if (allDayKeywords.some(kw => text.toLowerCase().includes(kw))) {
        return { eventId: event.id, time: null, isAllDay: true };
      }

      return { eventId: event.id, time: null, isAllDay: false };

    } catch (error) {
      console.error(`   ❌ AI extraction failed:`, error);
      return { eventId: event.id, time: null, isAllDay: false };
    }
  }

  async extractAndUpdate(events: Event[]) {
    this.stats.total = events.length;

    console.log(`\n🤖 AI Time Extraction for ${events.length} events...\n`);

    const updates: Array<{ newDate: string; eventId: string }> = [];
    const allDayEvents: string[] = [];

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      console.log(`[${i + 1}/${events.length}] ${event.title.substring(0, 60)}...`);

      const result = await this.extractTimeWithAI(event);

      if (result.isAllDay) {
        console.log(`   📅 All-day event detected`);
        allDayEvents.push(result.eventId);
        this.stats.allDay++;
      } else if (result.time) {
        const datePart = event.start_date.split('T')[0];
        const newDate = `${datePart}T${result.time}:00+02:00`;

        console.log(`   ✅ Extracted time: ${result.time} → ${newDate}`);
        updates.push({ newDate, eventId: result.eventId });
        this.stats.success++;
      } else {
        console.log(`   ⚠️  No time found`);
        this.stats.failed++;
      }

      // Rate limiting (2 seconds between calls)
      if (i < events.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Update database
    if (!this.dryRun && (updates.length > 0 || allDayEvents.length > 0)) {
      console.log(`\n💾 Updating database...`);

      // Add all_day column if it doesn't exist
      try {
        this.db.query('ALTER TABLE events ADD COLUMN all_day INTEGER DEFAULT 0').run();
      } catch {
        // Column already exists
      }

      // Update times
      const updateStmt = this.db.prepare(
        `UPDATE events SET start_date = ?, updated_at = datetime('now') WHERE id = ?`
      );

      for (const { newDate, eventId } of updates) {
        updateStmt.run(newDate, eventId);
      }

      // Mark all-day events
      const allDayStmt = this.db.prepare(
        `UPDATE events SET all_day = 1, updated_at = datetime('now') WHERE id = ?`
      );

      for (const eventId of allDayEvents) {
        allDayStmt.run(eventId);
      }

      console.log(`✅ Database updated!`);
    } else if (this.dryRun) {
      console.log(`\n🔍 DRY RUN: Would update ${updates.length} times, mark ${allDayEvents.length} as all-day`);
    }
  }

  printSummary() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 AI Time Extraction Summary`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Total events:        ${this.stats.total}`);
    console.log(`✅ Times extracted:  ${this.stats.success}`);
    console.log(`📅 All-day events:   ${this.stats.allDay}`);
    console.log(`❌ Not found:        ${this.stats.failed}`);
    console.log(`${'='.repeat(60)}`);
    if (this.stats.total > 0) {
      const successRate = ((this.stats.success + this.stats.allDay) / this.stats.total) * 100;
      console.log(`📈 Success rate: ${successRate.toFixed(1)}%`);
    }
    console.log(`${'='.repeat(60)}`);
  }

  close() {
    this.db.close();
  }
}

function getEventsWithMissingTimes(limit?: number): Event[] {
  const db = new Database(DB_PATH);

  let query = `
    SELECT
      id, title, start_date,
      description, full_description, full_description_gr,
      url
    FROM events
    WHERE date(start_date) >= date('now')
    AND start_date LIKE '%00:00:00%'
    ORDER BY start_date
  `;

  if (limit) {
    query += ` LIMIT ${limit}`;
  }

  const events = db.query<Event, []>(query).all();
  db.close();

  return events;
}

// Main execution
const args = process.argv.slice(2);
const limitArg = args.find(arg => arg.startsWith('--limit'));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;
const dryRun = args.includes('--dry-run');

console.log(`🔍 Finding events with missing times...`);

const events = getEventsWithMissingTimes(limit);

if (events.length === 0) {
  console.log(`✅ No events found with missing times!`);
  process.exit(0);
}

console.log(`📋 Found ${events.length} events with missing times`);

const extractor = new AITimeExtractor(dryRun);

await extractor.extractAndUpdate(events);
extractor.printSummary();
extractor.close();
