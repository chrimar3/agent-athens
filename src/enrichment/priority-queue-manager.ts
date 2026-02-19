/**
 * Priority Queue Manager
 *
 * Manages the enrichment_queue table with intelligent priority scoring.
 * Events are prioritized based on PRD criteria:
 * - Upcoming events (sooner = higher priority)
 * - Premium venues
 * - Events with complete data
 * - Key niches (techno, rebetiko, jazz)
 *
 * @see src/db/migrations/002-enrichment-queue-table.sql
 * @see docs/MASTER-ENRICHMENT-TEMPLATE.md
 */

import type Database from 'bun:sqlite';
import { determineEnrichmentTier, type EventForEnrichment } from './description-generator';

// ============================================================================
// Types
// ============================================================================

export interface QueuedEvent {
  event_id: string;
  priority_score: number;
  priority_reason: string;
  tier: 'stub' | 'standard' | 'premium';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  attempts: number;
  scheduled_for: string | null;
  quality_score: number | null;
}

export interface EventWithPriority extends EventForEnrichment {
  priority_score: number;
  priority_reason: string;
  tier: 'stub' | 'standard' | 'premium';
  status: string;
}

export interface QueueStats {
  total: number;
  pending: number;
  completed: number;
  failed: number;
  skipped: number;
  byTier: {
    stub: number;
    standard: number;
    premium: number;
  };
}

export interface PriorityFactors {
  daysUntilEvent: number;
  isPremiumVenue: boolean;
  isKeyNiche: boolean;
  hasCompleteData: boolean;
  hasPrice: boolean;
  sourceQuality: number;
}

