/**
 * Gate-rules loader for the S110f post-save validator.
 *
 * Reads config/enrichment-gate-rules.yml (owned by GEO Strategist) and
 * config/enrichment-overrides.yml (owned by GEO Strategist, append-only).
 * Caches are keyed by resolved path so test fixtures coexist with the
 * production configs.
 *
 * The chokepoint filter at src/db/database.ts:getAllEvents() consults
 * isHardStopConcern() + isOverridden() to decide which events stay visible
 * on public surfaces.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

// ── Types ──────────────────────────────────────────────

export type GateTier = 'A0' | 'B';

export interface GateRule {
  concern_type: string;
  tier: GateTier;
  rationale: string;
}

export interface GateRulesData {
  version: number;
  rules: GateRule[];
  hardstop_enabled: boolean;
  sourceFile: string;
}

export interface OverrideEntry {
  event_id: string;
  concern_types: string[];
  reason: string;
  approved_by: string;
  approved_at: string;
}

// ── Internal state ─────────────────────────────────────

const DEFAULT_RULES_PATH = join(import.meta.dir, '../../config/enrichment-gate-rules.yml');
const DEFAULT_OVERRIDES_PATH = join(import.meta.dir, '../../config/enrichment-overrides.yml');

const _rulesCache = new Map<string, GateRulesData>();
const _overridesCache = new Map<string, OverrideEntry[]>();
let _warnedRulesFallback = false;
let _warnedOverridesFallback = false;

interface RawRulesYaml {
  version?: number;
  rules?: Array<{ concern_type?: string; tier?: string; rationale?: string }>;
  hardstop_enabled?: boolean;
}

interface RawOverridesYaml {
  version?: number;
  overrides?: Array<{
    event_id?: string;
    concern_types?: string[];
    reason?: string;
    approved_by?: string;
    approved_at?: string;
  }>;
}

// ── Public API ─────────────────────────────────────────

/**
 * Load and parse the gate-rules YAML. Cached per resolved path.
 *
 * Failure mode: returns an empty rules array with hardstop_enabled=false
 * and logs a one-shot warning. This means a missing/malformed config does
 * NOT silently start hard-stopping events; it disables filtering. The
 * build report is responsible for surfacing the disabled state.
 */
export function loadGateRules(yamlPath?: string): GateRulesData {
  const path = yamlPath ?? DEFAULT_RULES_PATH;
  const cached = _rulesCache.get(path);
  if (cached) return cached;

  let data: GateRulesData;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = parse(raw) as RawRulesYaml;
    const rules: GateRule[] = (parsed.rules ?? [])
      .filter((r): r is { concern_type: string; tier: string; rationale: string } =>
        typeof r.concern_type === 'string' && typeof r.tier === 'string' && typeof r.rationale === 'string',
      )
      .map(r => {
        if (r.tier !== 'A0' && r.tier !== 'B') {
          console.warn(`[load-gate-rules] unknown tier "${r.tier}" for "${r.concern_type}"; treating as B (soft-flag).`);
          return { concern_type: r.concern_type, tier: 'B' as GateTier, rationale: r.rationale };
        }
        return { concern_type: r.concern_type, tier: r.tier as GateTier, rationale: r.rationale };
      });
    data = {
      version: parsed.version ?? 0,
      rules,
      hardstop_enabled: parsed.hardstop_enabled === true,
      sourceFile: path,
    };
  } catch (err) {
    if (!_warnedRulesFallback) {
      console.warn(`[load-gate-rules] could not load "${path}"; hard-stop filtering disabled.`, err);
      _warnedRulesFallback = true;
    }
    data = { version: 0, rules: [], hardstop_enabled: false, sourceFile: 'fallback' };
  }

  _rulesCache.set(path, data);
  return data;
}

/**
 * Load and parse the overrides YAML. Cached per resolved path.
 * Empty array is the default (no overrides active).
 */
export function loadOverrides(yamlPath?: string): OverrideEntry[] {
  const path = yamlPath ?? DEFAULT_OVERRIDES_PATH;
  const cached = _overridesCache.get(path);
  if (cached) return cached;

  let entries: OverrideEntry[];
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = parse(raw) as RawOverridesYaml;
    entries = (parsed.overrides ?? [])
      .filter((o): o is Required<NonNullable<RawOverridesYaml['overrides']>[number]> =>
        typeof o.event_id === 'string' &&
        Array.isArray(o.concern_types) &&
        typeof o.reason === 'string' &&
        typeof o.approved_by === 'string' &&
        typeof o.approved_at === 'string',
      )
      .map(o => ({
        event_id: o.event_id,
        concern_types: o.concern_types,
        reason: o.reason,
        approved_by: o.approved_by,
        approved_at: o.approved_at,
      }));
  } catch (err) {
    if (!_warnedOverridesFallback) {
      console.warn(`[load-gate-rules] could not load overrides "${path}"; treating as empty.`, err);
      _warnedOverridesFallback = true;
    }
    entries = [];
  }

  _overridesCache.set(path, entries);
  return entries;
}

/**
 * True iff the concern_type is tier A0 AND hardstop_enabled is true.
 *
 * Unknown concern_types (not present in rules) return false — the validator
 * is responsible for surfacing them as "config drift" via
 * getUnknownConcernTypes(); blocking on unknowns would be a footgun.
 */
export function isHardStopConcern(concernType: string, rules: GateRulesData): boolean {
  if (!rules.hardstop_enabled) return false;
  const rule = rules.rules.find(r => r.concern_type === concernType);
  return rule !== undefined && rule.tier === 'A0';
}

/**
 * True iff there is an override entry for this (event_id, concern_type) tuple.
 * An event can be overridden for some concerns but not others.
 */
export function isOverridden(
  eventId: string,
  concernType: string,
  overrides: OverrideEntry[],
): boolean {
  return overrides.some(o => o.event_id === eventId && o.concern_types.includes(concernType));
}

/**
 * Returns the subset of emittedTypes that are not declared in rules.yml.
 * Used by the build report to surface "validator config drift" — concern_types
 * the agent emitted that the YAML doesn't know about. Such events ship
 * normally; the operator triages at the audit checkpoint.
 */
export function getUnknownConcernTypes(emittedTypes: string[], rules: GateRulesData): string[] {
  const known = new Set(rules.rules.map(r => r.concern_type));
  return [...new Set(emittedTypes.filter(t => !known.has(t)))];
}

// ── Test helpers ───────────────────────────────────────

/**
 * Test-only: clear the path-keyed caches so successive tests can swap fixtures.
 * Not exported from the package barrel; intended for use within
 * src/utils/__tests__/load-gate-rules.test.ts.
 */
export function _clearCachesForTesting(): void {
  _rulesCache.clear();
  _overridesCache.clear();
  _warnedRulesFallback = false;
  _warnedOverridesFallback = false;
}
