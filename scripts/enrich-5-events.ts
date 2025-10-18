#!/usr/bin/env bun
/**
 * Enrich 5 high-value events with compelling 400-word descriptions
 * Usage: bun run scripts/enrich-5-events.ts
 */

import { getAllEvents, getDatabase } from '../src/db/database';
import type { Event } from '../src/types';

// Event IDs to enrich
const TARGET_EVENT_IDS = [
  'public-service-broadcasting-2025-10-18',
  'juergen-teller-you-are-invited-2025-10-19',
  'sunn-o-2025-10-19',
  'morrissey-live-in-athens-2025-12-12',
  'athens-marathon-the-authentic-2025-2025-11-09'
];

// Compelling 400-word descriptions for each event
const ENRICHED_DESCRIPTIONS: Record<string, string> = {
  'public-service-broadcasting-2025-10-18': `When a British band turns archival footage, vintage broadcasts, and historical speeches into stadium-worthy anthems, something genuinely unique is happening. Public Service Broadcasting have spent over a decade perfecting their signature blend of electronic rock, cinematic visuals, and documentary storytelling, transforming forgotten moments from history into immersive live experiences that feel like watching a film and attending a concert simultaneously.

The London-based duo of J. Willgoose, Esq. and Wrigglesworth create music that educates as much as it entertains. Their breakthrough album "The Race for Space" turned NASA mission recordings and Soviet space program archives into an electrifying tribute to the space age. Follow-up records explored Everest expeditions, Welsh mining disasters, and European history, always with the same meticulous attention to historical detail and sonic craftsmanship. They're not just making music about history; they're making history feel vital and immediate.

Live, Public Service Broadcasting are a completely different beast. What works brilliantly on record becomes transcendent on stage, where massive screens project vintage footage in sync with driving basslines, soaring guitars, and samples that make you feel like you're experiencing these historical moments firsthand. It's prog rock meets documentary cinema meets electronic music, and somehow it all makes perfect sense when you're in the room watching it unfold.

Athens gets to experience this rare phenomenon at Gazarte, one of the city's most versatile venues in the industrial-chic Keramikos neighborhood. The multi-level cultural space has become synonymous with quality international bookings, and Public Service Broadcasting represent exactly the kind of act Gazarte excels at hosting: ambitious, visually stunning, and utterly unique. The venue's main stage provides the perfect setting for PSB's audio-visual spectacle, with excellent sound and sightlines that ensure every moment lands with maximum impact.

This is Public Service Broadcasting's first Greek appearance, making it an essential night for anyone who values innovation in live music. Whether you're a fan of electronic music, rock, or simply compelling storytelling, this show offers something you won't find anywhere else. Doors open at 20:30, giving you time to grab a drink at Gazarte's excellent bar and settle in before the history lesson begins.

Don't miss this chance to see one of Britain's most inventive live acts in one of Athens' best venues. Public Service Broadcasting deliver experiences, not just concerts, and this is your opportunity to witness something genuinely special.`,

  'juergen-teller-you-are-invited-2025-10-19': `Juergen Teller doesn't take photos the way other fashion photographers do. Where the industry demands polish and perfection, the German-born artist delivers rawness, humor, and uncomfortable intimacy. His images have graced the pages of i-D, W Magazine, and countless Vivienne Westwood campaigns, yet they often look nothing like traditional fashion photography. Models appear unglamorous, celebrities look awkward, and luxury goods are presented with deliberate anti-glamour. It's fashion photography that questions fashion itself.

"you are invited" marks Teller's first major exhibition at Onassis Ready, the contemporary art space in Ag. Ioannis Rentis that has quickly established itself as one of Athens' most important cultural venues. The exhibition arrives at a perfect moment, as Teller's influence on contemporary photography has never been more apparent. His aesthetic, once considered shocking, now defines an entire generation's understanding of what fashion imagery can be: personal, political, playful, and profoundly human.

The show brings together works spanning Teller's career, from his early breakthrough campaigns to recent projects that continue pushing boundaries. You'll encounter his famous portraits of Kate Moss looking decidedly unglamorous, celebrities photographed in mundane settings, and images that blur the line between high art and snapshot photography. Teller's genius lies in making the viewer question what they're looking at: is this fashion? Art? Documentary? The answer is always yes, all three, and something more.

Onassis Ready provides an ideal setting for this encounter with one of photography's most provocative voices. The industrial space in Rentis has become Athens' go-to venue for challenging contemporary art, offering exhibitions that don't play it safe. The neighborhood itself, once purely industrial, is quietly transforming into a cultural destination, and Onassis Ready sits at the heart of this change.

Teller's work rewards close looking and repeated viewing. These aren't images designed to be scrolled past on Instagram; they demand you slow down, look carefully, and consider what fashion photography can be when it refuses to follow the rules. The exhibition includes vintage prints, recent work, and potentially unpublished images that offer fresh perspectives on Teller's singular vision.

For anyone interested in photography, fashion, or contemporary art, this exhibition is essential viewing. Teller has fundamentally changed how we think about fashion imagery, and seeing his work in person reveals details and nuances impossible to appreciate on screen. The opening is October 19th at 18:00, and the show will run for several weeks. Make the journey to Rentis; it's absolutely worth it.`,

  'sunn-o-2025-10-19': `Describing a Sunn O))) performance to someone who hasn't experienced it firsthand feels impossible. This isn't a concert in any conventional sense. It's a physical phenomenon, a sonic ritual, an encounter with sound so overwhelming that it transcends music and becomes something closer to a natural force. The American drone metal duo of Stephen O'Malley and Greg Anderson create music that you don't just hear; you feel it in your chest, your bones, your entire body.

Formed in Seattle in 1998, Sunn O))) (pronounced "sun") took inspiration from Earth's pioneering drone metal and amplified everything: the volume, the distortion, the glacial pacing, the sheer crushing weight of sound. Over nine studio albums, they've collaborated with avant-garde composers, metal legends, and noise artists, always pushing toward more extreme sonic territories. Their music exists at the intersection of metal, minimalist composition, noise art, and something indefinable that exists beyond genre entirely.

Live performances are where Sunn O))) truly come alive. The stage fills with fog machines creating an impenetrable wall of smoke. The musicians, dressed in robes like some doom-metal monastic order, stand nearly motionless as they coax earth-shaking frequencies from amplifiers turned to volumes that defy belief. Each note sustains for minutes, creating harmonic overtones that seem to vibrate in impossible spaces. It's meditative and punishing simultaneously, a test of endurance that becomes transcendent for those willing to surrender to it.

Athens gets this rare experience at Gagarin 205, the capital's premier venue for heavy music and alternative rock. Located on Liosion Street, Gagarin has built its reputation on bringing the world's most uncompromising artists to Greek audiences, and Sunn O))) represent perhaps the most extreme booking on that continuum. The venue's powerful sound system and devoted audience make it the perfect setting for this sonic assault.

Come prepared: earplugs are not optional, they're essential. Sunn O))) concerts routinely exceed 120 decibels, reaching levels that can cause hearing damage without protection. But don't let that scare you off. Experiencing this music at these volumes, feeling the air move with each bass note, watching the fog swirl in patterns created by pure sound—it's unlike anything else in contemporary music.

Tickets are €30-35, and this show will sell out. Sunn O))) tour infrequently, especially in Southern Europe, making this Athens appearance a genuine event for anyone interested in experimental music, heavy sound, or simply experiencing the absolute extremes of what live performance can be. Doors at 21:00, October 19th. Prepare yourself for something extraordinary.`,

  'morrissey-live-in-athens-2025-12-12': `Love him or loathe him—and there's rarely any middle ground—Morrissey remains one of the most compelling and controversial figures in rock music. As The Smiths' vocalist and lyricist, he helped define 1980s alternative music with songs that combined literary wit, emotional vulnerability, and melodic brilliance. As a solo artist over nearly four decades, he's built an equally impressive catalog while courting controversy with provocative statements that regularly make headlines for all the wrong reasons.

Separating the art from the artist has rarely been more complicated than with Morrissey. The music remains extraordinary: his voice, that distinctive instrument capable of profound melancholy and arch humor, has lost none of its power. His recent albums show a songwriter still capable of crafting memorable melodies and devastating lyrics. Live, he commands stages with the same charismatic presence that made him an icon in the first place. Fans who attended his shows report the same electric connection, the same sense of witnessing a genuine original.

Yet Morrissey the public figure has become increasingly difficult to defend. His political statements have alienated many longtime supporters, his cancellations have frustrated promoters worldwide, and his polarizing persona now threatens to overshadow his musical legacy. Attending a Morrissey concert in 2025 means confronting these contradictions directly: can you celebrate the music while rejecting the messenger? There's no easy answer, and perhaps that's precisely what makes this show so fascinating.

Athens gets this complicated experience at the Tae Kwon Do Stadium in Faliro, a venue large enough to accommodate the devoted fanbase Morrissey still commands. Despite the controversies, his live shows remain events, drawing fans who've followed him for decades alongside younger listeners discovering The Smiths and his solo work. The Greek audience has always appreciated British rock, and Morrissey represents a link to alternative music's most fertile period.

Expect a setlist mixing Smiths classics with solo material spanning his entire career. "How Soon Is Now?", "There Is a Light That Never Goes Out", and "The Boy with the Thorn in His Side" will likely appear alongside solo hits like "Suedehead" and "The More You Ignore Me, the Closer I Get". Morrissey's voice, against all odds, remains remarkably intact, capable of delivering these songs with the same emotional intensity that made them classics.

This show will divide opinion before it happens, during it, and long afterward. Morrissey concerts always do. But if you can navigate the contradictions, you'll witness one of rock's most singular performers delivering songs that have soundtracked millions of lives. December 12th, 19:00. Make your own decision about whether to attend. That's all anyone can do with Morrissey.`,

  'athens-marathon-the-authentic-2025-2025-11-09': `Every marathon in the world borrows its name and distance from what happened near Athens in 490 BCE. Only one follows the actual route. The Athens Marathon traces the legendary path of Pheidippides, the messenger who ran from the battlefield of Marathon to Athens to announce victory over the Persians, allegedly dying from exhaustion after delivering his message. Whether the story is historically accurate matters less than what it represents: the Athens Marathon is where it all began, and running it means participating in living history.

The 2025 edition on November 9th marks another chapter in this extraordinary event's modern history, which resumed in 1896 when the first modern Olympic Games returned the marathon to its birthplace. Today's race attracts over 20,000 runners from more than 100 countries, all seeking to experience the original route. Starting in the town of Marathon, runners follow coastal roads before turning inland toward Athens, finishing in the Panathenaic Stadium, the same marble stadium where ancient athletes competed and where the first modern Olympics concluded.

Make no mistake: this is a challenging course. The infamous uphill section from kilometer 31 to 35 has broken countless runners who arrived in Athens underprepared. Many consider it among the world's toughest major marathons, with summer heat training transitioning to November's cooler but still demanding conditions. Yet these difficulties add to the allure. Completing the Athens Marathon isn't just about finishing any marathon; it's about conquering the original route, the toughest test in the sport.

Beyond the main marathon, the event includes a 10K road race, a 5K fun run, and various activities transforming Marathon and Athens into a festival of running. Families line the route offering encouragement, local bands provide entertainment, and the finish line atmosphere in the historic Panathenaic Stadium creates moments runners remember for life. Crossing that marble finish line, in a stadium over 2,000 years old, after covering the route that gave marathon running its name—it's an emotional experience impossible to replicate elsewhere.

For Athens residents, the marathon offers a unique opportunity to participate in or support an event that showcases the city's deep connection to athletic history. For visitors, it's a chance to combine a major sporting challenge with cultural exploration of one of the world's great cities. The November timing is perfect: summer crowds have dispersed, weather is pleasant for both running and sightseeing, and the city embraces the event with genuine enthusiasm.

Registration for the 2025 race is open now, with slots filling rapidly. Whether you're a serious marathoner seeking to add the original to your resume, a recreational runner looking for a meaningful challenge, or simply someone who wants to experience Athens during this special weekend, the Athens Marathon offers something unique. November 9th, 2025. Run the route that started it all.`
};

