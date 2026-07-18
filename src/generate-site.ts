#!/usr/bin/env bun

// Main site generator - generates all combinatorial pages

import { readFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'fs';
import { writeFileIfChangedSync, writeHtmlIfChangedSync, copyFileIfChangedSync, writeJsonApiIfChangedSync, getWriteStats, resetWriteStats, formatWriteStats } from './utils/write-if-changed';
import { HREFLANG_GATE_OPEN } from './utils/hreflang';
import { join, dirname } from 'path';
import { Database } from 'bun:sqlite';
import type { Event, EventType, TimeRange, PriceFilter, Filters, HubConfig } from './types';
import { normalizeEvents } from './utils/normalize';
import { filterEvents } from './utils/filters';
import { buildURL, buildPageMetadata } from './utils/urls';
import { renderPage } from './templates/page';
import {
  renderCategoryPage,
  type CategoryConfig
} from './templates/category-page';
import { generateEventPages, generateEventSlug, loadSlugHistory, saveSlugHistory, generateRedirects, generateArchiveGoneRules } from './generators/event-page';
import { sweepOrphans } from './generators/orphan-sweep';
import { snapshotOfferOmissions, resetOfferOmissionsCounter } from './ticketing/offer-builder';
import { generateVenuePages, computePagedVenueSlugs } from './generators/venue-page';
import { generateSearchIndex } from './generators/search-index';
import { generateHubPages, getHubEvents } from './generators/hub-page';
import { generateOgImages, generateFavicons, generateEventOgImages, generateHubOgImages } from './generators/og-image';
import { precomputeEventTiles } from './generators/event-tile';
import { renderHeroSection } from './templates/card-variants';
import type { HeroMode } from './templates/card-variants';
import { DateTime } from 'luxon';
import { renderContentPage } from './templates/content-page';
import { BILINGUAL_CONTENT_SLUGS } from './sitemap/generate-sitemaps';
import { STRINGS } from './i18n/strings';
import { renderSiteNav, renderSiteFooter, renderHamburgerMenu, renderHamburgerScript, renderFaviconLinks, renderFontLinks, renderCssLink } from './templates/site-chrome';
import { renderSearchOverlay, renderSearchScript } from './templates/search-overlay';
import { ORGANIZATION_SCHEMA } from './utils/schema-geo';
import { validateAllPages, printSchemaSummary } from './validators/schema-completeness';
import { buildCompletenessReport, printBucketSummary, printHardStopSummary, writeCompletenessReport, type AriaAggregate } from './validators/completeness-reporter';
import { buildDataFeed, writeDataFeed } from './generators/datafeed';
import { renderHomepageCapsule, renderHubNavGrid, renderTerminalCta } from './templates/homepage';
import type { CapsuleStats, HubNavItem } from './templates/homepage';
import { BASE_URL } from './config/site-url';
import { renderAnalytics } from './config/analytics';
import { proofMetrics } from './utils/proof-metrics';
import { renderProofBody } from './templates/proof-body';
import { buildProofSchema } from './templates/proof-schema';
import { renderColophonContent } from './templates/colophon';
import { setColophonStats } from './templates/colophon-stats';
import { ACTIVE_SOURCE_COUNT } from './config/active-source-ids';
import { writeBuildProvenance } from './utils/build-provenance';

const DIST_DIR = join(import.meta.dir, '../dist');
const DATA_DIR = join(import.meta.dir, 'data');
const DB_PATH = join(import.meta.dir, '../data/events.db');

/**
 * Record generation statistics to the database for monitoring
 */
function recordGenerationStats(
  totalEvents: number,
  pagesGenerated: number,
  buildDurationMs: number,
  deploySuccess: boolean
): void {
  try {
    const db = new Database(DB_PATH);
    db.prepare(`
      INSERT INTO generation_stats (generated_at, total_events, pages_generated, build_duration_ms, deploy_success)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      new Date().toISOString(),
      totalEvents,
      pagesGenerated,
      buildDurationMs,
      deploySuccess ? 1 : 0
    );
    db.close();
  } catch (err) {
    // Log but don't fail the build
    console.log(`⚠️ Failed to record generation stats: ${err}`);
  }
}

const EVENT_TYPES: EventType[] = [
  'concert', 'dj_set', 'exhibition', 'cinema',
  'theater', 'performance', 'show', 'workshop', 'festival', 'tech', 'dance', 'other'
];
const TIME_RANGES: TimeRange[] = ['today', 'tomorrow', 'this-week', 'this-weekend', 'this-month', 'next-month', 'all-events'];
const PRICE_FILTERS: PriceFilter[] = ['open', 'with-ticket', 'all'];

// Map of genres by event type (from our sample data)
const GENRES: Record<EventType, string[]> = {
  concert: ['Pop', 'Post-rock', 'Jazz', 'Indie', 'Synth-pop', 'Dub', 'Acid jazz', 'Classical', 'World music', 'Soul', 'Rock', 'Rebetiko'],
  dj_set: ['Electronic', 'Techno', 'House', 'Trance', 'Drum and Bass', 'Ambient'],
  exhibition: ['Contemporary art', 'Photography', 'Sculpture', 'Installation'],
  cinema: ['Film premiere', 'Documentary', 'Outdoor cinema', 'Film festival'],
  theater: ['Drama', 'Comedy', 'Tragedy'],
  performance: ['Experimental', 'Multimedia', 'Ballet', 'Contemporary Dance', 'Tango'],
  show: ['Cabaret', 'Stand-up', 'Variety'],
  workshop: ['Masterclass', 'Educational'],
  festival: ['Multi-day', 'Multi-act'],
  tech: ['AI', 'Machine Learning', 'Data Science', 'Cloud', 'DevOps', 'Startup'],
  dance: ['Tango', 'Swing', 'Latin', 'Contemporary Dance'],
  other: []
};

// Load category configuration
const CATEGORIES_CONFIG = JSON.parse(
  readFileSync(join(import.meta.dir, '../config/categories.json'), 'utf-8')
) as { categories: CategoryConfig[] };

async function main() {
  const buildStartTime = Date.now();
  resetWriteStats();
  resetOfferOmissionsCounter();
  console.log('🚀 Starting site generation...\n');

  // DB-health gate (2026-06-30): fail-fast on a degenerate DB BEFORE any expensive
  // work (image copy / OG / favicons). Opens read-only — never the create:true
  // singleton — so it can't manufacture the empty file it's guarding against. A
  // missing/empty/tableless/corrupt DB aborts loud here instead of a confusing
  // mid-stream "no such table" at getAllEvents. @see specs/db-availability-build-2026-06-30.md
  {
    const { assertEventsDbHealthy } = await import('./db/db-health');
    const dbHealth = assertEventsDbHealthy();
    console.log(`  ✓ DB health: ${dbHealth.rowCount} rows, integrity ok`);
  }

  // Create dist directory
  if (!existsSync(DIST_DIR)) {
    mkdirSync(DIST_DIR, { recursive: true });
  }

  // Copy design system CSS to dist
  mkdirSync(join(DIST_DIR, 'styles'), { recursive: true });
  copyFileIfChangedSync(
    join(import.meta.dir, 'styles/design-system.css'),
    join(DIST_DIR, 'styles/design-system.css')
  );

  // Copy self-hosted event images to dist
  const eventImgSrc = join(import.meta.dir, '../data/images');
  const eventImgDest = join(DIST_DIR, 'images/events');
  if (existsSync(eventImgSrc)) {
    mkdirSync(eventImgDest, { recursive: true });
    const imageFiles = readdirSync(eventImgSrc).filter(f => f.endsWith('.webp'));
    for (const file of imageFiles) {
      copyFileIfChangedSync(join(eventImgSrc, file), join(eventImgDest, file));
    }
    console.log(`📸 Copied ${imageFiles.length} event images to dist/`);
  }

  // Copy venue fallback images to dist
  const venueImgSrc = join(import.meta.dir, '../data/venue-images');
  const venueImgDest = join(DIST_DIR, 'images/venues');
  if (existsSync(venueImgSrc)) {
    mkdirSync(venueImgDest, { recursive: true });
    const venueImageFiles = readdirSync(venueImgSrc).filter(f => f.endsWith('.webp'));
    for (const file of venueImageFiles) {
      copyFileIfChangedSync(join(venueImgSrc, file), join(venueImgDest, file));
    }
    if (venueImageFiles.length > 0) {
      console.log(`📸 Copied ${venueImageFiles.length} venue images to dist/`);
    }
  }

  // Generate OG images and favicons
  console.log('🖼️  Generating OG images and favicons...');
  await generateOgImages();
  await generateFavicons();

  // Load events from database
  console.log('📥 Loading events from database...');
  const { getAllEvents, getDatabase } = await import('./db/database');

  // DB retention: events persist indefinitely for dedup history.
  // Lifecycle (upcoming vs past) is handled at the generation layer.

  // Load all events from database
  const allEvents = getAllEvents();

  // Filter by location_status: only verified_athens and pass_through events
  // Per spec FR-B: "Site shows: verified_athens + pass_through only"
  const PUBLISHABLE_STATUSES = ['verified_athens', 'pass_through'];
  const locationFiltered = allEvents.filter(event => {
    // Check if event has location_status field (from database)
    const status = event.locationStatus;
    // Reject unverified events - require explicit verification
    if (!status || status === 'unverified') return false;
    return PUBLISHABLE_STATUSES.includes(status);
  });

  // Pre-build performer QID gate (S179): every wikidata QID in
  // config/performer-sameAs.json must carry a resolver-written verification
  // record in config/performer-qid-verification.json — 27/52 QIDs were
  // LLM-fabricated (Moby = Edward Furlong class; 3rd fabricated-QID surface).
  // Without this gate the S179 data fix lasts until the next unverified write.
  {
    const { validatePerformerQidConfig } = await import('./validators/performer-qid-manifest');
    const qidReport = validatePerformerQidConfig();
    if (qidReport.failures.length > 0) {
      console.error(`\n❌ Performer QID gate FAILED: ${qidReport.failures.length} unverified QID${qidReport.failures.length === 1 ? '' : 's'}`);
      for (const f of qidReport.failures) {
        console.error(`   [performer-qid-gate] ${f}`);
      }
      console.error('   Fix: bun run scripts/audit-performer-qids.ts --apply (resolver re-derivation), then rebuild.');
      process.exit(1);
    }
    console.log(`  ✓ performer QID gate: ${qidReport.passed} QIDs verified against manifest${qidReport.warnings.length ? ` (${qidReport.warnings.length} stale manifest records)` : ''}`);
  }

  // Pre-build Tier 1 vocabulary guard (s-tba-bypass session, 2026-05-13):
  // detective control for any future writer that bypasses normalizePriceType().
  // Single-call-site normalizers in multi-writer codebases fail silently; this
  // pass fails the build before emission if any publishable row carries an
  // out-of-vocabulary price_type. Add new normalize sites at all writers; never
  // weaken this check to make a bypassed row publishable.
  {
    const { validatePriceTypeVocabulary } = await import('./validators/schema-completeness');
    const vocabErrors: string[] = [];
    for (const event of locationFiltered) {
      const result = validatePriceTypeVocabulary({
        id: event.id,
        price_type: event.price?.type ?? null,
        source: event.source,
      });
      if (result.errors.length > 0) vocabErrors.push(...result.errors);
    }
    if (vocabErrors.length > 0) {
      console.error(`\n❌ Tier 1 price_type vocabulary violations (${vocabErrors.length}):`);
      for (const e of vocabErrors.slice(0, 20)) console.error(`   - ${e}`);
      if (vocabErrors.length > 20) console.error(`   ... and ${vocabErrors.length - 20} more`);
      throw new Error(
        `Build aborted: ${vocabErrors.length} event(s) have out-of-vocabulary price_type. ` +
        `A writer is bypassing normalizePriceType(). See specs/s-tba-bypass-diagnostic.md.`
      );
    }
  }

  // Split events into two arrays:
  // 1. upcomingEvents — for listings, hubs, search index, counts (current/future only)
  // 2. pageableEvents — for event page generation (upcoming + past-active ≤45d)
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcomingEvents = locationFiltered.filter(event => {
    const startDate = new Date(event.startDate);

    // For exhibitions: show if currently running (end_date >= today) or starting soon
    if (event.type === 'exhibition' && event.endDate) {
      const endDate = new Date(event.endDate);
      endDate.setHours(23, 59, 59, 999); // End of day
      return endDate >= today; // Still running or future
    }

    // For other events: show if starting today or in the future
    return startDate >= today;
  });

  // pageableEvents: upcoming + past events within 45-day retention window
  const { classifyEventLifecycle, shouldNoindexEvent } = await import('./utils/event-lifecycle');
  const pageableEvents = locationFiltered.filter(event => {
    const lifecycle = classifyEventLifecycle(event);
    return lifecycle !== 'past-expired';
  });

  // Alias for backward compat — listing pages, hubs, etc. use `events`
  const events = upcomingEvents;

  // Preload venue fallback images from venue_context
  const venueImageMap = new Map<string, string>();
  try {
    const db = new Database(DB_PATH);
    const venueImages = db.prepare(
      "SELECT venue_name, image_path FROM venue_context WHERE image_path IS NOT NULL"
    ).all() as { venue_name: string; image_path: string }[];
    for (const v of venueImages) venueImageMap.set(v.venue_name, v.image_path);
    db.close();
  } catch (err) {
    console.log(`⚠️ Could not load venue images: ${err}`);
  }

  // Attach venue fallback image to each event (computed at load time)
  // Use pageableEvents since past-active events also need images for their pages
  for (const event of pageableEvents) {
    const venueImg = venueImageMap.get(event.venue.name);
    if (venueImg) event.venueImage = venueImg;
  }

  // Attach venue.website + venue.sameAs from athens-venues.json.
  // Website drives Tier-5 "Check venue website" CTA. sameAs feeds Schema.org
  // identity links (Component B-1). Empty arrays omitted — JSON-LD readers
  // treat present-but-empty as a present-but-unknown signal, worse than absence.
  const { getVenueByName, getAllVenues, normalizeVenueKey, getActiveReachableVenueKeys } = await import('./ticketing/venue-registry');
  for (const event of pageableEvents) {
    const venueRecord = getVenueByName(event.venue.name);
    if (venueRecord?.website) event.venue.website = venueRecord.website;
    if (venueRecord?.sameAs && venueRecord.sameAs.length > 0) {
      event.venue.sameAs = venueRecord.sameAs;
    }
  }

  // Component B-2: ratchet state for venue sameAs coverage.
  // Severity decided once at build start, threaded into validators (B-1 pattern).
  // INFO until coverage meets threshold; then promotes to WARN.
  const ratchetConfig = JSON.parse(
    readFileSync(join(import.meta.dir, '../config/completeness-ratchets.json'), 'utf-8'),
  );
  // Q-B8b lock 2026-05-04: denominator = venues active in pageableEvents AND
  // reachable via registry (canonical_name OR variation normalizes into a registry key).
  // Numerator filters by canonical_name membership only — must be subset of denominator's
  // domain, so an inactive venue with sameAs cannot inflate the ratio.
  const allVenues = getAllVenues();
  const activeReachableKeys = getActiveReachableVenueKeys(pageableEvents);
  const totalVenues = activeReachableKeys.size;
  const venuesWithSameAs = allVenues.filter(v =>
    v.sameAs && v.sameAs.length > 0 &&
    activeReachableKeys.has(normalizeVenueKey(v.canonical_name))
  ).length;
  const sameAsCoverage = totalVenues > 0 ? venuesWithSameAs / totalVenues : 0;
  const sameAsThreshold = ratchetConfig.athens.place.venueSameAs.warnAt;
  const sameAsSeverity: 'info' | 'warn' = sameAsCoverage >= sameAsThreshold ? 'warn' : 'info';
  const ratchetState = {
    venueSameAs: {
      coverage: sameAsCoverage,
      populated: venuesWithSameAs,
      total: totalVenues,
      threshold: sameAsThreshold,
      currentSeverity: sameAsSeverity,
    },
  };

  console.log(`✅ Loaded ${allEvents.length} events from SQLite`);
  console.log(`📍 ${locationFiltered.length} events with verified Athens location`);
  console.log(`📅 Publishing ${upcomingEvents.length} current/upcoming events`);
  console.log(`📄 ${pageableEvents.length} pageable events (includes ${pageableEvents.length - upcomingEvents.length} past-active)`);
  if (venueImageMap.size > 0) {
    const venueImgCount = pageableEvents.filter(e => !e.imageLocal && !e.imageUrl && e.venueImage).length;
    console.log(`🏛️ ${venueImageMap.size} venue images loaded, ${venueImgCount} events get venue fallback`);
  }
  console.log();

  // S103: colophon engine stats — set ONCE here (before any page renders) so the
  // dialog (on every page via site-chrome) and the /en/colophon/ mirror read the
  // same singleton. events = pageableEvents.length — the SAME value /proof emits,
  // so the two surfaces can never show different event counts (cross-surface lock).
  // Schema-validity is intentionally omitted this session (held for Editorial+GEO
  // reconciliation with /proof's "100% pass" framing). Date is the build-run date
  // (single date, Athens tz), NOT a precise timestamp and NOT the content-hash token.
  setColophonStats({
    events: pageableEvents.length,
    venues: totalVenues,
    sources: ACTIVE_SOURCE_COUNT,
    lastBuildDate: new Date(buildStartTime).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Athens',
    }),
  });

  // Save normalized events
  const normalizedPath = join(DIST_DIR, 'data');
  if (!existsSync(normalizedPath)) {
    mkdirSync(normalizedPath, { recursive: true });
  }
  writeFileIfChangedSync(
    join(normalizedPath, 'events.json'),
    JSON.stringify(events, null, 2)
  );

  // Generate search index
  generateSearchIndex(events);
  console.log('🔍 Search index generated');

  // Copy Fuse.js ESM to dist/scripts/
  mkdirSync(join(DIST_DIR, 'scripts'), { recursive: true });
  copyFileIfChangedSync(
    join(import.meta.dir, '../node_modules/fuse.js/dist/fuse.mjs'),
    join(DIST_DIR, 'scripts/fuse.mjs')
  );

  let pagesGenerated = 0;
  // null entries = generated-but-noindexed empty filter pages (Phase-2 A2);
  // stripped before the manifest + sitemap consumers below.
  const generatedUrls: Array<string | null> = [];

  // S161: precompute imageless-card tiles (Satori → inline SVG) before any
  // renderer runs. Card renderers do a sync getEventTile(id) lookup; this
  // populates the cache for every imageless pageable event.
  console.log('🎴 Precomputing imageless-card tiles...');
  const tilesGenerated = await precomputeEventTiles(pageableEvents);
  console.log(`  ✓ Generated ${tilesGenerated} tiles`);

  // Generate core time pages
  console.log('📄 Generating core pages...');
  for (const time of TIME_RANGES) {
    const url = await generatePage({ time }, events);
    generatedUrls.push(url);
    pagesGenerated++;
  }

  // Generate homepage — truncated entry point with hub navigation
  const athensNow = DateTime.now().setZone('Europe/Athens');
  const dayOfWeek = athensNow.weekday; // 1=Mon..7=Sun
  const todayEvents = filterEvents(events, { time: 'today' as TimeRange });

  const weekendEvents = filterEvents(events, { time: 'this-weekend' as TimeRange });

  let heroHtml = '';
  if (todayEvents.length >= 3) {
    heroHtml = renderHeroSection(todayEvents, 'today');
  } else if (dayOfWeek >= 5) {
    heroHtml = renderHeroSection(weekendEvents, 'weekend');
  } else if (todayEvents.length > 0) {
    heroHtml = renderHeroSection(todayEvents, 'today');
  } else {
    const weekEvents = filterEvents(events, { time: 'this-week' as TimeRange });
    heroHtml = renderHeroSection(weekEvents, 'coming-days');
  }

  // Load hub config for homepage navigation
  const hubPagesConfig: { hubs: HubConfig[] } = JSON.parse(
    readFileSync(join(import.meta.dir, '../config/hub-pages.json'), 'utf-8')
  );

  // Truncate homepage to 24 events
  const HOMEPAGE_EVENT_LIMIT = 24;
  const homepageEvents = events.slice(0, HOMEPAGE_EVENT_LIMIT);

  // Compute hub data for homepage navigation grid
  const hubNavData: HubNavItem[] = hubPagesConfig.hubs
    .map(hub => ({
      slug: hub.slug,
      titleEl: hub.titleEl,
      titleEn: hub.titleEn,
      path: `/${hub.slug}/`,
      eventCount: getHubEvents(hub, events).length,
      type: hub.filter.type === 'event_type' ? hub.filter.value
          : hub.filter.type === 'price_type' ? hub.filter.value
          : hub.slug,
    }))
    .filter(h => h.eventCount > 0);

  // Compute capsule stats from ALL events (not truncated).
  // Phase-2 B3 (visibility 2026-07-08): every capsule chip links to a hub —
  // its number MUST be the number that hub states, or the homepage contradicts
  // itself on the same claim (Θέατρο said 33 in the capsule, 37 in the grid:
  // the capsule counted type==='theater' while the hub includes performance).
  // One source per claim: getHubEvents, same as the grid and the hub page.
  const hubCount = (slug: string, fallback: number): number => {
    const hub = hubPagesConfig.hubs.find(h => h.slug === slug);
    return hub ? getHubEvents(hub, events).length : fallback;
  };
  const capsuleStats: CapsuleStats = {
    total: events.length,
    today: hubCount('today', todayEvents.length),
    weekend: hubCount('this-weekend', weekendEvents.length),
    concerts: hubCount('concerts', events.filter(e => e.type === 'concert').length),
    theater: hubCount('theatre', events.filter(e => e.type === 'theater').length),
    open: hubCount('open', events.filter(e => e.price.type === 'open').length),
    typeCount: new Set(events.map(e => e.type)).size,
  };

  // Build homepage pre-content: hero + answer capsule + hub nav
  const homepagePreContent = heroHtml
    + renderHomepageCapsule(capsuleStats)
    + renderHubNavGrid(hubNavData);

  // Build terminal CTA (injected after card grid)
  const homepagePostContent = renderTerminalCta(hubNavData);

  // Bypass generatePage — render directly without filter bar (no allEvents)
  // Phase-2 B3: metadata eventCount feeds the "N εκδηλώσεις στην Αθήνα"
  // meta/og description — an Athens-wide claim gets the Athens-wide count,
  // not the 24-card page cap (the old value contradicted the capsule total).
  const homeMetadata = buildPageMetadata({}, events.length);
  homeMetadata.pageType = 'homepage';
  const homeHtml = renderPage(homeMetadata, homepageEvents, undefined, homepagePreContent, 'el', homepagePostContent);
  const homeFilepath = join(DIST_DIR, 'index.html');
  writeHtmlIfChangedSync(homeFilepath, homeHtml);

  // Write homepage JSON API
  const homeApiDir = join(DIST_DIR, 'api');
  if (!existsSync(homeApiDir)) {
    mkdirSync(homeApiDir, { recursive: true });
  }
  writeJsonApiIfChangedSync(
    join(homeApiDir, 'index.json'),
    {
      filters: {},
      events: homepageEvents,
      meta: {
        total: homepageEvents.length,
        totalAll: events.length,
        lastUpdate: new Date().toISOString(),
        url: `${BASE_URL}/`
      }
    }
  );

  generatedUrls.push('index');
  pagesGenerated++;

  // Generate type pages
  console.log('📄 Generating type pages...');
  // S132: Skip bare {type: X} pages whose filter is already covered by a curated
  // category page (e.g., /concert duplicates /concerts with identical title).
  // Time/price/genre variants don't collide and are still emitted below.
  const curatedBareTypes = new Set<string>(
    CATEGORIES_CONFIG.categories
      .filter(c => {
        const f = (c as { filter?: Record<string, unknown> }).filter ?? {};
        return typeof f.type === 'string' && !('genresInclude' in f) && Object.keys(f).length === 1;
      })
      .map(c => (c as { filter: { type: string } }).filter.type)
  );

  for (const type of EVENT_TYPES) {
    // Type only (all time) — skip if a curated category covers the same filter
    if (!curatedBareTypes.has(type)) {
      generatedUrls.push(await generatePage({ type }, events));
      pagesGenerated++;
    }

    // Type × Time
    for (const time of TIME_RANGES) {
      // 'all-events' produces the same URL as bare type (buildURL strips the
      // 'all-events' suffix) — re-emitting it duplicates the bare-type entry,
      // and for curated types would re-introduce the deprecated singular slug.
      if (time === 'all-events') continue;
      generatedUrls.push(await generatePage({ type, time }, events));
      pagesGenerated++;
    }
  }

  // Generate price pages
  console.log('📄 Generating price pages...');
  for (const price of PRICE_FILTERS.filter(p => p !== 'all')) {
    // Price only
    generatedUrls.push(await generatePage({ price }, events));
    pagesGenerated++;

    // Price × Time
    for (const time of TIME_RANGES) {
      generatedUrls.push(await generatePage({ price, time }, events));
      pagesGenerated++;
    }
  }

  // Generate Type × Price pages
  console.log('📄 Generating type + price pages...');
  for (const type of EVENT_TYPES) {
    for (const price of PRICE_FILTERS.filter(p => p !== 'all')) {
      // Type + Price
      generatedUrls.push(await generatePage({ type, price }, events));
      pagesGenerated++;

      // Type + Price + Time
      for (const time of TIME_RANGES) {
        generatedUrls.push(await generatePage({ type, price, time }, events));
        pagesGenerated++;
      }
    }
  }

  // Generate genre pages (top genres only)
  console.log('📄 Generating genre pages...');
  for (const type of EVENT_TYPES) {
    const genres = GENRES[type].slice(0, 5); // Top 5 per type

    for (const genre of genres) {
      // Genre × Time
      for (const time of TIME_RANGES) {
        generatedUrls.push(await generatePage({ type, genre, time }, events));
        pagesGenerated++;
      }

      // Genre × Price × Time
      for (const price of PRICE_FILTERS.filter(p => p !== 'all')) {
        for (const time of TIME_RANGES) {
          generatedUrls.push(await generatePage({ type, genre, price, time }, events));
          pagesGenerated++;
        }
      }
    }
  }

  // Generate category landing pages
  console.log('\n📁 Generating category landing pages...');
  const categoryUrls = await generateCategoryPages(events);
  generatedUrls.push(...categoryUrls);
  pagesGenerated += categoryUrls.length;

  // Pre-compute event-set hashes for cornerstone hubs — gates JSON-LD
  // datePublished/dateModified via resolveLastModified so timestamps reflect
  // actual content changes, not build cron. Cornerstones are explicitly
  // listed (opt-in), not derived from config.cornerstone === true, so adding
  // a cornerstone here is a deliberate edit.
  const { loadManifest: loadEventSetManifest, saveManifest: saveEventSetManifest } =
    await import('./sitemap/content-hasher');
  const { gateCornerstoneHashes } = await import('./utils/gate-cornerstones');
  const eventSetManifestPath = join(import.meta.dir, '../data/event-set-hashes.json');
  const eventSetManifest = loadEventSetManifest(eventSetManifestPath);
  const GATED_CORNERSTONES = ['this-weekend', 'today', 'this-month', 'open'] as const;
  const cornerstoneInputs = GATED_CORNERSTONES.flatMap(slug => {
    const config = hubPagesConfig.hubs.find(h => h.slug === slug);
    if (!config) return [];
    const cornerstoneEvents = getHubEvents(config, events);
    if (cornerstoneEvents.length === 0) return [];
    return [{ slug, events: cornerstoneEvents }];
  });
  const { el: lastUpdateOverrides, en: lastUpdateOverridesEn } =
    gateCornerstoneHashes(cornerstoneInputs, eventSetManifest);

  // Generate hub pages (enhanced versions of existing listing pages)
  console.log('\n📄 Generating hub pages...');
  const hubSlugs = generateHubPages(events, lastUpdateOverrides);
  console.log(`  ✓ ${hubSlugs.length} hub pages enhanced`);

  // Generate English hub pages for hubs with answerCapsuleEn
  console.log('\n🇬🇧 Generating English hub pages...');
  const { renderHubPage } = await import('./generators/hub-page');
  const bilingualHubSlugs = new Set<string>();
  for (const config of hubPagesConfig.hubs) {
    if (!config.answerCapsuleEn) continue;
    const filteredEvents = getHubEvents(config, events);
    if (filteredEvents.length < 3) continue;
    const enLastUpdate = lastUpdateOverridesEn[config.slug];
    const html = renderHubPage(config, filteredEvents, events, undefined, 'en', enLastUpdate);
    if (!html) continue;
    mkdirSync(join(DIST_DIR, 'en', config.slug), { recursive: true });
    writeHtmlIfChangedSync(join(DIST_DIR, 'en', config.slug, 'index.html'), html);
    generatedUrls.push(`en/${config.slug}/`);
    bilingualHubSlugs.add(config.slug);
    pagesGenerated++;
  }
  console.log(`  ✓ ${bilingualHubSlugs.size} English hub pages generated`);
  saveEventSetManifest(eventSetManifest, eventSetManifestPath);

  // Generate overflow /all/ pages for hubs exceeding HUB_EVENT_LIMIT
  const { HUB_EVENT_LIMIT, renderOverflowPage } = await import('./generators/hub-page');
  console.log('\n📄 Generating hub overflow pages...');
  let overflowCount = 0;
  const overflowSlugsEl = new Set<string>();
  const overflowSlugsEn = new Set<string>();
  for (const config of hubPagesConfig.hubs) {
    const filteredEvents = getHubEvents(config, events);
    if (filteredEvents.length <= HUB_EVENT_LIMIT) continue;

    // Greek overflow page
    const overflowHtml = renderOverflowPage(config, filteredEvents, events, 'el');
    const overflowDir = join(DIST_DIR, config.slug, 'all');
    mkdirSync(overflowDir, { recursive: true });
    writeHtmlIfChangedSync(join(overflowDir, 'index.html'), overflowHtml);
    // NOT added to generatedUrls — noindex pages excluded from sitemap
    overflowSlugsEl.add(config.slug);
    overflowCount++;

    // English overflow page (if bilingual hub)
    if (config.answerCapsuleEn && filteredEvents.length >= 3) {
      const enHtml = renderOverflowPage(config, filteredEvents, events, 'en');
      const enDir = join(DIST_DIR, 'en', config.slug, 'all');
      mkdirSync(enDir, { recursive: true });
      writeHtmlIfChangedSync(join(enDir, 'index.html'), enHtml);
      overflowSlugsEn.add(config.slug);
      overflowCount++;
    }
  }
  console.log(`  ✓ ${overflowCount} overflow pages generated`);

  // Phase-2 follow-up (2026-07-18): sweep stale HUB artifacts — same class as
  // the venue-orphan sweep in generateVenuePages. dist/ persists across builds
  // and is the deploy source, so an overflow all/ dir or EN hub dir whose
  // generation gate stops firing ships forever (live examples caught
  // post-merge: /today/all/ from Jun 27 still carrying pre-fix JSON-LD stubs,
  // /en/exhibitions/ from Jun 12). Deletion is BOUNDED to slugs declared in
  // hub-pages.json — nothing outside the hub page class (en/events/,
  // en/about/, …) is ever a candidate. Order matters: en/<slug>/all is listed
  // before en/<slug> (removing the latter also removes the former).
  let sweptHubArtifacts = 0;
  for (const config of hubPagesConfig.hubs) {
    const slug = config.slug;
    const staleCandidates: Array<[string, boolean]> = [
      [join(DIST_DIR, slug, 'all'), overflowSlugsEl.has(slug)],
      [join(DIST_DIR, 'en', slug, 'all'), overflowSlugsEn.has(slug)],
      [join(DIST_DIR, 'en', slug), bilingualHubSlugs.has(slug)],
    ];
    for (const [dir, generatedThisBuild] of staleCandidates) {
      if (generatedThisBuild || !existsSync(dir)) continue;
      rmSync(dir, { recursive: true, force: true });
      sweptHubArtifacts++;
    }
  }
  if (sweptHubArtifacts > 0) {
    console.log(`  ✓ swept ${sweptHubArtifacts} stale hub artifact dir(s)`);
  }

  // Generate individual event pages (Phase C.3)
  // Uses pageableEvents: upcoming + past-active events (≤45 days) get pages
  console.log('\n📄 Generating individual event pages...');
  const previousSlugHistory = loadSlugHistory();
  // S146: shared page-existence predicate. Computed from the FULL events array
  // (same input venue-page.ts uses), so url/href emission in event pages stays
  // in lockstep with which venue pages actually generate. Drift = dangling links.
  const pagedVenueSlugs = computePagedVenueSlugs(events);
  const { urls: eventPageUrls, slugMap: currentSlugs, pastEventUrls, pagesWritten: eventPagesWritten } = await generateEventPages(pageableEvents, pagedVenueSlugs);
  generatedUrls.push(...eventPageUrls);
  pagesGenerated += eventPagesWritten;

  // Generate English event pages for events with fullDescriptionEn
  console.log('\n🇬🇧 Generating English event pages...');
  const { renderEventDetailPage, generateEventSlug, selectRelatedEvents } = await import('./generators/event-page');
  const englishEvents = pageableEvents.filter(e => e.fullDescriptionEn);
  const bilingualSlugs = new Set<string>();
  const enEventsDir = join(DIST_DIR, 'en/events');
  if (englishEvents.length > 0) {
    mkdirSync(enEventsDir, { recursive: true });
  }

  // Reuse venue grouping for related events
  const eventsByVenueEn = new Map<string, Event[]>();
  for (const event of pageableEvents) {
    const venueEvents = eventsByVenueEn.get(event.venue.name) || [];
    venueEvents.push(event);
    eventsByVenueEn.set(event.venue.name, venueEvents);
  }

  for (const event of englishEvents) {
    const slug = generateEventSlug(event);
    bilingualSlugs.add(slug);

    // Related events at same venue (max 6, upcoming only — shared helper
    // with the Greek pages; pageableEvents includes past-active ≤45d)
    const venueEvents = eventsByVenueEn.get(event.venue.name) || [];
    const relatedEvents = selectRelatedEvents(venueEvents, event.id);

    const html = renderEventDetailPage(event, relatedEvents, 'en', pagedVenueSlugs);
    const pageDir = join(enEventsDir, slug);
    if (!existsSync(pageDir)) {
      mkdirSync(pageDir, { recursive: true });
    }
    writeHtmlIfChangedSync(join(pageDir, 'index.html'), html);
    // F2b/G3: same gate as the EL push — a noindexed (cooling) EN page is
    // generated but never advertised. One lifecycle predicate, both locales.
    if (!shouldNoindexEvent(event)) {
      generatedUrls.push(`en/events/${slug}/`);
    }
  }
  pagesGenerated += englishEvents.length;
  console.log(`  ✓ Generated ${englishEvents.length} English event pages`);

  // Generate per-event OG images (only for events without self-hosted images)
  console.log('\n🖼️  Generating per-event OG images...');
  await generateEventOgImages(pageableEvents);

  // Generate per-hub OG images
  console.log('🖼️  Generating per-hub OG images...');
  const hubEventCounts = new Map<string, number>();
  for (const hub of hubPagesConfig.hubs) {
    hubEventCounts.set(hub.slug, getHubEvents(hub, events).length);
  }
  await generateHubOgImages(hubPagesConfig.hubs, hubEventCounts);

  // Initialize _redirects (sitemap redirect only — /en/* redirect removed for bilingual pages)
  const redirectsPath = join(DIST_DIR, '_redirects');
  writeFileIfChangedSync(redirectsPath, `https://agentathens.netlify.app/*  ${BASE_URL}/:splat  301!\n/sitemap.xml  /sitemap-index.xml  301\n/en  /en/today  302\n/en/  /en/today  302\n`);

  // Save slug history and generate redirects (for changed slugs)
  saveSlugHistory(currentSlugs, previousSlugHistory);
  const redirects = generateRedirects(currentSlugs, previousSlugHistory);
  if (redirects.length > 0) {
    const existingRedirects = readFileSync(redirectsPath, 'utf-8');
    writeFileIfChangedSync(redirectsPath, existingRedirects + '\n' + redirects.join('\n'));
    console.log(`  ✓ Generated ${redirects.length} redirects for changed slugs`);
  }

  // GEO Ruling 2 §2 — explicit 410 for archive-phase (>45d) event URLs, bounded
  // to the trailing 45–90d band (aging past 90d IS the prune). Partitioned below
  // the slug-change 301s; event pages ONLY. Force-410 defeats lingering-dist-dir
  // shadowing. Enumerated from locationFiltered via the classifier's own
  // resolveEffectiveEnd keying (single source — no parallel date arithmetic).
  const preservedUrls = loadBacklinkPreservedUrls();
  const goneRules = generateArchiveGoneRules(locationFiltered, { preservedUrls });
  if (goneRules.length > 0) {
    const existingRedirects = readFileSync(redirectsPath, 'utf-8');
    writeFileIfChangedSync(
      redirectsPath,
      existingRedirects + '\n\n# archive-410 (GEO Ruling 2 — bounded 45–90d band; event pages only)\n' + goneRules.join('\n') + '\n'
    );
    console.log(`  ✓ Generated ${goneRules.length} archive-410 rules (45–90d band)${preservedUrls.size ? `, ${preservedUrls.size} preserved` : ''}`);
  }

  // Generate venue pages (Phase C.5)
  console.log('\n🏛️ Generating venue pages...');
  const venuePageUrls = await generateVenuePages(events, venueImageMap);
  generatedUrls.push(...venuePageUrls);
  pagesGenerated += venuePageUrls.length;

  // Generate content pages (about, editorial, corrections)
  console.log('\n📄 Generating content pages...');
  const todayIso = DateTime.now().setZone('Europe/Athens').toISODate();
  const publisher = {
    '@type': 'Organization',
    'name': ORGANIZATION_SCHEMA.name,
    'url': ORGANIZATION_SCHEMA.url
  };

  // proofMetrics: anti-drift reader. Numbers flow from live artifacts, not literals.
  // pageableEvents.length is the only correct event-count denominator (the raw
  // location_status SQL filter returns 11,643 — the historical count, not pageable).
  const metrics = proofMetrics({ pageableCount: pageableEvents.length });

  // Bilingual content page pairs: { baseSlug, el: {...}, en: {...} }
  const contentPagePairs = [
    {
      baseSlug: 'about',
      el: {
        slug: 'about',
        title: 'Σχετικά',
        metaDescription: 'Agent Athens — Ημερήσιο πολιτιστικό ημερολόγιο Αθήνας με AI. Ποιοι είμαστε, πώς λειτουργούμε, τι καλύπτουμε.',
        schemaJson: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'AboutPage',
          'name': 'Σχετικά με το agent athens',
          'url': `${BASE_URL}/about/`,
          'description': 'Agent Athens — Ημερήσιο πολιτιστικό ημερολόγιο Αθήνας με AI. Ποιοι είμαστε, πώς λειτουργούμε, τι καλύπτουμε.',
          'inLanguage': 'el',
          publisher,
          'datePublished': '2026-03-02',
          'dateModified': todayIso
        }, null, 2),
        bodyHtml: `
        <h1>Σχετικά με το agent athens</h1>
        <p>Το agent athens είναι ένα ημερήσιο πολιτιστικό ημερολόγιο για την Αθήνα. Συγκεντρώνουμε, επαληθεύουμε και εμπλουτίζουμε εκδηλώσεις από δεκάδες πηγές, χρησιμοποιώντας τεχνητή νοημοσύνη και ανθρώπινη επίβλεψη.</p>

        <h2>Τι κάνουμε</h2>
        <p>Κάθε μέρα, αυτοματοποιημένοι scrapers συλλέγουν εκδηλώσεις από πάνω από 15 επαληθευμένους χώρους και πλατφόρμες εισιτηρίων στην Αθήνα. Καλύπτουμε συναυλίες, εκθέσεις, θέατρο, κλασική μουσική, DJ sets, σινεμά, παραστάσεις χορού, εργαστήρια, φεστιβάλ, και events τεχνολογίας.</p>
        <p>Κάθε εκδήλωση περνάει από αυτόματο φιλτράρισμα τοποθεσίας — εμφανίζονται μόνο εκδηλώσεις σε επαληθευμένους χώρους της Αττικής. Οι περιγραφές εμπλουτίζονται με πληροφορίες πρόσβασης, ιστορικό χώρου και πρακτικές λεπτομέρειες.</p>

        <h2>Πώς λειτουργεί</h2>
        <p>Η πλατφόρμα βασίζεται σε ανοικτό κώδικα (Bun, TypeScript, SQLite). Κάθε πρωί στις 08:00 ώρα Αθήνας εκτελείται η πλήρης αλυσίδα: συλλογή δεδομένων, επαλήθευση χώρων, εμπλουτισμός περιγραφών, δημιουργία σελίδων. Το site αναπτύσσεται ως στατικό HTML στο Netlify για μέγιστη ταχύτητα φόρτωσης.</p>
        <p>Η τεχνητή νοημοσύνη χρησιμοποιείται αποκλειστικά για τον εμπλουτισμό περιγραφών — δεν κατασκευάζει πληροφορίες. Κάθε εμπλουτισμένη περιγραφή βασίζεται σε πραγματικά δεδομένα από τις πρωτογενείς πηγές.</p>

        <h2>Γεωγραφική κάλυψη</h2>
        <p>Καλύπτουμε εκδηλώσεις σε χώρους σε ολόκληρη την Αττική, με έμφαση στο κέντρο της Αθήνας. Οι γειτονιές που καλύπτονται περιλαμβάνουν Κολωνάκι, Μετς, Εξάρχεια, Πλάκα, Γκάζι, Κεραμεικό, Κουκάκι, Παγκράτι, Πετράλωνα, Μαρούσι, και πολλές ακόμα.</p>

        <h2>Συχνότητα ενημέρωσης</h2>
        <p>Το ημερολόγιο ενημερώνεται καθημερινά. Νέες εκδηλώσεις εμφανίζονται αυτόματα, ενώ παρελθούσες εκδηλώσεις αφαιρούνται. Κάθε σελίδα εκδήλωσης περιέχει δομημένα δεδομένα Schema.org για αναζητήσεις και AI agents.</p>

        <h2>Επικοινωνία</h2>
        <p>Για ερωτήσεις, προτάσεις ή αναφορά σφαλμάτων, επικοινωνήστε μαζί μας μέσω <a href="https://github.com/chrimar3/agent-athens/issues">GitHub Issues</a> ή email στο cmarag8@gmail.com.</p>
      `
      },
      en: {
        slug: 'en/about',
        title: 'About',
        metaDescription: 'Agent Athens — Daily AI-curated cultural events calendar for Athens. Who we are, how we work, what we cover.',
        schemaJson: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'AboutPage',
          'name': 'About agent athens',
          'url': `${BASE_URL}/en/about/`,
          'description': 'Agent Athens — Daily AI-curated cultural events calendar for Athens. Who we are, how we work, what we cover.',
          'inLanguage': 'en',
          publisher,
          'datePublished': '2026-03-07',
          'dateModified': todayIso
        }, null, 2),
        bodyHtml: `
        <h1>About agent athens</h1>
        <p>Agent athens is a daily cultural events calendar for Athens. We aggregate, verify and enrich events from dozens of sources, combining AI enrichment with human oversight.</p>

        <h2>What we do</h2>
        <p>Every day, automated scrapers collect events from ${ACTIVE_SOURCE_COUNT} verified venues and ticketing platforms across Athens. We cover concerts, exhibitions, theatre, classical music, DJ sets, cinema, dance performances, workshops, festivals and tech events.</p>
        <p>Every event passes through automated location filtering — only events at verified Attica venues are shown. Descriptions are enriched with access information, venue history and practical details.</p>

        <h2>How it works</h2>
        <p>The platform is built on open-source technology (Bun, TypeScript, SQLite). Every morning at 08:00 Athens time the full pipeline runs: data collection, venue verification, description enrichment, page generation. The site is deployed as static HTML on Netlify for maximum load speed.</p>
        <p>AI is used exclusively for description enrichment — it does not fabricate information. Every enriched description is grounded in real data from primary sources.</p>

        <h2>Geographic coverage</h2>
        <p>We cover events at venues across the Attica region, with emphasis on central Athens. Covered neighbourhoods include Kolonaki, Mets, Exarchia, Plaka, Gazi, Kerameikos, Koukaki, Pangrati, Petralona, Marousi and many more.</p>

        <h2>Update frequency</h2>
        <p>The calendar is updated daily. New events appear automatically, while past events are removed. Every event page includes Schema.org structured data for search engines and AI agents.</p>

        <h2>Contact</h2>
        <p>For questions, suggestions or error reports, reach us via <a href="https://github.com/chrimar3/agent-athens/issues">GitHub Issues</a> or email at cmarag8@gmail.com.</p>
      `
      },
    },
    {
      baseSlug: 'editorial',
      el: {
        slug: 'editorial',
        title: 'Σύνταξη',
        metaDescription: 'Πώς δημιουργούμε τις περιγραφές εκδηλώσεων — πηγές, μεθοδολογία, ποιοτικός έλεγχος. Agent Athens.',
        schemaJson: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          'name': 'Συντακτική πολιτική — agent athens',
          'url': `${BASE_URL}/editorial/`,
          'description': 'Πώς δημιουργούμε τις περιγραφές εκδηλώσεων — πηγές, μεθοδολογία, ποιοτικός έλεγχος. Agent Athens.',
          'inLanguage': 'el',
          publisher,
          'datePublished': '2026-03-02',
          'dateModified': todayIso
        }, null, 2),
        bodyHtml: `
        <h1>Συντακτική πολιτική</h1>
        <p>Το agent athens συνδυάζει αυτοματοποιημένη συλλογή δεδομένων, εμπλουτισμό με τεχνητή νοημοσύνη, και ανθρώπινη επίβλεψη για να παρέχει αξιόπιστες πληροφορίες πολιτιστικών εκδηλώσεων.</p>

        <h2>Πηγές δεδομένων</h2>
        <p>Συλλέγουμε εκδηλώσεις από ${ACTIVE_SOURCE_COUNT} επαληθευμένες πηγές, συμπεριλαμβανομένων:</p>
        <ul>
          <li>Ιστοσελίδες χώρων (Half Note, Μέγαρο Μουσικής, Στέγη Ωνάση, Μουσείο Μπενάκη κ.ά.)</li>
          <li>Πλατφόρμες εισιτηρίων (Ticket Services, More.com, Eventbrite)</li>
          <li>Πολιτιστικά ημερολόγια (Athinorama, Resident Advisor)</li>
        </ul>
        <p>Κάθε πηγή αναφέρεται ρητά στη σελίδα της εκδήλωσης, με σύνδεσμο στην πρωτογενή καταχώρηση.</p>

        <h2>Μεθοδολογία εμπλουτισμού AI</h2>
        <p>Οι εμπλουτισμένες περιγραφές δημιουργούνται μέσω αυστηρής διαδικασίας:</p>
        <ul>
          <li>Η τεχνητή νοημοσύνη λαμβάνει μόνο πραγματικά δεδομένα από τις πηγές — δεν κατασκευάζει πληροφορίες</li>
          <li>Κάθε περιγραφή ακολουθεί τυποποιημένη δομή 8 ενοτήτων με ελάχιστα και μέγιστα μήκη</li>
          <li>Το σύστημα ελέγχει αυτόματα για γεωγραφική ακρίβεια, χρονική συνέπεια, και εγκυρότητα τιμών</li>
          <li>Πληροφορίες πρόσβασης (μετρό, λεωφορεία, parking) βασίζονται σε επαληθευμένη βάση γνώσης χώρων</li>
        </ul>

        <h2>Ποιοτικός έλεγχος</h2>
        <p>Κάθε εκδήλωση περνάει από πολλαπλά επίπεδα ελέγχου:</p>
        <ul>
          <li><strong>Φίλτρο τοποθεσίας:</strong> Μόνο χώροι στην Αττική, επαληθευμένοι μέσω whitelist χώρων</li>
          <li><strong>Έλεγχος δεδομένων:</strong> Αυτόματη επικύρωση ημερομηνιών, τιμών και βασικών πεδίων</li>
          <li><strong>Πύλες ποιότητας:</strong> Οι εμπλουτισμένες περιγραφές ελέγχονται για factual accuracy — καμία πληροφορία δεν κατασκευάζεται</li>
          <li><strong>Ανθρώπινη εποπτεία:</strong> Τακτικός έλεγχος δειγμάτων και αναθεώρηση κανόνων ποιότητας</li>
        </ul>

        <h2>Πολιτική μη κατασκευής πληροφοριών</h2>
        <p>Δεσμευόμαστε ότι καμία πληροφορία στις περιγραφές μας δεν είναι κατασκευασμένη. Αν κάτι δεν μπορεί να επαληθευτεί από τις πρωτογενείς πηγές, δεν συμπεριλαμβάνεται. Αυτό ισχύει ιδιαίτερα για τιμές εισιτηρίων, ώρες έναρξης, και χώρους διεξαγωγής.</p>

        <h2>Ενημερώσεις</h2>
        <p>Το ημερολόγιο ενημερώνεται καθημερινά στις 08:00 ώρα Αθήνας. Παρελθούσες εκδηλώσεις αφαιρούνται αυτόματα, ενώ τρέχουσες εκθέσεις παραμένουν μέχρι τη λήξη τους.</p>
      `
      },
      en: {
        slug: 'en/editorial',
        title: 'Editorial Policy',
        metaDescription: 'How we create event descriptions — data sources, AI enrichment methodology, quality control. Agent Athens.',
        schemaJson: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          'name': 'Editorial policy — agent athens',
          'url': `${BASE_URL}/en/editorial/`,
          'description': 'How we create event descriptions — data sources, AI enrichment methodology, quality control. Agent Athens.',
          'inLanguage': 'en',
          publisher,
          'datePublished': '2026-03-07',
          'dateModified': todayIso
        }, null, 2),
        bodyHtml: `
        <h1>Editorial policy</h1>
        <p>Agent athens combines automated data collection, AI enrichment and human oversight to provide reliable cultural event information.</p>

        <h2>Data sources</h2>
        <p>We collect events from ${ACTIVE_SOURCE_COUNT} verified sources, including:</p>
        <ul>
          <li>Venue websites (Half Note, Megaron Moussikis, Onassis Stegi, Benaki Museum and others)</li>
          <li>Ticketing platforms (Ticket Services, More.com, Eventbrite)</li>
          <li>Cultural listings (Athinorama, Resident Advisor)</li>
        </ul>
        <p>Each source is cited explicitly on the event page, with a link to the original listing.</p>

        <h2>AI enrichment methodology</h2>
        <p>Enriched descriptions are produced through a strict process:</p>
        <ul>
          <li>AI receives only real data from sources — it does not fabricate information</li>
          <li>Each description follows a standardised 8-section structure with minimum and maximum lengths</li>
          <li>The system automatically checks for geographic accuracy, temporal consistency and price validity</li>
          <li>Access information (metro, buses, parking) is drawn from a verified venue knowledge base</li>
        </ul>

        <h2>Quality control</h2>
        <p>Every event passes through multiple levels of verification:</p>
        <ul>
          <li><strong>Location filter:</strong> Only Attica venues, verified via a venue whitelist</li>
          <li><strong>Data validation:</strong> Automated verification of dates, prices and core fields</li>
          <li><strong>Quality gates:</strong> Enriched descriptions are checked for factual accuracy — no information is fabricated</li>
          <li><strong>Human oversight:</strong> Regular sample reviews and quality-rule audits</li>
        </ul>

        <h2>No-fabrication policy</h2>
        <p>We are committed to ensuring that no information in our descriptions is fabricated. If something cannot be verified from primary sources, it is not included. This applies especially to ticket prices, start times and venues.</p>

        <h2>Updates</h2>
        <p>The calendar is updated daily at 08:00 Athens time. Past events are removed automatically, while running exhibitions remain until their end date.</p>
      `
      },
    },
    {
      baseSlug: 'corrections',
      el: {
        slug: 'corrections',
        title: 'Διορθώσεις',
        metaDescription: 'Αναφορά σφαλμάτων και πολιτική διορθώσεων — Agent Athens πολιτιστικές εκδηλώσεις Αθήνα.',
        schemaJson: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          'name': 'Πολιτική διορθώσεων — agent athens',
          'url': `${BASE_URL}/corrections/`,
          'description': 'Αναφορά σφαλμάτων και πολιτική διορθώσεων — Agent Athens πολιτιστικές εκδηλώσεις Αθήνα.',
          'inLanguage': 'el',
          publisher,
          'datePublished': '2026-03-02',
          'dateModified': todayIso
        }, null, 2),
        bodyHtml: `
        <h1>Πολιτική διορθώσεων</h1>
        <p>Δεσμευόμαστε για ακρίβεια σε κάθε εκδήλωση που δημοσιεύουμε. Αν εντοπίσετε κάποιο σφάλμα, θέλουμε να το μάθουμε.</p>

        <h2>Πώς να αναφέρετε σφάλμα</h2>
        <p>Μπορείτε να αναφέρετε σφάλματα με δύο τρόπους:</p>
        <ul>
          <li><strong>GitHub:</strong> Δημιουργήστε ένα issue στο <a href="https://github.com/chrimar3/agent-athens/issues">github.com/chrimar3/agent-athens</a> — ιδανικό για λεπτομερείς αναφορές</li>
          <li><strong>Email:</strong> Στείλτε στο cmarag8@gmail.com με θέμα «Διόρθωση: [όνομα εκδήλωσης]»</li>
        </ul>
        <p>Στην αναφορά σας, παρακαλούμε συμπεριλάβετε τον σύνδεσμο της σελίδας εκδήλωσης και περιγραφή του σφάλματος.</p>

        <h2>Τι μπορεί να αναφερθεί</h2>
        <ul>
          <li>Λανθασμένες ημερομηνίες ή ώρες έναρξης</li>
          <li>Εσφαλμένες τιμές εισιτηρίων</li>
          <li>Λάθος χώρος διεξαγωγής ή διεύθυνση</li>
          <li>Εκδηλώσεις που δεν αφορούν την Αθήνα</li>
          <li>Ελλιπείς ή παραπλανητικές περιγραφές</li>
          <li>Ακυρωμένες εκδηλώσεις που εξακολουθούν να εμφανίζονται</li>
          <li>Σπασμένοι σύνδεσμοι προς πηγές ή εισιτήρια</li>
        </ul>

        <h2>Χρόνος απόκρισης</h2>
        <p>Οι διορθώσεις εφαρμόζονται εντός 24 ωρών. Κρίσιμα σφάλματα (λάθος τιμή, λάθος ημερομηνία) αντιμετωπίζονται άμεσα και αντικατοπτρίζονται στο επόμενο build. Για μη κρίσιμα ζητήματα (βελτίωση περιγραφής, ορθογραφικά), η διόρθωση γίνεται εντός της επόμενης ημέρας.</p>

        <h2>Διαφάνεια</h2>
        <p>Κάθε σελίδα εκδήλωσης αναφέρει την πηγή των δεδομένων. Ο κώδικας είναι ανοικτός στο <a href="https://github.com/chrimar3/agent-athens">GitHub</a> και οι κανόνες ποιότητας είναι δημόσια διαθέσιμοι. Πιστεύουμε ότι η διαφάνεια είναι θεμελιώδης για την αξιοπιστία.</p>
      `
      },
      en: {
        slug: 'en/corrections',
        title: 'Corrections',
        metaDescription: 'Report errors and correction policy — Agent Athens cultural events Athens.',
        schemaJson: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          'name': 'Correction policy — agent athens',
          'url': `${BASE_URL}/en/corrections/`,
          'description': 'Report errors and correction policy — Agent Athens cultural events Athens.',
          'inLanguage': 'en',
          publisher,
          'datePublished': '2026-03-07',
          'dateModified': todayIso
        }, null, 2),
        bodyHtml: `
        <h1>Correction policy</h1>
        <p>We are committed to accuracy in every event we publish. If you spot an error, we want to know.</p>

        <h2>How to report an error</h2>
        <p>You can report errors in two ways:</p>
        <ul>
          <li><strong>GitHub:</strong> Open an issue at <a href="https://github.com/chrimar3/agent-athens/issues">github.com/chrimar3/agent-athens</a> — ideal for detailed reports</li>
          <li><strong>Email:</strong> Send to cmarag8@gmail.com with subject "Correction: [event name]"</li>
        </ul>
        <p>In your report, please include the event page link and a description of the error.</p>

        <h2>What can be reported</h2>
        <ul>
          <li>Wrong dates or start times</li>
          <li>Incorrect ticket prices</li>
          <li>Wrong venue or address</li>
          <li>Events not related to Athens</li>
          <li>Incomplete or misleading descriptions</li>
          <li>Cancelled events that still appear</li>
          <li>Broken links to sources or tickets</li>
        </ul>

        <h2>Response time</h2>
        <p>Corrections are applied within 24 hours. Critical errors (wrong price, wrong date) are addressed immediately and reflected in the next build. For non-critical issues (description improvement, typos), the correction is made within the following day.</p>

        <h2>Transparency</h2>
        <p>Every event page cites its data source. The code is open on <a href="https://github.com/chrimar3/agent-athens">GitHub</a> and quality rules are publicly available. We believe transparency is fundamental to trust.</p>
      `
      },
    },
    {
      baseSlug: 'proof',
      // EN-only per D4. EL not generated until Greek launches as a
      // published+indexable+quality-gated product (paired with S144 hreflang
      // reactivation). availableLanguage:["en","el"] in the schema signals
      // intrinsic coverage without committing to a published EL page.
      // REACTIVATE: bilingual generation when Greek ships.
      enOnly: true,
      en: {
        slug: 'en/proof',
        title: 'Proof',
        metaDescription: 'How agent athens works — numbers from the current build\'s live artifacts: event pages, tests, Schema.org validity, search indexing.',
        schemaJson: JSON.stringify(buildProofSchema({ metrics, dateModified: todayIso ?? '' }), null, 2),
        bodyHtml: renderProofBody({ metrics, locale: 'en' })
      },
    },
    {
      baseSlug: 'colophon',
      // EN-only — the colophon is the recruiter-facing "about the maker" surface.
      // The page mirrors the same content rendered in the colophon dialog (via
      // src/templates/colophon.ts), so editing renderColophonContent() updates
      // both surfaces atomically — no drift.
      // TODO(geo-strategist): Person schema + sameAs → GitHub/LinkedIn on this
      // page. Deferred — the JSON-LD shape is owned by the GEO Strategist pass.
      enOnly: true,
      en: {
        slug: 'en/colophon',
        title: 'About me — Christos Maragkoudakis',
        metaDescription: 'Christos Maragkoudakis — AI systems, built end to end. About the maker of Agent Athens: how it was built, what it argues for, and what I\'m open to next.',
        schemaJson: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'AboutPage',
          'name': 'About me — Christos Maragkoudakis',
          'url': `${BASE_URL}/en/colophon/`,
          'description': 'Christos Maragkoudakis — AI systems, built end to end. About the maker of Agent Athens.',
          'inLanguage': 'en',
          publisher,
          'datePublished': '2026-05-23',
          'dateModified': todayIso
        }, null, 2),
        bodyHtml: renderColophonContent()
      },
    },
  ];

  // Generate content pages. Bilingual entries emit both locales; enOnly entries
  // (e.g. proof, where Greek is not yet quality-gated for indexing) emit EN only.
  // altSlug is undefined for enOnly — content-page.ts:50 already drops hreflang
  // globally per S144, so no hreflang annotation is emitted either way.
  for (const pair of contentPagePairs) {
    const isEnOnly = 'enOnly' in pair && pair.enOnly === true;
    for (const locale of ['el', 'en'] as const) {
      if (isEnOnly && locale === 'el') continue;
      const page = pair[locale];
      if (!page) continue; // type-narrowing safety for enOnly entries
      const altSlug = isEnOnly
        ? undefined
        : (locale === 'el' ? pair.en.slug : pair.el!.slug);
      // S(this) — dormant-locale noindex for bilingual el content pages. Driven
      // by the SAME set that drops them from the sitemap (BILINGUAL_CONTENT_SLUGS,
      // imported from generate-sitemaps.ts) so noindex and sitemap-absence stay
      // in lockstep. en twins (slug 'en/about') are not in the set → indexable.
      // Flips to index with the gate. Paired invariant: validateDormantLocaleNoindex.
      const dormantNoindex = !HREFLANG_GATE_OPEN && BILINGUAL_CONTENT_SLUGS.has(`${page.slug}/`);
      const html = renderContentPage(page.slug, page.title, page.bodyHtml, {
        metaDescription: page.metaDescription,
        schemaJson: page.schemaJson,
        locale,
        alternateSlug: altSlug,
        noindex: dormantNoindex,
      });
      const pageDir = join(DIST_DIR, page.slug);
      if (!existsSync(pageDir)) {
        mkdirSync(pageDir, { recursive: true });
      }
      writeHtmlIfChangedSync(join(pageDir, 'index.html'), html);
      generatedUrls.push(`${page.slug}/`);
      pagesGenerated++;
      console.log(`  ✓ /${page.slug}/`);
    }
  }

  // Generate /saved/ pages (el + en)
  console.log('\n💾 Generating saved-events pages...');
  const { renderSavedEventsScript, renderSavedPageScript } = await import('./templates/action-bar');
  for (const savedLocale of ['el', 'en'] as const) {
    const st = STRINGS[savedLocale];
    const savedSlug = savedLocale === 'en' ? 'en/saved' : 'saved';
    const savedAltSlug = savedLocale === 'en' ? 'saved' : 'en/saved';
    const savedBodyHtml = `
    <h1>${st.savedEvents}</h1>
    <noscript><p>${st.savedRequiresJs}</p></noscript>
    <div id="saved-events-list" class="saved-events-container"></div>
    <div class="saved-empty-state" id="saved-empty" style="display:none">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      <p>${st.savedEventsEmpty}</p>
    </div>`;
    const savedExtraScripts = renderSavedEventsScript() + renderSavedPageScript(savedLocale);
    const savedHtml = renderContentPage(savedSlug, st.savedEvents, savedBodyHtml, {
      metaDescription: st.savedEventsDesc,
      locale: savedLocale,
      alternateSlug: savedAltSlug,
      noindex: true,
      extraScripts: savedExtraScripts,
    });
    const savedPageDir = join(DIST_DIR, savedSlug);
    if (!existsSync(savedPageDir)) mkdirSync(savedPageDir, { recursive: true });
    writeHtmlIfChangedSync(join(savedPageDir, 'index.html'), savedHtml);
    // S(this) — saved pages are noindex (JS-only, no server-rendered content), so
    // they must NOT be advertised in any sitemap (a noindex URL in the sitemap is
    // the inverse sitemap↔robots drift). NOT added to generatedUrls — same policy
    // as /all/ overflow pages above. Paired invariant: validateDormantLocaleNoindex
    // (Rule 1: in-sitemap ⟹ indexable).
    pagesGenerated++;
    console.log(`  ✓ /${savedSlug}/ (noindex, sitemap-excluded)`);
  }

  // Generate 404 + 410 pages (410 is the archive-410 rewrite target — GEO Ruling 2)
  generate404Page();
  generate410Page();

  // Content-hash pass: compute hashes for all generated pages
  console.log('\n🔐 Computing content hashes...');
  const { loadManifest, hashContent, resolveLastModified, saveManifest } = await import('./sitemap/content-hasher');
  const { generateSplitSitemaps } = await import('./sitemap/generate-sitemaps');
  const previousManifest = loadManifest();
  const newManifest = { version: 1 as const, generatedAt: '', entries: {} as Record<string, { hash: string; lastModified: string }> };

  let unchangedCount = 0;
  let changedCount = 0;

  const uniqueUrls = [...new Set(generatedUrls.filter((u): u is string => u !== null))];

  for (const url of uniqueUrls) {
    // Map URL to file on disk
    let filePath: string;
    if (url === 'index') {
      filePath = join(DIST_DIR, 'index.html');
    } else if (url.endsWith('/')) {
      // Content pages: about/, editorial/, corrections/, en/about/, en/editorial/, en/corrections/
      filePath = join(DIST_DIR, url, 'index.html');
    } else if (url.startsWith('events/') || url.startsWith('venues/') || url.startsWith('en/events/') || url.startsWith('en/')) {
      // Event/venue/hub pages: events/slug/index.html, venues/slug/index.html, en/events/slug/index.html, en/slug/index.html
      filePath = join(DIST_DIR, url, 'index.html');
    } else {
      // Filter pages: slug.html
      filePath = join(DIST_DIR, `${url}.html`);
    }

    if (!existsSync(filePath)) continue;

    const html = readFileSync(filePath, 'utf-8');
    const hash = hashContent(html);
    const lastModified = resolveLastModified(url, hash, previousManifest);

    if (previousManifest.entries[url]?.hash === hash) {
      unchangedCount++;
    } else {
      changedCount++;
    }

    newManifest.entries[url] = { hash, lastModified };
  }

  saveManifest(newManifest);
  console.log(`  ✓ ${Object.keys(newManifest.entries).length} pages hashed (${unchangedCount} unchanged, ${changedCount} changed/new)`);

  // Copy static root files (GSC verification, Bing verification, etc.)
  // These live at /static/root-files/ in the repo and must survive clean rebuilds.
  copyStaticRootFiles();

  // Sweep orphaned dist/ entries. Event paths (dist/events, dist/en/events,
  // dist/api/<slug>.json in pageable set) use slug-membership against the DB —
  // armed by default (correctness-safe). Non-event paths fall back to mtime
  // and require SWEEP_ORPHANS=1 to delete.
  const validEventSlugs = new Set(pageableEvents.map(generateEventSlug));
  console.log('\n🔍 Checking for orphaned files...');
  sweepOrphans({
    distDir: DIST_DIR,
    validEventSlugs,
    buildStartTime,
    armNonEvent: process.env.SWEEP_ORPHANS === '1',
  });

  // S134 — Offer-omission telemetry.
  // Records build-time counts of Offer blocks omitted by buildOfferOrOmit,
  // broken down by source domain (athinorama.gr, manual-source-no-url,
  // past-event, etc.). Becomes the measurable baseline against which Sprint 2's
  // URL resolver coverage is later evaluated. Schema mirrors logs/indexnow-latest.json
  // for "stable machine-readable contract" pattern.
  const omissionsBySource = snapshotOfferOmissions();
  const totalOmitted = Object.values(omissionsBySource).reduce((a, b) => a + b, 0);
  const offerOmissionsLog = {
    build_timestamp: new Date(buildStartTime).toISOString(),
    total_omitted: totalOmitted,
    by_source: omissionsBySource,
  };
  const logsDir = join(import.meta.dir, '../logs');
  if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
  writeFileIfChangedSync(
    join(logsDir, 'offer-omissions-latest.json'),
    JSON.stringify(offerOmissionsLog, null, 2),
  );
  console.log(`📊 offer-omissions-latest.json: ${totalOmitted} total Offer blocks omitted (${Object.keys(omissionsBySource).length} sources)`);

  // Generate discovery files
  console.log('\n📄 Generating discovery files...');
  await generateLLMsTxt({
    events,
    venuePageUrls,
    categoryConfigs: CATEGORIES_CONFIG.categories,
    englishEventCount: englishEvents.length,
    englishHubCount: bilingualHubSlugs.size,
  });
  await generateRobotsTxt();

  // Sprint 2 Component A — Schema.org DataFeed at /api/events.json.
  // Discovery surface for AI agents and structured-data consumers; sibling
  // of llms.txt + robots.txt rather than appendix to the homepage block.
  // Written before validation at line 1032 so validateDataFeed can read it.
  const dataFeed = buildDataFeed(pageableEvents, 'el');
  writeDataFeed(dataFeed, join(DIST_DIR, 'api/events.json'));
  console.log(`  ✓ /api/events.json (${dataFeed.dataFeedElement.length} events)`);

  // Build priority overrides for past-active event pages (lower sitemap priority)
  const priorityOverrides = new Map<string, string>();
  for (const url of pastEventUrls) {
    priorityOverrides.set(url, '0.3');
  }
  const sitemapUrlCount = generateSplitSitemaps(generatedUrls.filter((u): u is string => u !== null), newManifest, priorityOverrides, bilingualSlugs, bilingualHubSlugs);
  await generateIndexNowKeyFile();

  // Build-time invariant: every declared canonical / sitemap <loc> must match
  // its 200-served form on Netlify, per-URL. Catches "canonical points at a
  // 301" bugs that break Bing/Google indexing (the bug class that blocked
  // /en/this-weekend pre-S153). Tier 1 build-fail discipline.
  const { validateDistCanonicalParity } = await import('./utils/dist-canonical-parity');
  const parityReport = validateDistCanonicalParity(DIST_DIR);
  if (parityReport.failures.length > 0) {
    console.error(`\n❌ Canonical parity invariant FAILED: ${parityReport.failures.length} violation${parityReport.failures.length === 1 ? '' : 's'}`);
    for (const f of parityReport.failures) {
      console.error(`   ${f.source}: ${f.reason}`);
      console.error(`     declared: ${f.declaredUrl}`);
    }
    console.error(`\nFix: align the declared URL form to its 200-served form. See docs/decisions.md (per-URL parity, 2026-05-23).`);
    process.exit(1);
  }
  console.log(`  ✓ canonical parity invariant: ${parityReport.passed} URLs verified`);

  // Build-time invariant: dormant-locale bare-root pages must be noindex AND
  // absent from every sitemap; any sitemap URL must stay indexable. Output-keyed
  // (reads emitted HTML + the 3 sitemaps + the dist/en/ twin set), so it survives
  // the runtime ≥3-event flip and never rots against a hardcoded slug list. This
  // is the paired half of the noindex emission (hub-page.ts + content-page el):
  // emission makes the dormant pages noindex; this makes any drift build-FAILing,
  // so a future generator that adds an /en/ twin without noindexing the bare-root
  // (the original Bing /today defect) cannot deploy. Tier-1 hard-stop discipline.
  const { validateDormantLocaleNoindex } = await import('./validators/dormant-locale-noindex');
  const dormantReport = validateDormantLocaleNoindex(DIST_DIR);
  if (dormantReport.failures.length > 0) {
    console.error(`\n❌ Dormant-locale noindex invariant FAILED: ${dormantReport.failures.length} violation${dormantReport.failures.length === 1 ? '' : 's'}`);
    for (const f of dormantReport.failures) {
      console.error(`   ✗ [${f.rule}] ${f.reason}`);
    }
    console.error(`\nFix: a bare-root page with an /en/ twin must emit <meta name="robots" content="noindex, follow"> AND be dropped from all sitemaps; a page in a sitemap must be indexable. See validateDormantLocaleNoindex + specs/dormant-locale-robots-meta-checkpoint.md.`);
    process.exit(1);
  }
  console.log(`  ✓ dormant-locale noindex invariant: ${dormantReport.passed} bare-root pages verified`);

  const buildDurationMs = Date.now() - buildStartTime;

  // Record generation stats to database
  recordGenerationStats(events.length, pagesGenerated, buildDurationMs, true);

  console.log(`\n✅ Site generation complete!`);
  console.log(`📊 Total pages generated: ${pagesGenerated}`);
  console.log(`   - ${eventPagesWritten} event pages (${englishEvents.length} English; ${eventPageUrls.length} in sitemap)`);
  console.log(`   - ${hubSlugs.length} hub pages (${bilingualHubSlugs.size} English, ${overflowCount} overflow)`);
  console.log(`   - ${venuePageUrls.length} venue pages`);
  console.log(`   - ${categoryUrls.length} category pages`);
  console.log(`🗺️  Sitemaps: ${sitemapUrlCount} URLs across 3 split sitemaps`);
  console.log(`🔐 Content hashes: ${unchangedCount} preserved, ${changedCount} updated`);
  console.log(`💾 ${formatWriteStats()}`);
  console.log(`⏱️  Build time: ${(buildDurationMs / 1000).toFixed(1)}s`);
  console.log(`📁 Output directory: ${DIST_DIR}`);

  // Schema completeness validation. F2b ARMED: failCount > 0 now exits 1 —
  // audit A2's F1 (5 streetAddress FAILs deployed for weeks) shipped precisely
  // because this layer was warning-only. Baseline at arming time was fail=0;
  // warnings stay non-blocking. The G1 invariants (EventCompleted-without-
  // endDate on run-implying types) ride this same gate.
  const schemaResults = validateAllPages(DIST_DIR, sameAsSeverity);
  printSchemaSummary(schemaResults);
  if (schemaResults.failCount > 0) {
    console.error(`\n❌ Schema completeness FAILED: ${schemaResults.failCount} page(s) with structural errors — build blocked (F2b arming, 2026-06-12).`);
    for (const d of schemaResults.details.filter(x => x.errors.length > 0).slice(0, 10)) {
      console.error(`   ✗ ${d.slug}: ${d.errors.join('; ')}`);
    }
    process.exit(1);
  }

  // Sprint 2 Component C — aria aggregate is produced by scripts/audit-aria.ts
  // and persisted to data/build-aria-aggregate.json. Build never depends on
  // audit having run: fresh checkouts (no aggregate file yet) fall back to
  // zero-aggregate so aria_level can still flip to "measured" structurally.
  // Documented sequence: build → audit → rebuild (rebuild picks up aggregate).
  let ariaAggregate: AriaAggregate = {
    hub_template: { total: 0, pass: 0, warn: 0, fail: 0, info: 0 },
    event_template: { total: 0, pass: 0, warn: 0, fail: 0, info: 0 },
  };
  const ariaAggregatePath = join(import.meta.dir, '../data/build-aria-aggregate.json');
  if (existsSync(ariaAggregatePath)) {
    try {
      ariaAggregate = JSON.parse(readFileSync(ariaAggregatePath, 'utf8'));
    } catch (e) {
      console.warn('[aria] could not parse build-aria-aggregate.json; using zero-aggregate');
    }
  }

  // Per-EventType bucket breakdown (Sprint 2 Component D + C + B-2)
  const completenessReport = buildCompletenessReport(schemaResults, pageableEvents, ariaAggregate, ratchetState);
  printBucketSummary(completenessReport);
  writeCompletenessReport(
    completenessReport,
    join(import.meta.dir, '../data/build-completeness.json'),
  );

  // S110f hard-stop firing report
  printHardStopSummary();

  // 2.1′: detail-page location is a build-FAIL, not a warning. The validators
  // already classify a missing/incomplete location as an error; this wires
  // those errors on EVENT-DETAIL pages to a non-zero build exit (mirrors the
  // price-type-vocabulary hard-stop precedent above). DETAIL-SCOPED ONLY —
  // hub/venue ListItem Event nodes are Session 2 (node-keyed), and a node-keyed
  // halt today would break the 39 venue pages whose MusicEvent nodes omit inline
  // location by design. Page class is read from the slug prefix (hub:/venue:/
  // datafeed: are non-detail; event-detail pages carry a bare slug).
  const isDetailPage = (slug: string): boolean =>
    !slug.startsWith('hub:') &&
    !slug.startsWith('venue:') &&
    !slug.startsWith('datafeed:');
  const locationHaltPages = schemaResults.details.filter(
    (r) => isDetailPage(r.slug) && r.errors.some((e) => e.toLowerCase().includes('location')),
  );
  console.log('\n=== Location hard-stop (2.1′, detail-page-scoped) ===');
  console.log(`   Event-detail pages missing required location: ${locationHaltPages.length}`);
  if (locationHaltPages.length > 0) {
    for (const p of locationHaltPages.slice(0, 20)) {
      const locErrs = p.errors.filter((e) => e.toLowerCase().includes('location'));
      console.error(`   ✗ ${p.slug}: ${locErrs.join('; ')}`);
    }
    throw new Error(
      `Build halted: ${locationHaltPages.length} event-detail page(s) missing required location. ` +
        'Backfill the venue in config/athens-venues.json or suppress the event (see location-filter).',
    );
  }

  // S176: UNGATED_HREFLANG is a build-FAIL on ALL page classes (parity with
  // location-absence — corruption class per GEO ruling 2026-06-05). The
  // paired validator (checkUngatedHreflang) flags any page emitting
  // hreflang/x-default while the S144 flip gate is closed; this wires those
  // errors to a non-zero exit so a future generator that hand-rolls
  // <link rel="alternate"> cannot deploy. Disarms automatically when
  // HREFLANG_GATE_OPEN flips (the validator reads the same constant).
  const hreflangHaltPages = schemaResults.details.filter((r) =>
    r.errors.some((e) => e.includes('UNGATED_HREFLANG')),
  );
  console.log('\n=== hreflang hard-stop (S176, all page classes) ===');
  console.log(`   Pages emitting ungated hreflang: ${hreflangHaltPages.length}`);
  if (hreflangHaltPages.length > 0) {
    for (const p of hreflangHaltPages.slice(0, 20)) {
      console.error(`   ✗ ${p.slug}`);
    }
    throw new Error(
      `Build halted: ${hreflangHaltPages.length} page(s) emit hreflang while the S144 gate is closed. ` +
        'Route emission through src/utils/hreflang.ts renderHreflangLinks (see specs/hreflang-sweep-S176.md).',
    );
  }

  // S176 / S110: /theatre membership-subset invariant is a build-FAIL (parity
  // with location/hreflang — corruption class). A ComedyEvent @type node in the
  // /theatre ItemList means a stand-up leaked past the comedy-format membership
  // predicate (config/hub-pages.json theatre comedyFormat:"exclude"). The paired
  // validator (validateHubSchema, scoped to hub:theatre / hub:en/theatre) flags
  // it with the S110_THEATRE_COMEDY_LEAK token; this wires those errors to a
  // non-zero exit so the leak cannot deploy. Disarms automatically once the
  // predicate keeps stand-ups out.
  const theatreLeakPages = schemaResults.details.filter((r) =>
    r.errors.some((e) => e.includes('S110_THEATRE_COMEDY_LEAK')),
  );
  console.log('\n=== /theatre comedy-format hard-stop (S110, theatre hub) ===');
  console.log(`   Theatre-hub pages with a comedy-format (ComedyEvent) member: ${theatreLeakPages.length}`);
  if (theatreLeakPages.length > 0) {
    for (const p of theatreLeakPages) {
      const leakErrs = p.errors.filter((e) => e.includes('S110_THEATRE_COMEDY_LEAK'));
      console.error(`   ✗ ${p.slug}: ${leakErrs.join('; ')}`);
    }
    throw new Error(
      `Build halted: ${theatreLeakPages.length} theatre-hub page(s) list a comedy-format (ComedyEvent) ` +
        'event. /theatre membership must exclude stand-ups (config/hub-pages.json theatre ' +
        'comedyFormat:"exclude", src/utils/comedy-format.ts isStandUpComedy).',
    );
  }

  // Provenance stamp — LAST, after every gate has passed, so a failed build
  // never leaves a fresh stamp. scripts/deploy-gate.sh refuses any deploy
  // whose stamp is missing, sha-mismatched vs HEAD, or built-from-dirty
  // (clean-tree deploy gate, Option 3 Phase 1 — 2026-07-07 breach closure).
  writeBuildProvenance(DIST_DIR, process.cwd());
  console.log('🔏 Build provenance stamped (dist/.build-provenance)');
}

