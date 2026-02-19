/**
 * Logging System for Agent Athens
 *
 * Provides structured logging for scrapers and other components.
 * Logs are written to daily files in data/logs/ directory.
 *
 * Usage:
 *   import { log, logSummary, getLogPath } from '../src/utils/logger';
 *
 *   log('INFO', 'more', 'Starting scrape');
 *   log('WARN', 'snfcc', 'No exhibitions found');
 *   log('ERROR', 'ra', 'GraphQL query failed', error);
 *
 *   logSummary([
 *     { source: 'more', events: 45, errors: 0 },
 *     { source: 'snfcc', events: 10, errors: 0 },
 *   ]);
 */

import { mkdirSync, appendFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const LOGS_DIR = join(import.meta.dir, '../../data/logs');

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface SourceStats {
  source: string;
  events: number;
  errors: number;
  duration?: number;
}

/**
 * Get the path for today's log file
 */
export function getLogPath(date?: Date): string {
  const d = date || new Date();
  const dateStr = d.toISOString().split('T')[0];
  return join(LOGS_DIR, `scrape-${dateStr}.log`);
}

/**
 * Ensure logs directory exists
 */
function ensureLogsDir(): void {
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }
}

/**
 * Format timestamp for log entries
 */
function formatTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Log a message to the daily log file
 *
 * @param level - Log level (INFO, WARN, ERROR, DEBUG)
 * @param source - Source identifier (e.g., 'more', 'snfcc', 'system')
 * @param message - Log message
 * @param errorObj - Optional error object for ERROR level
 */
export function log(
  level: LogLevel,
  source: string,
  message: string,
  errorObj?: Error | unknown
): void {
  ensureLogsDir();

  const timestamp = formatTimestamp();
  const logFile = getLogPath();

  // Format the log entry
  let entry = `[${timestamp}] [${level}] [${source}] ${message}`;

  // Add error details if provided
  if (errorObj) {
    if (errorObj instanceof Error) {
      entry += `\n    Error: ${errorObj.message}`;
      if (errorObj.stack) {
        const stackLines = errorObj.stack.split('\n').slice(1, 3);
        entry += `\n    Stack: ${stackLines.join('\n        ')}`;
      }
    } else {
      entry += `\n    Error: ${String(errorObj)}`;
    }
  }

  entry += '\n';

  // Write to file
  try {
    appendFileSync(logFile, entry);
  } catch (e) {
    console.error(`Failed to write to log file: ${e}`);
  }

  // Also output to console with colors
  const colors: Record<string, string> = {
    INFO: '\x1b[36m',   // Cyan
    WARN: '\x1b[33m',   // Yellow
    ERROR: '\x1b[31m',  // Red
    DEBUG: '\x1b[90m',  // Gray
    RESET: '\x1b[0m'
  };

  const color = colors[level] || colors.RESET;
  console.log(`${color}[${level}]${colors.RESET} [${source}] ${message}`);
  if (errorObj) {
    console.error(errorObj);
  }
}

/**
 * Log a daily summary of scraping results
 *
 * @param stats - Array of source statistics
 */
export function logSummary(stats: SourceStats[]): void {
  ensureLogsDir();

  const timestamp = formatTimestamp();
  const logFile = getLogPath();

  // Calculate totals
  const totalEvents = stats.reduce((sum, s) => sum + s.events, 0);
  const totalErrors = stats.reduce((sum, s) => sum + s.errors, 0);

  // Build summary
  const lines: string[] = [
    '',
    '='.repeat(50),
    `=== DAILY SUMMARY - ${timestamp.split('T')[0]} ===`,
    '='.repeat(50),
    ''
  ];

  // Per-source stats
  for (const s of stats) {
    const status = s.errors > 0 ? 'WARN' : 'OK';
    const durationStr = s.duration ? ` (${(s.duration / 1000).toFixed(1)}s)` : '';
    lines.push(`[${status}] ${s.source.padEnd(20)} | ${String(s.events).padStart(4)} events | ${String(s.errors).padStart(2)} errors${durationStr}`);
  }

  lines.push('');
  lines.push('-'.repeat(50));
  lines.push(`TOTAL: ${totalEvents} events | ${totalErrors} errors`);
  lines.push('='.repeat(50));
  lines.push('');

  const summary = lines.join('\n');

  // Write to file
  try {
    appendFileSync(logFile, summary);
  } catch (e) {
    console.error(`Failed to write summary to log file: ${e}`);
  }

  // Output to console
  console.log(summary);
}

/**
 * Read today's log file
 */
export function readTodayLog(): string | null {
  const logFile = getLogPath();
  if (!existsSync(logFile)) {
    return null;
  }
  return readFileSync(logFile, 'utf-8');
}

/**
 * Get recent log entries (last N lines)
 */
export function getRecentLogs(lines: number = 50): string[] {
  const content = readTodayLog();
  if (!content) return [];

  const allLines = content.split('\n');
  return allLines.slice(-lines);
}

/**
 * Count errors in today's log
 */
export function countTodayErrors(): number {
  const content = readTodayLog();
  if (!content) return 0;

  const errorMatches = content.match(/\[ERROR\]/g);
  return errorMatches ? errorMatches.length : 0;
}

/**
 * Parse today's summary stats from log
 */
export function parseTodaySummary(): SourceStats[] | null {
  const content = readTodayLog();
  if (!content) return null;

  // Find the last summary block
  const summaryMatch = content.match(/=== DAILY SUMMARY[\s\S]*?TOTAL:[^\n]+/g);
  if (!summaryMatch) return null;

  const lastSummary = summaryMatch[summaryMatch.length - 1];
  const stats: SourceStats[] = [];

  // Parse each source line
  const sourcePattern = /\[(OK|WARN)\]\s+(\S+)\s+\|\s+(\d+)\s+events\s+\|\s+(\d+)\s+errors/g;
  let match;
  while ((match = sourcePattern.exec(lastSummary)) !== null) {
    stats.push({
      source: match[2],
      events: parseInt(match[3]),
      errors: parseInt(match[4])
    });
  }

  return stats;
}

// Export convenience functions
export const info = (source: string, message: string) => log('INFO', source, message);
export const warn = (source: string, message: string) => log('WARN', source, message);
export const logError = (source: string, message: string, err?: Error | unknown) => log('ERROR', source, message, err);
export const debug = (source: string, message: string) => log('DEBUG', source, message);
