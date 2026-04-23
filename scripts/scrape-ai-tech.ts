#!/usr/bin/env bun
/**
 * 🤖 Agent Athens - AI/Tech Event Discovery Scraper
 *
 * Discovers AI, tech, and startup events in Athens from:
 * - starttech.vc RSS feed (with JSON-LD from event pages)
 * - greeksin.ai (annual conference)
 * - devoxx.gr (developer conference)
 * - archimedesai.gr (research seminars)
 * - Eventbrite Athens tech search (Puppeteer)
 * - Meetup Athens AI/tech groups (Puppeteer)
 * - Lu.ma Athens tech events (Puppeteer)
 * - Known upcoming events (manual)
 *
 * Usage:
 *   bun run scripts/scrape-ai-tech.ts                # Discover + save
 *   bun run scripts/scrape-ai-tech.ts --dry-run      # Discover only, don't save
 *   bun run scripts/scrape-ai-tech.ts --no-browser   # Skip Puppeteer sources
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { createHash } from 'crypto';
import puppeteer from 'puppeteer-core';
import { normalizeDateField } from '../src/utils/date-format';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const DB_PATH = join(import.meta.dir, '../data/events.db');
const today = new Date().toISOString().split('T')[0];

// AI/tech keyword filter — must match at least one
const AI_KEYWORDS = [
  // Core AI/ML
  'ai', 'artificial intelligence', 'machine learning', 'deep learning',
  'data science', 'llm', 'nlp', 'generative ai', 'neural', 'transformer',
  'gpt', 'computer vision', 'reinforcement learning', 'practical ai',
  // Specific tech communities
  'python', 'devops', 'cloud computing', 'kubernetes', 'docker',
  'software engineering', 'full stack', 'backend', 'frontend framework',
  // AI-adjacent events (require strong signal)
  'ai hackathon', 'ai summit', 'ai conference', 'ai meetup',
  'tech meetup', 'ml engineer', 'data engineer',
  // Known Athens AI community terms
  'mindstone', 'devoxx', 'greeks in ai', 'infraai', 'disrupt ai',
  'fiftyone', 'vibe coding', 'agents',
];

// Filter OUT keywords (not real tech/AI events)
const EXCLUDE_KEYWORDS = [
  'pub crawl', 'escape room', 'career fair', 'yoga', 'cooking',
  'wine tasting', 'speed dating', 'running club', 'franchise',
  'brand identity', 'branding', 'e-commerce expo', 'ecdm',
  'payments forum', 'regtech forum', 'talent days', 'career',
  'leadership conference', 'fund raising program', 'mentorship program',
  'philosophy', 'φιλοσοφ', 'μεταγνώση', 'trivium',
  'design open', 'digital marketing expo',
  'hack the box', 'browserstack', 'leaddev', 'cohesity',
  'angular meetup', 'ux meetup', 'ux practices',
  'hackerx', 'employer ticket',
];

interface DiscoveredEvent {
  title: string;
  start_date: string;
  end_date?: string;
  time?: string;
  venue_name: string;
  venue_address?: string;
  neighborhood?: string;
  url: string;
  source: string;
  event_type: string;
  price_type: string;
  price_amount: number | null;
  description?: string;
  organizer?: string;
}

function generateEventId(title: string, date: string, venue: string): string {
  const normalized = `${title.toLowerCase().trim()}|${date}|${venue.toLowerCase().trim()}`;
  return createHash('md5').update(normalized).digest('hex').substring(0, 16);
}

function isAITechEvent(title: string, description?: string): boolean {
  const text = `${title} ${description || ''}`.toLowerCase();
  if (EXCLUDE_KEYWORDS.some(kw => text.includes(kw))) return false;
  return AI_KEYWORDS.some(kw => text.includes(kw));
}

async function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<string | null> {
  try {
    const proc = Bun.spawn([
      'curl', '-s', '-L', '--max-time', String(Math.floor(timeoutMs / 1000)),
      '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      url
    ], { stdout: 'pipe', stderr: 'pipe' });

    const text = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    return (exitCode === 0 && text.length > 0) ? text : null;
  } catch {
    return null;
  }
}

// ============================================================================
// SOURCE 1: starttech.vc RSS Feed
// ============================================================================

async function scrapeStarttech(): Promise<DiscoveredEvent[]> {
  console.log('📡 starttech.vc (RSS feed)...');
  const events: DiscoveredEvent[] = [];

  const xml = await fetchWithTimeout('https://www.starttech.vc/events/feed/');
  if (!xml) {
    console.log('   ⚠️ Failed to fetch RSS feed');
    return events;
  }

  // Parse RSS items
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  console.log(`   Found ${items.length} RSS items`);

  for (const item of items) {
    const title = item.match(/<title>(.*?)<\/title>/)?.[1]?.replace(/&amp;/g, '&').replace(/&#038;/g, '&').replace(/&#124;/g, '|') || '';
    const link = item.match(/<link>(.*?)<\/link>/)?.[1] || '';

    if (!title || !isAITechEvent(title)) continue;

    // Fetch individual event page for JSON-LD structured data
    console.log(`   🔍 Fetching details: ${title.substring(0, 60)}...`);
    const eventHtml = await fetchWithTimeout(link);
    if (!eventHtml) continue;

    // Try JSON-LD first
    const jsonldMatch = eventHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (jsonldMatch) {
      try {
        let data = JSON.parse(jsonldMatch[1]);
        if (Array.isArray(data)) data = data[0];

        if (data['@type'] === 'Event' || (Array.isArray(data['@type']) && data['@type'].includes('Event'))) {
          const startDate = data.startDate?.split('T')[0] || '';
          const endDate = data.endDate?.split('T')[0] || undefined;
          const time = data.startDate?.match(/T(\d{2}:\d{2})/)?.[1] || '';

          if (startDate >= today) {
            const venue = data.location || {};
            const venueName = typeof venue === 'string' ? venue :
              venue.name || venue.address?.name || 'TBA';
            const venueAddress = venue.address?.streetAddress || '';

            const offer = data.offers;
            let priceType = 'open';
            let priceAmount: number | null = null;
            if (offer) {
              const price = offer.price || offer.lowPrice;
              if (price && parseFloat(price) > 0) {
                priceType = 'with-ticket';
                priceAmount = parseFloat(price);
              }
            }

            events.push({
              title: data.name || title,
              start_date: startDate,
              end_date: endDate,
              time,
              venue_name: venueName,
              venue_address: venueAddress,
              url: data.url || link,
              source: 'starttech.vc',
              event_type: guessEventType(title, data.description || ''),
              price_type: priceType,
              price_amount: priceAmount,
              description: (data.description || '').substring(0, 500),
              organizer: data.organizer?.name || 'starttech.vc'
            });
            console.log(`   ✅ ${data.name || title} (${startDate})`);
          }
        }
      } catch { /* JSON parse failed */ }
    }

    // Fallback: extract from HTML text (starttech pages have dates like "17 February 2026")
    if (events.length === 0 || events[events.length - 1]?.url !== link) {
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

      // Pattern: "17 February 2026" or "February 17, 2026"
      const dateMatch = eventHtml.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s*,?\s*(\d{4})/i) ||
                        eventHtml.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*,?\s*(\d{4})/i);

      if (dateMatch) {
        let day: string, monthStr: string, year: string;
        if (/^\d/.test(dateMatch[1])) {
          // "17 February 2026" format
          day = dateMatch[1];
          monthStr = dateMatch[2];
          year = dateMatch[3];
        } else {
          // "February 17, 2026" format
          monthStr = dateMatch[1];
          day = dateMatch[2];
          year = dateMatch[3];
        }
        const monthNum = monthNames.indexOf(monthStr.toLowerCase()) + 1;
        const parsedDate = `${year}-${String(monthNum).padStart(2, '0')}-${day.padStart(2, '0')}`;

        // Extract venue from "Location:" section
        const venueMatch = eventHtml.match(/(?:Location|Venue)[:\s]*([^<]+(?:HQ|street|avenue|Athens|Greece)[^<]*)/i) ||
                          eventHtml.match(/(?:Epignosis|OTEAcademy|ACE|Megaron|Eugenides)[^<,]{0,100}/i);
        const venueName = venueMatch?.[1]?.trim() || venueMatch?.[0]?.trim() || 'TBA';

        // Extract time
        const timeMatch = eventHtml.match(/(\d{1,2}:\d{2})\s*(?:PM|AM|μ\.μ\.|π\.μ\.|-)/i);
        const time = timeMatch?.[1] || '';

        if (parsedDate >= today) {
          events.push({
            title,
            start_date: parsedDate,
            time: time || undefined,
            venue_name: venueName.replace(/,\s*$/, ''),
            url: link,
            source: 'starttech.vc',
            event_type: guessEventType(title),
            price_type: 'open',
            price_amount: null,
            organizer: 'starttech.vc'
          });
          console.log(`   ✅ ${title.substring(0, 60)} (${parsedDate})`);
        } else {
          console.log(`   ⏭️  Past event: ${title.substring(0, 50)} (${parsedDate})`);
        }
      }
    }

    await Bun.sleep(500); // Rate limit
  }

  // Also try page 2
  const xml2 = await fetchWithTimeout('https://www.starttech.vc/events/feed/?paged=2');
  if (xml2) {
    const items2 = xml2.match(/<item>([\s\S]*?)<\/item>/g) || [];
    console.log(`   Page 2: ${items2.length} more items (skipping detail fetch)`);
  }

  console.log(`   📊 ${events.length} AI/tech events from starttech.vc\n`);
  return events;
}