export interface VelocityMetrics {
  enrichedThisWeek: number;
  newStubsThisWeek: number;
  velocity: number;           // enriched - newStubs ONLY (not expired)
  enrichmentRatio: number;    // percentage of visible events enriched
  totalVisible: number;       // total visible events (verified_athens + pass_through)
  totalEnriched: number;      // total enriched visible events
  target: number;             // target percentage (80)
  weeksToTarget: number | null; // estimated weeks to reach target
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Tiered venue system for priority scoring
 * Replaces flat PREMIUM_VENUES list with weighted tiers
 */
const VENUE_TIERS = {
  premium: {
    venues: ['Half Note Jazz Club', 'Megaron Mousikis', 'Megaron - Athens Concert Hall',
             'Gazarte', 'Onassis Stegi', 'Greek National Opera', 'Pallas Theater'],
    weight: 50
  },
  highTraffic: {
    venues: ['Gagarin 205', 'Floyd', 'Kyttaro', 'AN Club', 'Fuzz Club'],
    weight: 30
  },
  knownClubs: {
    venues: ['Astron', 'Dybbuk', 'Oddity', 'SMUT Athens', 'Six D.O.G.S', 'Bios',
             'A Litre of Light', 'Death Disco', 'Temple Athens', 'Romantso',
             'Stavros Niarchos Foundation'],
    weight: 20
  }
} as const;

/**
 * Get venue tier weight for priority scoring
 */
function getVenueTierWeight(venueName: string): number {
  if (!venueName) return 0;
  const lowerVenue = venueName.toLowerCase();

  for (const [, config] of Object.entries(VENUE_TIERS)) {
    if (config.venues.some(v => lowerVenue.includes(v.toLowerCase()))) {
      return config.weight;
    }
  }
  return 0;
}

/**
 * Event type weights for priority scoring
 * IMPORTANT: exhibition = 0 because static content, enrich once covers weeks
 */
const TYPE_WEIGHTS: Record<string, number> = {
  concert: 15,
  classical: 15,
  opera: 15,
  theater: 10,
  dance: 10,
  dj_set: 5,
  show: 5,
  exhibition: 0,  // Static content - enrich once covers weeks
  workshop: 0,
  screening: 0,
};

/** Key niches from Strategic Report */
const KEY_NICHE_GENRES = [
  'techno',
  'electronic',
  'house',
  'rebetiko',
  'laiko',
  'jazz',
  'greek-traditional',
];

/** High-quality sources */
const HIGH_QUALITY_SOURCES = ['resident-advisor', 'ra', 'half-note', 'gazarte'];

// ============================================================================
// Priority Calculation
// ============================================================================

/**
 * Calculate priority score for an event
 *
 * Scoring algorithm (0-100 scale):
 * - Days until event: 0-40 points (4 discrete bands)
 * - Venue tier: 0-50 points (premium/highTraffic/knownClubs)
 * - Event type: 0-15 points (concert > theater > dj_set > exhibition)
 * - Key niche genre: +15 points
 * - Complete data: +10 points
 * - Has price info: +10 points
 * - High-quality source: +5 points
 */
export function calculatePriority(event: EventForEnrichment, source?: string): {
  score: number;
  reason: string;
  factors: PriorityFactors;
} {
  const reasons: string[] = [];
  let score = 0;

  // Factor 1: Days until event (max 40 points, 4 discrete bands)
  const daysUntil = calculateDaysUntil(event.date);
  let timeScore = 0;

  if (daysUntil <= 3) {
    timeScore = 40;
    reasons.push('imminent (1-3 days)');
  } else if (daysUntil <= 7) {
    timeScore = 25;
    reasons.push('this week');
  } else if (daysUntil <= 14) {
    timeScore = 15;
    reasons.push('within 2 weeks');
  } else {
    timeScore = 0;
  }
  score += timeScore;

  // Factor 2: Venue tier (0-50 points based on tier)
  const venueTierWeight = event.venue ? getVenueTierWeight(event.venue) : 0;
  const isPremiumVenue = venueTierWeight >= 50;
  if (venueTierWeight > 0) {
    score += venueTierWeight;
    if (venueTierWeight >= 50) {
      reasons.push('premium venue');
    } else if (venueTierWeight >= 30) {
      reasons.push('high-traffic venue');
    } else {
      reasons.push('known club');
    }
  }

  // Factor 3: Event type weight (0-15 points)
  const typeWeight = TYPE_WEIGHTS[event.type || ''] ?? 0;
  if (typeWeight > 0) {
    score += typeWeight;
    reasons.push(`type:${event.type}`);
  }

  // Factor 4: Key niche (15 points)
  const isKeyNiche = event.genre
    ? KEY_NICHE_GENRES.some(g => event.genre?.toLowerCase().includes(g))
    : false;
  if (isKeyNiche) {
    score += 15;
    reasons.push('key niche');
  }

  // Factor 5: Complete data (10 points)
  const hasCompleteData = Boolean(
    event.title && event.date && event.venue && event.type && event.genre
  );
  if (hasCompleteData) {
    score += 10;
    reasons.push('complete data');
  }

  // Factor 6: Has price (10 points)
  const hasPrice = Boolean(event.price || event.price_advance || event.price_door);
  if (hasPrice) {
    score += 10;
    reasons.push('has price');
  }

  // Factor 7: High-quality source (5 points)
  const sourceQuality = source
    ? HIGH_QUALITY_SOURCES.some(s => source.toLowerCase().includes(s))
      ? 5
      : 0
    : 0;
  if (sourceQuality > 0) {
    score += sourceQuality;
    reasons.push('quality source');
  }

  return {
    score: Math.min(score, 100),
    reason: reasons.length > 0 ? reasons.join(', ') : 'standard',
    factors: {
      daysUntilEvent: daysUntil,
      isPremiumVenue,
      isKeyNiche,
      hasCompleteData,
      hasPrice,
      sourceQuality,
    },
  };
}

/**
 * Calculate days until event
 */
function calculateDaysUntil(dateStr: string): number {
  try {
    const eventDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    eventDate.setHours(0, 0, 0, 0);
    const diffTime = eventDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  } catch {
    return 999; // Unknown date gets low priority
  }
}

/**
 * Get coverage gap bonus for event type
 *
 * Rewards diversity — boosts first event of a type this week
 * to prevent all enrichment going to one genre/type
 *
 * @param db - Database connection
 * @param eventType - Event type to check coverage for
 * @returns Bonus points (0, 10, or 15)
 */
export function getCoverageGapBonus(db: Database, eventType: string): number {
  if (!eventType) return 0;

  // +15 if first of type this week
  const thisWeekCount = db.prepare(`
    SELECT COUNT(*) as count FROM enrichment_queue q
    JOIN events e ON q.event_id = e.id
    WHERE q.status = 'completed'
    AND e.type = ?
    AND e.start_date >= date('now')
    AND e.start_date <= date('now', '+7 days')
  `).get(eventType) as { count: number };

  if (thisWeekCount.count === 0) return 15;

  // +10 if <5 enriched total of this type
  const totalCount = db.prepare(`
    SELECT COUNT(*) as count FROM enrichment_queue q
    JOIN events e ON q.event_id = e.id
    WHERE q.status = 'completed' AND e.type = ?
  `).get(eventType) as { count: number };

  if (totalCount.count < 5) return 10;

  return 0;
}

/**
 * Get enrichment tier from priority score
 *
 * Tier thresholds:
 * - Premium: 80+ (highest quality content)
 * - Standard: 40-79 (good content)
 * - Stub: <40 (leave as-is)
 */
export function getTierFromScore(score: number): 'stub' | 'standard' | 'premium' {
  if (score >= 80) return 'premium';
  if (score >= 40) return 'standard';
  return 'stub';
}

// ============================================================================
// Queue Operations
// ============================================================================

/**
 * Sync events to enrichment queue
 *
 * Adds new events needing enrichment to the queue with priority scores.
 * Updates existing entries if priority changes.
 */
export function syncQueueFromEvents(db: Database): {
  added: number;
  updated: number;
  removed: number;
} {
  let added = 0;
  let updated = 0;
  let removed = 0;

  // Get all events needing enrichment
  const events = db.prepare(`
    SELECT
      id,
      title,
      start_date as date,
      substr(start_date, 12, 5) as time,
      venue_name as venue,
      type,
      genres as genre,
      price_type as price,
      price_advance,
      price_door,
      venue_neighborhood as neighborhood,
      venue_metro_station as metro_station,
      venue_metro_line as metro_line,
      door_policy,
      source
    FROM events
    WHERE needs_enrichment = 1
      AND location_status IN ('verified_athens', 'pass_through')
  `).all() as Array<EventForEnrichment & { source: string }>;

  // Check existing queue entries
  const existingQueue = new Set(
    (db.prepare('SELECT event_id FROM enrichment_queue').all() as Array<{ event_id: string }>)
      .map(r => r.event_id)
  );

  // Process each event
  const insertStmt = db.prepare(`
    INSERT INTO enrichment_queue (event_id, priority_score, priority_reason, tier, status)
    VALUES (?, ?, ?, ?, 'pending')
  `);

  const updateStmt = db.prepare(`
    UPDATE enrichment_queue
    SET priority_score = ?, priority_reason = ?, tier = ?, updated_at = datetime('now')
    WHERE event_id = ? AND status = 'pending'
  `);

  for (const event of events) {
    const { score, reason } = calculatePriority(event, event.source);
    const tier = determineEnrichmentTier(event);

    if (existingQueue.has(event.id)) {
      // Update existing pending entry
      const result = updateStmt.run(score, reason, tier, event.id);
      if (result.changes > 0) updated++;
    } else {
      // Add new entry
      insertStmt.run(event.id, score, reason, tier);
      added++;
    }
  }

  // Remove queue entries for events no longer needing enrichment
  const eventIds = new Set(events.map(e => e.id));
  const toRemove = [...existingQueue].filter(id => !eventIds.has(id));

  if (toRemove.length > 0) {
    const deleteStmt = db.prepare(`
      DELETE FROM enrichment_queue
      WHERE event_id = ? AND status IN ('pending', 'skipped')
    `);

    for (const id of toRemove) {
      const result = deleteStmt.run(id);
      if (result.changes > 0) removed++;
    }
  }

  return { added, updated, removed };
}

/**
 * Get next batch of events to enrich
 */
export function getNextBatch(
  db: Database,
  options: { limit?: number; tier?: 'stub' | 'standard' | 'premium'; minPriority?: number } = {}
): EventWithPriority[] {
  const { limit = 10, tier, minPriority = 0 } = options;

  let query = `
    SELECT
      e.id,
      e.title,
      e.start_date as date,
      substr(e.start_date, 12, 5) as time,
      e.venue_name as venue,
      e.type,
      e.genres as genre,
      e.price_type as price,
      e.price_advance,
      e.price_door,
      e.venue_neighborhood as neighborhood,
      e.venue_metro_station as metro_station,
      e.venue_metro_line as metro_line,
      e.door_policy,
      e.door_policy_note,
      e.time_doors,
      e.time_peak,
      e.ticket_url,
      q.priority_score,
      q.priority_reason,
      q.tier,
      q.status
    FROM enrichment_queue q
    JOIN events e ON q.event_id = e.id
    WHERE q.status = 'pending'
      AND q.priority_score >= ?
  `;

  const params: (string | number)[] = [minPriority];

  if (tier) {
    query += ` AND q.tier = ?`;
    params.push(tier);
  }

  query += ` ORDER BY q.priority_score DESC, e.start_date ASC LIMIT ?`;
  params.push(limit);

  return db.prepare(query).all(...params) as EventWithPriority[];
}

/**
 * Mark event as in progress
 */
export function markInProgress(db: Database, eventId: string): boolean {
  const result = db.prepare(`
    UPDATE enrichment_queue
    SET status = 'in_progress',
        last_attempt = datetime('now'),
        attempts = attempts + 1
    WHERE event_id = ?
  `).run(eventId);

  return result.changes > 0;
}

/**
 * Mark event as completed with quality score
 */
export function markCompleted(
  db: Database,
  eventId: string,
  qualityScore: number,
  qualityIssues?: string[]
): boolean {
  const now = new Date().toISOString();

  // Update queue
  const queueResult = db.prepare(`
    UPDATE enrichment_queue
    SET status = 'completed',
        completed_at = ?,
        quality_score = ?,
        quality_issues = ?
    WHERE event_id = ?
  `).run(now, qualityScore, qualityIssues ? JSON.stringify(qualityIssues) : null, eventId);

  // Update events table
  db.prepare(`
    UPDATE events
    SET needs_enrichment = 0,
        enriched_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(now, now, eventId);

  return queueResult.changes > 0;
}

/**
 * Mark event as failed
 */
export function markFailed(db: Database, eventId: string, error: string): boolean {
  const result = db.prepare(`
    UPDATE enrichment_queue
    SET status = CASE WHEN attempts >= 3 THEN 'skipped' ELSE 'failed' END,
        last_error = ?
    WHERE event_id = ?
  `).run(error, eventId);

  return result.changes > 0;
}

/**
 * Reset failed events for retry
 */
export function resetFailedEvents(db: Database): number {
  const result = db.prepare(`
    UPDATE enrichment_queue
    SET status = 'pending',
        last_error = NULL
    WHERE status = 'failed'
      AND attempts < 3
  `).run();

  return result.changes;
}

/**
 * Get queue statistics
 */
export function getQueueStats(db: Database): QueueStats {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped,
      SUM(CASE WHEN tier = 'stub' THEN 1 ELSE 0 END) as tier_stub,
      SUM(CASE WHEN tier = 'standard' THEN 1 ELSE 0 END) as tier_standard,
      SUM(CASE WHEN tier = 'premium' THEN 1 ELSE 0 END) as tier_premium
    FROM enrichment_queue
  `).get() as {
    total: number;
    pending: number;
    completed: number;
    failed: number;
    skipped: number;
    tier_stub: number;
    tier_standard: number;
    tier_premium: number;
  };

  return {
    total: stats.total || 0,
    pending: stats.pending || 0,
    completed: stats.completed || 0,
    failed: stats.failed || 0,
    skipped: stats.skipped || 0,
    byTier: {
      stub: stats.tier_stub || 0,
      standard: stats.tier_standard || 0,
      premium: stats.tier_premium || 0,
    },
  };
}

/**
 * Get top priority events (for display/debugging)
 */
export function getTopPriority(db: Database, limit = 10): QueuedEvent[] {
  return db.prepare(`
    SELECT
      event_id,
      priority_score,
      priority_reason,
      tier,
      status,
      attempts,
      scheduled_for,
      quality_score
    FROM enrichment_queue
    WHERE status = 'pending'
    ORDER BY priority_score DESC
    LIMIT ?
  `).all(limit) as QueuedEvent[];
}

/**
 * Calculate enrichment velocity metrics
 *
 * IMPORTANT: Velocity = enrichedThisWeek - newStubsThisWeek only.
 * Do NOT subtract expired — expired events exit both numerator and denominator,
 * so the ratio is unaffected.
 *
 * @param db - Database connection
 * @returns Velocity metrics including weeks to target
 */
export function calculateVelocityMetrics(db: Database): VelocityMetrics {
  // Enriched this week
  const enrichedThisWeek = (db.prepare(`
    SELECT COUNT(*) as count FROM enrichment_queue
    WHERE status = 'completed'
    AND completed_at >= date('now', '-7 days')
  `).get() as { count: number }).count;

  // New stubs (pending) added this week
  const newStubsThisWeek = (db.prepare(`
    SELECT COUNT(*) as count FROM enrichment_queue
    WHERE created_at >= date('now', '-7 days')
    AND status = 'pending'
  `).get() as { count: number }).count;

  // Total visible events (verified_athens + pass_through, future only)
  const totalVisible = (db.prepare(`
    SELECT COUNT(*) as count FROM events
    WHERE location_status IN ('verified_athens', 'pass_through')
    AND start_date >= date('now')
  `).get() as { count: number }).count;

  // Total enriched among visible events
  const totalEnriched = (db.prepare(`
    SELECT COUNT(*) as count FROM events e
    JOIN enrichment_queue q ON e.id = q.event_id
    WHERE e.location_status IN ('verified_athens', 'pass_through')
    AND e.start_date >= date('now')
    AND q.status = 'completed'
  `).get() as { count: number }).count;

  // CORRECT: velocity = enriched - newStubs only
  const velocity = enrichedThisWeek - newStubsThisWeek;
  const enrichmentRatio = totalVisible > 0 ? (totalEnriched / totalVisible) * 100 : 0;
  const target = 80;

  let weeksToTarget: number | null = null;
  if (velocity > 0 && enrichmentRatio < target) {
    const needed = Math.ceil((target / 100 * totalVisible) - totalEnriched);
    weeksToTarget = Math.ceil(needed / velocity);
  }

  return {
    enrichedThisWeek,
    newStubsThisWeek,
    velocity,
    enrichmentRatio: Math.round(enrichmentRatio * 10) / 10,
    totalVisible,
    totalEnriched,
    target,
    weeksToTarget
  };
}

/**
 * Get tier breakdown counts for pending events
 */
export function getTierBreakdown(db: Database): { premium: number; standard: number; stub: number } {
  const premium = (db.prepare(`
    SELECT COUNT(*) as count FROM enrichment_queue
    WHERE status = 'pending' AND priority_score >= 80
  `).get() as { count: number }).count;

  const standard = (db.prepare(`
    SELECT COUNT(*) as count FROM enrichment_queue
    WHERE status = 'pending' AND priority_score >= 40 AND priority_score < 80
  `).get() as { count: number }).count;

  const stub = (db.prepare(`
    SELECT COUNT(*) as count FROM enrichment_queue
    WHERE status = 'pending' AND priority_score < 40
  `).get() as { count: number }).count;

  return { premium, standard, stub };
}
