#!/usr/bin/env bun
/**
 * Enrich Batch 2 Events (20 events)
 * Generates 400-word cultural descriptions using Claude AI
 */

import Anthropic from "@anthropic-ai/sdk";
import { updateEventEnrichment } from "../src/db/database.ts";
import batch2Data from "../data/enrichment-batches/batch-2-of-13.json";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface BatchEvent {
  id: string;
  title: string;
  type: string;
  start_date: string;
  venue_name: string;
  genres: string;
  url: string;
  description: string;
}

interface EnrichmentResult {
  eventId: string;
  title: string;
  wordCount: number;
  success: boolean;
  error?: string;
}

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

/**
 * Generate enriched description for an event
 */
async function generateEnrichedDescription(event: BatchEvent): Promise<string> {
  const genres = JSON.parse(event.genres || "[]");
  const eventDate = new Date(event.start_date);
  const formattedDate = eventDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const eventTime = eventDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const prompt = `You are a cultural storyteller for Athens events. Generate a compelling 400-word description for this event.

EVENT DETAILS:
- Title: ${event.title}
- Type: ${event.type}
- Date: ${formattedDate}
- Time: ${eventTime}
- Venue: ${event.venue_name}
- Genres: ${genres.join(", ") || "N/A"}
- Original Description: ${event.description}

REQUIREMENTS:
1. Target exactly 400 words (acceptable range: 380-420 words)
2. Tell the cultural story - what makes this event special
3. Include practical details naturally (time, venue, atmosphere)
4. Add Athens cultural context when relevant
5. Use authentic storytelling, avoid marketing fluff
6. NEVER fabricate facts - only use provided information
7. Write in English (event is Greek but description for broader audience)

STRUCTURE GUIDELINES:
- Opening: Hook the reader with what makes this event unique
- Middle: Weave in cultural context, artist background (if known), venue atmosphere
- Practical: Naturally integrate date, time, venue, genre information
- Closing: Create anticipation and call to experience

Write the enriched description now (400 words):`;

  const message = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    temperature: 0.7,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const content = message.content[0];
  if (content.type === "text") {
    return content.text;
  }

  throw new Error("Unexpected response format from Claude");
}

/**
 * Process a single event
 */
async function processEvent(event: BatchEvent): Promise<EnrichmentResult> {
  console.log(`\n📝 Processing: ${event.title}`);

  try {
    const enrichedDescription = await generateEnrichedDescription(event);
    const wordCount = countWords(enrichedDescription);

    console.log(`   Generated: ${wordCount} words`);

    // Validate word count
    if (wordCount < 350 || wordCount > 450) {
      console.warn(`   ⚠️  Word count outside acceptable range: ${wordCount}`);
    }

    // Update database
    const aiContext = {
      enriched: true,
      wordCount,
      enrichedAt: new Date().toISOString(),
      batch: 2,
      model: "claude-3-5-sonnet-20241022",
    };

    const success = updateEventEnrichment(
      event.id,
      enrichedDescription,
      aiContext
    );

    if (success) {
      console.log(`   ✅ Successfully updated database`);
      return {
        eventId: event.id,
        title: event.title,
        wordCount,
        success: true,
      };
    } else {
      console.error(`   ❌ Failed to update database`);
      return {
        eventId: event.id,
        title: event.title,
        wordCount,
        success: false,
        error: "Database update failed",
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`   ❌ Error: ${errorMessage}`);
    return {
      eventId: event.id,
      title: event.title,
      wordCount: 0,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log("🚀 Starting Batch 2 Enrichment");
  console.log(`📊 Total events to process: ${batch2Data.length}`);
  console.log("=" .repeat(60));

  const results: EnrichmentResult[] = [];

  for (const event of batch2Data) {
    const result = await processEvent(event);
    results.push(result);

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Generate summary
  console.log("\n" + "=".repeat(60));
  console.log("📈 BATCH 2 ENRICHMENT SUMMARY");
  console.log("=".repeat(60));

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const totalWords = successful.reduce((sum, r) => sum + r.wordCount, 0);
  const avgWords = successful.length > 0 ? totalWords / successful.length : 0;

  console.log(`\n✅ Successfully enriched: ${successful.length}/${batch2Data.length}`);
  console.log(`❌ Failed: ${failed.length}`);
  console.log(`📝 Total words generated: ${totalWords.toLocaleString()}`);
  console.log(`📊 Average words per description: ${avgWords.toFixed(1)}`);

  if (failed.length > 0) {
    console.log("\n❌ Failed Events:");
    failed.forEach((f) => {
      console.log(`   - ${f.title} (${f.eventId}): ${f.error}`);
    });
  }

  // Word count distribution
  const wordCounts = successful.map((r) => r.wordCount).sort((a, b) => a - b);
  if (wordCounts.length > 0) {
    console.log("\n📊 Word Count Distribution:");
    console.log(`   Min: ${wordCounts[0]}`);
    console.log(`   Max: ${wordCounts[wordCounts.length - 1]}`);
    console.log(`   Median: ${wordCounts[Math.floor(wordCounts.length / 2)]}`);
  }

  console.log("\n✨ Batch 2 enrichment complete!");
}

// Run the script
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