async function generatePage(filters: Filters, allEvents: Event[], preContentHtml?: string): Promise<string | null> {
  const filteredEvents = filterEvents(allEvents, filters);
  const url = buildURL(filters);
  const metadata = buildPageMetadata(filters, filteredEvents.length);

  // Phase-2 A2: an EMPTY filter page gets noindex and is dropped from the
  // sitemap (return null → filtered before the manifest/sitemap consumers).
  // The page still generates (stable URL, users can land on it), but engines
  // are not invited to 1,000+ zero-content dead ends. Homepage exempt.
  const noindexEmpty = filteredEvents.length === 0 && url !== 'index';
  if (noindexEmpty) metadata.noindex = true;

  // Generate HTML (pass allEvents for filter bar count computation)
  const html = renderPage(metadata, filteredEvents, allEvents, preContentHtml);

  // Write HTML file
  const filename = url === 'index' ? 'index.html' : `${url}.html`;
  const filepath = join(DIST_DIR, filename);
  writeHtmlIfChangedSync(filepath, html);

  // Also generate JSON API
  const apiDir = join(DIST_DIR, 'api');
  if (!existsSync(apiDir)) {
    mkdirSync(apiDir, { recursive: true });
  }

  const jsonData = {
    filters,
    events: filteredEvents,
    meta: {
      total: filteredEvents.length,
      lastUpdate: new Date().toISOString(),
      url: `${BASE_URL}/${url}`
    }
  };

  writeJsonApiIfChangedSync(join(apiDir, `${url}.json`), jsonData);

  console.log(`  ✓ ${url} (${filteredEvents.length} events${noindexEmpty ? ', empty → noindex + sitemap-excluded' : ''})`);
  return noindexEmpty ? null : url;
}

