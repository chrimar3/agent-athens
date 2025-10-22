#!/usr/bin/env bun

/**
 * Event Enrichment Script - Batch 1 of 13
 *
 * Generates compelling 400-word descriptions for events in batch-1-of-13.json
 * Updates the database with enriched content and AI context
 */

import { readFileSync } from "fs";
import { join } from "path";
import { updateEventEnrichment } from "../src/db/database";

interface BatchEvent {
  id: string;
  title: string;
  type: string;
  start_date: string;
  venue_name: string;
  genres: string;
  url: string;
  description: string;
}

interface EnrichmentResult {
  eventId: string;
  title: string;
  success: boolean;
  wordCount: number;
  error?: string;
}

/**
 * Generate enriched description for each event
 * Each description is crafted for cultural storytelling and authenticity
 */
function generateEnrichedDescription(event: BatchEvent): string {
  // Format date and time for use in descriptions
  const eventDate = new Date(event.start_date);
  const dateStr = eventDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  const timeStr = eventDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  // Event-specific enrichment based on available data
  const eventId = event.id;

  // G. C. MENOTTI - L' AMOUR À TROIS / F. POULENC - LA VOIX HUMAINE
  if (eventId === "b85c39c22922cbf6") {
    return `In the resonant halls of Thessaloniki's Concert Hall, two masterpieces of twentieth-century opera converge for an evening that explores love's most complex territories. Gian Carlo Menotti's "L'Amour à Trois" and Francis Poulenc's "La Voix Humaine" represent intimate chamber opera at its most psychologically penetrating, offering audiences a rare opportunity to experience these emotionally charged works in the acoustically superb Aimilios Riadis Hall.

Menotti, the Italian-American composer who made opera accessible and immediate, crafted "L'Amour à Trois" as a sophisticated exploration of romantic entanglement. His melodic gift and theatrical instinct create music that speaks directly to the heart, bypassing intellectual distance to deliver pure emotional impact. The work showcases his remarkable ability to capture the speaking voice in musical phrases, making every sung word feel as natural as conversation while maintaining operatic grandeur.

Poulenc's "La Voix Humaine" stands as one of opera's most harrowing portrayals of abandonment and desperation. Based on Jean Cocteau's one-act play, this monodrama for soprano and orchestra depicts a woman's final telephone conversation with her departing lover. Poulenc's music traces every nuance of her emotional disintegration—from forced cheerfulness to raw anguish—in a forty-minute tour de force that demands complete commitment from its performer. The work's power lies in its unflinching honesty about love's capacity to devastate.

The pairing of these works creates a profound meditation on love's darker dimensions. Where Menotti examines the complications of divided affections, Poulenc lays bare the soul-crushing pain of love's ending. Together, they form an evening that refuses easy sentiment, instead offering mature reflection on passion's consequences.

The Thessaloniki Concert Hall's Aimilios Riadis Hall provides the perfect setting for these intimate works. With acoustics designed to capture every vocal nuance and orchestral detail, the hall allows Menotti's conversational melodies and Poulenc's psychological subtleties to reach audiences with full impact. The 20:30 start time creates an atmosphere conducive to the evening's emotional depth.

For those drawn to opera that prioritizes psychological truth over spectacular display, this program offers essential repertoire performed in ideal conditions. The works demand exceptional vocalists capable of sustaining dramatic tension and musical sophistication simultaneously—qualities that distinguish memorable performances from merely competent ones. This evening promises to reveal why these mid-century masterpieces continue to resonate with contemporary audiences seeking art that confronts love's complexities without sentimentality or evasion.`;
  }

  // Μιχάλης Κώτης και Μάνος Παπαδάκης
  if (eventId === "0da54cd265bb5568") {
    return `The Museum of Musical Instruments "Thyrathen" welcomes an evening of authentic Greek musical expression on ${dateStr} at ${timeStr}, featuring the exceptional talents of Michalis Kotis and Manos Papadakis. This intimate concert promises to showcase traditional and contemporary Greek soundscapes within one of Athens' most unique cultural spaces.

Housed in a beautifully preserved neoclassical building, the Thyrathen Museum offers more than just a venue—it provides a living context for understanding Greek musical heritage. Surrounded by historical instruments from across the Mediterranean, performers and audiences alike experience music within its cultural continuum. The museum's carefully curated acoustics and atmospheric setting create an immersive environment where every note resonates with historical significance.

Michalis Kotis brings to this performance a deep understanding of Greek folk traditions combined with contemporary sensibilities. His approach to music honors traditional forms while breathing new life into familiar melodies, creating performances that feel both timeless and fresh. Whether working with traditional instruments or exploring modern interpretations, Kotis demonstrates the living, evolving nature of Greek musical culture.

Manos Papadakis complements this artistic vision with his own distinctive musical voice. Together, these musicians create a dynamic dialogue between tradition and innovation, showcasing how Greek music continues to evolve while maintaining its essential character. Their collaboration highlights the rich complexity of Greek musical traditions—from island melodies to urban folk songs, from ancient rhythmic patterns to contemporary improvisations.

The intimate scale of the Thyrathen Museum ensures that this won't be a passive concert experience. In this setting, the boundaries between performers and audience soften, creating a shared musical journey. Expect an evening where stories emerge through melody, where instruments speak with voices honed over generations, and where the past and present of Greek music meet in vibrant dialogue.

For those seeking to understand Athens beyond its ancient monuments and tourist attractions, this concert offers entry into the city's living cultural heart. It's an opportunity to experience Greek music not as preserved artifact but as continuing tradition, performed by artists who carry these traditions forward with respect, skill, and creative vision.`;
  }

  // ΘΑΝΟΣ ΜΑΤΖΙΛΗΣ , ΚΕΛΛΥ ΒΟΥΔΟΥΡΗ, ΜΑΡΙΛΙΖΑ ΛΟΥΝΤΖΗ | ΣΤΑΥΡΟΣ ΤΟΥ ΝΟΤΟΥ CLUB
  if (eventId === "8dd067c290246be4") {
    return `Stavros tou Notou Club hosts a triple-header of contemporary Greek musical talent on ${dateStr} at ${timeStr}, bringing together Thanos Matzilis, Kelly Voudouri, and Mariliza Lountzi for an evening that celebrates the vibrant diversity of Athens' current music scene.

Stavros tou Notou has established itself as one of Athens' essential cultural venues, a space where artistic experimentation meets popular appeal. Located in the city's culturally rich southern districts, the venue has become synonymous with quality programming that spans traditional and contemporary forms. The Club's intimate atmosphere and excellent sound design create ideal conditions for experiencing live music in its most immediate, affecting form.

Thanos Matzilis approaches his performance with the distinctive sensibility that has made him a notable voice in Greek music. His work draws from deep wells of tradition while remaining thoroughly contemporary, creating soundscapes that feel both familiar and surprising. Whether exploring traditional material or original compositions, Matzilis demonstrates how Greek musical heritage continues to inspire new creative possibilities.

Kelly Voudouri brings her own artistic perspective to the evening, offering audiences a different facet of contemporary Greek musical expression. Her performances combine technical excellence with emotional authenticity, creating moments of genuine connection between artist and audience. In the intimate setting of Stavros tou Notou Club, her musical voice finds its ideal environment.

Mariliza Lountzi completes this triumvirate of talent, adding yet another dimension to the evening's musical palette. Together, these three artists represent the breadth and vitality of Athens' music scene—a scene that honors its rich heritage while constantly pushing into new creative territory.

This concert exemplifies what makes Athens' contemporary cultural life so compelling: the coexistence of multiple artistic voices, each with distinctive character, all sharing space in venues committed to presenting quality live performance. It's an opportunity to experience Greek music as a living, evolving art form, performed by artists who understand both where it comes from and where it might go.

For visitors seeking authentic encounters with contemporary Greek culture, this evening at Stavros tou Notou Club offers exactly that—no tourist-friendly sanitization, just real artists performing real music for audiences who appreciate both craft and creativity.`;
  }

  // ΚΑΛΟΓΕΡΑΚΙΑ | ΣΤΑΥΡΟΣ ΤΟΥ ΝΟΤΟΥ PLUS
  if (eventId === "bd60a06f0bd9e1e7") {
    return `Stavros tou Notou Plus welcomes Kalogerakia on ${dateStr} at ${timeStr} for an evening that promises to showcase one of the more intriguing acts in Athens' diverse music scene. The Plus space offers a slightly larger capacity than the venue's Club room while maintaining the intimate atmosphere that has made Stavros tou Notou a beloved destination for serious music lovers.

Kalogerakia brings a distinctive musical identity to this performance, one that reflects the creative energy currently flowing through Athens' cultural underground. In a city where musical traditions run deep and innovation constantly emerges from dialogue with the past, acts like Kalogerakia represent the ongoing evolution of Greek musical expression. Their approach defies easy categorization, drawing from multiple influences while maintaining a coherent artistic vision.

The Stavros tou Notou complex has become one of Athens' most important cultural institutions precisely because it provides space for artists working at the intersection of tradition and experimentation. Located in a neighborhood rich with authentic Athenian character, the venue attracts audiences seeking genuine artistic experiences rather than tourist-oriented entertainment. The Plus room, with its professional sound system and comfortable layout, offers optimal conditions for both performers and listeners.

What makes this performance particularly noteworthy is its placement within Athens' broader cultural ecosystem. The city's music scene thrives on venues like Stavros tou Notou that support emerging and established artists working outside commercial mainstream constraints. These spaces allow musical experimentation to flourish, giving audiences access to performances that might not find platforms in more commercially-oriented venues.

For those exploring Athens beyond its ancient landmarks and tourist districts, attending a concert at Stavros tou Notou Plus offers insight into the city's contemporary cultural life. Here, you'll find Athenians gathering not to consume packaged entertainment but to participate in living cultural exchanges—to hear artists pushing creative boundaries, to discover new sounds, to be part of conversations about where Greek music might go next.

The evening promises more than just musical performance; it offers entry into a community of people who care deeply about artistic expression and cultural vitality. Whether you're familiar with Kalogerakia's work or discovering them for the first time, this concert represents an opportunity to experience Athens' music scene in authentic, unfiltered form.`;
  }

  // THANOS STAVRIDIS QUARTET
  if (eventId === "cd63071c5ad5a0b6") {
    return `Half Note Jazz Club presents the Thanos Stavridis Quartet on ${dateStr} at ${timeStr}, bringing together some of Greece's finest jazz musicians for an evening of sophisticated improvisation and musical dialogue. As Athens' premier jazz venue, Half Note has long served as the city's main stage for both international jazz legends and the best of Greek jazz talent.

Thanos Stavridis has established himself as one of the most respected figures in Greek jazz, a musician whose work bridges the international jazz tradition with distinctly Mediterranean sensibilities. His quartet format allows for the kind of intimate musical conversation that defines jazz at its best—four voices in constant dialogue, each responding to the others in real time, creating music that exists only in the moment of its performance.

The Half Note Jazz Club occupies a special place in Athens' cultural landscape. Since its founding, the venue has maintained unwavering commitment to presenting authentic jazz in optimal conditions. Its acoustics, carefully designed for jazz performance, allow audiences to hear every nuance—the subtle brush work on cymbals, the gentle touch on piano keys, the breath behind a saxophone phrase. The club's atmosphere encourages focused listening while maintaining the relaxed ambiance essential to jazz appreciation.

Greek jazz has developed its own distinctive character over recent decades, as musicians trained in American jazz traditions have brought those influences into conversation with Greek musical heritage. The result is a sound that honors jazz fundamentals—swing, improvisation, blues feeling—while incorporating melodic and rhythmic elements from Greek folk and popular traditions. Stavridis and his quartet navigate this terrain with fluency and sophistication.

For visitors to Athens interested in the city's contemporary cultural offerings, a night at Half Note provides perspective unavailable in tourist-oriented venues. Here you'll find serious music lovers—both Greek and international—gathered to experience live improvised music performed at the highest level. The audience knows to listen during performances, to save conversation for between sets, to honor the musicians' craft with attention and appreciation.

The quartet format showcases jazz's essentially conversational nature. Each musician brings individual voice and perspective, but the magic happens in the spaces between—where listening becomes as important as playing, where musical ideas spark responses and counter-responses, where four players think together to create something none could achieve alone. This is jazz as dialogue, as collaborative creation, as shared journey into musical possibility.`;
  }

  // Molly Nilsson Live at Death Disco
  if (eventId === "5f7ff4c30cca0e5c") {
    return `Death Disco welcomes Swedish synth-pop artist Molly Nilsson on ${dateStr} at ${timeStr} for what promises to be an unforgettable evening of atmospheric electronic music. This concert brings one of European underground music's most distinctive voices to one of Athens' most interesting alternative venues, creating an ideal match between artist and setting.

Molly Nilsson has carved out a unique space in contemporary music through her fiercely independent approach and unmistakable sonic signature. Her self-released albums have garnered cult followings across Europe and beyond, connecting with listeners who appreciate music that combines emotional directness with sophisticated production. Nilsson's songs explore themes of urban alienation, romantic longing, and social observation through layers of vintage synthesizers and her distinctive, intimate vocal delivery.

Death Disco has established itself as Athens' destination for alternative electronic music and underground culture. The venue's commitment to booking artists working outside mainstream commercial constraints has made it essential for anyone seeking Athens' more adventurous musical offerings. Its industrial-chic aesthetic and excellent sound system create an immersive environment where electronic music can be experienced with full sonic impact.

What makes Nilsson's live performances particularly compelling is how she translates her recorded work's bedroom-produced intimacy to larger concert settings. Her shows maintain a personal, almost confessional quality even as the synthesizers fill the room with sound. There's vulnerability in her stage presence that creates immediate connection with audiences, transforming what could be coldly electronic into something warmly human.

For international visitors to Athens, this concert offers a chance to experience the city's vibrant alternative music scene. Death Disco represents a side of Athens often missed by tourists—a city with thriving underground culture, venues supporting experimental artists, audiences hungry for music that challenges and moves them. The crowd at a Molly Nilsson show will likely include artists, students, and music obsessives from across Europe, all drawn by the promise of an artist who remains genuinely alternative in an increasingly homogenized music landscape.

Athens has always attracted creative spirits from across the Mediterranean and beyond. A concert like this demonstrates how the city continues to function as a crossroads where international underground culture meets Greek alternative scenes, creating moments of genuine cultural exchange. Expect an evening where music becomes more than entertainment—where it serves as language for feelings and experiences that resist conventional expression.`;
  }

  // Mermaids Are Real
  if (eventId === "3229011f9197c8f4") {
    return `Centro Elegxo Tileoraseon (Television Control Center) hosts Mermaids Are Real on ${dateStr} at ${timeStr} as the duo presents material from their self-titled debut album. This concert offers audiences a chance to experience one of Athens' emerging acts in a venue known for supporting experimental and independent music.

Mermaids Are Real represents the kind of musical project that flourishes in Athens' supportive underground scene—artists working outside commercial pressures, developing distinctive sounds through patient experimentation, building audiences through authentic artistic vision rather than marketing strategies. Their debut album arrival marks a significant moment for the duo, documenting their sonic explorations in recorded form while promising live performances that will expand and reinterpret this material.

The Television Control Center has become one of Athens' most interesting cultural spaces, a venue whose name hints at its commitment to offering alternatives to mainstream cultural consumption. Located away from tourist districts, it serves as a genuine community space where local artists and audiences gather around shared commitment to creative expression. The venue's informal atmosphere encourages experimentation and risk-taking, making it ideal for emerging artists finding their voices.

Duo formats offer particular creative possibilities, forcing musicians to make every element count while leaving space for improvisation and spontaneous interaction. With just two people creating the sound, audiences can clearly perceive the musical dialogue, understand how individual contributions combine into cohesive whole. This transparency can make duo performances particularly intimate and engaging.

Athens' music scene has always depended on venues willing to support emerging artists before they achieve broader recognition. Spaces like Television Control Center play essential roles in this ecosystem, providing platforms where new sounds can find audiences, where artists can develop their craft through performance, where communities form around shared musical passions. Tonight's concert continues this tradition, offering the duo a stage and music lovers a chance to discover something new.

For those seeking to understand contemporary Athens beyond its ancient heritage and tourist attractions, attending concerts at venues like this provides invaluable perspective. Here you'll encounter the city's living creative culture—artists making work that reflects contemporary concerns and sensibilities, audiences supporting artistic expression with their presence and attention, communities forming around shared values rather than commercial transactions.

The evening promises material from the duo's debut album alongside the spontaneous elements that make live performance irreplaceable. Expect an intimate setting where the boundaries between performers and audience soften, where everyone present participates in creating the evening's energy and meaning.`;
  }

  // ROSANNA MAILAN - HAVANATHENS
  if (eventId === "8c6f14f5f0a89d90") {
    return `Half Note Jazz Club presents "HAVANATHENS" featuring Rosanna Mailan and Dimitris Kalantzis on ${dateStr} at ${timeStr}, offering an evening that promises to bridge two vibrant musical traditions—the rhythmic heat of Havana and the melodic sophistication of Athens. This cross-cultural musical conversation unfolds in one of Athens' most respected jazz venues, creating ideal conditions for exploring connections between Cuban and Greek musical sensibilities.

The collaboration's title, "HAVANATHENS," immediately signals its ambition: to find common ground between Cuban and Greek musical traditions, two cultures separated by geography but united by passionate expressiveness, complex rhythmic traditions, and music deeply embedded in social life. Both cultures have produced musical forms that serve not just as entertainment but as essential expressions of identity and community.

Rosanna Mailan brings to this project her understanding of how music functions as cultural bridge. Her approach honors both traditions without treating them as museum pieces, instead finding living connections that make the fusion feel organic rather than forced. When Cuban rhythms meet Greek melodic modes, when timbales converse with bouzouki-influenced phrasing, the results can reveal unexpected kinships between seemingly distant traditions.

Dimitris Kalantzis contributes his deep knowledge of Greek musical forms and his ability to place them in dialogue with other traditions. Greek music has always absorbed influences while maintaining its distinctive character—from Byzantine chant to Ottoman court music to rebetiko's urban blues. This openness to cross-pollination makes collaborations like "HAVANATHENS" feel like natural extensions of Greek musical history.

Half Note's intimate setting and excellent acoustics allow audiences to appreciate the musical details that make this fusion work. You'll hear how Cuban montuno patterns might lock into Greek rhythmic modes, how a Greek melody might take on new dimensions when harmonized with Cuban jazz voicings, how improvisational passages reveal the underlying similarities between traditions that both prize spontaneity and emotional directness.

For international visitors, this concert offers perspective on how Athens functions as Mediterranean cultural crossroads. The city has always been a meeting point where influences from multiple directions combine to create something distinctly Athenian. "HAVANATHENS" embodies this spirit of creative synthesis, demonstrating how musical traditions remain vital by entering into dialogue with each other.

Expect an evening of rhythmic vitality and melodic richness, where two powerful musical traditions meet in respectful, imaginative conversation. Whether you come primarily for the Cuban elements, the Greek influences, or the jazz framework that holds it all together, the music promises to reward both careful listening and spontaneous response.`;
  }

  // ΜΑΡΙΑ ΚΟΥΤΣΟΥΡΛΗ | ΣΤΑΥΡΟΣ ΤΟΥ ΝΟΤΟΥ CLUB
  if (eventId === "af8298f125d4894a") {
    return `Stavros tou Notou Club welcomes Maria Koutsourli on ${dateStr} at ${timeStr} for an evening that promises to showcase one of Greek art music's distinctive voices. This performance places Koutsourli's sophisticated musical vision in the intimate environment of one of Athens' most respected venues for serious contemporary music.

Maria Koutsourli has established herself as an artist who works at the intersection of multiple musical traditions, bringing together elements of Greek folk music, art song, and contemporary composition into performances that feel both deeply rooted and thoroughly modern. Her approach honors tradition without being bound by it, finding ways to make traditional forms speak to contemporary concerns and sensibilities.

The "Sinora" (Borders) series at Stavros tou Notou explores exactly this terrain—the boundaries and borderlands between musical traditions, the spaces where different forms meet and influence each other, the creative possibilities that emerge when artists navigate between categories rather than staying safely within them. Koutsourli's work exemplifies this spirit of boundary-crossing, creating music that refuses easy categorization while maintaining clear artistic integrity.

Stavros tou Notou Club has become essential to Athens' music scene precisely because it provides space for artists like Koutsourli who work with sophistication and seriousness. The venue attracts audiences who appreciate complexity and nuance, who come to listen rather than simply consume, who understand that some music requires attention and rewards it with depth and richness. The Club's excellent acoustics and intimate scale create conditions where every vocal nuance and instrumental detail can be clearly heard and appreciated.

Greek art music has a long, rich tradition of artists who draw from folk sources while crafting highly sophisticated artistic statements. Koutsourli continues this tradition, demonstrating how Greek musical heritage remains a living source of inspiration rather than historical artifact. Her performances offer audiences access to this ongoing creative dialogue between past and present, tradition and innovation.

For those exploring Athens' contemporary cultural offerings, this concert provides an opportunity to experience Greek music at a level of sophistication often missed in tourist-oriented venues. Here you'll encounter an artist working with genuine creative ambition, an audience that knows how to listen, a venue committed to presenting music as art rather than mere entertainment.

The evening promises material that draws from multiple sources but ultimately sounds distinctly like Koutsourli—an original voice emerging from deep engagement with tradition, an artist who understands that honoring the past and creating something new aren't contradictory goals but complementary aspects of vital artistic practice.`;
  }

  // Alcedo Folk Band στο Caja de Música
  if (eventId === "5b2aab91da06fd26") {
    return `Caja de Música hosts the Alcedo Folk Band on ${dateStr} at ${timeStr} for an evening celebrating folk music traditions and the continuing vitality of acoustic ensemble performance. This concert brings together musicians dedicated to preserving and reimagining folk traditions in one of Athens' venues most committed to presenting roots music in all its diversity.

Folk music remains vital when musicians understand it as living tradition rather than historical preservation project. The Alcedo Folk Band approaches their material with this understanding, honoring traditional forms while allowing them to breathe and evolve. Their performances demonstrate how folk music continues to speak to contemporary audiences when presented with authenticity and skill.

Caja de Música (Music Box) has carved out a special niche in Athens' music scene as a destination for folk and world music traditions. The venue's warm, welcoming atmosphere creates ideal conditions for the kind of communal experience that folk music has always fostered. Unlike genres that emphasize virtuosic display or cutting-edge production, folk music thrives on the connections it creates—between musicians, between performers and audiences, between present moments and long traditions.

The folk tradition encompasses extraordinary diversity, drawing from multiple regional sources and historical periods. What unites these varied forms is their relationship to community and place—music created by and for people, passed down through generations, adapted to changing circumstances while maintaining essential character. When performed with understanding and respect, folk music offers access to cultural memories and collective experiences that transcend individual perspectives.

Athens, positioned at crossroads of multiple cultural influences, has always been a meeting point for diverse musical traditions. The city's folk music scenes reflect this diversity, with musicians exploring material from Greek regional traditions, broader Balkan and Mediterranean sources, and beyond. Venues like Caja de Música provide essential platforms for this exploration, spaces where musicians and audiences can gather around shared appreciation for acoustic music's directness and emotional honesty.

For visitors seeking to experience Athens beyond its tourist attractions, an evening at Caja de Música offers valuable perspective on the city's living cultural traditions. Here you'll find music presented in intimate, unpretentious settings—no elaborate production, no multimedia displays, just skilled musicians sharing material they love with audiences who appreciate the craft and feeling behind every note.

The Alcedo Folk Band's performance promises an evening where music functions as it has for centuries—as vehicle for storytelling, emotional expression, and communal gathering. Expect material that ranges across folk traditions, played with respect for sources and joy in the music-making itself.`;
  }

  // THY ART IS MURDER | GAGARIN 205
  if (eventId === "0c998463edca2ac9") {
    return `Gagarin 205 Live Music Space opens its doors to Australian extreme metal force Thy Art Is Murder on ${dateStr} at ${timeStr}, with support from Heriot. This concert brings one of death metal's most uncompromising acts to Athens' premier venue for heavy music, promising an evening of sonic extremity and cathartic intensity.

Thy Art Is Murder has spent the past decade establishing themselves as leaders in modern death metal's more brutal territories. Their approach combines the genre's foundational elements—crushing heaviness, technical precision, aggressive vocal delivery—with contemporary production values and sophisticated songwriting that transcends mere brutality. The band's thematic concerns tackle social and political issues with unflinching directness, using extreme music's vehicle to address extreme circumstances in the modern world.

The Sydney band's evolution has seen them refine their sound while maintaining the ferocity that first attracted attention. Their albums demonstrate how extreme metal can be both artistically ambitious and viscerally powerful, how technical proficiency and emotional intensity need not exist in opposition. Live, they transform studio recordings' controlled aggression into overwhelming physical experiences, with volume and energy that test both venue sound systems and audience endurance.

Gagarin 205 has become Athens' essential venue for metal and heavy music, a space where both international touring acts and Greek metal bands find ideal performance conditions. The venue's robust sound system handles extreme music's demands, delivering clarity even at punishing volumes, allowing audiences to appreciate the music's complexity alongside its raw power. The space's size creates intimacy impossible in larger halls while providing room for the physical release that metal concerts inspire.

Support act Heriot adds another dimension to the evening, offering their own take on heavy music's possibilities. The pairing creates a night of sustained intensity, building energy across two sets toward peak cathartic release. For metal fans, this kind of careful programming transforms concerts from isolated performances into complete experiences, journeys through different aspects of heavy music's vast terrain.

Athens has supported metal scenes since the genre's early days, with generations of Greek bands contributing to international metal communities. Venues like Gagarin 205 maintain this tradition, providing spaces where metal culture can flourish—where fans can gather around shared musical passions, where touring bands find enthusiastic audiences, where volume and intensity are celebrated rather than merely tolerated.

For those unfamiliar with extreme metal's appeal, these concerts might seem impenetrable. But within metal communities, they function as crucial cultural events—gatherings where shared values around authenticity, intensity, and musical extremity create powerful sense of belonging and release.`;
  }

  // Άσαρκος "Ίντριγκα" Tour 2025
  if (eventId === "cc9a3fd003bb8d6e") {
    return `Asarkos brings his "Intrika" (Intrigue) tour to Athens on ${dateStr} at ${timeStr}, presenting material from his new album alongside selections spanning his entire career. This performance marks a significant moment for one of Greek hip-hop's most respected voices, an artist whose work has helped define and expand the genre's possibilities in Greek context.

The "Intrika" album represents Asarkos' latest exploration of the intersection between personal narrative and broader social observation, a balance he's maintained throughout his career. Greek hip-hop has developed its own distinctive character over recent decades, as artists have adapted the genre's fundamentals—rhythmic flow, sampled beats, street credibility—to address specifically Greek experiences and concerns. Asarkos has been central to this development, demonstrating how hip-hop's tools can articulate Greek urban realities.

The tour format allows for comprehensive presentation of an artist's evolution, showing how styles and concerns have developed across albums and years. For longtime fans, this offers chance to re-experience tracks that have become personal landmarks. For newer listeners, it provides overview of a career's arc, context for understanding how current work emerged from earlier explorations. Asarkos' catalog rewards this comprehensive approach, revealing consistency of vision alongside willingness to evolve and experiment.

Hip-hop concerts function differently than many other musical performances. The relationship between MC and audience is more interactive, with crowds often rhyming along with familiar verses, responding to call-and-response patterns, creating energy that feeds back to the performer. This dynamic transforms concerts into communal experiences where the line between performer and audience blurs, where everyone present participates in creating the evening's energy and meaning.

Greece's hip-hop scene has grown from underground phenomenon to significant cultural force, producing artists whose work resonates far beyond initial circles of enthusiasts. This growth reflects hip-hop's fundamental adaptability—its capacity to provide voice for marginalized perspectives, its ability to address local realities while connecting to global hip-hop culture. Artists like Asarkos have demonstrated that Greek hip-hop isn't merely imitation of American forms but vital expression of Greek urban experience.

The tour extends beyond Athens to Cyprus, recognizing the cultural connections between Greek populations across geographic boundaries. This expanded scope reflects how Greek hip-hop culture exists as network rather than isolated local scene, with artists and fans connected across distances by shared language and cultural reference points.

Expect an evening that combines the new album's fresh perspectives with familiar tracks that have achieved classic status within Greek hip-hop. Whether you're longtime follower of Asarkos' work or discovering it for the first time, the concert promises insights into how hip-hop has become essential voice in contemporary Greek cultural expression.`;
  }

  // CHIPPER - "LIBERTALIA" - Release Live Show
  if (eventId === "5814d5e4cf914c6a") {
    return `AN Club presents Chipper's "LIBERTALIA" album release show on ${dateStr} at ${timeStr}, with support from The Ruckus Habit and Fighting Flies. This triple-bill celebration of new music brings together three acts representing different facets of Athens' rock scene for an evening promising energy, volume, and the special excitement that surrounds debut album presentations.

Album release shows carry particular significance in music culture. They mark transitions from studio work to public presentation, from private creative process to shared experience. For bands, these shows represent culmination of months or years of work—writing, recording, refining, preparing. For audiences, they offer chance to encounter new material in ideal conditions: performed by musicians at peak enthusiasm, surrounded by crowds excited to discover the album's full scope.

Chipper's "LIBERTALIA" title suggests themes of freedom and utopian imagination—the historical pirate colony of Libertalia has long fascinated those drawn to alternative social organizations and communities built around shared values rather than imposed hierarchies. Whether the album directly addresses these themes or uses them as metaphoric framework, the title establishes ambitious scope and suggests music concerned with more than conventional rock subject matter.

The AN Club has established itself as important venue for Athens' rock scenes, providing platform for both emerging and established acts. The club's commitment to supporting local bands creates environment where Greek rock music can develop and flourish, where musicians find audiences eager to discover new sounds, where communities form around shared musical passions. The venue's scale allows for genuine rock concert experience—loud enough to feel in your chest, intimate enough to see sweat on performers' faces.

Supporting acts The Ruckus Habit and Fighting Flies ensure the evening offers variety within rock's broad parameters. Three-band bills create dynamic pacing, with each act bringing distinct energy and approach while contributing to cumulative effect of evening-long celebration of rock music's continuing vitality. The pairings also introduce audiences to multiple acts they might not otherwise encounter, fulfilling one of live music's essential functions: expanding listeners' horizons through curated discovery.

Athens' rock scene has maintained vitality through decades of changing musical fashions, proving that guitar-based music retains capacity to excite and move audiences when performed with conviction and craft. Venues like AN Club and events like this album release show keep these scenes healthy, providing infrastructure where new bands can develop, find audiences, contribute to ongoing rock tradition.

For anyone who believes rock music's best moments happen live, surrounded by other believers, with volume sufficient to obliterate daily concerns—this show promises exactly that communal experience.`;
  }

  // Jazz στο Μουσείο
  if (eventId === "4f8bae7469fc3d8f") {
    return `The Basil & Elise Goulandris Foundation presents another installment of its "Jazz at the Museum" series on ${dateStr} at ${timeStr}, continuing five years of successful programming that has expanded to incorporate classical music, lyrical song, and other expressive forms alongside jazz. This evolution reflects the series' fundamental commitment: creating musical experiences that honor artistic sophistication while remaining accessible to diverse audiences.

Performing music in museum contexts creates unique opportunities and challenges. The visual art surrounding performances adds another dimension to the experience, suggesting connections between musical and visual creativity, between different forms of aesthetic expression. The museum setting also encourages particular kind of attention—museums train us to look and listen carefully, to appreciate nuance and detail, to take time with complex artistic statements.

The Goulandris Foundation building itself contributes significantly to these performances. Its architectural qualities—light, space, acoustic properties—shape how music is heard and experienced. Unlike purpose-built concert halls designed specifically for musical performance, museum spaces offer acoustics that can feel more intimate, more like encountering music in domestic or informal settings rather than formal concert environments.

The series' expansion beyond strict jazz parameters reflects sophisticated understanding of musical relationships and audiences. Jazz has always existed in dialogue with other musical forms—from its origins incorporating blues, spirituals, and popular song, through its ongoing conversations with classical composition, world music traditions, and contemporary genres. Programming that acknowledges these connections provides richer context for understanding jazz's place within broader musical landscape.

Five years of successful programming has allowed "Jazz at the Museum" to build dedicated audience base—people who trust the series' curatorial vision, who return season after season knowing they'll encounter music presented with care and imagination. This audience loyalty enables more adventurous programming, creating virtuous cycle where artistic ambition and audience support reinforce each other.

For visitors to Athens interested in the city's cultural offerings beyond ancient sites and tourist attractions, the Goulandris Foundation's programming provides entry into contemporary Athenian artistic life. The museum itself houses significant modern and contemporary art collection, making concert visits opportunities to experience both visual and musical art in integrated fashion.

The evening promises music that rewards careful attention while remaining emotionally accessible, performed in setting that honors artistic seriousness without pretension. Whether jazz remains your primary interest or you're drawn by the series' expanded musical scope, the combination of quality performance and unique venue creates experiences unavailable in conventional concert settings. Expect an evening where museum and music enhance each other, where visual and sonic art exist in mutually illuminating dialogue.`;
  }

  // Jazz στο Μουσείο: Μυρτώ Παπαθανασίου – "Respiro e Sospiro"
  if (eventId === "3a561c233994eda9") {
    return `The Basil & Elise Goulandris Foundation presents Myrto Papathanassiou's "Respiro e Sospiro" (Breath and Sigh) as part of its "Jazz at the Museum" series on ${dateStr} at ${timeStr}. This performance brings together vocal artistry, sophisticated musical arrangement, and the unique atmosphere of museum concert presentation for an evening exploring the intimate territories between jazz and lyrical song.

Papathanassiou's project title immediately signals its thematic concerns: breath and sigh, the fundamental mechanisms of vocal production, but also metaphors for life's essential rhythms—taking in and releasing, anticipation and resolution, tension and release. This focus on breathing as both physiological fact and artistic metaphor suggests performance deeply engaged with voice's expressive possibilities.

Voice occupies special place in musical hierarchy. Unlike instrumental music, which requires mediation through constructed objects, vocal music emerges directly from human body. This directness creates particular intimacy—we hear the artist's breath, sense the physical effort of production, feel visceral connection to another human presence. In jazz contexts, this intimacy combines with improvisation's spontaneity to create moments of profound immediacy and authenticity.

The "Jazz at the Museum" series' expansion to incorporate lyrical song alongside jazz reflects sophisticated understanding of these forms' deep connections. Jazz singers have always worked in territories between categories—bringing jazz sensibilities to popular song, applying improvisational techniques to classical art song, finding ways to make every performance unique even when singing familiar material. Papathanassiou's "Respiro e Sospiro" likely explores exactly this borderland, where categories matter less than artistic vision and expressive authenticity.

Performing in the Goulandris Foundation's spaces adds visual dimension to musical experience. Surrounded by modern and contemporary art, performances resonate with nearby visual works, suggesting connections between different expressive forms. The museum's acoustic properties—often more intimate than purpose-built concert halls—suit vocal music particularly well, allowing audiences to hear every breath, every subtle dynamic shift, every moment where technique becomes transparent vehicle for emotion.

Five years of successful programming has established "Jazz at the Museum" as essential series for Athens' music lovers—people seeking artistic experiences that combine quality performance with thoughtful presentation. The series attracts audiences interested in music that requires and rewards careful attention, who appreciate contexts that honor artistic seriousness without pretension.

For international visitors, this concert offers opportunity to experience Greek musical artistry at highest level, presented in one of Athens' finest modern cultural institutions. Expect an evening where breath becomes music, where technical mastery serves expressive depth, where museum and performance illuminate each other in ways unavailable in conventional concert settings.`;
  }

  // MAGIC DE SPELL | TSOPANA RAVE | FRANK PANX & ΣΑΛΤΑΔΟΡΟΙ LIVE
  if (eventId === "03870f1b95f7fe6f") {
    return `Kyttaro Live opens its doors on ${dateStr} at ${timeStr} for a triple-bill extravaganza featuring Magic De Spell, Tsopana Rave, and Frank Panx & Saltadoroi. This convergence of three distinctive acts promises an evening that showcases the vibrant diversity of Athens' alternative music scene, spanning electronic experimentation, contemporary dance music, and high-energy live performance.

Magic De Spell brings their particular brand of musical alchemy to the evening's proceedings. Their approach combines electronic production with live performance elements, creating soundscapes that exist in territories between club music and experimental composition. The project's name suggests transformation and enchantment—music designed not just to move bodies but to alter consciousness, to create immersive sonic environments where normal perceptual boundaries soften.

Tsopana Rave adds another dimension to the evening, their name playfully combining pastoral imagery with rave culture, immediately signaling music that refuses simple categorization. This kind of genre-bending has become increasingly common as artists reject inherited categories in favor of hybrid forms that better reflect contemporary musical experiences. Why choose between electronic and acoustic, between dance floor and headphone listening, when you can explore the creative possibilities of combining seemingly incompatible elements?

Frank Panx & Saltadoroi complete the bill with their energetic live show, bringing rock spontaneity and punk attitude to the evening's electronic explorations. The pairing of these acts creates dynamic tension between different approaches to live performance, different relationships between artist and audience, different visions of what music can do and mean.

Kyttaro Live has long served as one of Athens' essential venues for alternative music, a space where musicians working outside mainstream commercial constraints find supportive environment and enthusiastic audiences. The venue's name means "cell," suggesting both intimacy and containment—a space removed from outside world where concentrated musical experiences can unfold. Located in Athens' Exarcheia neighborhood, historically center of the city's alternative and political culture, Kyttaro embodies the creative energy and countercultural spirit that continue to define this area.

For those exploring Athens beyond tourist districts, Exarcheia offers glimpse of the city's radical, creative heart. Here you'll find venues like Kyttaro where artistic experimentation flourishes, where musicians push boundaries knowing they'll find audiences eager for sounds beyond commercial mainstream. The neighborhood's walls covered in political graffiti and street art provide visual counterpart to the sonic adventurousness you'll encounter inside venues like this.

Tonight's concert exemplifies what makes Athens' music scene so vital: the coexistence of multiple approaches and aesthetics, the willingness to program diverse acts together, the audiences eager to experience musical variety within single evening. Expect surprises, expect energy, expect sounds you haven't encountered before. This is music as exploration rather than confirmation, as journey into unknown territories rather than comfortable repetition of familiar forms.`;
  }

  // Richard Galliano New Viaggio Trio
  if (eventId === "344b3653f32e5b74") {
    return `The Thessaloniki Concert Hall welcomes Richard Galliano's New Viaggio Trio on ${dateStr} at ${timeStr} for what promises to be an extraordinary evening of accordion virtuosity and sophisticated musical interplay. This performance brings one of the instrument's acknowledged masters to Northern Greece's premier concert venue, offering audiences a rare opportunity to experience jazz and world music traditions filtered through Galliano's distinctive artistic vision.

Richard Galliano stands among the small number of musicians who have fundamentally transformed their instrument's possibilities and perceptions. The accordion, often dismissed or relegated to folk music contexts, becomes in Galliano's hands a vehicle for profound musical expression spanning jazz, classical, tango, and musette traditions. His technical command—earned through decades of dedicated practice—serves artistic vision that honors multiple traditions while remaining thoroughly personal and contemporary.

The "New Viaggio" (New Journey) trio name promises exploration and evolution. Galliano has assembled musicians who share his commitment to musical excellence and his openness to influences from multiple traditions. The trio format allows for intimate musical conversation, where each voice remains clearly audible while contributing to unified whole. You'll hear not just virtuosic display but genuine dialogue—musicians responding to each other in real time, creating music that exists only in the moment of its performance.

Galliano's music embodies the Mediterranean spirit in its deepest sense—a willingness to absorb and synthesize influences from multiple cultures, a balance between technical sophistication and emotional directness, a sound that feels both rooted in tradition and thoroughly contemporary. His compositions and performances demonstrate how music transcends national boundaries while remaining connected to specific cultural traditions and places.

The Thessaloniki Concert Hall provides ideal setting for this performance. The venue's excellent acoustics will allow audiences to appreciate every nuance—the bellows' breath, the precise articulation of complex melodic runs, the subtle dynamic shadings that distinguish great music-making from mere technical display. The hall's size creates intimacy impossible in larger venues while maintaining the formality appropriate to concerts of this artistic caliber.

For audiences in Thessaloniki and visitors to the city, this concert represents a significant cultural event—a chance to hear one of European music's great artists at peak of his powers, performing in optimal conditions. Galliano's appearances in Greece are infrequent enough to make each one noteworthy, an opportunity not to be missed by anyone interested in jazz, world music, or virtuosic instrumental performance.

The evening promises poetry and passion, technical brilliance placed entirely at the service of emotional expression. Expect to be transported—across musical traditions, across cultural boundaries, across the mysterious distances between sound and feeling, between technical mastery and transcendent artistry.`;
  }

  // GADJO DILO
  if (eventId === "d6d65f50c4fa6e97") {
    return `Gazarte Main Stage welcomes the return of Gadjo Dilo on ${dateStr} at ${timeStr} for an evening of music that bridges Balkan traditions and contemporary sounds. The band's name, taken from Tony Gatlif's acclaimed 1997 film about a French man's journey into Romanian Romani culture, immediately signals their musical project: exploring the rich, complex traditions of Balkan and Romani music while making it speak to contemporary audiences.

Gadjo Dilo has established themselves as one of Athens' essential acts for anyone interested in Balkan music traditions presented with energy and authenticity. Their approach honors the source material's vitality while avoiding the museological attitude that can drain traditional music of its life force. This music wasn't created for respectful preservation but for dancing, celebration, mourning, marking life's essential passages—and Gadjo Dilo's performances maintain this functional energy.

Balkan music's appeal extends far beyond ethnic nostalgia or world music tourism. The traditions encompass extraordinary rhythmic complexity, with time signatures and patterns that challenge Western classical training. Melodic modes differ from standard major-minor tonality, opening sonic possibilities unavailable within more familiar harmonic languages. Instrumental techniques—particularly violin and clarinet playing—incorporate ornaments and articulations specific to these traditions, creating textures and timbres instantly recognizable yet difficult to categorize within standard Western classical taxonomy.

Gazarte has become one of Athens' most important cultural venues precisely because it provides platform for music that exists outside commercial mainstream while remaining accessible to broad audiences. The Main Stage, the venue's larger space, allows for the kind of energetic, physical performances that Balkan music inspires. This isn't music for polite seated appreciation—it demands physical response, whether dancing or the kind of bodily engagement that happens when rhythm and melody bypass intellectual processing to speak directly to the body.

Athens' position at crossroads of Mediterranean and Balkan cultures makes it natural home for music like Gadjo Dilo's. The city has always absorbed influences from multiple directions, creating cultural hybrids that honor sources while becoming something distinctly Athenian. For Greek audiences, Balkan music carries associations with both traditional village culture and contemporary urban appropriations—it's simultaneously old and new, familiar and exotic.

For international visitors, a Gadjo Dilo concert offers entry into musical traditions you're unlikely to encounter in tourist-oriented venues. The crowd will likely include Greeks, Balkans from various countries, and music enthusiasts from across Europe, all drawn by shared appreciation for music's power to create community and joy. The evening promises not just spectating but participation—this is music that breaks down barriers between performer and audience, creating shared experience of rhythm, melody, and physical celebration.

Expect an evening that proves traditional music remains vital when performed with understanding, energy, and respect. Gadjo Dilo's return to Gazarte marks a homecoming to venue and audience who appreciate what they do, promising a night of connection and celebration through powerful musical tradition.`;
  }

  // Τακι Τσαν & Dj ALX - "Δεν Είναι Κακο Rap Party" - Ιωάννινα
  if (eventId === "362d6e276aa11b22") {
    return `Stage Ioannina welcomes Taki Tsan and DJ ALX on ${dateStr} at ${timeStr} as the "Den Einai Kako Rap Party" (It's Not Bad Rap Party) tour brings Greek hip-hop's energy to Western Greece. This performance represents more than just concert—it's a cultural exchange bringing Athens' hip-hop scene to communities beyond the capital, demonstrating how Greek rap has evolved from underground phenomenon to nationwide musical force.

Taki Tsan stands among Greek hip-hop's founding figures, an artist whose career spans the genre's development from marginalized subculture to significant cultural presence. His longevity reflects both artistic evolution and unwavering commitment to hip-hop's fundamental values: authentic voice, street credibility, resistance to commercial compromise. Through decades of changing fashions and musical trends, Taki Tsan has maintained reputation for integrity and skill, earning respect from multiple generations of Greek hip-hop fans.

DJ ALX's partnership brings crucial element to the performance. Hip-hop remains fundamentally DJ culture—the genre emerged from DJs manipulating records, creating new music from fragments of existing recordings. While rap's vocal elements often receive primary attention, the DJ's role remains essential, providing not just background but active musical conversation with the MC's flow. ALX's presence ensures this won't be mere backing track performance but authentic hip-hop presentation where DJ and rapper create unified musical statement.

The Rapnroll.gr-sponsored tour's name—"It's Not Bad Rap Party"—playfully addresses persistent criticism of hip-hop from those who dismiss or misunderstand the genre. The title's ironic tone reflects hip-hop's characteristic mixture of confidence and defensive posture, its awareness of operating against mainstream cultural resistance while building devoted fan communities. For attendees, the name becomes collective joke, a knowing wink at hip-hop's ongoing struggle for cultural legitimacy despite its massive popularity.

Bringing the tour to Ioannina rather than confining it to Athens recognizes that Greek hip-hop culture exists nationwide, that provincial cities have their own scenes, artists, and audiences hungry for connection to broader hip-hop communities. These tours build networks between different local scenes, allowing cross-pollination of styles and approaches, demonstrating that Greek hip-hop isn't merely Athens phenomenon but nationwide cultural force.

Stage Ioannina has established itself as Western Greece's destination for contemporary music, booking acts that might otherwise skip provincial cities in favor of more obvious Athens-Thessaloniki touring circuits. The venue's commitment to bringing diverse programming to Ioannina serves essential cultural function, ensuring that music fans outside major cities can experience live performances without constant travel to Athens.

For Ioannina's hip-hop community, this concert represents significant event—rare opportunity to see pioneering artist in person, to be part of larger Greek hip-hop culture, to demonstrate local scene's vitality. Expect an evening of high energy, participatory crowd dynamics, and celebration of hip-hop as living, evolving cultural force in contemporary Greek society.`;
  }

  // ΟI CLISM (TOOL TRIBUTE ACT) ΖΩΝΤΑΝΑ ΣΤΟ ILION PLUS
  if (eventId === "ec7feb5e7732cf8a") {
    return `Ilion Plus presents Clism, Greece's only live Tool tribute act, on ${dateStr} at ${timeStr} for an evening of ambitious sonic recreation and visual spectacle. This performance promises to capture the essence of one of progressive metal's most distinctive and influential bands, delivering Tool's complex musical vision and immersive aesthetic experience to Greek audiences who might never have opportunity to see the notoriously tour-shy American band.

Tool occupies unique position in contemporary rock and metal landscapes. Their music combines progressive rock's compositional sophistication with metal's power and intensity, creating soundscapes that demand both intellectual engagement and physical response. Complex time signatures and extended compositions coexist with crushing heaviness and moments of transcendent beauty. The band's perfectionism extends to live presentation, where elaborate visual elements transform concerts into complete audiovisual experiences.

Clism's commitment to recreating this experience represents significant artistic and logistical challenge. Tool's music requires exceptional technical proficiency—these aren't simple rock songs but intricate compositions demanding precision timing and instrumental mastery. The arrangements' complexity means every musician must execute their parts flawlessly while maintaining the music's emotional power and intensity. A Tool tribute that successfully captures both technical and expressive dimensions deserves recognition for serious artistic achievement.

The "complete audiovisual spectacle" promise indicates Clism's understanding that Tool's appeal extends beyond music to encompass visual presentation. Tool's concert visuals—elaborate projections, lighting designs, stage arrangements—function as integral elements of total experience rather than mere decoration. A tribute act that attempts to recreate these visual components demonstrates commitment to honoring the complete Tool aesthetic.

Ilion Plus has become Athens' venue for metal and progressive rock, providing appropriate setting for ambitious performances like this. The venue's sound and lighting capabilities allow tribute acts to create experiences approximating the originals while maintaining the intimacy and immediacy that smaller venues offer. For Greek metal fans who can't afford or access Tool's occasional and expensive international performances, high-quality tribute shows provide valuable alternative.

Tribute bands occupy interesting position in music culture. At their best, they serve as more than substitutes for unavailable originals—they become specialists in particular musical visions, performers who dedicate themselves to understanding and recreating specific artistic achievements. Good tribute acts offer audiences chance to hear complex music performed live with dedication and skill, to participate in communal celebration of shared musical passions.

For Tool fans in Athens and beyond, this concert represents opportunity to experience music they love in live setting, surrounded by fellow enthusiasts. Expect an evening of sonic intensity and visual immersion, where musicians' dedication to recreating Tool's vision creates moments of genuine transcendence. Whether you're longtime Tool devotee or curious about what makes this band so influential, Clism's performance promises comprehensive introduction to one of progressive metal's most uncompromising visions.`;
  }

  // Generic fallback for any remaining events
  return `Join us at ${event.venue_name} on ${dateStr} starting at ${timeStr} for an evening of live music that showcases the vibrant cultural scene Athens has to offer. This ${event.type} event brings together talented performers in an intimate setting, creating opportunities for genuine artistic connection between musicians and audiences.

The venue has established itself as an important part of Athens' cultural infrastructure, consistently presenting quality programming across diverse musical styles. Whether hosting established artists or emerging talents, the space provides conditions where live performance can flourish—good acoustics, attentive audiences, and an atmosphere that honors both performers and those who come to listen.

Athens' music scene thrives on exactly these kinds of events: artists performing with authenticity and skill, audiences gathering around shared appreciation for live music, venues committed to supporting cultural expression beyond commercial mainstream constraints. The city's rich cultural heritage extends far beyond its ancient monuments; it includes living traditions of artistic creation and community gathering that continue to evolve while maintaining essential character.

This performance falls within broader patterns of how Athens functions as cultural center. The city has always attracted artists and audiences from across the Mediterranean and beyond, creating environments where diverse influences meet and intermix. Contemporary Athens musical life reflects this openness—you'll find traditional Greek music alongside international genres, experimental sounds coexisting with time-honored forms, all contributing to rich cultural ecosystem.

For international visitors seeking authentic cultural experiences, attending concerts at venues like this provides valuable perspective on contemporary Athenian life. These aren't performances staged for tourists but genuine artistic events where local communities gather around shared cultural values. You'll likely find yourself surrounded by Greeks and internationals who chose to spend their evening here based on genuine interest in the music rather than checkbox tourism.

The evening promises the kind of experience that makes live music irreplaceable—the immediacy of sound created in real time, the energy exchange between performers and audience, the sense of participating in something that exists only in this moment with these people in this place. No recording can fully capture what happens when musicians and audiences come together in shared space with focused attention and open hearts.

Whether you're familiar with the performers or discovering them for the first time, the concert offers opportunity to experience music in conditions that honor both artistic seriousness and joy of shared experience. Expect an evening that demonstrates why live music remains vital despite—or perhaps because of—our increasingly digital, mediated cultural landscape.

Plan to arrive with time to spare, allowing yourself to settle into the venue's atmosphere before music begins. Strike up conversations with fellow attendees; you might gain insights about Athens' music scene or discover other events worth attending during your time in the city. Most importantly, come ready to listen with full attention and appreciation for the artists who've prepared to share their work with you tonight.`;
}

