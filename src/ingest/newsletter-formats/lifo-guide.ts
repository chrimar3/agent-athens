/**
 * Lifo Guide Newsletter Parser
 *
 * Parses events from Lifo Guide weekly newsletter emails (Greek).
 * Supports both HTML and plain text parsing with fallback.
 *
 * @see specs/001-data-pipeline/tasks.md (Task 4.6)
 * @see tests/fixtures/sample-emails/lifo-guide-sample.json
 */

// ============================================================================
// Types
// ============================================================================

export interface ParsedEvent {
  title: string;
  date: string;
  time: string;
  venue: string;
  type: 'concert' | 'exhibition' | 'cinema' | 'theater' | 'performance' | 'workshop';
  genre?: string;
  price: 'open' | 'with-ticket';
  priceDetails?: string;
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
  rawEventCount: number;
}

// ============================================================================
// Main Parser Function
// ============================================================================

/**
 * Parse Lifo Guide newsletter email
 *
 * @param email - Email content to parse
 * @returns Parse result with extracted events
 */
export function parseLifoGuideEmail(email: EmailContent): ParseResult {
  const result: ParseResult = {
    success: false,
    events: [],
    errors: [],
    rawEventCount: 0,
  };

  try {
    const events = email.html
      ? parseLifoHtml(email.html)
      : parseLifoText(email.text);

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
 * Parse events from Lifo HTML content
 */
export function parseLifoHtml(html: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];

  // Track current section for event type
  let currentSection = 'performance';
  const sectionPattern = /<div class="section"[^>]*data-category="([^"]+)"[^>]*>([\s\S]*?)(?=<div class="section"|<div class="footer"|$)/gi;

  let sectionMatch;
  while ((sectionMatch = sectionPattern.exec(html)) !== null) {
    const category = sectionMatch[1];
    const sectionContent = sectionMatch[2];

    // Determine event type from category
    if (category === 'concerts' || category.includes('ΣΥΝΑΥΛΙ')) {
      currentSection = 'concert';
    } else if (category === 'theater' || category.includes('ΘΕΑΤΡΟ')) {
      currentSection = 'theater';
    } else if (category === 'exhibitions' || category.includes('ΕΚΘΕΣ')) {
      currentSection = 'exhibition';
    }

    // Find events within this section
    const sectionEventPattern = /<article class="event-item">([\s\S]*?)<\/article>/gi;
    let eventMatch;

    while ((eventMatch = sectionEventPattern.exec(sectionContent)) !== null) {
      const eventHtml = eventMatch[1];
      const event = extractLifoEventFromHtml(eventHtml, currentSection);
      if (event) {
        events.push(event);
      }
    }
  }

  return events;
}

/**
 * Extract event from Lifo HTML event block
 */
function extractLifoEventFromHtml(
  html: string,
  eventType: string
): ParsedEvent | null {
  // Extract title
  const titleMatch = html.match(/<h3 class="event-title">([^<]+)<\/h3>/i);
  if (!titleMatch) return null;

  let title = titleMatch[1].trim();
  let venue = '';

  // Check for venue in title (format: "Event @ Venue" or "Event στο Venue")
  if (title.includes('@')) {
    const parts = title.split('@');
    title = parts[0].trim();
    venue = parts[1].trim();
  } else if (title.includes(' στο ')) {
    const parts = title.split(' στο ');
    title = parts[0].trim();
    venue = parts[1].trim();
  }

  // Extract date
  const dateMatch = html.match(/<span class="date">([^<]+)<\/span>/i);
  const dateStr = dateMatch ? dateMatch[1].trim() : '';

  // Extract time
  const timeMatch = html.match(/<span class="time">([^<]+)<\/span>/i);
  const timeStr = timeMatch ? timeMatch[1].trim() : '';

  // Extract venue if not in title
  if (!venue) {
    const venueMatch = html.match(/<div class="event-venue">([^<]+)<\/div>/i);
    venue = venueMatch ? venueMatch[1].trim() : '';
  }

  // Extract price
  const priceMatch = html.match(/<div class="event-price">([^<]+)<\/div>/i);
  const priceStr = priceMatch ? priceMatch[1].trim() : '';

  // Extract description
  const descMatch = html.match(/<p class="event-description">([^<]+)<\/p>/i);
  const description = descMatch ? descMatch[1].trim() : '';

  // Determine price type
  const isOpen = priceStr.toLowerCase().includes('ελεύθερη') ||
                 priceStr.toLowerCase().includes('δωρεάν') ||
                 priceStr.toLowerCase().includes('free');

  return {
    title,
    date: parseGreekDate(dateStr),
    time: parseLifoTime(timeStr),
    venue,
    type: eventType as ParsedEvent['type'],
    price: isOpen ? 'open' : 'with-ticket',
    priceDetails: priceStr.replace('Εισιτήριο:', '').trim(),
    description,
    source: 'lifo-guide',
  };
}

