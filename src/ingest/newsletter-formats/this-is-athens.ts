/**
 * This Is Athens Newsletter Parser
 *
 * Parses events from This Is Athens weekly newsletter emails.
 * Supports both HTML and plain text parsing with fallback.
 *
 * @see specs/001-data-pipeline/tasks.md (Task 4.4)
 * @see tests/fixtures/sample-emails/this-is-athens-sample.json
 */

// ============================================================================
// Types
// ============================================================================

export interface ParsedEvent {
  title: string;
  date: string;           // YYYY-MM-DD or date range
  time: string;           // HH:MM (24-hour)
  venue: string;
  type: 'concert' | 'exhibition' | 'cinema' | 'theater' | 'performance' | 'workshop';
  genre?: string;
  price: 'open' | 'with-ticket';
  priceDetails?: string;  // e.g., "€15-€25"
  description: string;
  source: string;
}

export interface EmailContent {
  messageId: string;
  subject: string;
  from: string;
  date: string;
  text: string;
  html: string;
}

export interface ParseResult {
  success: boolean;
  events: ParsedEvent[];
  errors: string[];
  rawEventCount: number;  // Events found before filtering
}

// ============================================================================
// Main Parser Function
// ============================================================================

/**
 * Parse This Is Athens newsletter email
 *
 * @param email - Email content to parse
 * @returns Parse result with extracted events
 */
export function parseThisIsAthensEmail(email: EmailContent): ParseResult {
  const result: ParseResult = {
    success: false,
    events: [],
    errors: [],
    rawEventCount: 0,
  };

  try {
    // Try HTML parsing first, fall back to text
    const events = email.html
      ? parseHtml(email.html)
      : parseText(email.text);

    result.rawEventCount = events.length;
    result.events = events;
    result.success = events.length > 0;
  } catch (error) {
    result.errors.push((error as Error).message);
  }

  return result;
}

// ============================================================================
// HTML Parsing
// ============================================================================

/**
 * Parse events from HTML content
 */
export function parseHtml(html: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];

  // Find event sections using regex
  const eventPattern = /<div class="event">([\s\S]*?)<\/div>/gi;
  let match;

  while ((match = eventPattern.exec(html)) !== null) {
    const eventHtml = match[1];
    const event = extractEventFromHtml(eventHtml);
    if (event) {
      events.push(event);
    }
  }

  return events;
}

/**
 * Extract event data from HTML event block
 */
function extractEventFromHtml(html: string): ParsedEvent | null {
  // Extract title from h3
  const titleMatch = html.match(/<h3>([^<]+)<\/h3>/i);
  if (!titleMatch) return null;

  const title = titleMatch[1].trim();

  // Extract fields
  const dateMatch = html.match(/<strong>Date:<\/strong>\s*([^<]+)/i);
  const timeMatch = html.match(/<strong>Time:<\/strong>\s*([^<]+)/i);
  const venueMatch = html.match(/<strong>Venue:<\/strong>\s*([^<]+)/i);
  const priceMatch = html.match(/<strong>Price:<\/strong>\s*([^<]+)/i);

  // Get description (p tag after price, containing text without strong)
  const descMatch = html.match(/<p>(?!<strong>)([^<]+)<\/p>/gi);
  const description = descMatch ? descMatch[descMatch.length - 1].replace(/<\/?p>/gi, '').trim() : '';

  // Determine event type from section context
  const type = determineEventType(title, html);

  // Parse date
  const dateStr = dateMatch ? dateMatch[1].trim() : '';
  const parsedDate = parseDateString(dateStr);

  // Parse time
  const timeStr = timeMatch ? timeMatch[1].trim() : '';
  const parsedTime = parseTimeString(timeStr);

  // Determine price type
  const priceStr = priceMatch ? priceMatch[1].trim() : '';
  const priceType = priceStr.toLowerCase().includes('free') ? 'open' : 'with-ticket';

  return {
    title,
    date: parsedDate,
    time: parsedTime,
    venue: venueMatch ? venueMatch[1].trim() : '',
    type,
    price: priceType,
    priceDetails: priceStr,
    description,
    source: 'this-is-athens',
  };
}

// ============================================================================
// Text Parsing
// ============================================================================

/**
 * Parse events from plain text content
 */
