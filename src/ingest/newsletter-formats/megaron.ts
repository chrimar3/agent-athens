/**
 * Megaron - Athens Concert Hall Newsletter Parser
 *
 * Parses events from Megaron weekly newsletter emails (Greek).
 * Supports plain text parsing of event listings.
 *
 * @see config/newsletter-formats.json
 * @see data/emails-to-parse/*Megaron*.json
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
 * Parse Megaron newsletter email
 *
 * @param email - Email content to parse
 * @returns Parse result with extracted events
 */
export function parseMegaronEmail(email: EmailContent): ParseResult {
  const result: ParseResult = {
    success: false,
    events: [],
    errors: [],
    rawEventCount: 0,
  };

  try {
    // Megaron emails are primarily text-based
    const events = parseMegaronText(email.text);

    result.rawEventCount = events.length;
    result.events = events;
    result.success = events.length > 0;
  } catch (error) {
    result.errors.push((error as Error).message);
  }

  return result;
}

// ============================================================================
// Greek Month Names
// ============================================================================

const GREEK_MONTHS: Record<string, string> = {
  'ιανουαρίου': '01', 'φεβρουαρίου': '02', 'μαρτίου': '03', 'απριλίου': '04',
  'μαΐου': '05', 'ιουνίου': '06', 'ιουλίου': '07', 'αυγούστου': '08',
  'σεπτεμβρίου': '09', 'οκτωβρίου': '10', 'νοεμβρίου': '11', 'δεκεμβρίου': '12',
};

// ============================================================================
// Text Parsing
// ============================================================================

/**
 * Parse events from Megaron plain text content
 */
