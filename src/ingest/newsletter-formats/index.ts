/**
 * Newsletter Format Registry
 *
 * Manages newsletter formats and matches incoming emails to appropriate parsers.
 * Supports matching by sender email address or subject line patterns.
 *
 * @see specs/001-data-pipeline/tasks.md (Task 4.2)
 * @see config/newsletter-formats.json
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Types
// ============================================================================

export interface NewsletterFormat {
  id: string;
  name: string;
  senders: string[];           // Email addresses or patterns
  subjectPatterns: string[];   // Regex patterns for subject matching
  parserModule: string;        // Path to parser module
  enabled: boolean;
  priority: number;            // Higher = matched first
}

export interface FormatMatch {
  format: NewsletterFormat;
  matchedBy: 'sender' | 'subject';
  matchedValue: string;
}

export interface NewsletterFormatsConfig {
  formats: NewsletterFormat[];
  version: string;
  lastUpdated: string;
}

// ============================================================================
// Newsletter Format Registry
// ============================================================================

/**
 * Newsletter Format Registry
 *
 * Manages newsletter formats and matches incoming emails.
 * Formats are matched by sender (preferred) or subject pattern.
 */
export class NewsletterFormatRegistry {
  private formats: NewsletterFormat[] = [];

  /**
   * Load formats from array
   *
   * @param formats - Array of newsletter formats
   */
  loadFormats(formats: NewsletterFormat[]): void {
    // Filter out disabled formats
    this.formats = formats.filter(f => f.enabled);
    // Sort by priority (highest first)
    this.formats.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Load formats from JSON config file
   *
   * @param configPath - Path to config file (default: config/newsletter-formats.json)
   */
  loadFromConfig(configPath: string = 'config/newsletter-formats.json'): void {
    if (!existsSync(configPath)) {
      console.warn(`Newsletter formats config not found: ${configPath}`);
      this.formats = [];
      return;
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      const config: NewsletterFormatsConfig = JSON.parse(content);
      this.loadFormats(config.formats);
    } catch (error) {
      console.error(`Failed to load newsletter formats from ${configPath}:`, error);
      this.formats = [];
    }
  }

  /**
   * Get all enabled formats
   *
   * @returns Array of enabled formats, sorted by priority
   */
  getFormats(): NewsletterFormat[] {
    return [...this.formats];
  }

  /**
   * Get format by ID
   *
   * @param id - Format ID
   * @returns Format or undefined if not found
   */
  getFormatById(id: string): NewsletterFormat | undefined {
    return this.formats.find(f => f.id === id);
  }

  /**
   * Match email to format by sender address
   *
   * @param sender - Email sender (can include display name)
   * @returns Match result or null if no match
   */
  matchBySender(sender: string): FormatMatch | null {
    const normalizedSender = sender.toLowerCase();

    for (const format of this.formats) {
      for (const formatSender of format.senders) {
        if (normalizedSender.includes(formatSender.toLowerCase())) {
          return {
            format,
            matchedBy: 'sender',
            matchedValue: formatSender,
          };
        }
      }
    }

    return null;
  }

  /**
   * Match email to format by subject pattern
   *
   * @param subject - Email subject line
   * @returns Match result or null if no match
   */
  matchBySubject(subject: string): FormatMatch | null {
    for (const format of this.formats) {
      for (const pattern of format.subjectPatterns) {
        try {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(subject)) {
            return {
              format,
              matchedBy: 'subject',
              matchedValue: pattern,
            };
          }
        } catch (error) {
          // Invalid regex pattern, skip
          console.warn(`Invalid regex pattern in format ${format.id}: ${pattern}`);
        }
      }
    }

    return null;
  }

  /**
   * Match email to format (tries sender first, then subject)
   *
   * Sender matching is preferred as it's more reliable.
   * Falls back to subject pattern matching if sender doesn't match.
   *
   * @param sender - Email sender
   * @param subject - Email subject
   * @returns Match result or null if no match
   */
  match(sender: string, subject: string): FormatMatch | null {
    // Try sender match first (more reliable)
    const senderMatch = this.matchBySender(sender);
    if (senderMatch) return senderMatch;

    // Fall back to subject match
    return this.matchBySubject(subject);
  }

  /**
   * Check if registry has any formats loaded
   */
  hasFormats(): boolean {
    return this.formats.length > 0;
  }

  /**
   * Get count of loaded formats
   */
  getFormatCount(): number {
    return this.formats.length;
  }
}

// ============================================================================
// Default Registry Instance
// ============================================================================

/**
 * Default registry instance
 * Automatically loads from config/newsletter-formats.json
 */
let defaultRegistry: NewsletterFormatRegistry | null = null;

/**
 * Get the default registry instance
 *
 * Lazy-loads the registry on first access.
 */
export function getDefaultRegistry(): NewsletterFormatRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new NewsletterFormatRegistry();
    defaultRegistry.loadFromConfig();
  }
  return defaultRegistry;
}

/**
 * Reset the default registry
 *
 * Useful for testing or reloading config.
 */
export function resetDefaultRegistry(): void {
  defaultRegistry = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Match email to newsletter format using default registry
 *
 * @param sender - Email sender
 * @param subject - Email subject
 * @returns Match result or null
 */
export function matchNewsletter(sender: string, subject: string): FormatMatch | null {
  return getDefaultRegistry().match(sender, subject);
}

/**
 * Get all registered newsletter formats
 */
export function getNewsletterFormats(): NewsletterFormat[] {
  return getDefaultRegistry().getFormats();
}