export function parseText(text: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const lines = text.split('\n');

  let currentEvent: Partial<ParsedEvent> | null = null;
  let currentSection = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect section headers
    if (line.includes('CONCERTS') || line.includes('🎵')) {
      currentSection = 'concert';
      continue;
    }
    if (line.includes('THEATER') || line.includes('🎭')) {
      currentSection = 'theater';
      continue;
    }
    if (line.includes('EXHIBITIONS') || line.includes('🖼️')) {
      currentSection = 'exhibition';
      continue;
    }

    // Detect event title (line without Date:/Time:/Venue:/Price:)
    if (line && !line.startsWith('Date:') && !line.startsWith('Time:') &&
        !line.startsWith('Venue:') && !line.startsWith('Price:') &&
        !line.startsWith('---') && !line.includes('This Is Athens') &&
        currentSection) {

      // Check if this could be a title (no colon, reasonable length)
      if (!line.includes(':') && line.length < 100 && line.length > 3) {
        // Save previous event if exists
        if (currentEvent && currentEvent.title) {
          events.push(currentEvent as ParsedEvent);
        }

        currentEvent = {
          title: line,
          type: currentSection as ParsedEvent['type'],
          source: 'this-is-athens',
          price: 'with-ticket',
        };
        continue;
      }
    }

    // Parse event fields
    if (currentEvent) {
      if (line.startsWith('Date:')) {
        const dateStr = line.replace('Date:', '').trim();
        currentEvent.date = parseDateString(dateStr);
      } else if (line.startsWith('Time:')) {
        const timeStr = line.replace('Time:', '').trim();
        currentEvent.time = parseTimeString(timeStr);
      } else if (line.startsWith('Venue:')) {
        currentEvent.venue = line.replace('Venue:', '').trim();
      } else if (line.startsWith('Price:')) {
        const priceStr = line.replace('Price:', '').trim();
        currentEvent.priceDetails = priceStr;
        currentEvent.price = priceStr.toLowerCase().includes('free') ? 'open' : 'with-ticket';
      } else if (line && !line.startsWith('---') && currentEvent.venue) {
        // Description line (after venue is set)
        if (!currentEvent.description) {
          currentEvent.description = line;
        }
      }
    }
  }

  // Don't forget last event
  if (currentEvent && currentEvent.title) {
    events.push(currentEvent as ParsedEvent);
  }

  return events;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine event type from context
 */
export function determineEventType(
  title: string,
  context: string
): ParsedEvent['type'] {
  const lowerContext = context.toLowerCase();
  const lowerTitle = title.toLowerCase();

  if (lowerContext.includes('concert') || lowerTitle.includes('live') ||
      lowerTitle.includes('jazz') || lowerContext.includes('🎵')) {
    return 'concert';
  }
  if (lowerContext.includes('theater') || lowerContext.includes('theatre') ||
      lowerContext.includes('🎭')) {
    return 'theater';
  }
  if (lowerContext.includes('exhibition') || lowerContext.includes('museum') ||
      lowerContext.includes('🖼️')) {
    return 'exhibition';
  }
  if (lowerContext.includes('cinema') || lowerContext.includes('film')) {
    return 'cinema';
  }
  if (lowerContext.includes('workshop')) {
    return 'workshop';
  }

  return 'performance';
}

/**
 * Parse date string to YYYY-MM-DD format
 *
 * Handles various formats:
 * - "Saturday, January 25, 2025" -> "2025-01-25"
 * - "January 20-26, 2025" -> "2025-01-20" (use start date)
 * - "Until March 15, 2025" -> "2025-03-15"
 */
export function parseDateString(dateStr: string): string {
  const months: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
  };

  const lower = dateStr.toLowerCase();

  // Try to extract month, day, year
  for (const [monthName, monthNum] of Object.entries(months)) {
    if (lower.includes(monthName)) {
      // Extract day number(s)
      const dayMatch = dateStr.match(/(\d{1,2})(?:-\d{1,2})?/);
      const yearMatch = dateStr.match(/\d{4}/);

      if (dayMatch && yearMatch) {
        const day = dayMatch[1].padStart(2, '0');
        return `${yearMatch[0]}-${monthNum}-${day}`;
      }
    }
  }

  return dateStr; // Return original if can't parse
}

/**
 * Parse time string to HH:MM format
 *
 * Handles "21:00", "10:00-18:00" (uses start time)
 */
export function parseTimeString(timeStr: string): string {
  const match = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    const hours = match[1].padStart(2, '0');
    return `${hours}:${match[2]}`;
  }
  return timeStr;
}

// ============================================================================
// Parser Info
// ============================================================================

/**
 * Parser metadata for registry
 */
export const parserInfo = {
  id: 'this-is-athens',
  name: 'This Is Athens Parser',
  version: '1.0.0',
  supportedFormats: ['html', 'text'],
};
