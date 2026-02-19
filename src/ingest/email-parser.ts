/**
 * Email Parser Orchestrator
 *
 * Routes emails to format-specific parsers and integrates with quality gates.
 * Supports single email parsing, file-based parsing, and batch directory processing.
 *
 * @see specs/001-data-pipeline/tasks.md (Task 4.8)
 * @see src/ingest/newsletter-formats/index.ts
 * @see src/quality/location-filter.ts
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  NewsletterFormatRegistry,
  type FormatMatch,
  type NewsletterFormat,
} from './newsletter-formats';
import { parseThisIsAthensEmail, type ParsedEvent as ThisIsAthensEvent } from './newsletter-formats/this-is-athens';
import { parseLifoGuideEmail, type ParsedEvent as LifoGuideEvent } from './newsletter-formats/lifo-guide';
import { parseMegaronEmail } from './newsletter-formats/megaron';
import { parseSNFCCEmail } from './newsletter-formats/snfcc';
import { checkLocation, type LocationResult, type LocationStatus } from '../quality/location-filter';

// ============================================================================
// Types
// ============================================================================

export interface EmailContent {
  messageId: string;
  subject: string;
  from: string;
  date: string;
  text: string;
  html: string;
}

export interface ParsedEventWithMeta {
  title: string;
  date: string;
  time: string;
  venue: string;
  type: string;
  genre?: string;
  price: 'open' | 'with-ticket';
  priceDetails?: string;
  description: string;
  source: string;
  sourceMessageId: string;
  location_status?: LocationStatus;
  matched_venue?: string;
}

export interface ParseStats {
  totalEvents: number;
  filteredCount: number;
  parseTimeMs: number;
  rejectedCount: number;
  verifiedCount: number;
  unverifiedCount: number;
}

export interface EmailParseResult {
  success: boolean;
  formatMatched: string | null;
  matchedBy: 'sender' | 'subject' | null;
  events: ParsedEventWithMeta[];
  error?: string;
  stats?: ParseStats;
  sourceFile?: string;
}

export interface EmailParserOptions {
  applyLocationFilter?: boolean;
  filterRejected?: boolean;
  configPath?: string;
}

export interface EmailParser {
  parse(email: unknown): Promise<EmailParseResult>;
  parseFile(filePath: string): Promise<EmailParseResult>;
  parseDirectory(dirPath: string): Promise<EmailParseResult[]>;
}

// ============================================================================
// Parser Registry
// ============================================================================

type ParserFunction = (email: EmailContent) => { success: boolean; events: Array<{ title: string; date: string; time: string; venue: string; type: string; genre?: string; price: 'open' | 'with-ticket'; priceDetails?: string; description: string; source: string }>; errors: string[] };

const parserRegistry: Record<string, ParserFunction> = {
  'this-is-athens': parseThisIsAthensEmail as ParserFunction,
  'lifo-guide': parseLifoGuideEmail as ParserFunction,
  'megaron': parseMegaronEmail as ParserFunction,
  'snfcc': parseSNFCCEmail as ParserFunction,
};

// ============================================================================
// Main Parse Function
// ============================================================================

/**
 * Parse a single email using the appropriate format parser
 *
 * @param email - Email content object
 * @param options - Parser options
 * @returns Parse result with events and metadata
 */
