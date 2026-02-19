#!/usr/bin/env bun
/**
 * Venue Ticket URL Mapping
 *
 * Maps venues to their ticket seller websites.
 * For venues that consistently sell through a specific platform,
 * we can construct the ticket URL directly.
 *
 * Usage:
 *   bun run scripts/venue-ticket-mapping.ts [--dry-run] [--verbose]
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';

const DB_PATH = join(import.meta.dir, '../data/events.db');

// Venue to ticket seller mapping
// Format: venue_name -> { seller: domain, urlPattern?: function to construct URL }
const VENUE_TICKET_MAP: Record<string, {
  seller: string;
  baseUrl: string;
  urlPattern?: (title: string) => string;
}> = {
  // Jazz clubs - sell through their own sites
  'Half Note Jazz Club': {
    seller: 'halfnote.gr',
    baseUrl: 'https://www.halfnote.gr/en/calendar/'
  },
  'Jazzet Cafe': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },

  // Major venues - ticketservices or megaron
  'Μέγαρο Μουσικής Αθηνών': {
    seller: 'megaron.gr',
    baseUrl: 'https://www.megaron.gr/calendar/'
  },

  // SNFCC venues
  'ΚΠΙΣΝ': {
    seller: 'snfcc.org',
    baseUrl: 'https://www.snfcc.org/events'
  },
  'Εθνική Λυρική Σκηνή': {
    seller: 'nationalopera.gr',
    baseUrl: 'https://www.nationalopera.gr/en/programma-parastaseon'
  },

  // Onassis Stegi
  'Στέγη Ιδρύματος Ωνάση': {
    seller: 'onassis.org',
    baseUrl: 'https://www.onassis.org/onassis-stegi/'
  },

  // Major concert venues - often more.com
  'Gagarin 205': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Piraeus Club Academy': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Floyd': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Fuzz': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Κύτταρο': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Gazarte': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Temple': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Doors': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Universe': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Gustav Athens': {
    seller: 'ticketservices.gr',
    baseUrl: 'https://www.ticketservices.gr/'
  },
  'Bios Ρομάντσο': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },

  // Live music venues
  'Σταυρός του Νότου': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Μικρός Κεραμεικός': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },

  // Theaters - often ticketservices or viva
  'Ολύμπια - Δημοτικό Μουσικό Θέατρο «Μαρία Κάλλας»': {
    seller: 'ticketservices.gr',
    baseUrl: 'https://www.ticketservices.gr/'
  },
  'Ολύμπια - Δημοτικό Μουσικό Θέατρο &#171;Μαρία Κάλλας&#187;': {
    seller: 'ticketservices.gr',
    baseUrl: 'https://www.ticketservices.gr/'
  },
  'Θέατρο Ολύμπια': {
    seller: 'ticketservices.gr',
    baseUrl: 'https://www.ticketservices.gr/'
  },
  'Θέατρο Παλλάς': {
    seller: 'viva.gr',
    baseUrl: 'https://www.viva.gr/tickets/theater/'
  },
  'Αλκμήνη': {
    seller: 'viva.gr',
    baseUrl: 'https://www.viva.gr/tickets/theater/'
  },
  'Θέατρο Nous': {
    seller: 'viva.gr',
    baseUrl: 'https://www.viva.gr/tickets/theater/'
  },
  'Theatre Of The No': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/theater/'
  },

  // Cultural centers
  'Ίδρυμα Μιχάλης Κακογιάννης': {
    seller: 'mcf.gr',
    baseUrl: 'https://www.mcf.gr/ekdiloseis/'
  },
  'Μουσείο Γουλανδρή': {
    seller: 'goulandris.gr',
    baseUrl: 'https://www.goulandris.gr/el/events'
  },

  // More concert venues
  'Κέντρο Ελέγχου Τηλεοράσεων': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Ράδιο': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Άλσος': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Underflow': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'MÉTRON Stage': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'EXA': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Ωδείο Αθηνών': {
    seller: 'ticketservices.gr',
    baseUrl: 'https://www.ticketservices.gr/'
  },
  'Παρνασσός': {
    seller: 'ticketservices.gr',
    baseUrl: 'https://www.ticketservices.gr/'
  },
  'ΠΛΥΦΑ': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Ορφέας Cafe Bar': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Oddity': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'HolyWood Stage': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Concert #1 Baumstrasse': {
    seller: 'ticketservices.gr',
    baseUrl: 'https://www.ticketservices.gr/'
  },
  'Caja de Música': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Aux Club': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Το Τρένο στο Ρουφ': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Σπίτι Art Bar': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Σαρδανάπαλος': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Πέραν': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Ον Off Studio': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Καταφύ': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Κ4': {
    seller: 'more.com',
    baseUrl: 'https://www.more.com/gr-el/music/'
  },
  'Παλιά Βουλή': {
    seller: 'ticketservices.gr',
    baseUrl: 'https://www.ticketservices.gr/'
  },
  'Μεγάλη Μουσική Βιβλιοθήκη της Ελλάδος': {
    seller: 'ticketservices.gr',
    baseUrl: 'https://www.ticketservices.gr/'
  },
  'Ιερός Ναός Αγίου Νικολάου Ραγκαβά': {
    seller: 'ticketservices.gr',
    baseUrl: 'https://www.ticketservices.gr/'
  },
  'Οικία Κατακουζηνού': {
    seller: 'ticketservices.gr',
    baseUrl: 'https://www.ticketservices.gr/'
  },

  // More theaters
  'Καφεθέατρο': {
    seller: 'viva.gr',
    baseUrl: 'https://www.viva.gr/tickets/theater/'
  },
  'Ίλιον Plus': {
    seller: 'viva.gr',
    baseUrl: 'https://www.viva.gr/tickets/theater/'
  },
  'ΙΛΙΟΝ Plus': {
    seller: 'viva.gr',
    baseUrl: 'https://www.viva.gr/tickets/theater/'
  },
  'Θέατρο Μεταξουργείο': {
    seller: 'viva.gr',
    baseUrl: 'https://www.viva.gr/tickets/theater/'
  },
  'Γυάλινο Μουσικό Θέατρο': {
    seller: 'viva.gr',
    baseUrl: 'https://www.viva.gr/tickets/theater/'
  },
  'ΦΙΑΤ': {
    seller: 'viva.gr',
    baseUrl: 'https://www.viva.gr/tickets/theater/'
  },
  'Ροές': {
    seller: 'viva.gr',
    baseUrl: 'https://www.viva.gr/tickets/theater/'
  },
  'Πορεία at Victoria': {
    seller: 'viva.gr',
    baseUrl: 'https://www.viva.gr/tickets/theater/'
  },
  'Νέος Ακάδημος': {
    seller: 'viva.gr',
    baseUrl: 'https://www.viva.gr/tickets/theater/'
  },
  'Μ54': {
    seller: 'viva.gr',
    baseUrl: 'https://www.viva.gr/tickets/theater/'
  },
  'Κάππα': {
    seller: 'viva.gr',
    baseUrl: 'https://www.viva.gr/tickets/theater/'
  },
  'Θέατρο του Νέου Κόσμου': {
    seller: 'viva.gr',
    baseUrl: 'https://www.viva.gr/tickets/theater/'
  },
  'Θέατρο Τέχνης': {
    seller: 'viva.gr',
    baseUrl: 'https://www.viva.gr/tickets/theater/'
  },
};

// Normalized venue name mapping (handles encoding differences)
const VENUE_ALIASES: Record<string, string> = {
  'Ολύμπια - Δημοτικό Μουσικό Θέατρο &#171;Μαρία Κάλλας&#187;': 'Ολύμπια - Δημοτικό Μουσικό Θέατρο «Μαρία Κάλλας»',
};

interface EventRow {
  id: string;
  title: string;
  venue_name: string;
  url: string | null;
  ticket_url: string | null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#171;/g, '«')
    .replace(/&#187;/g, '»')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');

  console.log('🎫 Venue Ticket URL Mapping');
  console.log('─'.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  const db = new Database(DB_PATH);

  // Get events without ticket URLs from mapped venues
  const mappedVenues = Object.keys(VENUE_TICKET_MAP);
  const aliasedVenues = Object.keys(VENUE_ALIASES);

  // Get all events without ticket URLs
  const events = db.query<EventRow, []>(`
    SELECT id, title, venue_name, url, ticket_url
    FROM events
    WHERE source = 'athinorama.gr'
      AND start_date >= date('now')
      AND (ticket_url IS NULL OR ticket_url = '' OR ticket_url LIKE '%athinorama%')
  `).all();

  console.log(`Events without ticket URLs: ${events.length}`);

  let updated = 0;
  let notMapped = 0;

  for (const event of events) {
    // Decode and normalize venue name
    let venueName = decodeHtmlEntities(event.venue_name);

    // Check for aliases
    if (VENUE_ALIASES[event.venue_name]) {
      venueName = VENUE_ALIASES[event.venue_name];
    }

    // Check if we have a mapping for this venue
    const mapping = VENUE_TICKET_MAP[venueName];

    if (mapping) {
      // Use the base URL as the ticket URL
      // In the future, we could construct more specific URLs
      const ticketUrl = mapping.baseUrl;

      if (verbose) {
        console.log(`✅ ${event.title.substring(0, 30)}...`);
        console.log(`   Venue: ${venueName}`);
        console.log(`   Ticket: ${ticketUrl}`);
      }

      if (!dryRun) {
        db.run(`
          UPDATE events
          SET ticket_url = ?
          WHERE id = ?
        `, [ticketUrl, event.id]);
      }

      updated++;
    } else {
      notMapped++;
      if (verbose) {
        console.log(`❌ No mapping for: ${venueName}`);
      }
    }
  }

  console.log('');
  console.log('─'.repeat(50));
  console.log('Results:');
  console.log(`  ✅ Updated: ${updated}`);
  console.log(`  ❌ No mapping: ${notMapped}`);

  if (dryRun) {
    console.log('\n⚠️  DRY RUN - no changes saved');
  } else {
    console.log(`\n✅ Updated ${updated} events with venue-based ticket URLs`);
  }

  // Show unmapped venues with counts
  console.log('\n📊 Unmapped venues (top 10):');
  const unmappedVenues = db.query<{ venue_name: string; count: number }, []>(`
    SELECT venue_name, COUNT(*) as count
    FROM events
    WHERE source = 'athinorama.gr'
      AND start_date >= date('now')
      AND (ticket_url IS NULL OR ticket_url = '' OR ticket_url LIKE '%athinorama%')
      AND venue_name NOT IN (${mappedVenues.map(() => '?').join(',')})
    GROUP BY venue_name
    ORDER BY count DESC
    LIMIT 10
  `).all(...mappedVenues);

  for (const v of unmappedVenues) {
    console.log(`  ${v.count}x ${decodeHtmlEntities(v.venue_name)}`);
  }

  db.close();
}

main().catch(console.error);
