#!/usr/bin/env bun
/**
 * Parse ALL HTML files from data/html-to-parse/ directory
 * Extracts events using tool_agent AI and imports to database
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { DateTime } from "luxon";
import { upsertEvent, getEventStats } from "../src/db/database";
import type { Event } from "../src/types";
import crypto from "crypto";

const HTML_DIR = join(import.meta.dir, "../data/html-to-parse");
const RATE_LIMIT_MS = 2000; // 2 seconds between AI calls

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

interface ParseStats {
  filesProcessed: number;
  eventsExtracted: number;
  eventsAdded: number;
  eventsUpdated: number;
  duplicatesSkipped: number;
  nonAthensRejected: number;
  errors: number;
}

/**
 * Call tool_agent for AI parsing (FREE)
 */
async function callToolAgent(prompt: string): Promise<string> {
  try {
    const response = await fetch("http://localhost:3000/api/tool-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      throw new Error(`tool_agent error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.response || "";
  } catch (error) {
    console.error("❌ tool_agent call failed:", error);
    throw error;
  }
}

/**
 * Generate unique event ID
 */
function generateEventId(title: string, date: string, venue: string): string {
  const normalized = `${title.toLowerCase().trim()}|${date}|${venue.toLowerCase().trim()}`;
  return crypto.createHash("sha256").update(normalized).digest("hex").substring(0, 16);
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
    // Convert to ISO datetime
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
      address: raw.venue, // Will be enriched later
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
 * Parse single HTML file
 */
async function parseHtmlFile(htmlPath: string, metadataPath: string): Promise<ParsedEventRaw[]> {
  console.log(`\n🔄 Processing: ${htmlPath.split("/").pop()}`);

  // Read metadata
  let metadata: any = {};
  try {
    metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
  } catch {
    console.warn("⚠️  No metadata file found, using defaults");
  }

  // Read HTML
  const html = readFileSync(htmlPath, "utf-8");
  const siteName = metadata.site_name || "Unknown Site";
  const sourceUrl = metadata.url || "";

  // Truncate HTML if too large (max 50KB for AI parsing)
  const htmlTruncated = html.length > 50000 ? html.substring(0, 50000) + "\n...[truncated]" : html;

  const prompt = `Extract ALL cultural events from this HTML page.

Source: ${siteName}
URL: ${sourceUrl}

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
${htmlTruncated}`;

  try {
    const response = await callToolAgent(prompt);

    // Extract JSON from response (may have markdown code blocks)
    let jsonStr = response.trim();
    if (jsonStr.includes("```json")) {
      jsonStr = jsonStr.split("```json")[1].split("```")[0].trim();
    } else if (jsonStr.includes("```")) {
      jsonStr = jsonStr.split("```")[1].split("```")[0].trim();
    }

    const events = JSON.parse(jsonStr);

    if (!Array.isArray(events)) {
      console.error("❌ Response is not an array");
      return [];
    }

    console.log(`✅ Extracted ${events.length} events`);
    return events;

  } catch (error) {
    console.error("❌ Parse error:", error);
    return [];
  }
}

/**
 * Main execution
 */
async function main() {
  console.log("🚀 Starting HTML parsing process...\n");
  console.log("📂 Directory:", HTML_DIR);

  const stats: ParseStats = {
    filesProcessed: 0,
    eventsExtracted: 0,
    eventsAdded: 0,
    eventsUpdated: 0,
    duplicatesSkipped: 0,
    nonAthensRejected: 0,
    errors: 0,
  };

  // Get initial DB stats
  const initialStats = getEventStats();
  console.log(`\n📊 Initial database: ${initialStats.total} events\n`);

  // Get all HTML files
  const files = readdirSync(HTML_DIR).filter(f => f.endsWith(".html"));
  console.log(`📋 Found ${files.length} HTML files to process\n`);

  let fileIndex = 0;
  for (const htmlFile of files) {
    fileIndex++;
    const htmlPath = join(HTML_DIR, htmlFile);
    const metadataPath = htmlPath.replace(".html", ".json");

    try {
      // Parse HTML file
      const rawEvents = await parseHtmlFile(htmlPath, metadataPath);
      stats.filesProcessed++;
      stats.eventsExtracted += rawEvents.length;

      // Import events to database
      for (const rawEvent of rawEvents) {
        try {
          const source = htmlFile.replace(".html", "");
          const event = convertToEvent(rawEvent, source);
          const result = upsertEvent(event);

          if (result.success) {
            if (result.isNew) {
              stats.eventsAdded++;
            } else {
              stats.eventsUpdated++;
            }
          } else {
            // Event was rejected (likely non-Athens)
            stats.nonAthensRejected++;
          }
        } catch (error) {
          console.error(`❌ Error importing event: ${rawEvent.title}`, error);
          stats.errors++;
        }
      }

      // Rate limiting
      if (fileIndex < files.length) {
        console.log(`⏳ Waiting ${RATE_LIMIT_MS / 1000}s before next file...`);
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
      }

      // Progress update every 10 files
      if (fileIndex % 10 === 0) {
        console.log(`\n📊 Progress: ${fileIndex}/${files.length} files processed`);
        console.log(`   Events: ${stats.eventsAdded} new, ${stats.eventsUpdated} updated, ${stats.nonAthensRejected} rejected\n`);
      }

    } catch (error) {
      console.error(`❌ File processing error: ${htmlFile}`, error);
      stats.errors++;
    }
  }

  // Final summary
  const finalStats = getEventStats();

  console.log("\n" + "=".repeat(60));
  console.log("📊 FINAL SUMMARY");
  console.log("=".repeat(60));
  console.log(`\n📁 Files Processed: ${stats.filesProcessed} / ${files.length}`);
  console.log(`\n📥 Events Extracted: ${stats.eventsExtracted}`);
  console.log(`   ✅ New events added: ${stats.eventsAdded}`);
  console.log(`   🔄 Events updated: ${stats.eventsUpdated}`);
  console.log(`   ⏭️  Duplicates skipped: ${stats.duplicatesSkipped}`);
  console.log(`   🚫 Non-Athens rejected: ${stats.nonAthensRejected}`);
  console.log(`   ❌ Errors: ${stats.errors}`);
  console.log(`\n💾 Database Status:`);
  console.log(`   Before: ${initialStats.total} events`);
  console.log(`   After: ${finalStats.total} events`);
  console.log(`   Change: +${finalStats.total - initialStats.total} events`);
  console.log("\n" + "=".repeat(60));

  // Show breakdown by type
  console.log("\n📊 Events by Type:");
  Object.entries(finalStats.byType).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`);
  });

  console.log("\n📊 Events by Price:");
  Object.entries(finalStats.byPriceType).forEach(([priceType, count]) => {
    console.log(`   ${priceType}: ${count}`);
  });

  console.log("\n✅ Processing complete!\n");
}

// Run
main().catch(console.error);