// ============================================================================
// SOURCE 2: greeksin.ai (Annual Conference)
// ============================================================================

async function scrapeGreeksInAI(): Promise<DiscoveredEvent[]> {
  console.log('📡 greeksin.ai...');
  const events: DiscoveredEvent[] = [];

  const html = await fetchWithTimeout('https://www.greeksin.ai/');
  if (!html) {
    console.log('   ⚠️ Failed to fetch');
    return events;
  }

  // Extract key details from the page
  const titleMatch = html.match(/<title>(.*?)<\/title>/);
  const title = titleMatch?.[1]?.replace(/ - .*/, '') || 'Greeks in AI 2026';

  // Look for dates (July 15-17 pattern)
  const dateMatch = html.match(/(?:July|june|march)\s+(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?,?\s*(\d{4})/i);
  let startDate = '';
  let endDate = '';

  if (dateMatch) {
    const month = dateMatch[0].match(/january|february|march|april|may|june|july|august|september|october|november|december/i)?.[0] || 'July';
    const monthNum = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(month.toLowerCase()) + 1;
    const year = dateMatch[3] || '2026';
    const day1 = dateMatch[1];
    const day2 = dateMatch[2];

    startDate = `${year}-${String(monthNum).padStart(2, '0')}-${day1.padStart(2, '0')}`;
    if (day2) {
      endDate = `${year}-${String(monthNum).padStart(2, '0')}-${day2.padStart(2, '0')}`;
    }
  } else {
    // Fallback: known date
    startDate = '2026-07-15';
    endDate = '2026-07-17';
  }

  // Extract venue
  const venueMatch = html.match(/(?:Eugenides|venue)[^<]{0,300}(?:Paleo Faliro|Palaio Faliro|Syngrou)/i);
  const venueName = venueMatch ? 'Eugenides Foundation Conference Centre' : 'Eugenides Foundation Conference Centre';

  if (startDate >= today) {
    events.push({
      title: 'Greeks in AI 2026',
      start_date: startDate,
      end_date: endDate || undefined,
      venue_name: venueName,
      venue_address: '387 Syngrou Avenue, Paleo Faliro',
      neighborhood: 'Paleo Faliro',
      url: 'https://www.greeksin.ai/',
      source: 'greeksin.ai',
      event_type: 'conference',
      price_type: 'open',
      price_amount: null,
      description: 'The flagship Greek AI diaspora symposium. Research + industry + networking. Greek AI researchers from MIT, Stanford, and top European institutions meet the local ecosystem.',
      organizer: 'Greeks in AI'
    });
    console.log(`   ✅ Greeks in AI 2026 (${startDate}${endDate ? ' - ' + endDate : ''})`);
  }

  console.log(`   📊 ${events.length} events from greeksin.ai\n`);
  return events;
}

// ============================================================================
// SOURCE 3: devoxx.gr (Developer Conference)
// ============================================================================

async function scrapeDevoxx(): Promise<DiscoveredEvent[]> {
  console.log('📡 devoxx.gr...');
  const events: DiscoveredEvent[] = [];

  const html = await fetchWithTimeout('https://devoxx.gr/');
  if (!html) {
    console.log('   ⚠️ Failed to fetch');
    return events;
  }

  // Extract JSON-LD
  const jsonldMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  for (const match of jsonldMatches) {
    try {
      const jsonStr = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
      let data = JSON.parse(jsonStr);
      if (Array.isArray(data)) data = data[0];

      if (data['@type'] === 'Event') {
        const startDate = data.startDate?.split('T')[0] || '';
        const endDate = data.endDate?.split('T')[0] || '';

        if (startDate >= today) {
          const location = data.location || {};
          events.push({
            title: data.name || 'Devoxx Greece 2026',
            start_date: startDate,
            end_date: endDate || undefined,
            venue_name: location.name || 'Megaron Athens International Conference Centre',
            venue_address: location.address?.streetAddress || '',
            neighborhood: 'Kolonaki',
            url: data.url || 'https://devoxx.gr/',
            source: 'devoxx.gr',
            event_type: 'conference',
            price_type: data.offers?.price ? 'with-ticket' : 'with-ticket',
            price_amount: null,
            description: (data.description || '').substring(0, 500),
            organizer: data.organizer?.name || 'Devoxx'
          });
          console.log(`   ✅ ${data.name} (${startDate}${endDate ? ' - ' + endDate : ''})`);
        }
      }
    } catch { /* parse error */ }
  }

  // Fallback if no JSON-LD found
  if (events.length === 0) {
    // Look for date in HTML
    const megaron = html.match(/Megaron/i);
    const datePattern = html.match(/(?:23|24|25)\s*[-–]\s*(?:24|25|26)\s*(?:April|Απριλ)/i) ||
                       html.match(/April\s+\d{1,2}(?:\s*[-–]\s*\d{1,2})?,?\s*\d{4}/i);

    if (megaron) {
      events.push({
        title: 'Devoxx Greece 2026',
        start_date: '2026-04-23',
        end_date: '2026-04-25',
        venue_name: 'Megaron Athens International Conference Centre',
        venue_address: 'Leoforos Vasilissis Sofias and Kokkali 1, Athens 115 21',
        neighborhood: 'Kolonaki',
        url: 'https://devoxx.gr/',
        source: 'devoxx.gr',
        event_type: 'conference',
        price_type: 'with-ticket',
        price_amount: null,
        description: '3-day developer conference. Part of global Devoxx family. Covers Java, Cloud, AI/ML, Security, Architecture. Community-driven.',
        organizer: 'Devoxx'
      });
      console.log(`   ✅ Devoxx Greece 2026 (2026-04-23 - 2026-04-25) [from known data]`);
    }
  }

  console.log(`   📊 ${events.length} events from devoxx.gr\n`);
  return events;
}

// ============================================================================
// SOURCE 4: archimedesai.gr (Research Seminars)
// ============================================================================

async function scrapeArchimedes(): Promise<DiscoveredEvent[]> {
  console.log('📡 archimedesai.gr...');
  const events: DiscoveredEvent[] = [];

  // Scrape the homepage for recent event announcements
  const html = await fetchWithTimeout('https://archimedesai.gr/en/');
  if (!html) {
    console.log('   ⚠️ Failed to fetch');
    return events;
  }

  // Find event titles and dates from the homepage articles
  // Pattern: "Event (ΑAGTA) will take place on 4 February 2026 at Archimedes premises"
  const eventMentions = html.match(/(?:event|seminar|talk|lecture|workshop)[^<]{10,300}(?:\d{1,2}\s+(?:January|February|March|April|May|June|July)\s+\d{4})/gi) || [];

  for (const mention of eventMentions) {
    const dateMatch = mention.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
    if (!dateMatch) continue;

    const day = dateMatch[1].padStart(2, '0');
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const month = String(monthNames.indexOf(dateMatch[2].toLowerCase()) + 1).padStart(2, '0');
    const year = dateMatch[3];
    const date = `${year}-${month}-${day}`;

    if (date < today) continue;

    // Extract title from the mention
    const titleClean = mention
      .replace(/\s+/g, ' ')
      .replace(/<[^>]+>/g, '')
      .trim()
      .substring(0, 150);

    events.push({
      title: titleClean,
      start_date: date,
      venue_name: 'Archimedes Amphitheatre (Athena Research Center)',
      venue_address: '1 Artemidos Street, Marousi',
      neighborhood: 'Marousi',
      url: 'https://archimedesai.gr/en/events',
      source: 'archimedesai.gr',
      event_type: 'seminar',
      price_type: 'open',
      price_amount: null,
      organizer: 'Archimedes Unit (Athena RC)'
    });
    console.log(`   ✅ ${titleClean.substring(0, 80)} (${date})`);
  }

  // Also check for upcoming seminars linked from events page
  const eventsPage = await fetchWithTimeout('https://archimedesai.gr/en/events');
  if (eventsPage) {
    // Find calendar entries with event details
    const calendarEvents = eventsPage.match(/class="[^"]*ic-event[^"]*"[\s\S]*?<\/(?:div|li)>/g) || [];
    console.log(`   Calendar entries found: ${calendarEvents.length}`);
  }

  console.log(`   📊 ${events.length} events from archimedesai.gr\n`);
  return events;
}

// ============================================================================
// SOURCE 5: Known upcoming events (from integration document)
// ============================================================================

function getKnownUpcomingEvents(): DiscoveredEvent[] {
  console.log('📡 Known upcoming events (from integration doc)...');
  const known: DiscoveredEvent[] = [];

  const knownEvents: DiscoveredEvent[] = [
    {
      title: 'AI Hackathon Greece 2026',
      start_date: '2026-03-06',
      end_date: '2026-03-08',
      venue_name: 'ACE AUEB',
      venue_address: 'Troias 2, central Athens',
      url: 'https://hackathongreece.ai/',
      source: 'hackathongreece.ai',
      event_type: 'hackathon',
      price_type: 'open',
      price_amount: null,
      description: "Greece's largest AI hackathon. 3rd year. Application-based. 8 challenge tracks.",
      organizer: 'ACE AUEB'
    },
    {
      title: 'InfraAI Global Summit 2026',
      start_date: '2026-03-30',
      end_date: '2026-04-01',
      venue_name: 'Asteria Domus Glyfada',
      venue_address: 'Glyfada, Athenian Riviera',
      neighborhood: 'Glyfada',
      url: 'https://infraai.com/',
      source: 'manual',
      event_type: 'conference',
      price_type: 'with-ticket',
      price_amount: 1000,
      description: 'Premium AI infrastructure summit. C-suite, investors. 200+ attendees.',
      organizer: 'InfraAI'
    },
    {
      title: 'Disrupt AI Summit 2026',
      start_date: '2026-05-14',
      end_date: '2026-05-15',
      venue_name: 'OTEAcademy',
      venue_address: 'Pelika 3 & Spartis, Maroussi',
      neighborhood: 'Marousi',
      url: 'https://productledhub.com/disrupt-ai-summit/',
      source: 'productledhub.com',
      event_type: 'conference',
      price_type: 'with-ticket',
      price_amount: null,
      description: 'Corporate/practitioner AI summit. 500+ attendees. Includes GenAI Bootcamp.',
      organizer: 'Product-Led Hub'
    },
    {
      title: 'Athens SEO 2026',
      start_date: '2026-05-22',
      end_date: '2026-05-23',
      venue_name: 'The Ellinikon Experience Centre',
      venue_address: 'Ellinikon, southern Athens',
      neighborhood: 'Ellinikon',
      url: 'https://athensseo.com/',
      source: 'manual',
      event_type: 'conference',
      price_type: 'with-ticket',
      price_amount: null,
      description: 'Technical SEO + AI in search. Europe-facing.',
      organizer: 'Athens SEO'
    }
  ];

  for (const e of knownEvents) {
    if (e.start_date >= today) {
      known.push(e);
      console.log(`   ✅ ${e.title} (${e.start_date}${e.end_date ? ' - ' + e.end_date : ''})`);
    }
  }

  console.log(`   📊 ${known.length} known upcoming events\n`);
  return known;
}

// ============================================================================
// SOURCE 6: Eventbrite Athens Tech (Puppeteer + __SERVER_DATA__ extraction)
// ============================================================================

async function scrapeEventbrite(): Promise<DiscoveredEvent[]> {
  console.log('📡 eventbrite.com (__SERVER_DATA__ interception)...');
  const events: DiscoveredEvent[] = [];

  const urls = [
    'https://www.eventbrite.com/d/greece--athens/technology/',
    'https://www.eventbrite.com/d/greece--athens/science-and-tech/',
    'https://www.eventbrite.com/d/greece--athens/startup/',
    'https://www.eventbrite.com/d/greece--athens/hackathon/',
    'https://www.eventbrite.com/d/greece--athens/data-science/',
  ];

  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

    for (const url of urls) {
      try {
        const category = url.split('/').slice(-2, -1)[0];
        console.log(`   🔍 ${category}...`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });

        // Extract structured event data from Eventbrite's __SERVER_DATA__
        const serverEvents = await page.evaluate(() => {
          const sd = (window as any).__SERVER_DATA__;
          if (!sd?.search_data?.events?.results) return [];

          return sd.search_data.events.results.map((e: any) => ({
            name: e.name || '',
            summary: e.summary || '',
            start_date: e.start_date || '',
            end_date: e.end_date || '',
            start_time: e.start_time || '',
            url: e.url || '',
            is_online: e.is_online_event || false,
            venue_name: e.primary_venue?.name || '',
            venue_address: e.primary_venue?.address?.localized_address_display || '',
            venue_city: e.primary_venue?.address?.city || '',
            tags: (e.tags || []).map((t: any) => t.display_name || ''),
            format: (e.tags || []).find((t: any) => t.prefix === 'EventbriteFormat')?.display_name || '',
            discount_amount: e.open_discount?.amount_off || null,
          }));
        });

        console.log(`   Found ${serverEvents.length} events in __SERVER_DATA__`);

        for (const se of serverEvents) {
          // Skip online-only events
          if (se.is_online) {
            console.log(`   ⏭️  Online-only: ${se.name.substring(0, 50)}`);
            continue;
          }

          // Filter by AI/tech keywords
          const searchText = `${se.name} ${se.summary} ${se.tags.join(' ')}`;
          if (!isAITechEvent(se.name, searchText)) continue;

          // Filter by date
          if (!se.start_date || se.start_date < today) continue;

          // Determine price type
          const priceType = se.discount_amount === '0.00' || !se.discount_amount ? 'open' : 'with-ticket';

          // Determine neighborhood from venue address
          const neighborhood = extractNeighborhood(se.venue_address);

          events.push({
            title: se.name,
            start_date: se.start_date,
            end_date: se.end_date || undefined,
            time: se.start_time || undefined,
            venue_name: se.venue_name || 'TBA',
            venue_address: se.venue_address,
            neighborhood,
            url: se.url,
            source: 'eventbrite',
            event_type: guessEventType(se.name, se.summary),
            price_type: priceType,
            price_amount: null,
            description: se.summary?.substring(0, 500) || undefined,
          });
          console.log(`   ✅ ${se.name.substring(0, 60)} (${se.start_date}) @ ${se.venue_name || 'TBA'}`);
        }

        await Bun.sleep(2000); // Rate limit between pages
      } catch (err) {
        console.log(`   ⚠️ Error on ${url}: ${err}`);
      }
    }
  } catch (err) {
    console.log(`   ⚠️ Puppeteer error: ${err}`);
  } finally {
    if (browser) await browser.close();
  }

  console.log(`   📊 ${events.length} AI/tech events from Eventbrite\n`);
  return events;
}

