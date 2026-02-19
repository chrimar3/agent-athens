/**
 * SNFCC (Stavros Niarchos Foundation Cultural Center) Newsletter Parser
 *
 * Parses events from SNFCC weekly newsletter emails (Greek).
 * Supports plain text parsing of event listings.
 *
 * @see config/newsletter-formats.json
 * @see data/emails-to-parse/*snfcc*.json
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
// Greek Month Names
// ============================================================================

const GREEK_MONTHS: Record<string, string> = {
  'ιανουαρίου': '01', 'φεβρουαρίου': '02', 'μαρτίου': '03', 'απριλίου': '04',
  'μαΐου': '05', 'ιουνίου': '06', 'ιουλίου': '07', 'αυγούστου': '08',
  'σεπτεμβρίου': '09', 'οκτωβρίου': '10', 'νοεμβρίου': '11', 'δεκεμβρίου': '12',
  'ιανουάριο': '01', 'φεβρουάριο': '02', 'μάρτιο': '03', 'απρίλιο': '04',
  'μάιο': '05', 'ιούνιο': '06', 'ιούλιο': '07', 'αύγουστο': '08',
  'σεπτέμβριο': '09', 'οκτώβριο': '10', 'νοέμβριο': '11', 'δεκέμβριο': '12',
};

// ============================================================================
// Main Parser Function
// ============================================================================

/**
 * Parse SNFCC newsletter email
 *
 * @param email - Email content to parse
 * @returns Parse result with extracted events
 */
export function parseSNFCCEmail(email: EmailContent): ParseResult {
  const result: ParseResult = {
    success: false,
    events: [],
    errors: [],
    rawEventCount: 0,
  };

  try {
    const events = parseSNFCCText(email.text, email.date);

    result.rawEventCount = events.length;
    result.events = events;
    result.success = events.length > 0;
  } catch (error) {
    result.errors.push((error as Error).message);
  }

  return result;
}

// ============================================================================
// Text Parsing
// ============================================================================

/**
 * Parse events from SNFCC plain text content
 */