/**
 * Generate category landing pages with curated slugs
 * These provide user-friendly URLs like /concerts, /exhibitions
 */
async function generateCategoryPages(events: Event[]): Promise<string[]> {
  const categories = CATEGORIES_CONFIG.categories;
  const generatedUrls: string[] = [];

  for (const category of categories) {
    // Generate category HTML page
    const html = renderCategoryPage(category, events, categories);

    // Write to dist/[slug].html (e.g., dist/concerts.html)
    const filepath = join(DIST_DIR, `${category.slug}.html`);
    writeHtmlIfChangedSync(filepath, html);

    // Also generate JSON API for this category
    const apiDir = join(DIST_DIR, 'api', 'categories');
    if (!existsSync(apiDir)) {
      mkdirSync(apiDir, { recursive: true });
    }

    // Import filter function to get filtered events for JSON
    const { filterEventsByCategory } = await import('./templates/category-page');
    const filteredEvents = filterEventsByCategory(events, category);

    const jsonData = {
      category: {
        slug: category.slug,
        title: category.title,
        titleEn: category.titleEn,
        description: category.description
      },
      events: filteredEvents,
      meta: {
        total: filteredEvents.length,
        lastUpdate: new Date().toISOString(),
        url: `${BASE_URL}/${category.slug}`
      }
    };

    writeJsonApiIfChangedSync(join(apiDir, `${category.slug}.json`), jsonData);

    console.log(`  ✓ /${category.slug} (${filteredEvents.length} events)`);
    generatedUrls.push(category.slug);
  }

  return generatedUrls;
}