export function parseMegaronText(text: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const lines = text.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip empty lines, URLs, and section headers
    if (!line || line.startsWith('http') || line.startsWith('**') || line.includes('----')) {
      i++;
      continue;
    }

    // Look for date patterns that indicate an event
    // Format 1: "Σάββατο 24.1.2026, 20:30" or "Κυριακή, 25.1.2026, 19:00"
    const dateMatch = line.match(/^(Δευτέρα|Τρίτη|Τετάρτη|Πέμπτη|Παρασκευή|Σάββατο|Κυριακή)[,]?\s+(\d{1,2})\.(\d{1,2})\.(\d{4})[,]?\s+(\d{1,2}):(\d{2})/i);

    // Format 2: "Δευτέρα 3 Νοεμβρίου 2025, 19:00" (written month)
    const writtenMonthMatch = !dateMatch && line.match(/^(Δευτέρα|Τρίτη|Τετάρτη|Πέμπτη|Παρασκευή|Σάββατο|Κυριακή)[,]?\s+(\d{1,2})\s+(Ιανουαρίου|Φεβρουαρίου|Μαρτίου|Απριλίου|Μαΐου|Ιουνίου|Ιουλίου|Αυγούστου|Σεπτεμβρίου|Οκτωβρίου|Νοεμβρίου|Δεκεμβρίου)\s+(\d{4})[,]?\s+(\d{1,2}):(\d{2})/i);

    if (dateMatch) {
      // Found a date line - look back for the title
      let title = '';
      let description = '';

      // Title is usually 1-3 lines before the date
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const prevLine = lines[j].trim();
        if (prevLine && !prevLine.startsWith('http') && !prevLine.startsWith('Περισσότερα') &&
            !prevLine.startsWith('ΕΙΣΙΤΗΡΙΑ') && !prevLine.startsWith('ΕΙΣΟΔΟΣ') &&
            prevLine.length > 3 && prevLine.length < 200) {
          title = prevLine;
          break;
        }
      }

      if (!title) {
        i++;
        continue;
      }

      // Parse the date
      const day = dateMatch[2].padStart(2, '0');
      const month = dateMatch[3].padStart(2, '0');
      const year = dateMatch[4];
      const hours = dateMatch[5].padStart(2, '0');
      const minutes = dateMatch[6];

      // Look ahead for description and price info
      let isOpen = false;
      for (let j = i + 1; j < Math.min(lines.length, i + 10); j++) {
        const nextLine = lines[j].trim();

        if (nextLine.startsWith('ΕΙΣΟΔΟΣ ΕΛΕΥΘΕΡΗ') || nextLine.includes('Είσοδος ελεύθερη')) {
          isOpen = true;
        }

        // Description is typically the paragraph after the date
        if (nextLine && !nextLine.startsWith('http') && !nextLine.startsWith('Περισσότερα') &&
            !nextLine.startsWith('ΕΙΣΙΤΗΡΙΑ') && !nextLine.startsWith('ΕΙΣΟΔΟΣ') &&
            !nextLine.startsWith('Σημ.:') && nextLine.length > 50) {
          description = nextLine;
          break;
        }
      }

      events.push({
        title,
        date: `${year}-${month}-${day}`,
        time: `${hours}:${minutes}`,
        venue: 'Μέγαρο Μουσικής Αθηνών',
        type: determineEventType(title, description),
        price: isOpen ? 'open' : 'with-ticket',
        description: description || '',
        source: 'megaron',
      });

      i++;
      continue;
    }

    // Handle written month format: "Δευτέρα 3 Νοεμβρίου 2025, 19:00"
    if (writtenMonthMatch) {
      let title = '';
      let description = '';

      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const prevLine = lines[j].trim();
        if (prevLine && !prevLine.startsWith('http') && !prevLine.startsWith('Περισσότερα') &&
            !prevLine.startsWith('ΕΙΣΙΤΗΡΙΑ') && !prevLine.startsWith('ΕΙΣΟΔΟΣ') &&
            prevLine.length > 3 && prevLine.length < 200) {
          title = prevLine;
          break;
        }
      }

      if (!title) {
        i++;
        continue;
      }

      const day = writtenMonthMatch[2].padStart(2, '0');
      const monthName = writtenMonthMatch[3].toLowerCase();
      const month = GREEK_MONTHS[monthName] || '01';
      const year = writtenMonthMatch[4];
      const hours = writtenMonthMatch[5].padStart(2, '0');
      const minutes = writtenMonthMatch[6];

      let isOpen = false;
      for (let j = i + 1; j < Math.min(lines.length, i + 10); j++) {
        const nextLine = lines[j].trim();
        if (nextLine.includes('Ελεύθερη είσοδος') || nextLine.includes('Free admission')) {
          isOpen = true;
        }
        if (nextLine && !nextLine.startsWith('http') && !nextLine.startsWith('Περισσότερα') &&
            !nextLine.startsWith('ΕΙΣΙΤΗΡΙΑ') && nextLine.length > 50) {
          description = nextLine;
          break;
        }
      }

      events.push({
        title,
        date: `${year}-${month}-${day}`,
        time: `${hours}:${minutes}`,
        venue: 'Μέγαρο Μουσικής Αθηνών',
        type: determineEventType(title, description),
        price: isOpen ? 'open' : 'with-ticket',
        description: description || '',
        source: 'megaron',
      });

      i++;
      continue;
    }

    // Also check for date range format: "Κάθε Σάββατο, 19:00 & 21:00, 10.1 - 28.2.2026"
    const rangeMatch = line.match(/Κάθε\s+(Δευτέρα|Τρίτη|Τετάρτη|Πέμπτη|Παρασκευή|Σάββατο|Κυριακή)[,]?\s+(\d{1,2}):(\d{2}).*?(\d{1,2})\.(\d{1,2})\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/i);

    if (rangeMatch) {
      // Look back for title
      let title = '';
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const prevLine = lines[j].trim();
        if (prevLine && !prevLine.startsWith('http') && prevLine.length > 3 && prevLine.length < 200) {
          title = prevLine;
          break;
        }
      }

      if (title) {
        const startDay = rangeMatch[4].padStart(2, '0');
        const startMonth = rangeMatch[5].padStart(2, '0');
        const year = rangeMatch[8];
        const hours = rangeMatch[2].padStart(2, '0');
        const minutes = rangeMatch[3];

        events.push({
          title,
          date: `${year}-${startMonth}-${startDay}`,
          time: `${hours}:${minutes}`,
          venue: 'Μέγαρο Μουσικής Αθηνών',
          type: determineEventType(title, ''),
          price: 'with-ticket',
          description: '',
          source: 'megaron',
        });
      }
    }

    i++;
  }

  // Remove duplicates based on title + date
  const seen = new Set<string>();
  return events.filter(event => {
    const key = `${event.title}|${event.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine event type from title and description
 */
function determineEventType(title: string, description: string): ParsedEvent['type'] {
  const text = `${title} ${description}`.toLowerCase();

  if (text.includes('jazz') || text.includes('τζαζ') || text.includes('συναυλία') ||
      text.includes('ρεσιτάλ') || text.includes('πιάνο') || text.includes('piano') ||
      text.includes('ορχήστρα') || text.includes('orchestra') || text.includes('μουσικ')) {
    return 'concert';
  }
  if (text.includes('έκθεση') || text.includes('exhibition') || text.includes('annex')) {
    return 'exhibition';
  }
  if (text.includes('θέατρο') || text.includes('theater') || text.includes('παράσταση')) {
    return 'theater';
  }
  if (text.includes('εργαστήρι') || text.includes('workshop') || text.includes('σεμινάρι')) {
    return 'workshop';
  }
  if (text.includes('animation') || text.includes('ταινία') || text.includes('film')) {
    return 'cinema';
  }

  return 'performance';
}

/**
 * Parse Greek date format to YYYY-MM-DD
 *
 * Handles: "24.1.2026" -> "2026-01-24"
 */
export function parseMegaronDate(dateStr: string): string {
  const match = dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3];
    return `${year}-${month}-${day}`;
  }
  return dateStr;
}

/**
 * Parse time format to HH:MM
 */
export function parseMegaronTime(timeStr: string): string {
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

export const parserInfo = {
  id: 'megaron',
  name: 'Megaron Parser',
  version: '1.0.0',
  supportedFormats: ['text'],
  language: 'el',
};
