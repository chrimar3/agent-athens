#!/usr/bin/env bun

// Main site generator - generates all combinatorial pages

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Database } from 'bun:sqlite';
import type { Event, EventType, TimeRange, PriceFilter, Filters } from './types';
import { normalizeEvents } from './utils/normalize';
import { filterEvents } from './utils/filters';
import { buildURL, buildPageMetadata } from './utils/urls';
import { renderPage } from './templates/page';
import {
  renderCategoryPage,
  type CategoryConfig
} from './templates/category-page';
import { generateEventPages, loadSlugHistory, saveSlugHistory, generateRedirects } from './generators/event-page';
import { generateVenuePages } from './generators/venue-page';
import { generateSearchIndex } from './generators/search-index';
import { generateHubPages } from './generators/hub-page';
import { generateOgImages, generateFavicons, generateEventOgImages, generateHubOgImages } from './generators/og-image';
import { renderHeroSection } from './templates/card-variants';
import type { HeroMode } from './templates/card-variants';
import { DateTime } from 'luxon';
import { renderContentPage } from './templates/content-page';
import { renderSiteNav, renderSiteFooter, renderHamburgerMenu, renderHamburgerScript, renderFaviconLinks, renderFontLinks } from './templates/site-chrome';
import { renderSearchOverlay, renderSearchScript } from './templates/search-overlay';
import { ORGANIZATION_SCHEMA } from './utils/schema-geo';
import { validateAllPages, printSchemaSummary } from './validators/schema-completeness';

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
  'concert', 'dj_set', 'exhibition', 'cinema', 'screening',
  'theater', 'performance', 'show', 'workshop', 'festival', 'tech'
];
const TIME_RANGES: TimeRange[] = ['today', 'tomorrow', 'this-week', 'this-weekend', 'this-month', 'next-month', 'all-events'];
const PRICE_FILTERS: PriceFilter[] = ['open', 'with-ticket', 'all'];

// Map of genres by event type (from our sample data)
const GENRES: Record<EventType, string[]> = {
  concert: ['Pop', 'Post-rock', 'Jazz', 'Indie', 'Synth-pop', 'Dub', 'Acid jazz', 'Classical', 'World music', 'Soul', 'Rock', 'Rebetiko'],
  dj_set: ['Electronic', 'Techno', 'House', 'Trance', 'Drum and Bass', 'Ambient'],
  exhibition: ['Contemporary art', 'Photography', 'Sculpture', 'Installation'],
  cinema: ['Film premiere', 'Documentary'],
  screening: ['Outdoor cinema', 'Film festival'],
  theater: ['Drama', 'Comedy', 'Tragedy'],
  performance: ['Experimental', 'Multimedia', 'Ballet', 'Contemporary Dance', 'Tango'],
  show: ['Cabaret', 'Stand-up', 'Variety'],
  workshop: ['Masterclass', 'Educational'],
  festival: ['Multi-day', 'Multi-act'],
  tech: ['AI', 'Machine Learning', 'Data Science', 'Cloud', 'DevOps', 'Startup']
};

// Load category configuration
const CATEGORIES_CONFIG = JSON.parse(
  readFileSync(join(import.meta.dir, '../config/categories.json'), 'utf-8')
) as { categories: CategoryConfig[] };