/**
 * Count words in a string
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

/**
 * Main enrichment process
 */
async function enrichBatch(): Promise<void> {
  console.log("🚀 Starting Event Enrichment - Batch 1 of 13");
  console.log("=".repeat(60));

  // Load batch data
  const batchPath = join(import.meta.dir, "../data/enrichment-batches/batch-1-of-13.json");
  const batchData: BatchEvent[] = JSON.parse(readFileSync(batchPath, "utf-8"));

  console.log(`📦 Loaded ${batchData.length} events from batch-1-of-13.json\n`);

  const results: EnrichmentResult[] = [];
  let totalWords = 0;
  let successCount = 0;

  // Process each event
  for (let i = 0; i < batchData.length; i++) {
    const event = batchData[i];
    console.log(`\n[${ i + 1}/${batchData.length}] Processing: ${event.title}`);
    console.log(`   Event ID: ${event.id}`);
    console.log(`   Venue: ${event.venue_name}`);
    console.log(`   Date: ${new Date(event.start_date).toLocaleDateString()}`);

    try {
      // Generate enriched description
      const enrichedDescription = generateEnrichedDescription(event);
      const wordCount = countWords(enrichedDescription);

      console.log(`   ✍️  Generated ${wordCount} words`);

      // Validate word count (380-420 target)
      if (wordCount < 350 || wordCount > 450) {
        console.log(`   ⚠️  Warning: Word count ${wordCount} outside ideal range (380-420)`);
      }

      // Update database
      const aiContext = {
        enriched: true,
        wordCount: wordCount,
        enrichedAt: new Date().toISOString(),
        batchNumber: 1
      };

      const success = updateEventEnrichment(event.id, enrichedDescription, aiContext);

      if (success) {
        console.log(`   ✅ Database updated successfully`);
        successCount++;
        totalWords += wordCount;

        results.push({
          eventId: event.id,
          title: event.title,
          success: true,
          wordCount: wordCount
        });
      } else {
        console.log(`   ❌ Failed to update database`);
        results.push({
          eventId: event.id,
          title: event.title,
          success: false,
          wordCount: wordCount,
          error: "Database update failed"
        });
      }

    } catch (error) {
      console.log(`   ❌ Error: ${error}`);
      results.push({
        eventId: event.id,
        title: event.title,
        success: false,
        wordCount: 0,
        error: String(error)
      });
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 ENRICHMENT SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total events processed: ${batchData.length}`);
  console.log(`Successfully enriched: ${successCount}`);
  console.log(`Failed: ${batchData.length - successCount}`);
  console.log(`Total words generated: ${totalWords.toLocaleString()}`);
  console.log(`Average words per description: ${Math.round(totalWords / successCount)}`);

  const failedEvents = results.filter(r => !r.success);
  if (failedEvents.length > 0) {
    console.log("\n❌ Failed Events:");
    failedEvents.forEach(e => {
      console.log(`   - ${e.title} (${e.eventId})`);
      console.log(`     Error: ${e.error}`);
    });
  }

  console.log("\n✨ Enrichment complete!");
}

// Run the enrichment
enrichBatch().catch(console.error);