function extractNeighborhood(address: string): string | undefined {
  if (!address) return undefined;
  const a = address.toLowerCase();
  if (a.includes('maroussi') || a.includes('μαρούσι')) return 'Marousi';
  if (a.includes('glyfada') || a.includes('γλυφάδα')) return 'Glyfada';
  if (a.includes('kifissia') || a.includes('κηφισ')) return 'Kifissia';
  if (a.includes('pireos') || a.includes('πειραι')) return 'Gazi';
  if (a.includes('syntagma') || a.includes('σύνταγμα')) return 'Syntagma';
  if (a.includes('monastiraki') || a.includes('μοναστηράκι')) return 'Monastiraki';
  return undefined;
}

// ============================================================================
// SOURCE 7: Meetup Athens AI/Tech Groups (Puppeteer)
// ============================================================================

async function scrapeMeetup(): Promise<DiscoveredEvent[]> {
  console.log('📡 meetup.com (Puppeteer)...');
  const events: DiscoveredEvent[] = [];

  // Known groups with upcoming events
  const groupUrls = [
    'https://www.meetup.com/mindstone-athens/events/',
    'https://www.meetup.com/athens-big-data/events/',
    'https://www.meetup.com/pydata-piraeus/events/',
    'https://www.meetup.com/athens-ai-machine-learning-data-science/events/',
  ];

  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    for (const url of groupUrls) {
      try {
        const groupName = url.split('/')[3];
        console.log(`   🔍 ${groupName}...`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

        // Wait for event list to render
        await page.waitForSelector('[data-testid="event-card"], .eventCard, [id*="event"]', { timeout: 8000 }).catch(() => {});

        const pageEvents = await page.evaluate(() => {
          const results: Array<{
            title: string;
            date: string;
            venue: string;
            url: string;
          }> = [];

          // Meetup event cards
          const cards = document.querySelectorAll(
            '[data-testid="event-card"], .eventCard--link, a[href*="/events/"]'
          );

          cards.forEach(card => {
            const link = card.closest('a') || card.querySelector('a');
            const href = link?.getAttribute('href') || '';
            if (!href.includes('/events/') || href.endsWith('/events/')) return;

            const titleEl = card.querySelector('h2, h3, [data-testid="event-card-title"], .eventCardHead--title');
            const dateEl = card.querySelector('time, [data-testid="event-card-date"], .eventTimeDisplay');
            const venueEl = card.querySelector('[data-testid="event-card-venue"], .venueDisplay');

            if (titleEl) {
              results.push({
                title: titleEl.textContent?.trim() || '',
                date: dateEl?.getAttribute('datetime') || dateEl?.textContent?.trim() || '',
                venue: venueEl?.textContent?.trim() || '',
                url: href.startsWith('http') ? href : `https://www.meetup.com${href}`,
              });
            }
          });

          return results;
        });

        console.log(`   Found ${pageEvents.length} events from ${groupName}`);

        for (const pe of pageEvents) {
          // Parse datetime attribute or date text
          let parsedDate = '';
          if (pe.date.match(/^\d{4}-\d{2}-\d{2}/)) {
            parsedDate = pe.date.split('T')[0];
          } else {
            parsedDate = parseEventbriteDate(pe.date) || ''; // Reuse the parser
          }

          if (!parsedDate || parsedDate < today) continue;

          events.push({
            title: pe.title,
            start_date: parsedDate,
            venue_name: pe.venue || 'TBA',
            url: pe.url,
            source: 'meetup',
            event_type: guessEventType(pe.title),
            price_type: 'open',
            price_amount: null,
            organizer: groupName,
          });
          console.log(`   ✅ ${pe.title.substring(0, 60)} (${parsedDate})`);
        }

        await Bun.sleep(2000); // Rate limit
      } catch (err) {
        console.log(`   ⚠️ Error on ${url}: ${err}`);
      }
    }
  } catch (err) {
    console.log(`   ⚠️ Puppeteer error: ${err}`);
  } finally {
    if (browser) await browser.close();
  }

  console.log(`   📊 ${events.length} AI/tech events from Meetup\n`);
  return events;
}