export async function parseEmail(
  email: unknown,
  options: EmailParserOptions = {}
): Promise<EmailParseResult> {
  const startTime = Date.now();
  const {
    applyLocationFilter = false,
    filterRejected = true,
    configPath,
  } = options;

  // Validate email input
  if (!email || typeof email !== 'object') {
    return {
      success: false,
      formatMatched: null,
      matchedBy: null,
      events: [],
      error: 'Invalid email input: email must be an object',
    };
  }

  const emailContent = email as Partial<EmailContent>;

  // Validate required fields
  if (!emailContent.from || !emailContent.subject) {
    return {
      success: false,
      formatMatched: null,
      matchedBy: null,
      events: [],
      error: 'Invalid email: missing required fields (from, subject)',
    };
  }

  // Initialize registry
  const registry = new NewsletterFormatRegistry();
  if (configPath) {
    registry.loadFromConfig(configPath);
  } else {
    registry.loadFromConfig();
  }

  // Match email to format
  const match = registry.match(emailContent.from, emailContent.subject);

  if (!match) {
    return {
      success: false,
      formatMatched: null,
      matchedBy: null,
      events: [],
      error: 'No matching format found for this email',
    };
  }

  // Get the parser for this format
  const parser = parserRegistry[match.format.id];

  if (!parser) {
    return {
      success: false,
      formatMatched: match.format.id,
      matchedBy: match.matchedBy,
      events: [],
      error: `No parser implementation found for format: ${match.format.id}`,
    };
  }

  // Parse the email
  try {
    const fullEmail: EmailContent = {
      messageId: emailContent.messageId || `<generated-${Date.now()}@agent-athens>`,
      subject: emailContent.subject,
      from: emailContent.from,
      date: emailContent.date || new Date().toISOString(),
      text: emailContent.text || '',
      html: emailContent.html || '',
    };

    const parseResult = parser(fullEmail);

    if (!parseResult.success) {
      return {
        success: false,
        formatMatched: match.format.id,
        matchedBy: match.matchedBy,
        events: [],
        error: parseResult.errors.join('; ') || 'Parser returned no events',
      };
    }

    // Convert events to ParsedEventWithMeta
    let events: ParsedEventWithMeta[] = parseResult.events.map(event => ({
      ...event,
      sourceMessageId: fullEmail.messageId,
    }));

    // Apply location filter if enabled
    let rejectedCount = 0;
    let verifiedCount = 0;
    let unverifiedCount = 0;

    if (applyLocationFilter) {
      events = events.map(event => {
        const locationResult = checkLocation({
          venue_name: event.venue,
          title: event.title,
          description: event.description,
        });

        if (locationResult.status === 'rejected_non_athens') {
          rejectedCount++;
        } else if (locationResult.status === 'verified_athens') {
          verifiedCount++;
        } else if (locationResult.status === 'unverified') {
          unverifiedCount++;
        }

        return {
          ...event,
          location_status: locationResult.status,
          matched_venue: locationResult.matched_venue,
        };
      });

      // Filter out rejected events if requested
      if (filterRejected) {
        events = events.filter(event => event.location_status !== 'rejected_non_athens');
      }
    }

    const endTime = Date.now();

    return {
      success: true,
      formatMatched: match.format.id,
      matchedBy: match.matchedBy,
      events,
      stats: {
        totalEvents: parseResult.events.length,
        filteredCount: parseResult.events.length - events.length,
        parseTimeMs: endTime - startTime,
        rejectedCount,
        verifiedCount,
        unverifiedCount,
      },
    };
  } catch (error) {
    return {
      success: false,
      formatMatched: match.format.id,
      matchedBy: match.matchedBy,
      events: [],
      error: `Parser error: ${(error as Error).message}`,
    };
  }
}

// ============================================================================
// File-Based Parsing
// ============================================================================

/**
 * Parse email from a JSON file
 *
 * @param filePath - Path to JSON file containing email content
 * @param options - Parser options
 * @returns Parse result
 */
export async function parseEmailFromFile(
  filePath: string,
  options: EmailParserOptions = {}
): Promise<EmailParseResult> {
  if (!existsSync(filePath)) {
    return {
      success: false,
      formatMatched: null,
      matchedBy: null,
      events: [],
      error: `File not found: ${filePath}`,
      sourceFile: filePath,
    };
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const email = JSON.parse(content);
    const result = await parseEmail(email, options);
    return {
      ...result,
      sourceFile: filePath,
    };
  } catch (error) {
    return {
      success: false,
      formatMatched: null,
      matchedBy: null,
      events: [],
      error: `Failed to read or parse file: ${(error as Error).message}`,
      sourceFile: filePath,
    };
  }
}

// ============================================================================
// Directory Batch Parsing
// ============================================================================

/**
 * Parse all email JSON files in a directory
 *
 * @param dirPath - Path to directory containing email JSON files
 * @param options - Parser options
 * @returns Array of parse results
 */
export async function parseEmailsFromDirectory(
  dirPath: string,
  options: EmailParserOptions = {}
): Promise<EmailParseResult[]> {
  if (!existsSync(dirPath)) {
    return [];
  }

  const results: EmailParseResult[] = [];

  try {
    const files = readdirSync(dirPath);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    for (const file of jsonFiles) {
      const filePath = join(dirPath, file);
      const result = await parseEmailFromFile(filePath, options);
      results.push(result);
    }
  } catch (error) {
    // Return empty array on directory read error
    console.error(`Error reading directory ${dirPath}:`, error);
  }

  return results;
}

// ============================================================================
// Parser Factory
// ============================================================================

/**
 * Create an email parser instance with configured options
 *
 * @param options - Default parser options
 * @returns Parser instance
 */
export function createEmailParser(options: EmailParserOptions = {}): EmailParser {
  return {
    parse: (email: unknown) => parseEmail(email, options),
    parseFile: (filePath: string) => parseEmailFromFile(filePath, options),
    parseDirectory: (dirPath: string) => parseEmailsFromDirectory(dirPath, options),
  };
}

// ============================================================================
// Convenience Exports
// ============================================================================

export { NewsletterFormatRegistry } from './newsletter-formats';
export type { NewsletterFormat, FormatMatch } from './newsletter-formats';
