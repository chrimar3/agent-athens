/**
 * HTML Parser with tool_agent (Claude Code)
 *
 * Parses event information from HTML using Claude Code tool_agent interactively.
 * This approach is free and leverages Claude Code's extended thinking capabilities.
 */

import type { RawEvent } from '../../src/types.js';

export interface HTMLParserOptions {
  source: string;
  language?: string;
}

/**
 * Parse events from HTML using Claude Code tool_agent
 *
 * This function prepares HTML for interactive parsing with Claude Code.
 * It does NOT automatically parse - you must use Claude Code interactively.
 *
 * @param html - Raw HTML content
 * @param options - Parser options
 * @returns Array of RawEvent objects (empty - requires manual Claude Code interaction)
 */
export async function parseHTMLEvents(
  html: string,
  options: HTMLParserOptions
): Promise<RawEvent[]> {
  throw new Error(
    'HTML parsing requires Claude Code tool_agent.\n\n' +
    'Steps:\n' +
    '1. Save HTML to a temp file: echo "..." > temp-events.html\n' +
    '2. Ask Claude Code: "Parse events from temp-events.html using the extraction prompt"\n' +
    '3. Claude Code will extract events and save to JSON\n' +
    '4. Import the JSON file manually\n\n' +
    'See html-parser.ts for the extraction prompt template.'
  );
}

/**
 * Create extraction prompt for Claude
 */
function createExtractionPrompt(
  html: string,
  source: string,
  language: string
): string {
  return `Extract all upcoming events from the following HTML from ${source}.

**Requirements:**
- Return ONLY valid JSON (no markdown, no explanations)
- Use this exact structure: {"events": [...]}
- Include ALL events found on the page
- Skip navigation, ads, footers, past events

**Event fields (all required except where noted):**
- title: Event title (string)
- date: Event date in YYYY-MM-DD format (string)
- time: Event time in HH:MM format (string, optional)
- venue: Venue name (string)
- location: Full address or area (string)
- type: Event type - one of: concert, exhibition, cinema, theater, performance, workshop, other (string)
- genre: Event genre or style (string)
- price: Price info - use "open" for free events, "with-ticket" for paid, or specific amount like "€15" (string)
- description: Brief description (string)
- url: Event URL if available (string, optional)
- source: "${source}" (string)

**Special handling:**
- Convert Greek dates to YYYY-MM-DD (e.g., "25 Οκτωβρίου 2025" -> "2025-10-25")
- Map Greek event types to English (συναυλία -> concert, έκθεση -> exhibition)
- For price: δωρεάν/free -> "open", any paid event -> "with-ticket" or specific amount
- Handle missing times gracefully (omit time field or use null)
- Normalize venue names (e.g., "Gazarte Roof Stage" -> "Gazarte")

**Input language:** ${language === 'el' ? 'Greek' : 'English'}

**HTML content:**
${html.substring(0, 50000)} ${html.length > 50000 ? '... (truncated)' : ''}

Return JSON only:`;
}

/**
 * Fetch HTML for manual parsing with Claude Code
 *
 * This function fetches HTML but does NOT automatically parse it.
 * Use Claude Code interactively to extract events.
 */
export async function fetchAndParseHTML(
  url: string,
  options: HTMLParserOptions
): Promise<RawEvent[]> {
  console.log(`\n⚠️  HTML fetching for Claude Code tool_agent:\n`);
  console.log(`1. Fetch HTML manually:`);
  console.log(`   curl "${url}" > temp-${options.source}.html\n`);
  console.log(`2. Ask Claude Code:`);
  console.log(`   "Parse events from temp-${options.source}.html using the extraction prompt from html-parser.ts"\n`);
  console.log(`3. Save results to:`);
  console.log(`   data/scraped-${options.source}.json\n`);

  throw new Error('HTML parsing requires manual Claude Code interaction (see instructions above)');
}

/**
 * CLAUDE CODE TOOL_AGENT WORKFLOW
 *
 * This parser is designed to work with Claude Code interactively (FREE, no API costs).
 *
 * **Workflow:**
 *
 * 1. **Fetch HTML manually:**
 *    ```bash
 *    curl "https://www.thisisathens.org/events" > temp-events.html
 *    ```
 *
 * 2. **Ask Claude Code to parse:**
 *    "Parse events from temp-events.html using the extraction prompt in html-parser.ts.
 *     Save the results to data/scraped-events.json"
 *
 * 3. **Claude Code will:**
 *    - Read the HTML file
 *    - Use the extraction prompt template below
 *    - Extract all events into structured JSON
 *    - Validate required fields
 *    - Save to data/scraped-events.json
 *
 * 4. **Import to database:**
 *    ```bash
 *    bun run scripts/import-scraped-events.ts
 *    ```
 *
 * **Benefits:**
 * - Free (uses your existing Claude Code subscription)
 * - More context window than API calls
 * - Extended thinking for better parsing
 * - Full transparency (you can review results before importing)
 *
 * **Trade-offs:**
 * - Requires manual interaction (not automated)
 * - 2-3 minutes per source vs instant API calls
 * - Best for daily/weekly scraping, not real-time
 */

/**
 * Validate extracted events have required fields
 */
export function validateExtractedEvents(events: any[]): RawEvent[] {
  const validated: RawEvent[] = [];

  for (const event of events) {
    // Check required fields
    if (!event.title || !event.date || !event.venue) {
      console.warn('[html-parser] Skipping event with missing required fields:', event);
      continue;
    }

    // Ensure proper structure
    const rawEvent: RawEvent = {
      title: String(event.title),
      date: String(event.date),
      time: event.time ? String(event.time) : undefined,
      venue: String(event.venue),
      location: String(event.location || event.venue),
      type: String(event.type || 'other'),
      genre: String(event.genre || 'general'),
      price: String(event.price || 'with-ticket'),
      description: String(event.description || ''),
      url: event.url ? String(event.url) : undefined,
      source: String(event.source)
    };

    validated.push(rawEvent);
  }

  return validated;
}