// ============================================================================
// SOURCE 8: Lu.ma Athens Tech Events (Puppeteer)
// ============================================================================

async function scrapeLuma(): Promise<DiscoveredEvent[]> {
  console.log('📡 lu.ma (Puppeteer)...');
  const events: DiscoveredEvent[] = [];

  const searchUrls = [
    'https://lu.ma/discover?q=athens+ai',
    'https://lu.ma/discover?q=athens+tech',
    'https://lu.ma/discover?q=greece+ai',
  ];

  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    for (const url of searchUrls) {
      try {
        const query = new URL(url).searchParams.get('q') || '';
        console.log(`   🔍 "${query}"...`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

        // Wait for event cards
        await page.waitForSelector('[class*="event-card"], [class*="EventCard"], a[href*="/event/"]', { timeout: 8000 }).catch(() => {});

        const pageEvents = await page.evaluate(() => {
          const results: Array<{
            title: string;
            date: string;
            venue: string;
            url: string;
          }> = [];

          // Lu.ma event cards
          const links = document.querySelectorAll('a[href*="/event/"]');
          const seen = new Set<string>();

          links.forEach(link => {
            const href = (link as HTMLAnchorElement).href;
            if (seen.has(href)) return;
            seen.add(href);

            const card = link.closest('[class*="card"]') || link;
            const texts = Array.from(card.querySelectorAll('div, span, p'))
              .map(el => el.textContent?.trim() || '')
              .filter(t => t.length > 0 && t.length < 200);

            // First substantial text is usually the title
            const title = texts.find(t => t.length > 10 && t.length < 150) || '';
            // Date text usually contains month names
            const dateText = texts.find(t => /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(t)) || '';
            // Location text
            const venue = texts.find(t => /Athens|Greece|Αθήνα/i.test(t)) || '';

            if (title) {
              results.push({ title, date: dateText, venue, url: href });
            }
          });

          return results;
        });

        console.log(`   Found ${pageEvents.length} event cards`);

        for (const pe of pageEvents) {
          if (!isAITechEvent(pe.title, pe.venue)) continue;

          const parsedDate = parseEventbriteDate(pe.date) || '';
          if (!parsedDate || parsedDate < today) continue;

          // Filter: must mention Athens/Greece
          const text = `${pe.title} ${pe.venue}`.toLowerCase();
          if (!text.includes('athens') && !text.includes('greece') && !text.includes('αθήνα')) continue;

          events.push({
            title: pe.title,
            start_date: parsedDate,
            venue_name: pe.venue || 'TBA',
            url: pe.url,
            source: 'luma',
            event_type: guessEventType(pe.title),
            price_type: 'open',
            price_amount: null,
          });
          console.log(`   ✅ ${pe.title.substring(0, 60)} (${parsedDate})`);
        }

        await Bun.sleep(2000);
      } catch (err) {
        console.log(`   ⚠️ Error on ${url}: ${err}`);
      }
    }
  } catch (err) {
    console.log(`   ⚠️ Puppeteer error: ${err}`);
  } finally {
    if (browser) await browser.close();
  }

  console.log(`   📊 ${events.length} AI/tech events from Lu.ma\n`);
  return events;
}