// ============================================================================
// Text Parsing
// ============================================================================

/**
 * Parse events from Lifo plain text content
 */
export function parseLifoText(text: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const lines = text.split('\n');

  let currentEvent: Partial<ParsedEvent> | null = null;
  let currentSection = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect section headers
    if (line.includes('ΣΥΝΑΥΛΙ') || line === '== ΣΥΝΑΥΛΙΕΣ ==') {
      currentSection = 'concert';
      continue;
    }
    if (line.includes('ΘΕΑΤΡΟ') || line === '== ΘΕΑΤΡΟ ==') {
      currentSection = 'theater';
      continue;
    }
    if (line.includes('ΕΚΘΕΣ') || line === '== ΕΚΘΕΣΕΙΣ ==') {
      currentSection = 'exhibition';
      continue;
    }

    // Skip empty lines and footer
    if (!line || line.startsWith('---') || line.includes('Lifo Guide -')) {
      continue;
    }

    // Check for event title (contains @ or στο)
    if (currentSection && (line.includes('@') || line.includes(' στο '))) {
      // Save previous event
      if (currentEvent && currentEvent.title) {
        events.push(currentEvent as ParsedEvent);
      }

      let title = line;
      let venue = '';

      if (line.includes('@')) {
        const parts = line.split('@');
        title = parts[0].trim();
        venue = parts[1]?.trim() || '';
      } else if (line.includes(' στο ')) {
        const parts = line.split(' στο ');
        title = parts[0].trim();
        venue = parts[1]?.trim() || '';
      }

      currentEvent = {
        title,
        venue,
        type: currentSection as ParsedEvent['type'],
        source: 'lifo-guide',
        price: 'with-ticket',
      };
      continue;
    }

    // Check for event title with Greek quotes
    if (currentSection && line.startsWith('«') && line.includes('»')) {
      if (currentEvent && currentEvent.title) {
        events.push(currentEvent as ParsedEvent);
      }

      // Extract title and optional author
      const titleMatch = line.match(/«([^»]+)»\s*(?:του\s+)?(.+)?/);
      currentEvent = {
        title: titleMatch ? `«${titleMatch[1]}»${titleMatch[2] ? ' ' + titleMatch[2] : ''}` : line,
        type: currentSection as ParsedEvent['type'],
        source: 'lifo-guide',
        price: 'with-ticket',
      };
      continue;
    }

    // Parse event fields
    if (currentEvent) {
      // Date and time line (e.g., "Σάββατο 25/01 | 21:00")
      if (line.includes('|') && (line.includes('/') || line.includes(':'))) {
        const parts = line.split('|');
        if (parts.length >= 2) {
          currentEvent.date = parseGreekDate(parts[0].trim());
          currentEvent.time = parseLifoTime(parts[1].trim());
        }
        continue;
      }

      // Price line
      if (line.startsWith('Εισιτήριο:') || line.includes('Ελεύθερη είσοδος')) {
        currentEvent.priceDetails = line.replace('Εισιτήριο:', '').trim();
        currentEvent.price = line.includes('Ελεύθερη') ? 'open' : 'with-ticket';
        continue;
      }

      // Venue line (if not already set and not a known field)
      if (!currentEvent.venue && !line.includes('|') && !line.startsWith('Ε') &&
          line.length < 60 && !currentEvent.description) {
        // Could be venue
        if (line.includes('Θέατρο') || line.includes('Μουσείο') || line.includes('EMST')) {
          currentEvent.venue = line;
          continue;
        }
      }

      // Description (remaining text)
      if (!line.includes('|') && !line.startsWith('Ε') && line.length > 10) {
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
 * Parse Greek date format to YYYY-MM-DD
 *
 * Handles:
 * - "Σάββατο 25/01" -> "2025-01-25"
 * - "25/01/2025" -> "2025-01-25"
 * - "Έως 28/02/2025" -> "2025-02-28"
 */
export function parseGreekDate(dateStr: string): string {
  // Handle "Έως" (until) dates
  if (dateStr.includes('Έως')) {
    dateStr = dateStr.replace('Έως', '').trim();
  }

  // Extract DD/MM or DD/MM/YYYY
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3] || '2025'; // Default to current year
    return `${year}-${month}-${day}`;
  }

  return dateStr;
}

/**
 * Parse Lifo time format to HH:MM
 */
export function parseLifoTime(timeStr: string): string {
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
  id: 'lifo-guide',
  name: 'Lifo Guide Parser',
  version: '1.0.0',
  supportedFormats: ['html', 'text'],
  language: 'el',
};