async function generateLLMsTxt(params: {
  events: Event[];
  venuePageUrls: string[];
  categoryConfigs: CategoryConfig[];
  englishEventCount?: number;
  englishHubCount?: number;
}) {
  const { events, venuePageUrls, categoryConfigs, englishEventCount = 0, englishHubCount = 0 } = params;
  const base = BASE_URL;

  const eventCount = events.length;
  const venueCount = venuePageUrls.length;
  const uniqueTypes = [...new Set(events.map(e => e.type))].sort().join(', ');
  const sourceCount = new Set(events.map(e => e.source)).size;

  const categoryLines = categoryConfigs
    .map(c => `- [${c.titleEn}](${base}/${c.slug}): ${c.description}`)
    .join('\n');

  const venueExamples = venuePageUrls
    .slice()
    .sort()
    .slice(0, 5)
    .map(url => `- ${base}/${url}`)
    .join('\n');

  const content = `# Agent Athens

> AI-curated cultural events calendar for Athens, Greece.
> ${eventCount} events across ${venueCount} venues. Updated daily at 08:00 Athens time. Data licensed CC BY 4.0.

## Browse by Category

${categoryLines}

## Browse by Time

- [Today](${base}/today), [Tomorrow](${base}/tomorrow), [This Weekend](${base}/this-weekend)
- [This Week](${base}/this-week), [This Month](${base}/this-month)
- [Free Events Today](${base}/open-today)

## Venues

${venueCount} venue pages. Examples:
${venueExamples}

${englishEventCount > 0 ? `## English Event Pages

${englishEventCount} events have full English descriptions at \`/en/events/{slug}/\`.${HREFLANG_GATE_OPEN ? '\nEach English page has bidirectional hreflang tags linking to the Greek version.' : ''}

` : ''}${englishHubCount > 0 ? `## English Hub Pages

${englishHubCount} hub pages have English versions at \`/en/{slug}/\`.
Hub pages include answer capsules, comparison tables and FAQ sections${HREFLANG_GATE_OPEN ? ', with hreflang tags' : ''}.

` : ''}## JSON API