// ============================================================================
// HELPERS
// ============================================================================

function guessEventType(title: string, description?: string): string {
  const text = `${title} ${description || ''}`.toLowerCase();
  if (text.includes('hackathon')) return 'hackathon';
  if (text.includes('meetup') || text.includes('meet-up')) return 'meetup';
  if (text.includes('seminar') || text.includes('talk') || text.includes('lecture')) return 'seminar';
  if (text.includes('workshop') || text.includes('bootcamp')) return 'workshop';
  if (text.includes('conference') || text.includes('summit') || text.includes('devoxx')) return 'conference';
  return 'meetup';
}

function deduplicateEvents(events: DiscoveredEvent[]): DiscoveredEvent[] {
  const seen = new Map<string, DiscoveredEvent>();

  for (const e of events) {
    // Key: normalized title + date
    const key = `${e.title.toLowerCase().replace(/\s+/g, ' ').trim()}|${e.start_date}`;
    const altKey = `${e.venue_name.toLowerCase()}|${e.start_date}`;

    if (!seen.has(key) && !seen.has(altKey)) {
      seen.set(key, e);
    }
  }

  return Array.from(seen.values());
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🤖  AGENT ATHENS - AI/Tech Event Discovery                  ║');
  console.log('║     Scanning Athens for AI, tech & startup events             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const noBrowser = args.includes('--no-browser');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be saved\n');
  }
  if (noBrowser) {
    console.log('⏭️  NO-BROWSER MODE - Skipping Puppeteer sources\n');
  }

  // Run all scrapers
  const allEvents: DiscoveredEvent[] = [];

  // Tier 1: HTTP-based scrapers (fast, no browser needed)
  const starttech = await scrapeStarttech();
  allEvents.push(...starttech);

  const greeks = await scrapeGreeksInAI();
  allEvents.push(...greeks);

  const devoxx = await scrapeDevoxx();
  allEvents.push(...devoxx);

  const archimedes = await scrapeArchimedes();
  allEvents.push(...archimedes);

  const known = getKnownUpcomingEvents();
  allEvents.push(...known);

  // Tier 2: Browser-based scrapers (slower, catches more community events)
  if (!noBrowser) {
    const eventbrite = await scrapeEventbrite();
    allEvents.push(...eventbrite);

    const meetup = await scrapeMeetup();
    allEvents.push(...meetup);

    const luma = await scrapeLuma();
    allEvents.push(...luma);
  }

  // Deduplicate
  const unique = deduplicateEvents(allEvents);

  // Summary
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  📊  DISCOVERY RESULTS                                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Group by source
  const bySrc = new Map<string, DiscoveredEvent[]>();
  for (const e of unique) {
    const src = e.source;
    if (!bySrc.has(src)) bySrc.set(src, []);
    bySrc.get(src)!.push(e);
  }

  for (const [src, events] of bySrc) {
    console.log(`${src.padEnd(25)} | ${events.length} events`);
  }
  console.log('─'.repeat(45));
  console.log(`${'TOTAL'.padEnd(25)} | ${unique.length} unique events`);
  console.log('');

  // Print all events sorted by date
  console.log('📅 All discovered events (sorted by date):\n');
  unique.sort((a, b) => a.start_date.localeCompare(b.start_date));

  for (const e of unique) {
    const dateStr = e.end_date ? `${e.start_date} → ${e.end_date}` : e.start_date;
    const typeTag = e.event_type.toUpperCase().padEnd(10);
    const price = e.price_amount ? `€${e.price_amount}` : e.price_type === 'open' ? 'Free' : 'TBA';

    console.log(`  ${typeTag} ${dateStr}`);
    console.log(`  📌 ${e.title}`);
    console.log(`  📍 ${e.venue_name}${e.neighborhood ? ` (${e.neighborhood})` : ''}`);
    console.log(`  💰 ${price}  |  🔗 ${e.url}`);
    if (e.description) {
      console.log(`  📝 ${e.description.substring(0, 120)}...`);
    }
    console.log('');
  }

  // Save to database if not dry-run
  if (!dryRun && unique.length > 0) {
    console.log('💾 Saving to database...');
    const db = new Database(DB_PATH);
    let saved = 0;

    const stmt = db.prepare(`
      INSERT INTO events (
        id, title, description, start_date, end_date, time_doors, type, genres,
        venue_name, url, price_type, price_amount, source,
        location_status, needs_enrichment, created_at, updated_at
      ) VALUES (
        $id, $title, $description, $start_date, $end_date, $time_doors, $type, $genres,
        $venue_name, $url, $price_type, $price_amount, $source,
        $location_status, 1, datetime('now'), datetime('now')
      )
      ON CONFLICT(id) DO UPDATE SET
        title = $title,
        url = $url,
        type = $type,
        price_type = COALESCE($price_type, price_type),
        price_amount = COALESCE($price_amount, price_amount),
        updated_at = datetime('now')
    `);

    for (const e of unique) {
      try {
        stmt.run({
          $id: generateEventId(e.title, e.start_date, e.venue_name),
          $title: e.title,
          $description: e.description || '',
          $start_date: normalizeDateField(e.time ? `${e.start_date}T${e.time}:00` : e.start_date),
          $end_date: e.end_date ? normalizeDateField(e.end_date) : null,
          $time_doors: e.time || null,
          $type: e.event_type,
          $genres: JSON.stringify(['AI', 'Tech']),
          $venue_name: e.venue_name,
          $url: e.url,
          $price_type: e.price_type,
          $price_amount: e.price_amount,
          $source: e.source,
          $location_status: 'unverified'
        });
        saved++;
      } catch (err) {
        // Skip on error (likely missing column)
        console.log(`   ⚠️ Save error for "${e.title.substring(0, 40)}": ${err}`);
      }
    }

    db.close();
    console.log(`   ✅ Saved ${saved}/${unique.length} events to database`);
  }

  console.log('\n✨ Discovery complete!\n');
}

main().catch(console.error);