async function main() {
  const buildStartTime = Date.now();
  console.log('🚀 Starting site generation...\n');

  // Create dist directory
  if (!existsSync(DIST_DIR)) {
    mkdirSync(DIST_DIR, { recursive: true });
  }

  // Copy design system CSS to dist
  mkdirSync(join(DIST_DIR, 'styles'), { recursive: true });
  copyFileSync(
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
      copyFileSync(join(eventImgSrc, file), join(eventImgDest, file));
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
      copyFileSync(join(venueImgSrc, file), join(venueImgDest, file));
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
  const { classifyEventLifecycle } = await import('./utils/event-lifecycle');
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

  console.log(`✅ Loaded ${allEvents.length} events from SQLite`);
  console.log(`📍 ${locationFiltered.length} events with verified Athens location`);
  console.log(`📅 Publishing ${upcomingEvents.length} current/upcoming events`);
  console.log(`📄 ${pageableEvents.length} pageable events (includes ${pageableEvents.length - upcomingEvents.length} past-active)`);
  if (venueImageMap.size > 0) {
    const venueImgCount = pageableEvents.filter(e => !e.imageLocal && !e.imageUrl && e.venueImage).length;
    console.log(`🏛️ ${venueImageMap.size} venue images loaded, ${venueImgCount} events get venue fallback`);
  }
  console.log();

  // Save normalized events
  const normalizedPath = join(DIST_DIR, 'data');
  if (!existsSync(normalizedPath)) {
    mkdirSync(normalizedPath, { recursive: true });
  }
  writeFileSync(
    join(normalizedPath, 'events.json'),
    JSON.stringify(events, null, 2)
  );

  // Generate search index
  generateSearchIndex(events);
  console.log('🔍 Search index generated');

  // Copy Fuse.js ESM to dist/scripts/
  mkdirSync(join(DIST_DIR, 'scripts'), { recursive: true });
  copyFileSync(
    join(import.meta.dir, '../node_modules/fuse.js/dist/fuse.mjs'),
    join(DIST_DIR, 'scripts/fuse.mjs')
  );

  let pagesGenerated = 0;
  const generatedUrls: string[] = [];

  // Generate core time pages
  console.log('📄 Generating core pages...');
  for (const time of TIME_RANGES) {
    const url = await generatePage({ time }, events);
    generatedUrls.push(url);
    pagesGenerated++;
  }

  // Generate homepage with hero section — smart mode based on day and availability
  const athensNow = DateTime.now().setZone('Europe/Athens');
  const dayOfWeek = athensNow.weekday; // 1=Mon..7=Sun
  const todayEvents = filterEvents(events, { time: 'today' as TimeRange });

  let heroHtml = '';
  if (todayEvents.length >= 3) {
    heroHtml = renderHeroSection(todayEvents, 'today');
  } else if (dayOfWeek >= 5) {
    const weekendEvents = filterEvents(events, { time: 'this-weekend' as TimeRange });
    heroHtml = renderHeroSection(weekendEvents, 'weekend');
  } else if (todayEvents.length > 0) {
    heroHtml = renderHeroSection(todayEvents, 'today');
  } else {
    const weekEvents = filterEvents(events, { time: 'this-week' as TimeRange });
    heroHtml = renderHeroSection(weekEvents, 'coming-days');
  }

  const homeUrl = await generatePage({}, events, heroHtml);
  generatedUrls.push(homeUrl);
  pagesGenerated++;

  // Generate type pages
  console.log('📄 Generating type pages...');
  for (const type of EVENT_TYPES) {
    // Type only (all time)
    generatedUrls.push(await generatePage({ type }, events));
    pagesGenerated++;

    // Type × Time
    for (const time of TIME_RANGES) {
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

  // Generate hub pages (enhanced versions of existing listing pages)
  console.log('\n📄 Generating hub pages...');
  const hubSlugs = generateHubPages(events);
  console.log(`  ✓ ${hubSlugs.length} hub pages enhanced`);

  // Generate individual event pages (Phase C.3)
  // Uses pageableEvents: upcoming + past-active events (≤45 days) get pages
  console.log('\n📄 Generating individual event pages...');
  const previousSlugHistory = loadSlugHistory();
  const { urls: eventPageUrls, slugMap: currentSlugs, pastEventUrls } = await generateEventPages(pageableEvents);
  generatedUrls.push(...eventPageUrls);
  pagesGenerated += eventPageUrls.length;

  // Generate per-event OG images (only for events without self-hosted images)
  console.log('\n🖼️  Generating per-event OG images...');
  await generateEventOgImages(pageableEvents);

  // Generate per-hub OG images
  console.log('🖼️  Generating per-hub OG images...');
  const hubPagesConfig: { hubs: import('./types').HubConfig[] } = JSON.parse(
    readFileSync(join(import.meta.dir, '../config/hub-pages.json'), 'utf-8')
  );
  const { getHubEvents } = await import('./generators/hub-page');
  const hubEventCounts = new Map<string, number>();
  for (const hub of hubPagesConfig.hubs) {
    hubEventCounts.set(hub.slug, getHubEvents(hub, events).length);
  }
  await generateHubOgImages(hubPagesConfig.hubs, hubEventCounts);

  // Initialize _redirects with /en/ redirect (must be first rule — Netlify processes top-to-bottom)
  // 302 (temporary) because we'll remove this when bilingual content launches
  const redirectsPath = join(DIST_DIR, '_redirects');
  writeFileSync(redirectsPath, '/en/*  /:splat  302\n/sitemap.xml  /sitemap-index.xml  301\n');

  // Save slug history and generate redirects (for changed slugs)
  saveSlugHistory(currentSlugs, previousSlugHistory);
  const redirects = generateRedirects(currentSlugs, previousSlugHistory);
  if (redirects.length > 0) {
    const existingRedirects = readFileSync(redirectsPath, 'utf-8');
    writeFileSync(redirectsPath, existingRedirects + '\n' + redirects.join('\n'));
    console.log(`  ✓ Generated ${redirects.length} redirects for changed slugs`);
  }

  // Generate venue pages (Phase C.5)
  console.log('\n🏛️ Generating venue pages...');
  const venuePageUrls = await generateVenuePages(events, venueImageMap);
  generatedUrls.push(...venuePageUrls);
  pagesGenerated += venuePageUrls.length;

  // Generate content pages (about, editorial, corrections)
  console.log('\n📄 Generating content pages...');
  const BASE_URL = 'https://agentathens.netlify.app';
  const todayIso = DateTime.now().setZone('Europe/Athens').toISODate();
  const publisher = {
    '@type': 'Organization',
    'name': ORGANIZATION_SCHEMA.name,
    'url': ORGANIZATION_SCHEMA.url
  };

  const contentPages = [
    {
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
    {
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
        <p>Συλλέγουμε εκδηλώσεις από πάνω από 15 επαληθευμένες πηγές, συμπεριλαμβανομένων:</p>
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
    {
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
  ];

  for (const page of contentPages) {
    const html = renderContentPage(page.slug, page.title, page.bodyHtml, {
      metaDescription: page.metaDescription,
      schemaJson: page.schemaJson,
    });
    const pageDir = join(DIST_DIR, page.slug);
    if (!existsSync(pageDir)) {
      mkdirSync(pageDir, { recursive: true });
    }
    writeFileSync(join(pageDir, 'index.html'), html);
    generatedUrls.push(`${page.slug}/`);
    pagesGenerated++;
    console.log(`  ✓ /${page.slug}/`);
  }

  // Generate 404 page
  generate404Page();

  // Content-hash pass: compute hashes for all generated pages
  console.log('\n🔐 Computing content hashes...');
  const { loadManifest, hashContent, resolveLastModified, saveManifest } = await import('./sitemap/content-hasher');
  const { generateSplitSitemaps } = await import('./sitemap/generate-sitemaps');
  const previousManifest = loadManifest();
  const newManifest = { version: 1 as const, generatedAt: '', entries: {} as Record<string, { hash: string; lastModified: string }> };

  let unchangedCount = 0;
  let changedCount = 0;

  const uniqueUrls = [...new Set(generatedUrls)];

  for (const url of uniqueUrls) {
    // Map URL to file on disk
    let filePath: string;
    if (url === 'index') {
      filePath = join(DIST_DIR, 'index.html');
    } else if (url.endsWith('/')) {
      // Content pages: about/, editorial/, corrections/
      filePath = join(DIST_DIR, url, 'index.html');
    } else if (url.startsWith('events/') || url.startsWith('venues/')) {
      // Event/venue pages: events/slug/index.html, venues/slug/index.html
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

  // Generate discovery files
  console.log('\n📄 Generating discovery files...');
  await generateLLMsTxt({
    events,
    venuePageUrls,
    categoryConfigs: CATEGORIES_CONFIG.categories,
  });
  await generateRobotsTxt();
  // Build priority overrides for past-active event pages (lower sitemap priority)
  const priorityOverrides = new Map<string, string>();
  for (const url of pastEventUrls) {
    priorityOverrides.set(url, '0.3');
  }
  const sitemapUrlCount = generateSplitSitemaps(generatedUrls, newManifest, priorityOverrides);
  await generateIndexNowKeyFile();

  const buildDurationMs = Date.now() - buildStartTime;

  // Record generation stats to database
  recordGenerationStats(events.length, pagesGenerated, buildDurationMs, true);

  console.log(`\n✅ Site generation complete!`);
  console.log(`📊 Total pages generated: ${pagesGenerated}`);
  console.log(`   - ${eventPageUrls.length} event pages`);
  console.log(`   - ${venuePageUrls.length} venue pages`);
  console.log(`   - ${categoryUrls.length} category pages`);
  console.log(`🗺️  Sitemaps: ${sitemapUrlCount} URLs across 3 split sitemaps`);
  console.log(`🔐 Content hashes: ${unchangedCount} preserved, ${changedCount} updated`);
  console.log(`⏱️  Build time: ${(buildDurationMs / 1000).toFixed(1)}s`);
  console.log(`📁 Output directory: ${DIST_DIR}`);

  // Schema completeness validation (warning-only, never blocks build)
  const schemaResults = validateAllPages(DIST_DIR);
  printSchemaSummary(schemaResults);
}

async function generatePage(filters: Filters, allEvents: Event[], preContentHtml?: string): Promise<string> {
  const filteredEvents = filterEvents(allEvents, filters);
  const url = buildURL(filters);
  const metadata = buildPageMetadata(filters, filteredEvents.length);

  // Generate HTML (pass allEvents for filter bar count computation)
  const html = renderPage(metadata, filteredEvents, allEvents, preContentHtml);

  // Write HTML file
  const filename = url === 'index' ? 'index.html' : `${url}.html`;
  const filepath = join(DIST_DIR, filename);
  writeFileSync(filepath, html);

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
      url: `https://agentathens.netlify.app/${url}`
    }
  };

  writeFileSync(
    join(apiDir, `${url}.json`),
    JSON.stringify(jsonData, null, 2)
  );

  console.log(`  ✓ ${url} (${filteredEvents.length} events)`);
  return url;
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
    writeFileSync(filepath, html);

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
        url: `https://agentathens.netlify.app/${category.slug}`
      }
    };

    writeFileSync(
      join(apiDir, `${category.slug}.json`),
      JSON.stringify(jsonData, null, 2)
    );

    console.log(`  ✓ /${category.slug} (${filteredEvents.length} events)`);
    generatedUrls.push(category.slug);
  }

  return generatedUrls;
}

async function generateLLMsTxt(params: {
  events: Event[];
  venuePageUrls: string[];
  categoryConfigs: CategoryConfig[];
}) {
  const { events, venuePageUrls, categoryConfigs } = params;
  const base = 'https://agentathens.netlify.app';

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

## JSON API

Every HTML page has a JSON counterpart at \`/api/{slug}.json\`.

- [All Events](${base}/api/index.json)
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

## Contact

- [GitHub Issues](https://github.com/chrimar3/agent-athens/issues)
- Email: cmarag8@gmail.com
`;

  writeFileSync(join(DIST_DIR, 'llms.txt'), content);
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

Sitemap: https://agentathens.netlify.app/sitemap-index.xml
`;

  writeFileSync(join(DIST_DIR, 'robots.txt'), content);
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

    writeFileSync(join(DIST_DIR, `${key}.txt`), key);
    console.log(`  ✓ IndexNow key file (${key}.txt)`);
  } catch (err) {
    console.log(`  ⚠️ IndexNow key file skipped: ${err}`);
  }
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
  <link rel="stylesheet" href="/styles/design-system.css">
  <title>Η σελίδα δεν βρέθηκε | agent-athens</title>
  <meta name="robots" content="noindex">
</head>
<body>
  ${renderSiteNav()}
  ${renderHamburgerMenu()}
  ${renderSearchOverlay()}

  <div class="error-page">
    <div class="error-code">404</div>
    <h1>Η σελίδα δεν βρέθηκε</h1>
    <p>Η σελίδα που ψάχνετε δεν υπάρχει ή έχει μετακινηθεί. Το ημερολόγιο ενημερώνεται καθημερινά — ίσως η εκδήλωση έχει παρέλθει.</p>
    <a href="/" class="error-home-link">Αρχική σελίδα</a>
  </div>

  ${renderSiteFooter()}
  ${renderHamburgerScript()}
  ${renderSearchScript()}
</body>
</html>`;

  writeFileSync(join(DIST_DIR, '404.html'), html);
  console.log('  ✓ 404.html');
}

// Run generator
main().catch(console.error);
