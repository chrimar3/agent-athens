/**
 * AI Parser Helper - For use with Claude Code (FREE)
 *
 * This module provides utilities for parsing emails/HTML with Claude Code interactively.
 * No API keys needed - uses your Claude Code subscription.
 */

export interface EmailToParse {
  subject: string;
  from: string;
  date: string;
  text: string;
  html: string;
  messageId: string;
}

/**
 * Generate parsing prompt for Claude Code
 *
 * Usage:
 * 1. Run email ingestion to save emails to data/emails-to-parse/
 * 2. Ask Claude Code: "Parse the emails saved in data/emails-to-parse/ and extract events"
 * 3. Claude Code will use this prompt template and save results
 */
export function generateEmailParsingPrompt(email: EmailToParse): string {
  return `Parse this Athens cultural events newsletter and extract all events.

Email Details:
- Subject: ${email.subject}
- From: ${email.from}
- Date: ${email.date}

Email Content:
${email.text || email.html}

Extract ALL events mentioned in this email. Return as a JSON array.

CRITICAL RULES:
1. Do NOT fabricate information. Only use data from the email.
2. If any field is missing, use these defaults:
   - time: "20:00"
   - type: "concert" (if music-related) or "performance" (otherwise)
   - genre: "general"
   - price: "with-ticket"
   - address: "Athens, Greece"
   - url: ""
   - short_description: ""
3. Use "open" not "free" for free events
4. Return ONLY valid JSON array (no markdown, no explanations)

Required format:
[
  {
    "title": "Event Name",
    "date": "2025-10-25",
    "time": "21:00",
    "venue": "Venue Name",
    "type": "concert",
    "genre": "jazz",
    "price": "open",
    "address": "123 Street, Athens",
    "url": "https://example.com/event",
    "short_description": "Brief description"
  }
]

Return JSON only:`;
}

/**
 * Parse JSON response, handling markdown code blocks
 */
export function parseJSONResponse(response: string): any {
  let cleaned = response.trim();

  // Remove markdown code blocks if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '');
  }

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.error('❌ Failed to parse JSON:', error);
    throw error;
  }
}
