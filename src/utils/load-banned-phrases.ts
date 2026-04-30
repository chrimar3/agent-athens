/**
 * Banned-phrases loader for editorial copy quality enforcement.
 *
 * Reads config/banned-phrases.yaml (owned by Editorial Director). Cache is
 * keyed by resolved path so test fixtures coexist with the production config.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

// ── Types ──────────────────────────────────────────────

export interface BannedPhrasesAbsoluteEntry {
  phrase: string;
  language: 'en' | 'el';
}

export interface BannedPhrasesContextualEntry {
  phrase: string;
  isRegex: boolean;
  bannedWhen: string;
  allowedWhen: string;
  language: 'en' | 'el';
  source?: string;
}

export interface BannedPhrasesData {
  absolute: BannedPhrasesAbsoluteEntry[];
  contextual: BannedPhrasesContextualEntry[];
  loadedAt: Date;
  sourceFile: string;
}

// ── Internal helpers ───────────────────────────────────

const DEFAULT_YAML_PATH = join(import.meta.dir, '../../config/banned-phrases.yaml');
const _cache = new Map<string, BannedPhrasesData>();
let _warnedFallback = false;

const REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g;
function escapeRegex(s: string): string {
  return s.replace(REGEX_ESCAPE, '\\$&');
}

// ECMAScript `\b` is ASCII-only even with the `u` flag, so ED's seed patterns
// like `\bζωντανή\b` would never match Greek text. We substitute a Unicode-aware
// boundary at compile time — seed stays correct, JS engine sees what it needs.
const UNICODE_WORD_BOUNDARY =
  '(?:(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_])|(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_]))';
function unicodifyBoundaries(pattern: string): string {
  return pattern.replace(/\\b/g, UNICODE_WORD_BOUNDARY);
}

interface RawContextual {
  phrase: string;
  banned_when: string;
  allowed_when: string;
  source?: string;
}

interface RawLanguageBlock {
  absolute?: string[];
  contextual?: RawContextual[];
}

interface RawYaml {
  banned?: {
    en?: RawLanguageBlock;
    el?: RawLanguageBlock;
  };
}

function parseLanguage(
  lang: 'en' | 'el',
  block: RawLanguageBlock | undefined,
): { absolute: BannedPhrasesAbsoluteEntry[]; contextual: BannedPhrasesContextualEntry[] } {
  if (!block) return { absolute: [], contextual: [] };

  const absolute: BannedPhrasesAbsoluteEntry[] = (block.absolute ?? []).map((phrase) => ({
    phrase,
    language: lang,
  }));

  const contextual: BannedPhrasesContextualEntry[] = (block.contextual ?? []).map((entry) => {
    const rawPhrase = entry.phrase;
    const declaredRegex = rawPhrase.startsWith('re:');
    const phrase = declaredRegex ? rawPhrase.slice(3) : rawPhrase;

    // If a `re:` pattern is malformed, downgrade to literal so a single seed
    // typo doesn't kill the whole loader.
    let isRegex = declaredRegex;
    if (declaredRegex) {
      try {
        new RegExp(unicodifyBoundaries(phrase), 'iu');
      } catch (err) {
        console.warn(
          `[load-banned-phrases] regex compile failed for "${phrase}" (${lang}); falling back to literal match.`,
          err,
        );
        isRegex = false;
      }
    }

    return {
      phrase,
      isRegex,
      bannedWhen: entry.banned_when,
      allowedWhen: entry.allowed_when,
      language: lang,
      ...(entry.source ? { source: entry.source } : {}),
    };
  });

  return { absolute, contextual };
}

// ── Public API ─────────────────────────────────────────

export function loadBannedPhrases(yamlPath?: string): BannedPhrasesData {
  const path = yamlPath ?? DEFAULT_YAML_PATH;
  const cached = _cache.get(path);
  if (cached) return cached;

  let data: BannedPhrasesData;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = parse(raw) as RawYaml;
    const en = parseLanguage('en', parsed.banned?.en);
    const el = parseLanguage('el', parsed.banned?.el);
    data = {
      absolute: [...en.absolute, ...el.absolute],
      contextual: [...en.contextual, ...el.contextual],
      loadedAt: new Date(),
      sourceFile: path,
    };
  } catch (err) {
    if (!_warnedFallback) {
      console.warn(
        `[load-banned-phrases] could not load "${path}"; using empty fallback.`,
        err,
      );
      _warnedFallback = true;
    }
    data = { absolute: [], contextual: [], loadedAt: new Date(), sourceFile: 'fallback' };
  }

  _cache.set(path, data);
  return data;
}

export function checkAbsoluteMatch(
  text: string,
  entries: BannedPhrasesAbsoluteEntry[],
): string[] {
  const hits: string[] = [];
  for (const entry of entries) {
    const re = new RegExp(unicodifyBoundaries('\\b' + escapeRegex(entry.phrase) + '\\b'), 'iu');
    if (re.test(text)) hits.push(entry.phrase);
  }
  return hits;
}

export function compileContextualRegex(entry: BannedPhrasesContextualEntry): RegExp {
  if (entry.isRegex) return new RegExp(unicodifyBoundaries(entry.phrase), 'iu');
  return new RegExp(unicodifyBoundaries('\\b' + escapeRegex(entry.phrase) + '\\b'), 'iu');
}