Every HTML page has a JSON counterpart at \`/api/{slug}.json\`.

- [All Events](${base}/api/index.json)
- [All Events as Schema.org DataFeed](${base}/api/events.json)
- [Today](${base}/api/today.json)
- [Category example](${base}/api/categories/concerts.json)

## Coverage

- Geographic: Athens, Greece (Attica region)
- Types: ${uniqueTypes}
- Sources: ${sourceCount} verified venues and listing sites
- Freshness: Updated daily at 08:00 Europe/Athens
- Structured data: Schema.org Event markup on all pages

## About

- [About Agent Athens](${base}/about/): What we do, how we work
- [Editorial Policy](${base}/editorial/): Data sources, AI enrichment methodology, quality standards
- [Corrections](${base}/corrections/): Report errors, correction policy

### English E-E-A-T Pages

- [About (English)](${base}/en/about/): Who we are, how we work
- [Editorial Policy (English)](${base}/en/editorial/): Data sources, AI methodology, quality control
- [Corrections (English)](${base}/en/corrections/): Report errors, correction policy

## Contact

- [GitHub Issues](https://github.com/chrimar3/agent-athens/issues)
- Email: cmarag8@gmail.com
`;

  writeFileIfChangedSync(join(DIST_DIR, 'llms.txt'), content);
  console.log('  ✓ llms.txt');
}