// Word count utility
function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

async function enrichEvents() {
  console.log('🎨 Starting event enrichment process...\n');

  // Load all events from database
  const allEvents = getAllEvents();
  console.log(`📊 Loaded ${allEvents.length} total events from database\n`);

  let enrichedCount = 0;
  let totalWords = 0;
  const errors: string[] = [];

  for (const eventId of TARGET_EVENT_IDS) {
    try {
      // Find the event
      const event = allEvents.find(e => e.id === eventId);

      if (!event) {
        const error = `❌ Event not found: ${eventId}`;
        console.error(error);
        errors.push(error);
        continue;
      }

      // Get enriched description
      const fullDescription = ENRICHED_DESCRIPTIONS[eventId];

      if (!fullDescription) {
        const error = `❌ No description prepared for: ${eventId}`;
        console.error(error);
        errors.push(error);
        continue;
      }

      // Count words
      const wordCount = countWords(fullDescription);

      console.log(`📝 Enriching: ${event.title}`);
      console.log(`   Word count: ${wordCount} words`);
      console.log(`   Event type: ${event.type}`);
      console.log(`   Date: ${new Date(event.startDate).toLocaleDateString()}`);

      // Save to database using direct SQL update to avoid FTS corruption
      const db = getDatabase();
      const stmt = db.prepare(`
        UPDATE events
        SET full_description = ?,
            updated_at = ?
        WHERE id = ?
      `);

      try {
        stmt.run(fullDescription, new Date().toISOString(), eventId);
        var success = true;
      } catch (error) {
        console.error(`   Database error: ${error}`);
        var success = false;
      }

      if (success) {
        console.log(`   ✅ Database updated successfully\n`);
        enrichedCount++;
        totalWords += wordCount;
      } else {
        const error = `❌ Failed to update database for: ${eventId}`;
        console.error(`   ${error}\n`);
        errors.push(error);
      }

    } catch (error) {
      const errorMsg = `❌ Error processing ${eventId}: ${error}`;
      console.error(errorMsg);
      errors.push(errorMsg);
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 ENRICHMENT SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Events enriched: ${enrichedCount}/${TARGET_EVENT_IDS.length}`);
  console.log(`📝 Total words generated: ${totalWords.toLocaleString()}`);
  console.log(`📈 Average words per event: ${Math.round(totalWords / enrichedCount)}`);

  if (errors.length > 0) {
    console.log(`\n❌ Errors encountered: ${errors.length}`);
    errors.forEach(error => console.log(`   - ${error}`));
  } else {
    console.log('\n✨ All events enriched successfully!');
  }

  console.log('\n' + '='.repeat(60));
}

// Run the enrichment
enrichEvents().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