export function parseSNFCCText(text: string, emailDate: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const lines = text.split('\n');

  // Get year from email date
  const emailYear = emailDate ? new Date(emailDate).getFullYear() : new Date().getFullYear();

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip empty lines and URLs
    if (!line || line.startsWith('http') || line.startsWith('→') || line.includes('utm_')) {
      i++;
      continue;
    }

    // Look for event patterns
    // Pattern 1: "Το Σάββατο 29 Νοεμβρίου στις 19.00"
    const dateTimeMatch = line.match(/(?:Το\s+)?(Δευτέρα|Τρίτη|Τετάρτη|Πέμπτη|Παρασκευή|Σάββατο|Κυριακή)\s+(\d{1,2})\s+(Ιανουαρίου|Φεβρουαρίου|Μαρτίου|Απριλίου|Μαΐου|Ιουνίου|Ιουλίου|Αυγούστου|Σεπτεμβρίου|Οκτωβρίου|Νοεμβρίου|Δεκεμβρίου)(?:\s+στις?\s+(\d{1,2})[:.](\d{2}))?/i);

    if (dateTimeMatch) {
      const day = dateTimeMatch[2].padStart(2, '0');
      const monthName = dateTimeMatch[3].toLowerCase();
      const month = GREEK_MONTHS[monthName] || '01';
      const hours = dateTimeMatch[4] ? dateTimeMatch[4].padStart(2, '0') : '19';
      const minutes = dateTimeMatch[5] || '00';

      // Look back for title (usually 1-5 lines before)
      let title = '';
      for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
        const prevLine = lines[j].trim();
        if (prevLine && !prevLine.startsWith('http') && !prevLine.startsWith('→') &&
            !prevLine.startsWith('Περισσότερα') && !prevLine.includes('utm_') &&
            !prevLine.startsWith('Φωτογραφία:') && !prevLine.startsWith('Χορηγός') &&
            prevLine.length > 5 && prevLine.length < 150) {
          title = prevLine;
          break;
        }
      }

      if (!title) {
        i++;
        continue;
      }

      // Look for description and free entry
      let description = '';
      let isOpen = false;

      // Check around this line for context
      const contextStart = Math.max(0, i - 3);
      const contextEnd = Math.min(lines.length, i + 8);
      const context = lines.slice(contextStart, contextEnd).join(' ').toLowerCase();

      if (context.includes('ελεύθερη είσοδο') || context.includes('είσοδος ελεύθερη') ||
          context.includes('δωρεάν')) {
        isOpen = true;
      }

      // Get description from lines after date
      for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
        const nextLine = lines[j].trim();
        if (nextLine && !nextLine.startsWith('http') && !nextLine.startsWith('→') &&
            !nextLine.includes('utm_') && !nextLine.startsWith('Χορηγός') &&
            nextLine.length > 30) {
          description = nextLine;
          break;
        }
      }

      events.push({
        title,
        date: `${emailYear}-${month}-${day}`,
        time: `${hours}:${minutes}`,
        venue: 'SNFCC - Κέντρο Πολιτισμού Ίδρυμα Σταύρος Νιάρχος',
        type: determineEventType(title, description),
        price: isOpen ? 'open' : 'with-ticket',
        description,
        source: 'snfcc',
      });

      i++;
      continue;
    }

    // Pattern 2: "Έως Τετάρτη 05/11" or "Έως 28/02/2025"
    const untilMatch = line.match(/Έως\s+(?:την\s+)?(?:Δευτέρα|Τρίτη|Τετάρτη|Πέμπτη|Παρασκευή|Σάββατο|Κυριακή)?\s*(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{4}))?/i);

    if (untilMatch) {
      const day = untilMatch[1].padStart(2, '0');
      const month = untilMatch[2].padStart(2, '0');
      const year = untilMatch[3] || emailYear.toString();

      // Look back for title
      let title = '';
      for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
        const prevLine = lines[j].trim();
        if (prevLine && !prevLine.startsWith('http') && !prevLine.startsWith('→') &&
            !prevLine.includes('utm_') && prevLine.length > 10 && prevLine.length < 150 &&
            !prevLine.match(/^\d/) && !prevLine.startsWith('Φωτογραφία')) {
          title = prevLine;
          break;
        }
      }

      if (!title) {
        i++;
        continue;
      }

      // Check for free entry
      const contextStart = Math.max(0, i - 3);
      const contextEnd = Math.min(lines.length, i + 3);
      const context = lines.slice(contextStart, contextEnd).join(' ').toLowerCase();

      const isOpen = context.includes('ελεύθερη') || context.includes('δωρεάν');

      events.push({
        title,
        date: `${year}-${month}-${day}`,
        time: '10:00', // Default for exhibitions
        venue: 'SNFCC - Κέντρο Πολιτισμού Ίδρυμα Σταύρος Νιάρχος',
        type: 'exhibition',
        price: isOpen ? 'open' : 'with-ticket',
        description: '',
        source: 'snfcc',
      });

      i++;
      continue;
    }

    // Pattern 3: Simple date "29 Νοεμβρίου - 6 Ιανουαρίου" (date ranges)
    const rangeDateMatch = line.match(/(\d{1,2})\s+(Ιανουαρίου|Φεβρουαρίου|Μαρτίου|Απριλίου|Μαΐου|Ιουνίου|Ιουλίου|Αυγούστου|Σεπτεμβρίου|Οκτωβρίου|Νοεμβρίου|Δεκεμβρίου)\s*[-–]\s*(\d{1,2})\s+(Ιανουαρίου|Φεβρουαρίου|Μαρτίου|Απριλίου|Μαΐου|Ιουνίου|Ιουλίου|Αυγούστου|Σεπτεμβρίου|Οκτωβρίου|Νοεμβρίου|Δεκεμβρίου)/i);

    if (rangeDateMatch) {
      const startDay = rangeDateMatch[1].padStart(2, '0');
      const startMonthName = rangeDateMatch[2].toLowerCase();
      const startMonth = GREEK_MONTHS[startMonthName] || '01';

      // Look back for title
      let title = '';
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const prevLine = lines[j].trim();
        if (prevLine && !prevLine.startsWith('http') && !prevLine.includes('utm_') &&
            prevLine.length > 5 && prevLine.length < 150) {
          title = prevLine;
          break;
        }
      }

      if (title) {
        events.push({
          title,
          date: `${emailYear}-${startMonth}-${startDay}`,
          time: '10:00',
          venue: 'SNFCC - Κέντρο Πολιτισμού Ίδρυμα Σταύρος Νιάρχος',
          type: determineEventType(title, ''),
          price: 'open',
          description: '',
          source: 'snfcc',
        });
      }
    }

    i++;
  }

  // Remove duplicates based on title
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

  if (text.includes('έκθεση') || text.includes('exhibition') || text.includes('γλυπτ') ||
      text.includes('εικαστικ') || text.includes('anatomy') || text.includes('art')) {
    return 'exhibition';
  }
  if (text.includes('συναυλία') || text.includes('concert') || text.includes('jazz') ||
      text.includes('μουσικ') || text.includes('τραγουδ') || text.includes('quartet')) {
    return 'concert';
  }
  if (text.includes('θέατρο') || text.includes('theater') || text.includes('παράσταση')) {
    return 'theater';
  }
  if (text.includes('εργαστήρι') || text.includes('workshop') || text.includes('σεμινάρι')) {
    return 'workshop';
  }
  if (text.includes('παγοδρόμιο') || text.includes('ice') || text.includes('χριστουγεννιάτικ') ||
      text.includes('φεστιβάλ') || text.includes('festival')) {
    return 'performance';
  }
  if (text.includes('cinema') || text.includes('ταινία') || text.includes('film')) {
    return 'cinema';
  }

  return 'performance';
}

// ============================================================================
// Parser Info
// ============================================================================

export const parserInfo = {
  id: 'snfcc',
  name: 'SNFCC Parser',
  version: '1.0.0',
  supportedFormats: ['text'],
  language: 'el',
};