async function generateRobotsTxt() {
  const content = `# Search engines
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

# AI Search Crawlers — ALLOW (power AI citations)
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: AppleBot-Extended
Allow: /

User-agent: Amazonbot
Allow: /

User-agent: meta-externalagent
Allow: /

# AI Training — BLOCK (prevents model training, preserves search)
User-agent: Google-Extended
Disallow: /

# Default
User-agent: *
Allow: /

Sitemap: ${BASE_URL}/sitemap-index.xml
`;

  writeFileIfChangedSync(join(DIST_DIR, 'robots.txt'), content);
  console.log('  ✓ robots.txt');
}

async function generateIndexNowKeyFile() {
  try {
    const configPath = join(import.meta.dir, '../config/indexnow.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const key = config.indexnow_key;

    if (!key || key.length < 16) {
      console.log('  ⏭️ IndexNow key file skipped (no valid key in config)');
      return;
    }

    writeFileIfChangedSync(join(DIST_DIR, `${key}.txt`), key);
    console.log(`  ✓ IndexNow key file (${key}.txt)`);
  } catch (err) {
    console.log(`  ⚠️ IndexNow key file skipped: ${err}`);
  }
}

function copyStaticRootFiles(): void {
  const staticRootDir = join(import.meta.dir, '..', 'static', 'root-files');
  if (!existsSync(staticRootDir)) return;
  // Reserved names are generated by the build; never allow a static file to clobber them.
  const RESERVED = new Set([
    '_redirects', 'robots.txt', 'llms.txt', '404.html', '410.html', 'index.html',
    'sitemap-index.xml', 'sitemap-events.xml', 'sitemap-venues.xml', 'sitemap-editorial.xml',
  ]);
  let copied = 0;
  for (const name of readdirSync(staticRootDir)) {
    if (RESERVED.has(name) || name.startsWith('sitemap-')) {
      console.log(`  ⚠️  Skipping reserved name: ${name}`);
      continue;
    }
    const src = join(staticRootDir, name);
    if (!statSync(src).isFile()) continue;
    copyFileIfChangedSync(src, join(DIST_DIR, name));
    copied++;
  }
  console.log(`📋 Copied ${copied} static root file${copied === 1 ? '' : 's'}`);
}

/**
 * GEO Ruling 2 §2 — load the dormant backlink allowlist. URLs here are skipped
 * by the archive-410 emission (301-preservation seam for equity-bearing URLs).
 * Empty by design; missing/malformed file → empty set (fail-open to full 410).
 */
function loadBacklinkPreservedUrls(): Set<string> {
  try {
    const raw = readFileSync(join(import.meta.dir, '..', 'config', 'backlink-preserved-urls.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { preserved_urls?: string[] };
    return new Set(Array.isArray(parsed.preserved_urls) ? parsed.preserved_urls : []);
  } catch {
    return new Set();
  }
}

/**
 * GEO Ruling 2 §2 — minimal 410 body page. The archive-410 `_redirects` rules
 * rewrite past-expired event URLs to this page with a 410 status. noindex so the
 * tombstone itself is never indexed; mirrors the 404 chrome for consistency.
 */
function generate410Page(): void {
  const html = `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="view-transition" content="same-origin">
  ${renderFaviconLinks()}
  ${renderFontLinks()}
  ${renderCssLink()}
  <title>Η εκδήλωση έχει ολοκληρωθεί | agent-athens</title>
  <meta name="robots" content="noindex">
${renderAnalytics()}
</head>
<body>
  ${renderSiteNav('el')}
  ${renderHamburgerMenu('el')}
  ${renderSearchOverlay()}

  <main class="error-page">
    <div class="error-code">410</div>
    <h1>Η εκδήλωση έχει ολοκληρωθεί</h1>
    <p>Αυτή η εκδήλωση έχει παρέλθει και η σελίδα της δεν είναι πλέον διαθέσιμη. Το ημερολόγιο ενημερώνεται καθημερινά — δείτε τι παίζει τώρα στην Αθήνα.</p>
    <a href="/" class="error-home-link">Αρχική σελίδα</a>
  </main>

  ${renderSiteFooter('el')}
  ${renderHamburgerScript()}
  ${renderSearchScript()}
</body>
</html>`;

  writeHtmlIfChangedSync(join(DIST_DIR, '410.html'), html);
  console.log('  ✓ 410.html');
}

function generate404Page(): void {
  const html = `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="view-transition" content="same-origin">
  ${renderFaviconLinks()}
  ${renderFontLinks()}
  ${renderCssLink()}
  <title>Η σελίδα δεν βρέθηκε | agent-athens</title>
  <meta name="robots" content="noindex">
${renderAnalytics()}
</head>
<body>
  ${renderSiteNav('el')}
  ${renderHamburgerMenu('el')}
  ${renderSearchOverlay()}

  <main class="error-page">
    <div class="error-code">404</div>
    <h1>Η σελίδα δεν βρέθηκε</h1>
    <p>Η σελίδα που ψάχνετε δεν υπάρχει ή έχει μετακινηθεί. Το ημερολόγιο ενημερώνεται καθημερινά — ίσως η εκδήλωση έχει παρέλθει.</p>
    <a href="/" class="error-home-link">Αρχική σελίδα</a>
  </main>

  ${renderSiteFooter('el')}
  ${renderHamburgerScript()}
  ${renderSearchScript()}
</body>
</html>`;

  writeHtmlIfChangedSync(join(DIST_DIR, '404.html'), html);
  console.log('  ✓ 404.html');
}

// Run generator. S174: exit non-zero on failure — the 2.1′ hard-stop throw
// was silently swallowed by `.catch(console.error)` (exit 0), so production
// deployed through 311 location fails daily. Armed only after the residual
// reached 0 and the ingest address-guard shipped (specs/scrape-guard-S174.md).
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
