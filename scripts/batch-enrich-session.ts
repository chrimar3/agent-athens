#!/usr/bin/env bun
/**
 * Batch Enrichment Session - February 2026 (17 events)
 */

import Database from 'bun:sqlite';

const db = new Database('data/events.db');
const now = new Date().toISOString();

const enrichments = [
  // ============================================================================
  // HALF NOTE JAZZ CLUB (4 events)
  // ============================================================================
  {
    id: 'bae5bda67ab3adbb',
    description: `You settle into a candlelit table as the first notes of a Brazilian guitar fill the room. The warmth of bossa nova wraps around you while the scent of wine mingles with the low hum of conversation. This is where Athens comes to remember that music can be both sophisticated and sensual.

Miranda Verouli leads her quintet through a tribute to Gal Costa, the Brazilian singer whose voice defined tropicália and MPB for five decades. Costa's catalog—from the psychedelic experimentation of the late 1960s to the romantic ballads that made her a household name—gets reimagined for an intimate jazz club setting.

The crowd here knows their music. You'll find vinyl collectors who can debate the relative merits of Costa's Tropicália albums, couples who slow-danced to these songs in their youth, and younger listeners discovering this repertoire for the first time. Nobody's checking their phone.

| Aspect | Details |
|--------|---------|
| **Setting** | Intimate jazz club, ~150 capacity, low ceilings amplify every note |
| **Vibe** | Warm, romantic, conversational |
| **Sound** | Listening room—every brush on the snare audible |
| **Seating** | Tables with full service, bar stools for solo visitors |

The set builds from quiet acoustic arrangements through to the full-blooded samba that Costa made her own. Expect the quintet to find new angles on familiar melodies.

If you want loud or want to dance—this isn't it. But if you're the kind of person who listens to albums start to finish and appreciates musicians who've studied their craft for decades, pull up a chair.

| Info | Details |
|------|---------|
| **Date** | Thursday, February 26, 2026 |
| **Doors** | 21:00 |
| **Music starts** | 21:30 |
| **Duration** | ~2.5 hours |
| **Price** | €15-20 table / €10-15 bar |
| **Tickets** | halfnote.gr |
| **Address** | Trivonianou 17, Mets |
| **Getting there** | Akropoli Metro (Red Line), 10 min walk |
| **Last metro** | 00:15 (show ends in time) |
| **Payment** | Cards and cash |
| **Good to know** | Book ahead and confirm same day—tables fill fast |

Half Note is where Athens' serious jazz listeners have gathered since 1979. For Brazilian jazz, there's nowhere else in the city with this combination of sound quality and atmosphere.

**Tags:** Jazz, Intimate, Local-favorite, Mixed-ages, Metro-accessible, Reservation-required

**Last verified:** February 2026`
  },
  {
    id: '8bc1dc30a4504dab',
    description: `The lights go down and a single voice cuts through the darkness—raw, unguarded, filling every corner of the room. You lean forward in your seat, drink forgotten, completely absorbed. This is the kind of performance that reminds you why live music matters.

Iro, one of Greece's most distinctive vocalists, presents "You Only Live Once" (YOLO)—an evening that promises the spontaneity and emotional directness that has defined her career. Known for refusing to play it safe, Iro brings jazz sensibility to Greek material and Greek soul to jazz standards.

The Half Note crowd for Greek vocalists skews toward those who've followed these artists for years. You'll recognize people from the front row at previous shows, musicians who've come to listen rather than network, and couples for whom a night of live music is a regular ritual rather than a special occasion.

| Aspect | Details |
|--------|---------|
| **Setting** | Historic jazz club, intimate 150-seat room |
| **Vibe** | Intense, emotionally charged, focused |
| **Sound** | Crystal-clear vocal mix in a room built for listening |
| **Seating** | Reserved tables, some bar seating |

The set will likely move between languages and genres—expect the unexpected. The late 22:30 start means this is a night for those who don't have early mornings.

If you want background music for conversation, look elsewhere. But if you're ready to be moved by a performer who holds nothing back, this is your night.

| Info | Details |
|------|---------|
| **Date** | Saturday, February 28, 2026 |
| **Doors** | 22:00 |
| **Music starts** | 22:30 |
| **Duration** | ~2 hours |
| **Price** | €15-20 table / €10-15 bar |
| **Tickets** | halfnote.gr |
| **Address** | Trivonianou 17, Mets |
| **Getting there** | Akropoli Metro (Red Line), 10 min walk |
| **Last metro** | 00:15 (may need taxi home) |
| **Payment** | Cards and cash |
| **Good to know** | Saturday shows book out—reserve early in the week |

Iro at Half Note represents the intersection of Greek vocal tradition and jazz club intimacy that's hard to find anywhere else.

**Tags:** Jazz, Intimate, Greek-locals, 30s-40s, Metro-accessible, Reservation-required

**Last verified:** February 2026`
  },
  {
    id: '66d57dc45ae2ba87',
    description: `The harmonica wails and the room transforms. Cigarette smoke may be banned these days, but close your eyes and you could be in a Delta juke joint circa 1955. Blues Cargo have been keeping this flame alive in Athens for decades, and tonight they've brought reinforcements.

Michael Dotson joins Blues Cargo as special guest, bringing American blues authenticity to a band that's spent years perfecting the form. This is blues played by musicians who've studied the original recordings until they could hear the room, not just the notes.

Blues audiences in Athens are a dedicated tribe. You'll find them in faded band t-shirts from shows they actually attended, discussing the finer points of different Chicago blues eras between sets. These are people who own more vinyl than their shelves can hold.

| Aspect | Details |
|--------|---------|
| **Setting** | Intimate club, exposed brick and low lighting |
| **Vibe** | Loose, warm, knowing |
| **Sound** | Amplified but never harsh—you'll feel the bass in your chest |
| **Seating** | Tables clustered around the stage, bar at the back |

The night builds from slow blues to shuffles to the kind of extended jams that only happen when musicians trust each other completely. With a special guest, expect some improvised moments that won't be repeated.

If you need polish and production, if blues feels like history homework—this won't convert you. But if a bent note can raise the hair on your arms, don't miss this.

| Info | Details |
|------|---------|
| **Date** | Monday, March 2, 2026 |
| **Doors** | 21:00 |
| **Music starts** | 21:30 |
| **Duration** | ~2.5 hours |
| **Price** | €15-20 table / €10-15 bar |
| **Tickets** | halfnote.gr |
| **Address** | Trivonianou 17, Mets |
| **Getting there** | Akropoli Metro (Red Line), 10 min walk |
| **Last metro** | 00:15 (show ends in time) |
| **Payment** | Cards and cash |
| **Good to know** | Monday shows are easier to book—but still reserve |

Half Note on a blues night offers something Athens' slick modern venues can't: the feeling of music made in the moment, for the people in the room.

**Tags:** Jazz, Intimate, Local-favorite, Mixed-ages, Metro-accessible, Reservation-required

**Last verified:** February 2026`
  },
  {
    id: '22290993f31d9160',
    description: `The piano introduces a theme—just a few notes—and the bass and drums lean in to respond. You watch three musicians who've played together so long they communicate in glances and half-gestures. This is jazz as conversation, unfolding in real time.

Spyros Manesis leads his trio through an evening of original compositions and reimagined standards. A pianist who trained in both classical and jazz traditions, Manesis brings technical precision to music that never feels academic. The trio format puts every choice under a spotlight.

Half Note's jazz trio audiences know what they're hearing. These are listeners who can tell when a chord substitution is clever and when it's showing off, who appreciate restraint as much as virtuosity. Conversation during solos? Never.

| Aspect | Details |
|--------|---------|
| **Setting** | Legendary jazz room, perfect acoustics for piano trio |
| **Vibe** | Focused, appreciative, intimate |
| **Sound** | Pure listening room—you'll hear the pedal work |
| **Seating** | Tables for dinner service, bar for drinks only |

The set will move through different tempos and moods—ballads that breathe, uptempo pieces that swing, and moments where the trio finds pockets of rhythm that seem to suspend time.

If you want vocals, if you want familiar melodies, if you want anything other than musicians exploring what's possible with piano, bass, and drums—this isn't your night. But if you understand why the jazz piano trio is its own art form, this is essential.

| Info | Details |
|------|---------|
| **Date** | Thursday, March 5, 2026 |
| **Doors** | 21:00 |
| **Music starts** | 21:30 |
| **Duration** | ~2 hours |
| **Price** | €15-20 table / €10-15 bar |
| **Tickets** | halfnote.gr |
| **Address** | Trivonianou 17, Mets |
| **Getting there** | Akropoli Metro (Red Line), 10 min walk |
| **Last metro** | 00:15 (show ends in time) |
| **Payment** | Cards and cash |
| **Good to know** | Thursday jazz at Half Note—a Athens tradition since 1979 |

For piano trio jazz in Athens, Half Note is the only room with both the acoustics and the audience this music deserves.

**Tags:** Jazz, Intimate, Local-favorite, 30s-40s, Metro-accessible, Reservation-required

**Last verified:** February 2026`
  },

  // ============================================================================
  // BENAKI MUSEUM EXHIBITIONS (2 events)
  // ============================================================================
  {
    id: '5864d4f58bcccd88',
    description: `"Alexis Akrithakis: A Line Like a Wave" opens at Benaki Museum Pireos 138 on February 11, 2026. This retrospective presents one of the most influential Greek artists of the 20th century, whose distinctive linear style bridged folk art, pop, and conceptual practice.

Akrithakis (1939-1994) spent formative years in Berlin and Paris before returning to Greece, absorbing influences from each context while developing an unmistakably personal visual language. His work—filled with arrows, birds, suitcases, and wandering lines—captures movement and displacement with deceptive simplicity.

The Pireos 138 building offers 3,000 square meters of exhibition space, allowing Akrithakis's work to breathe. Expect to trace his evolution from early figurative pieces through the iconic symbolic vocabulary of his mature period. The exhibition title references his fluid, continuous line—a signature element that makes his work immediately recognizable.

Ticketed entry with timed slots likely during peak hours. The museum café offers excellent views over Gazi for post-exhibition reflection.

| Info | Details |
|------|---------|
| **Opens** | February 11, 2026 |
| **Hours** | 10:00-18:00 (varies by day) |
| **Venue** | Benaki Museum, Pireos 138 |
| **Price** | Ticketed |
| **Getting there** | Kerameikos Metro (Blue Line), 5 min walk |

For those interested in Greek contemporary art history, this exhibition provides essential context for understanding the generation that shaped the country's visual culture.

**Last verified:** February 2026`
  },
  {
    id: '8787e304dbc782c4',
    description: `"MIET Collection: Greek Art of the 20th Century" continues at Benaki Museum Pireos 138. This exhibition presents works from the National Bank of Greece Cultural Foundation collection, surveying Greek artistic production across the last century.

The MIET collection represents decades of systematic acquisition, encompassing major figures from the Generation of the Thirties through contemporary practitioners. Expect to encounter works by artists who defined each era's visual vocabulary alongside lesser-known pieces that complicate familiar narratives.

Benaki Pireos 138's industrial architecture provides neutral backdrop for works spanning multiple movements and media. The curatorial approach typically emphasizes connections and ruptures across generations rather than strict chronological presentation.

The exhibition offers essential overview for visitors seeking to understand Greek art's development. Regular visitors will find reason to return—collections of this depth reward multiple viewings.

| Info | Details |
|------|---------|
| **Date** | February 25, 2026 onwards |
| **Hours** | 10:00-18:00 (varies by day) |
| **Venue** | Benaki Museum, Pireos 138, Gazi |
| **Price** | Ticketed |
| **Getting there** | Kerameikos Metro (Blue Line), 5 min walk |

One of Athens' essential stops for understanding 20th century Greek visual culture.

**Last verified:** February 2026`
  },

  // ============================================================================
  // ONASSIS STEGI (2 events)
  // ============================================================================
  {
    id: '2b3e9206ffe9f074',
    description: `"By Heart" by Tiago Rodrigues opens at Onassis Stegi on May 12, 2026. The Portuguese director and playwright—currently artistic director of the Avignon Festival—brings his acclaimed solo performance to one of Athens' leading contemporary arts venues.

In "By Heart," Rodrigues invites audience members to memorize a poem together, exploring how literature survives censorship, loss, and the limits of memory. The piece originated from his grandmother's experience of going blind and her determination to learn a poem by heart before losing her sight entirely.

The performance is intimate and participatory—not passive viewing but active engagement with text, memory, and community. Rodrigues has performed "By Heart" in multiple languages across venues from Lisbon to New York; this Athens presentation offers rare access to one of Europe's most significant theatre-makers.

| Info | Details |
|------|---------|
| **Date** | May 12, 2026 |
| **Time** | 11:00 |
| **Venue** | Onassis Stegi, Syngrou 107 |
| **Price** | Ticketed |
| **Getting there** | Syngrou-Fix Metro (Red Line), 3 min walk |

Essential viewing for anyone interested in contemporary European theatre and the relationship between performance and memory.

**Last verified:** February 2026`
  },
  {
    id: 'ba1cb764c001ee17',
    description: `"Yorgos Lanthimos: Photographs" opens at Onassis Stegi on May 17, 2026. The Academy Award-winning Greek filmmaker presents his photographic work in an exhibition that explores the visual sensibility behind films like "The Favourite," "Poor Things," and "The Lobster."

Lanthimos's cinema is distinguished by its precise visual compositions—wide-angle lenses creating uncanny perspectives, carefully controlled color palettes, and an eye for the absurd lurking within the mundane. This exhibition offers opportunity to examine that visual intelligence in still-image form.

The photographer's eye often reveals what remains hidden in motion. Expect to see the same attention to geometry, staging, and psychological tension that characterizes his filmmaking, translated into a medium that demands different kinds of attention.

Onassis Stegi provides appropriate setting for work by an artist whose career was significantly supported by Onassis Foundation early on. The venue's architecture and exhibition spaces match the ambition of showing major contemporary work.

| Info | Details |
|------|---------|
| **Opens** | May 17, 2026 |
| **Time** | 11:00 |
| **Venue** | Onassis Stegi, Syngrou 107 |
| **Price** | Ticketed |
| **Getting there** | Syngrou-Fix Metro (Red Line), 3 min walk |

For admirers of Lanthimos's films, this exhibition offers rare insight into the visual thinking behind some of contemporary cinema's most distinctive imagery.

**Last verified:** February 2026`
  },

  // ============================================================================
  // SNFCC PROGRAMS & FACILITIES (9 events)
  // ============================================================================
  {
    id: '992779086a0f93ae',
    description: `Guided tours at the Stavros Niarchos Foundation Cultural Center (SNFCC) offer visitors insight into Renzo Piano's award-winning architectural design and the park's sustainable landscape systems. Tours cover the building's engineering innovations, green roof, and the integration of cultural facilities within the broader urban planning vision.

The SNFCC opened in 2016, gifted to the Greek state by the Stavros Niarchos Foundation. The complex houses the Greek National Opera and National Library of Greece within Piano's signature style—transparency, lightness, and connection to landscape.

Tours typically depart from the Lighthouse (Pharos) and cover multiple levels of the complex. Advance registration recommended for English-language tours. Free admission.

| Info | Details |
|------|---------|
| **Venue** | SNFCC, Kallithea |
| **Price** | Free |
| **Getting there** | Free shuttle from Syntagma, or Faliro tram terminus |
| **Booking** | snfcc.org |

For architecture enthusiasts and first-time visitors seeking to understand the building and its context.

**Last verified:** February 2026`
  },
  {
    id: 'b87c0218c532da39',
    description: `The choreographed water fountains at SNFCC's Canal create a daily spectacle of light, water, and music. The Canal—a 400-meter water feature running through the heart of the complex—comes alive with synchronized performances that transform this architectural element into kinetic art.

Shows typically run multiple times daily, with evening performances incorporating lighting effects. The fountains were designed as an integral part of Renzo Piano's vision for the site, connecting the main building to the sea.

Viewing is free from multiple vantage points around the Canal. The best spots fill quickly for popular evening shows, particularly in summer months. The experience combines well with a walk through the park or pre-opera dinner.

| Info | Details |
|------|---------|
| **Venue** | SNFCC Canal, Kallithea |
| **Price** | Free |
| **Schedule** | Multiple daily performances |
| **Getting there** | Free shuttle from Syntagma, or Faliro tram terminus |

A popular family attraction and photogenic introduction to the SNFCC complex.

**Last verified:** February 2026`
  },
  {
    id: '6a1ed42c0c07bacb',
    description: `Summer Camp Activities at SNFCC offer children structured programming within the cultural center's extensive grounds. The 21-hectare park provides space for outdoor activities, while the building's educational facilities host arts, science, and cultural workshops.

Programming typically runs during school holiday periods, offering working parents childcare options combined with enriching activities. Past years have included environmental education, creative arts, sports, and music programs tailored to different age groups.

Registration opens ahead of each summer season. Activities are often free or subsidized, reflecting SNFCC's mission of public access to culture and recreation.

| Info | Details |
|------|---------|
| **Venue** | SNFCC, Kallithea |
| **Price** | Free / subsidized |
| **Season** | Summer months |
| **Registration** | snfcc.org |
| **Getting there** | Free shuttle from Syntagma |

Family-focused programming in one of Athens' most remarkable public spaces.

**Last verified:** February 2026`
  },
  {
    id: '0bec40a0d3f5166e',
    description: `The Stavros Niarchos Park Patrons Program supports ongoing maintenance and development of SNFCC's 21-hectare public park. Through memberships and donations, patrons contribute to the park's Mediterranean and sustainable planting schemes, educational programs, and free public events.

The park—designed by landscape architecture firm H. Pangalou & Associates—features over 1,400 trees and extensive plantings suited to the Greek climate. It includes running tracks, playgrounds, a labyrinth, and extensive green spaces unusual in the Athenian landscape.

Patron benefits typically include special access to events, behind-the-scenes tours, and recognition on the SNFCC premises. The program helps ensure the park remains freely accessible to all visitors.

| Info | Details |
|------|---------|
| **Venue** | SNFCC Park, Kallithea |
| **More info** | snfcc.org |

For those who wish to support one of Athens' most significant public green spaces.

**Last verified:** February 2026`
  },
  {
    id: 'd0af97420c6dc260',
    description: `The Pharos (Lighthouse) at SNFCC serves as both architectural landmark and visitor center for the cultural complex. Rising at the southern end of the building, this glass-enclosed space offers panoramic views across the Saronic Gulf to the mountains of the Peloponnese.

Designed by Renzo Piano Building Workshop, the Pharos embodies the transparency and connection to light that characterizes the entire complex. It serves as starting point for guided tours and orientation for first-time visitors.

The views extend from Aegina island to the Parthenon, offering perspective on Athens' relationship to sea and landscape rarely visible from the city center. Free access during SNFCC opening hours.

| Info | Details |
|------|---------|
| **Venue** | SNFCC, Kallithea |
| **Price** | Free |
| **Hours** | During SNFCC opening hours |
| **Getting there** | Free shuttle from Syntagma |

Essential first stop for visitors wanting to understand the SNFCC site and its setting.

**Last verified:** February 2026`
  },
  {
    id: '4d299bd4998ef410',
    description: `The Book Tower (Pyrgos Vivlion) is a distinctive vertical element within the National Library of Greece at SNFCC. This architectural feature houses reading rooms and book collections across multiple levels, visible from the building's atrium.

The National Library relocated to SNFCC in 2018, consolidating collections previously scattered across multiple sites. The Book Tower symbolizes this new chapter while referencing traditional library architecture's vertical stacking of knowledge.

Public access includes reading rooms, exhibition spaces, and children's library facilities. The collection includes manuscripts, rare books, and contemporary Greek publishing. Free library cards available for residents and researchers.

| Info | Details |
|------|---------|
| **Venue** | National Library of Greece, SNFCC |
| **Price** | Free admission |
| **Hours** | Library opening hours |
| **Getting there** | Free shuttle from Syntagma |

For readers, researchers, and architecture enthusiasts interested in contemporary library design.

**Last verified:** February 2026`
  },
  {
    id: '086a03e18f1f8101',
    description: `WOW – Women of the World Athens returns to SNFCC as part of the global festival celebrating women's achievements and addressing challenges women face worldwide. The WOW festival model, originating at London's Southbank Centre, combines talks, performances, debates, and workshops across a multi-day program.

WOW Athens brings together activists, artists, leaders, and community members for conversations about gender equality, women's rights, and women's creative contributions. Programming typically includes Greek and international speakers, with content ranging from keynote presentations to grassroots workshops.

The SNFCC venue provides multiple spaces for simultaneous programming, allowing attendees to curate their own experience across the festival. Free admission to many events, with some workshops requiring registration.

| Info | Details |
|------|---------|
| **Venue** | SNFCC, Kallithea |
| **Price** | Free / registration required for some events |
| **More info** | snfcc.org |
| **Getting there** | Free shuttle from Syntagma |

Part of the global WOW movement, offering Athens platform for women's voices and perspectives.

**Last verified:** February 2026`
  },
  {
    id: '259646123596d949',
    description: `Open Call: WOW Athens Marketplace 2026 invites women entrepreneurs, artisans, and small business owners to participate in the market component of the WOW Athens festival at SNFCC. The Marketplace provides platform for women-led businesses to showcase products and connect with festival attendees.

Past iterations have featured handmade goods, sustainable products, local food producers, and creative services. Selection processes typically emphasize small-scale and women-owned enterprises, supporting economic empowerment alongside the festival's cultural programming.

Applications require business information and product details. Selected vendors receive allocated selling space during festival days, access to the WOW community, and visibility within the broader festival program.

| Info | Details |
|------|---------|
| **Event** | WOW Athens Marketplace 2026 |
| **Venue** | SNFCC, Kallithea |
| **Application** | snfcc.org |
| **Deadline** | Check website for current dates |

Opportunity for women entrepreneurs to participate in a major cultural festival.

**Last verified:** February 2026`
  },
  {
    id: '7861945e20e9452b',
    description: `Open Call: SNFCC Youth Council invites young people to join an advisory body shaping programming at the Stavros Niarchos Foundation Cultural Center. The Youth Council provides channel for youth perspectives on SNFCC activities, events, and services.

Council members typically participate in regular meetings, provide feedback on programming, develop youth-focused initiatives, and connect with peers interested in arts and culture. The program offers leadership development within one of Greece's major cultural institutions.

Selection processes consider applicants' interests in arts and culture, community engagement, and ideas for youth programming. Council membership is voluntary with term limits to ensure rotation and fresh perspectives.

| Info | Details |
|------|---------|
| **Program** | SNFCC Youth Council |
| **Venue** | SNFCC, Kallithea |
| **Application** | snfcc.org |
| **Age range** | Check website for current eligibility |

For young people seeking voice in cultural programming and institutional governance.

**Last verified:** February 2026`
  }
];

let enriched = 0;
for (const e of enrichments) {
  const stmt = db.prepare(`
    UPDATE events
    SET full_description = ?,
        needs_enrichment = 0,
        enriched_at = ?,
        updated_at = ?
    WHERE id = ?
  `);
  const result = stmt.run(e.description, now, now, e.id);
  if (result.changes > 0) {
    console.log(`✅ Enriched: ${e.id.substring(0,8)}...`);
    enriched++;
  } else {
    console.log(`❌ Failed: ${e.id}`);
  }
}

db.close();
console.log(`\n✅ Batch enrichment complete! (${enriched}/${enrichments.length} events)`);
