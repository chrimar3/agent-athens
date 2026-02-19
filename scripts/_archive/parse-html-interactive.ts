#!/usr/bin/env bun
/**
 * Interactive HTML Parser for Claude Code
 * Processes HTML files and extracts events using Claude's context
 */

import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { DateTime } from "luxon";
import { upsertEvent, getEventStats } from "../src/db/database";
import type { Event } from "../src/types";
import crypto from "crypto";

const HTML_DIR = join(import.meta.dir, "../data/html-to-parse");
const PARSED_DIR = join(import.meta.dir, "../data/parsed");

interface ParsedEventRaw {
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  venue: string;
  type: string;
  genre: string;
  price_type: string; // "free" or "with-ticket"
  url?: string;
  description?: string;
}

/**
 * Generate unique event ID
 */
function generateEventId(title: string, date: string, venue: string): string {
  const normalized = `${title.toLowerCase().trim()}|${date}|${venue.toLowerCase().trim()}`;
  return crypto.createHash("sha256").update(normalized).digest("hex").substring(0, 16);
}

/**
 * Normalize event type to valid EventType
 */
function normalizeEventType(type: string): "concert" | "exhibition" | "cinema" | "theater" | "performance" | "workshop" | "other" {
  const normalized = type.toLowerCase().trim();

  if (normalized.includes("concert") || normalized.includes("music") || normalized.includes("jazz")) {
    return "concert";
  }
  if (normalized.includes("exhibition") || normalized.includes("art") || normalized.includes("gallery")) {
    return "exhibition";
  }
  if (normalized.includes("cinema") || normalized.includes("film") || normalized.includes("movie")) {
    return "cinema";
  }
  if (normalized.includes("theater") || normalized.includes("theatre") || normalized.includes("play")) {
    return "theater";
  }
  if (normalized.includes("performance") || normalized.includes("dance")) {
    return "performance";
  }
  if (normalized.includes("workshop") || normalized.includes("class")) {
    return "workshop";
  }

  return "other";
}

/**
 * Convert parsed raw event to Event object
 */
function convertToEvent(raw: ParsedEventRaw, source: string): Event {
  const id = generateEventId(raw.title, raw.date, raw.venue);
  const now = new Date().toISOString();

  // Parse time to create full ISO datetime
  let startDate = raw.date;
  if (raw.time) {
    const dt = DateTime.fromISO(`${raw.date}T${raw.time}:00`, { zone: "Europe/Athens" });
    startDate = dt.toISO() || raw.date;
  }

  return {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    id,
    title: raw.title,
    description: raw.description || "",
    startDate,
    endDate: undefined,
    type: normalizeEventType(raw.type),
    genres: [raw.genre],
    tags: [],
    venue: {
      name: raw.venue,
      address: raw.venue,
      neighborhood: undefined,
      coordinates: undefined,
      capacity: undefined,
    },
    price: {
      type: raw.price_type === "free" ? "free" : "paid",
      amount: undefined,
      currency: "EUR",
      range: undefined,
    },
    url: raw.url,
    source,
    createdAt: now,
    updatedAt: now,
    language: "en",
  };
}

/**
 * Get HTML file info for parsing
 */
export function getHtmlFileInfo(filename: string): { html: string; metadata: any; truncated: string } {
  const htmlPath = join(HTML_DIR, filename);
  const metadataPath = htmlPath.replace(".html", ".json");

  let metadata: any = {};
  try {
    metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
  } catch {
    console.warn("⚠️  No metadata file found");
  }

  const html = readFileSync(htmlPath, "utf-8");
  const truncated = html.length > 50000 ? html.substring(0, 50000) + "\n...[truncated]" : html;

  return { html, metadata, truncated };
}

/**
 * Generate parsing prompt for Claude
 */
export function generateParsingPrompt(filename: string): string {
  const info = getHtmlFileInfo(filename);
  const { metadata, truncated } = info;

  const siteName = metadata.site_name || "Unknown Site";
  const sourceUrl = metadata.url || "";

  return `Extract ALL cultural events from this HTML page.

Source: ${siteName}
URL: ${sourceUrl}
File: ${filename}

For EACH event found, extract:
- title (event name)
- date (YYYY-MM-DD format, if range use start date)
- time (HH:MM in 24-hour format, or null if not available)
- venue (venue/location name)
- type (concert/theater/exhibition/cinema/performance/workshop)
- genre (specific genre like "jazz", "rock", "contemporary-art")
- price_type ("free" or "with-ticket")
- url (event detail page URL, full URL starting with https://)
- description (brief description if available)

CRITICAL RULES:
1. Do NOT fabricate any information
2. Skip events with missing critical fields (title, date, venue)
3. Convert all dates to YYYY-MM-DD format
4. Only extract events in Athens, Greece (skip other cities)
5. Return ONLY valid JSON array, no other text
6. If no events found, return empty array: []

Example output format:
[
  {
    "title": "Jazz Night at Half Note",
    "date": "2025-10-28",
    "time": "21:00",
    "venue": "Half Note Jazz Club",
    "type": "concert",
    "genre": "jazz",
    "price_type": "with-ticket",
    "url": "https://example.com/event",
    "description": "An evening of jazz music"
  }
]

HTML Content:
${truncated}`;
}

/**
 * Import parsed events to database
 */
export function importParsedEvents(events: ParsedEventRaw[], source: string): {
  added: number;
  updated: number;
  rejected: number;
  errors: number;
} {
  const stats = { added: 0, updated: 0, rejected: 0, errors: 0 };

  for (const rawEvent of events) {
    try {
      const event = convertToEvent(rawEvent, source);
      const result = upsertEvent(event);

      if (result.success) {
        if (result.isNew) {
          stats.added++;
          console.log(`  ✅ Added: ${event.title}`);
        } else {
          stats.updated++;
          console.log(`  🔄 Updated: ${event.title}`);
        }
      } else {
        stats.rejected++;
        console.log(`  ⏭️  Rejected: ${rawEvent.title} (non-Athens)`);
      }
    } catch (error) {
      console.error(`  ❌ Error importing: ${rawEvent.title}`, error);
      stats.errors++;
    }
  }

  return stats;
}

/**
 * Save parsed events to JSON file for review
 */
export function saveParsedEvents(filename: string, events: ParsedEventRaw[]): void {
  const outputPath = join(PARSED_DIR, filename.replace(".html", "-parsed.json"));
  writeFileSync(outputPath, JSON.stringify(events, null, 2));
  console.log(`💾 Saved to: ${outputPath}`);
}

/**
 * List all HTML files to parse
 */
export function listHtmlFiles(limit?: number): string[] {
  const files = readdirSync(HTML_DIR)
    .filter(f => f.endsWith(".html"))
    .sort();

  return limit ? files.slice(0, limit) : files;
}

/**
 * Main execution - for command line use
 */
if (import.meta.main) {
  console.log("🚀 Interactive HTML Parser\n");

  const files = listHtmlFiles(10);
  console.log(`📋 Found ${files.length} HTML files (showing first 10):\n`);

  files.forEach((file, i) => {
    console.log(`${i + 1}. ${file}`);
  });

  console.log("\n📝 To parse a file:");
  console.log('   const { generateParsingPrompt, importParsedEvents } = await import("./parse-html-interactive.ts");');
  console.log('   const prompt = generateParsingPrompt("filename.html");');
  console.log('   // Send prompt to Claude, get JSON response');
  console.log('   const events = JSON.parse(response);');
  console.log('   importParsedEvents(events, "source-name");');
}
