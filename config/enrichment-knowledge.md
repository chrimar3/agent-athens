# Enrichment Knowledge Base
## Agent Athens â€” Enrichment Writer

---

# SECTION 1: WORKFLOW

## What You Receive (Input)

For each event, you'll get some combination of:
- Event title, date(s), time, venue name
- Event type (concert, exhibition, theater, etc.)
- Genre/category
- Price information
- Artist/performer name(s)
- Raw description from scraping (often marketing copy)
- Venue context (neighborhood, capacity, character)
- Artist context (background, discography, significance)

Sometimes you'll get rich context. Sometimes you'll get almost nothing beyond a title and venue. Work with what you have.

## What You Produce (Output)

A single description field following the Master Enrichment Template. Word count varies by event type: 80-120 words for compact enrichments (local concerts, DJ sets), 120-300 words for mid-range (exhibitions, kids events, contemporary theater), and 400-600 words for premium showcases (major residencies, festival parent pages, ancient drama). Use the full 8-section structure for premium enrichments, and the three-part block structure (What is it? / Why it matters / What to expect) for compact ones.

**Critical:** Your output is ONLY the narrative description. No tags, no timestamps, no JSON, no metadata â€” unless specifically asked for those.

## When Context Is Thin

If you have minimal information about an artist or event:
- Lead with the venue and atmosphere (you know Athens venues from this file)
- Frame the genre/tradition rather than the specific artist
- Be transparent about what you know and don't know
- The "Good to Know" section can still be strong if you know the venue
- Never fabricate artist biographies or credentials

## When Multiple Events Are Queued

- Write each description independently
- Maintain consistent voice across all of them
- Don't let quality slip as the batch progresses
- Each event deserves its own Opening â€” no copy-paste sensory scenes

## Self-Check Before Delivering

Run through these before every description:

1. First sentence is a declarative citation anchor? (event name + venue + neighborhood)
2. Sensory transport follows the anchor? (present tense, second person, 2+ sensory details)
3. Uses "you" / present tense throughout?
4. Tribe is character-based? (not demographics)
5. Filter section present and honest?
6. No lazy adjectives? (amazing, incredible, unique, vibrant, stunning)
7. "Good to Know" is insider knowledge? (not obvious info)
8. Differentiation is specific? (not "best" or "only")
9. Word count within range for this event type? (see Variable Enrichment Matrix in Master Template)
10. No tags or timestamps in prose?
11. Neighborhood name mentioned?
12. Nearest metro station included?
13. At least one insider detail not in the source listing?
14. At least one statistic or attributed fact? (where possible)
15. Citability test passes? (â‰¥2 AI-quotable factual sentences that only work for THIS event)
16. Opening paragraph â‰¤50 words? (citation anchor + sensory transport combined)
17. No markdown tables in description? (prose bridge replaces details table — see Section 1B below)
18. Good to Know follows chronological flow? (getting there â†' arriving â†' being there, no backtracking)
19. No metro line colors? (station name only — "Thissio metro" not "Thissio metro on the Green line")
20. Closer varied from other descriptions in batch? (cannot swap with another description and have both still work)

---

# SECTION 1B: PROSE BRIDGE GUIDANCE

## What Replaced the Details Table

The markdown details table (| Aspect | Details |) has been retired from all descriptions. Markdown tables do not render in Schema.org `description` fields, Open Graph tags, or meta descriptions. They create parsing artifacts for AI engines and break narrative flow.

## How to Write the Prose Bridge

The prose bridge is a paragraph placed between the Tribe and Experience sections. It weaves four elements into flowing narrative:

- **Setting** â€" venue type, capacity, key physical feature
- **Vibe** â€" 2-3 atmosphere descriptors grounded in sensory detail
- **Sound** â€" what the room sounds like
- **Door** â€" access policy

**Lead with the venue name and address,** then layer in the rest naturally. One or two sentences is usually enough. The door policy can also move to Good to Know if it reads better there.

### Good Example:
```
Oddity on Irakleidon 61 holds roughly two hundred people in a compact
Thissio basement â€" intense, focused, sweaty. The sound system fills
the space without drowning it, and at capacity the crowd density hits
the point where you feel the room as a single body.
```

### Good Example:
```
Rabbithole on Germanikou 20 seats fewer than a hundred â€" concentrated,
literary, emotionally direct. The four performers work at a proximity
that turns dialogue into overheard conversation.
```

### Bad Example (do not use):
```
| Aspect | Details |
|--------|---------|
| **Setting** | Compact basement club, ~200 capacity |
| **Vibe** | Intense, focused, sweaty |
| **Sound** | Hard techno, high SPL |
| **Door** | Ticketed, â‚¬8-15 |
```

---

# SECTION 1C: EXEMPLAR LIBRARY

## Reference Descriptions by Event Type

Exemplar descriptions exist as quality benchmarks for Claude Code enrichment sessions. Before writing a new description, check whether an exemplar exists for that event type. If it does, the new description should hold up against the relevant exemplar.

### Current Exemplars (as of March 2026):

| Event Type | Exemplar Event | Word Count | Key Lesson |
|------------|---------------|-----------|-----------|
| Electronic DJ set | BYORN at Oddity | ~440w (premium) | Verifiable credentials without press-release tone |
| Metal / live concert | Deviser at Temple | ~445w (premium) | Character-based tribe at its sharpest; multi-band bill |
| Experimental concert | Nekyia at Megaron | ~427w (premium) | Events that defy category; scarcity as hook |
| Adult theater | Eurydice at Rabbithole | ~422w (premium) | Literary source without academic tone; price as closer |
| Children's theater | Animal Farm at Megaron | ~432w (premium) | Honest filter about edge; institutional venue |
| Documentary screening | Interwar Athens at Megaron | ~402w (premium) | Highest citability; knowledge-domain tribe |
| Exhibition | Tilda Swinton at Onassis Ready | ~252w (exhibition range) | Exhibition-length precision; multi-artist handling |
| Rebetiko / laiko | Charoulis at Stavros tou Notou | ~452w (premium) | Participatory music culture; return narrative |
| Classical orchestral | London Philharmonic at Megaron | ~453w (premium) | Rare program repertoire; competition-winning credentials |
| Comedy / satirical theater | Tartuffe at Theatro Alkyonis | ~176w (theater range) | Compact three-part structure; 350-year-old material made current |
| Festival / multi-artist | Sonic Sisters at Daddy's | ~390w (festival range) | Relay format; mission-driven curation |

### Still Missing (fill when events become available):
- Startup / tech event
- Open-air cinema (seasonal, summer 2026)

### How to Use Exemplars in Claude Code

When CC receives an enrichment batch, it should:
1. Check the event type against the exemplar table
2. Read the relevant exemplar for structural reference
3. Write the new description at the correct matrix word count
4. Validate against the same quality gates the exemplar passes

Exemplars are not templates to copy â€" they demonstrate the voice, structure, and quality standard. The new description should feel like it belongs in the same library, not like a remix of the exemplar.

---

# SECTION 2: ATHENS VENUE KNOWLEDGE

This section compounds over time. Expand it as you write more events.

---

## Techno / Electronic Venues

### SMUT Athens
- **Location:** Vatsaxi 4
- **Capacity:** ~300
- **Entry:** â‚¬15-20 via Resident Advisor
- **Door Policy:** STRICT â€” creative/fetish attire required for many events. RA tickets = priority, not guaranteed entry.
- **Schedule:** Saturday nights (weekly institution)
- **Character:** Queer techno, identity-driven, serious community. Queer community and allies who understand dress codes.

### Astron Club
- **Location:** Leoforos Konstantinoupoleos 121, Gazi
- **Capacity:** ~150 ("the box")
- **Entry:** â‚¬10-15
- **Door Policy:** Berlin-lite selection â€” singles > groups, couples sometimes rejected, "look like you dance"
- **Drinks:** Alfa beer ONLY, â‚¬5
- **Finding it:** NO SIGN â€” look for shaking windows
- **Acts:** Helena Hauff, DJ Bone caliber
- **Transport:** Kerameikos metro (Blue line)
- **Note:** Relocated to Gazi summer 2024

### AUX Club
- **Location:** Agiou Orous 15, Gazi
- **Capacity:** ~200
- **Entry:** â‚¬8-12 (varies by event)
- **Door Policy:** Inclusive â€” "come as you are" stated ethos
- **Regular nights:** Velocity, Pulse Tribe
- **Rising artists:** Home to AtÃ© & Salin (EXHALE Records, Tomorrowland 2025)
- **Character:** New wave, explicitly welcoming, quality without gatekeeping
- **Transport:** Kerameikos metro (Blue line)

### Six D.O.G.S
- **Location:** Avramiotou 6-8, Monastiraki
- **Capacity:** ~500 (varies by configuration)
- **Character:** Dual-space â€” indoor club + outdoor garden courtyard. Art/music/culture hybrid. 10+ years defining Athens electronic identity.
- **Entry:** â‚¬8-10 (â‚¬8 with wallet app)
- **Door Policy:** Relaxed
- **Garden:** Closes 23:00 (noise regulations) â€” indoor continues
- **Regular nights:** Monthly "Slam!" queer night
- **Notable:** DVS1 "Wall of Sound" launched here March 2025
- **Transport:** Monastiraki metro (Blue/Green line), 2-min walk
- **Payment:** Cards accepted

### Romantso
- **Location:** Anaxagora 3-5, Omonoia
- **Capacity:** ~400
- **Entry:** Free - â‚¬9 (often free, â‚¬5-6 before 22:00)
- **Door Policy:** Extremely relaxed
- **Rooftop:** Operates 20:00-23:30 before club nights
- **Sound:** Future beats, footwork, bass, disco
- **Character:** Budget entry point, converted printing house, experimental
- **Transport:** Omonoia metro (Red/Blue line)

### Bios
- **Location:** Pireos 84, Gazi
- **Capacity:** ~300 across spaces
- **Spaces:** Tesla bar (ground floor, winter), basement club (Funktion-One system), rooftop bar (summer, Acropolis views)
- **Character:** Multi-arts space in Bauhaus-era former industrial building. Gallery, club, bar.
- **Drinks:** Cocktails â‚¬9 (pricey for Athens)
- **Door Policy:** Relaxed
- **Transport:** Kerameikos metro (Blue line), 7-min walk
- **Notable acts:** Autechre, Mala, Objekt

### Temple Athens
- **Location:** Iakhou 17, Gazi
- **Capacity:** ~600
- **Entry:** â‚¬15-25
- **Door Policy:** Some selection on big nights
- **Sound:** Funktion-One, serious laser rig
- **Character:** Big-room techno, two floors, basement is the peak experience
- **Transport:** Kerameikos metro (Blue line)

### IT Athens
- **Location:** Solomou 30, Exarchia
- **Capacity:** ~250
- **Entry:** â‚¬8-15
- **Door Policy:** Relaxed
- **Regular nights:** Pulse Tribe Kollektiv
- **Character:** Exarchia's electronic contribution, alternative ethos
- **Transport:** Omonoia or Panepistimio metro (12-min walk)

### Oddity
- **Location:** Irakleidon 61
- **Capacity:** ~200
- **Entry:** â‚¬8-15
- **Regular nights:** Blend collective (progressive/melodic)
- **Character:** Counterpoint to harder Gazi sounds
- **Transport:** Thissio metro (Green line)

### Steam Athens
- **Location:** Evrymedondos 3, Gazi
- **Capacity:** ~300
- **Entry:** â‚¬10-20
- **Character:** Part of Gazi cluster
- **Transport:** Kerameikos metro (Blue line)


### EON Athens — STATUS UNCLEAR (may be event-specific)
- **Location:** Eleonas district (industrial area)
- **Capacity:** ~1,000+
- **Access:** Taxi required — no metro to Eleonas
- **Programming:** DVS1 Wall of Sound annual event (2023, 2024, 2025). L-acoustics sound system. Presented by ADD Festival / Six D.O.G.S.
- **Character:** Large-format industrial warehouse. May be temporary/pop-up.

### Universe Multivenue — NEEDS FULL PROFILE
- **Confirmed bookings:** Autechre (Oct 3, 2026, modcla & Plisskën); Freddie Gibbs (April 17, 2026)
- **Tickets:** more.com

---

## Live Music Venues

### Gazarte
- **Location:** Voutadon 32-34, Gazi
- **Capacity:** 100-400 depending on space
- **Spaces:** Main Stage (major acts, largest), Ground Stage (rock/alt), Roof Stage (Greek/jazz, Acropolis views â€” reservations essential, email/phone)
- **Character:** Multi-level culture hub â€” concerts, exhibitions, cinema, restaurant with real kitchen. Industrial bones with polished edges.
- **Timing:** Doors 20:00-21:00, music ~21:30. Consumption NOT mandatory.
- **Tickets:** â‚¬15-35 typical, â‚¬40-50 premium, via more.com (formerly Viva.gr)
- **Transport:** Kerameikos metro (Blue line), 5-min walk
- **Payment:** Cards accepted
- **Notable 2025 bookings:** Kenny Garrett, Billy Cobham's Time Machine, John Medeski

### Gagarin 205
- **Location:** Liosion 205, Attiki
- **Capacity:** 1,200 standing
- **Tickets:** â‚¬35-50 presale, +â‚¬5-10 at door
- **Timing:** Doors 19:00-20:00, headliner 21:30-22:00
- **Genre focus:** Metal dominates (Dark Funeral, Leprous, Eluveitie, Chelsea Wolfe)
- **Sound:** State-of-the-art, Greece's most modern venue
- **Transport:** Attiki metro (Red/Blue line)
- **Note:** Neighborhood not pretty â€” taxi out after show

### Fuzz Live Music Club
- **Location:** Piraeus 209, Tavros
- **Capacity:** 2,000
- **Character:** Considered Athens' best indoor venue for live music. Programming runs from Editors to EinstÃ¼rzende Neubauten.
- **Neighborhood:** Tavros (not Gazi â€” common mistake)
- **Tickets:** â‚¬25-45 typical, via more.com
- **Notable:** Home of Death Disco Indoor Festival (Nov-Dec): â‚¬35-40 daily, â‚¬65-70 weekend, early bird -15-20%
- **Transport:** Tavros metro (Blue line)

### Floyd Live Music Venue
- **Location:** Pireos 117, Gazi
- **Capacity:** 2,000+
- **Tickets:** â‚¬25-45
- **Opened:** October 2023 (sold-out Blind Guardian)
- **Programming:** Epica, Franz Ferdinand tier
- **Issues noted:** Parking difficulties, smoking enforcement, acoustics need improvement
- **Transport:** Kerameikos metro (Blue line)

### Kyttaro Live Club
- **Location:** Ipeirou 48, near Viktoria Square
- **Capacity:** 800+
- **Tickets:** â‚¬20-35
- **History:** First Athens venue for Hendrix, Zappa, Velvet Underground. Recently restored, state-of-the-art sound.
- **Character:** "Mecca of Greek rock"
- **Transport:** Victoria metro (Green line), then taxi/walk

### AN Club
- **Location:** Exarchia
- **Capacity:** ~400
- **Tickets:** â‚¬15-25 typical, â‚¬25-35 international acts
- **Timing:** LATE STARTS â€” bands often after 22:00
- **History:** 30+ years, Athens' oldest rock venue
- **Genre:** Hardcore rock/punk/metal
- **Transport:** Omonoia or Panepistimio metro (walk)

### Death Disco
- **Location:** Ogygou 16, Psiri
- **Capacity:** ~200
- **Entry:** â‚¬10-15
- **Schedule:** Live 21:00-midnight, then DJ sets
- **Genre:** 80s darkwave, minimal synth
- **Festival:** Death Disco Open Air at Technopolis (September) â€” 2025: Peter Hook & The Light, Anne Clark, The Chameleons
- **Transport:** Monastiraki metro (Blue/Green line)

---

## Jazz Venues

### Half Note Jazz Club
- **Location:** Trivonianou 17, Mets
- **Capacity:** ~200, tables pressed close to stage
- **Character:** Intimate listening room â€” the literary end of Athens live music. Operating since 1979, ~250 concerts per season.
- **Practical:** Strict reservation policy, confirm same-day by phone. Tables seat 4; smaller groups share with strangers (usually works out fine). Arrive 20 min early or lose seat 15 min after start.
- **Entry:** Table â‚¬15-20, bar seats â‚¬10-15 (no reservation but disappear early), special acts up to â‚¬51
- **Season:** Closes for summer in May, reopens October. Winter is peak season.
- **Transport:** 10-min walk from Akropoli metro (Red line). Last metro ~00:15 weekdays. Fri/Sat late shows (22:30 start) outlast metro â€” budget â‚¬10-12 taxi to center. Sunday 21:30 start usually makes last train. Saturday: Lines 2 & 3 run 24 hours.
- **Payment:** Cards accepted

### Theatre of the No
- **Location:** Konstantinou Palaiologou 3 (opposite City Hall)
- **Capacity:** ~100
- **Entry:** â‚¬10 (musicians free with drink)
- **Schedule:** Jazz Jam Wednesdays, 22:00
- **House band:** Serafeim Bellos (drums), Phoebe Pehlivanidi (piano), George Pantazopoulos (bass)
- **Note:** Athens' first English-speaking theater â€” accessible for visitors
- **Transport:** Syntagma metro

### Underflow Records & Art Gallery
- **Location:** Koukaki
- **Capacity:** ~80
- **Entry:** â‚¬8-15
- **Schedule:** Most Friday nights
- **Genre:** Experimental, gypsy, avant-garde jazz
- **Character:** Record store + gallery + acoustically-treated basement venue, own label
- **Transport:** Syngrou-Fix metro (Red line)

---

## Rebetiko / Traditional Venues

**SEASONAL NOTE:** Most rebetiko venues CLOSE May-September.

### Stoa Athanaton â€” VERIFIED OPERATIONAL (January 2026)
- **Location:** Sofokleous 19, above Central Meat Market
- **Schedule:** Fri/Sat 22:30-early morning, Sun matinee 13:00-19:30
- **Entry:** ~â‚¬8 (drinking only), wine from â‚¬22/bottle, table d'hÃ´te ~â‚¬18
- **Crowd:** Almost entirely Greek â€” foreigners rarely attend
- **Character:** Pinnacle of rebetiko authenticity, inside Central Meat Market
- **Related:** Sister venue Rembetiki Istoria PERMANENTLY CLOSED early 2024
- **Transport:** Omonoia metro (Red/Blue line)

### Klimataria â€” RECOMMENDED FOR VISITORS
- **Location:** Plateia Theatrou 2
- **Capacity:** ~80
- **Entry:** â‚¬3/person music charge
- **Schedule:** Wed & Thu 21:30, Fri 22:00, Sat 22:30
- **Cost:** Dinner for two with wine â‚¬30-60
- **Wine:** House wine from wooden barrels
- **Website:** klimataria.gr (English available)
- **Since:** 1927
- **Character:** Best balance of authenticity and accessibility
- **Transport:** Monastiraki or Thissio metro

### Kavouras
- **Location:** Themistokleous 64-70, Exarchia (above 24-hour souvlaki joint)
- **Capacity:** ~60
- **Entry:** No cover typically
- **Drinks:** â‚¬10-15+
- **Schedule:** Friday and Saturday nights only
- **Crowd:** Young Greeks, students
- **Character:** Drinks-only, Exarchia alternative atmosphere
- **Transport:** Omonoia metro (walk)

### Perivoli tou Ouranou
- **Location:** Lysikratous 19, Plaka
- **Capacity:** ~120
- **Season:** WINTER ONLY
- **Price range:** Premium (NYE â‚¬120/person)
- **Character:** Upscale, top-billed artists, professional production
- **Crowd:** Greek high spenders despite Plaka location
- **Note:** Traditional flower-throwing etiquette observed
- **Transport:** Syntagma or Akropoli metro

### Hamam
- **Location:** Dimofondos 97, Petralona
- **Website:** xamam.gr (full program listings — best-documented rebetiko venue online)
- **Musical director:** Grigoris Vasilas (bouzouki/vocals)
- **2024-2025 Saturday "Nychtes Laikes":** Grigoris Vasilas, Dimitris Kontogiannis, Sofia Emfietzi, Pantelis Ampatzis
- **2024-2025 Friday "White Rose of Athens":** Nikos Tatasopoulos (bouzouki), Stavroula Manolopoulou (vocals)
- **Character:** Curated music stage with different programs on different nights, changing seasonally. NOT a single house band.
- **Transport:** Petralona metro (Green line)

### Kapnikarea
- **Location:** Near Monastiraki
- **Schedule:** DAYTIME â€” starts ~14:30
- **Character:** Rare daytime rebetiko option
- **Transport:** Monastiraki metro

### Athens Rebetiko Festival
- **Location:** Iera Odos 154, Gazi
- **Date 2025:** October 10-12
- **Entry:** â‚¬10 presale / â‚¬12 door
- **Free for:** Unemployed, pensioners 75+, children under 12

---

## Classical / Cultural Venues

### Megaron Mousikis (Athens Concert Hall)
- **Location:** Vas. Sofias & Kokkali, near Hilton
- **Character:** Athens' premier classical/high-culture venue. Three halls with top-tier acoustics. Programs range from symphony to jazz to world music.
- **Practical:** Formal but not stuffy. Online booking standard.
- **Transport:** Megaro Moussikis metro (Blue line), directly adjacent
- **Payment:** Cards accepted

### Stavros Niarchos Foundation Cultural Center (SNFCC)
- **Location:** Leof. Andrea Siggrou 364, Kallithea
- **Character:** Major cultural complex â€” Greek National Opera, National Library, park, free events. Architecture by Renzo Piano.
- **Practical:** Many free events in the park and esplanade. Paid events in Opera and smaller halls.
- **Transport:** Dedicated shuttle bus from Syntagma. SNFCC metro station on Tram line. Taxi ~â‚¬10-15 from center.

---

## Summer / Beach Venues

**SEASONAL:** Primary May-September when indoor clubs close.

### Bolivar Beach Bar â€” BUDGET OPTION
- **Location:** Alimos
- **Entry:** â‚¬6-8 local events, higher for internationals
- **Sunbeds:** â‚¬2+
- **Anniversary:** 21st in 2025
- **Headliners 2025:** Tale Of Us, Boris Brejcha, Maceo Plex, Sven VÃ¤th
- **Transport:** Tram (Kalamaki stop, direct from Syntagma). Saturday 24-hour tram service. Taxi €16-22 night from center.

### Astir Beach â€” PREMIUM
- **Location:** Vouliagmeni
- **Umbrella sets:** â‚¬80-160 for two
- **Premium daybeds:** Up to â‚¬320 for four
- **Transport:** Taxi €25-35 day / €30-40 night from center (Vouliagmeni — no tram access)


### Island Athens Riviera — PREMIUM ELECTRONIC
- **Location:** 27th km Athens-Sounion Avenue, Varkiza (above private cove)
- **Capacity:** Large-scale open-air (no official figure)
- **Entry:** €25-60 for headliner events (varies by artist tier). Restaurant entry via reservation.
- **Tables:** Standing minimum ~€500, VIP minimum ~€1,000. Table-service venue at night.
- **Restaurant:** Full Mediterranean-Japanese fine dining. Mains €50-70. 150+ label wine cellar.
- **Cocktails:** €12-20+
- **Dress code:** De facto smart casual to dressy. Crowd is affluent southern-suburbs Athenians, yacht arrivals.
- **Season:** Early May to mid-September. Tue-Sat 20:00-06:00, Sun 18:00-06:00, closed Monday.
- **Music:** Melodic house, Afro house, mainstream crossover electronic. International headliners weekly in high season. NOT underground techno — glossy end of the electronic spectrum.
- **2023-2024 confirmed headliners:** Dixon, Adriatique, Bedouin, Damian Lazarus, WhoMadeWho, CamelPhat, Diplo, Black Coffee, Agents of Time
- **Resident DJs:** Nick Jojo, Echonomist
- **Tickets:** ComeTogether.live, More.com
- **Reservations:** +30 210 965 3563, islandclubrestaurant.gr
- **Operated by:** Panas Group (credited with coining the "Athens Riviera" brand)
- **Transport:** Taxi only. €30-40 daytime / €40-55 night from Syntagma. No tram, no metro, no bus after midnight. Varkiza is 27km from center. **Getting home at 3am is the main logistical challenge** — pre-book via FreeNow, split 4 ways to bring cost to €10-14/person.
- **TripAdvisor:** 3.4/5 (284 reviews). Polarized — setting and food praised, overcrowding and pricing criticized.
- **Instagram:** @islandathensriviera
- **Character:** Athens' defining summer club-restaurant for three decades. Where the city's nightlife migrates when Gazi clubs close in May — not to the underground, but to the cliffs. Closer in spirit to a Mykonos beach club than to Bolivar.
- **Positioning vs. Bolivar:** Bolivar books Tale Of Us for a dedicated electronic crowd at €6-8 in Alimos. Island books Dixon for a dining-and-dancing crowd at €25-60+ in Varkiza. Different audience, different price tier, complementary rather than competing.
- **Confidence:** Tier 2 overall. Location, headliners, season: Tier 1. Capacity, specific table prices: Tier 2-3.

### Akanthus Summer Club — MAINSTREAM / GREEK LIVE
- **Location:** Akti tou Iliou, Alimos (same beachfront strip as Bolivar)
- **Capacity:** 1,500-6,000 (varies by night/configuration)
- **Entry:** ~€15 bar entry
- **Daytime:** Sunbed sets €20 weekday / €30 weekend (includes towels, coffees, locker, solar charger)
- **Tables:** Bottle packages €110-160 for 5 people
- **Season:** May-September (summer); **October-April at "Akanthus Gazoo," Pireos 100, Gazi** — one of few Riviera venues with year-round programming
- **Music:** Thu: Greek live concerts (Dionysis Sxoinas, Dimos Anastasiadis). Fri: "For Ever" / "Suck My Greek" mainstream party. Sat: "LoveLand" club night. Sun: "Greek Sundays."
- **International:** Black Coffee (2018, confirmed via RA)
- **Operated by:** Momentum Group
- **Transport:** Tram (Kalamaki stop, direct from Syntagma ~30 min). Saturday 24-hour tram service. Taxi €16-22 night.
- **Instagram:** @akanthus_club (22K followers)
- **Character:** The mainstream middle ground. Greek live acts on Thursdays, mainstream club on weekends. Generous daytime beach inclusions. Only Riviera venue with year-round programming (winter Gazi location).
- **For enrichment writers:** When a named Greek live act plays (Thursday concerts), it's worth a calendar listing. Generic Friday/Saturday club nights — list only when notable guest DJ.
- **Confidence:** Tier 2 overall.

### ASTERIA Glyfada (formerly Balux) — UPSCALE DINING + LIGHT DJ
- **Location:** 110 Poseidonos Avenue, Glyfada
- **Beach pricing:** €50-70 weekday / €60-90 weekend (umbrella + 2 sunbeds, incl. towels, water, sunscreen)
- **Music:** Bungalow 7 (bungalow7.gr) — Thursday "Club Dining Nights" with guest DJs. Ark (ark-glyfada.gr) — resident DJ at Garden Bar.
- **Transport:** Tram (Kolymbitirio stop, 6-min walk). Taxi €20-28 night from center.
- **Character:** Luxury beachfront complex, 2022 renovation. Music is dining ambiance, not events. Not a nightclub.
- **For enrichment writers:** Do NOT create standalone events for ASTERIA unless a notable named DJ is announced. Mention as "also nearby" in Riviera descriptions.
- **NOTE:** Original "Balux Cafe: The House Project" no longer exists. Now "Balux Family" (family dining). Do NOT reference old Balux.
- **Confidence:** Tier 2 overall.

### Posidonio Music Hall — SUMMER BOUZOUKIA
- **Location:** Poseidonos Avenue, Elliniko
- **Capacity:** 1,500 m²
- **Since:** 1991 (renovated 2023)
- **Music:** Major Greek pop/laika artists. Bouzoukia format — table service, bottle minimums, flower trays.
- **Tables:** €190-1,000+ (standard bouzoukia minimum-spend model)
- **Transport:** Taxi from center or bus from Elliniko area. Not directly tram/metro accessible.
- **Website:** posidonio.com
- **Character:** Athens' premier summer bouzoukia hall. Where the biggest Greek pop names perform on the coast in summer.
- **For enrichment writers:** Profile as bouzoukia venue (Section 12 pricing reference applies). Not an electronic venue.
- **Confidence:** Tier 2 overall.

---

## LGBTQ+ Venues (Gazi District)

### Sodade2
- Operating since 2000, legendary gay club. Anchor of Gazi LGBTQ+ district.

### Shamone
- Known for drag shows

### CLOSED April 2024: Bizzar, Lamda

---

## Rooftop / Cocktail

### A for Athens
- **Location:** Miaouli 2, Monastiraki
- **Character:** Most famous Acropolis view, heavy tourist presence
- **Timing:** Queue forms 19:00 in summer for sunset
- **Price:** Premium

### Baba au Rum
- Psiri, #25 World's Best Bars. Cocktails â‚¬12-15+.

### The Clumsies
- Psiri, #47 World's Best Bars. Cocktails â‚¬12-15+.

---

## Startup / Conference Venues

### Zappeion Hall (Zappeion Megaron)
- **Location:** Vassilissis Olgas & Vassilissis Amalias, next to National Garden
- **Capacity:** 4,546 sqm exhibition & congress halls + Peristyle Central Circular Atrium
- **Character:** Neoclassical landmark (1888), fully equipped conference center. Translation systems in 9 languages. Iconic Athens location next to Parliament, National Garden, Panathenaic Stadium.
- **Transport:** Syntagma metro (Red/Blue line), 10-min walk through National Garden. Trolleybus 1, 2, 4, 5, 11.
- **Parking:** Limited. Garages at Syntagma Square and Filellinon Street.
- **Events:** Panathēnea 2026 (May 27-29)
- **Note:** Heavy traffic in city center during events. Walk from Syntagma recommended over driving.

### Athens Conservatory (Odeio Athinon)
- **Location:** Vassileos Georgiou B' 17-19, central Athens
- **Character:** Oldest performing arts institution in modern Greece (founded 1871). Historic building with multiple halls.
- **Transport:** Central Athens, walkable from Syntagma metro
- **Events:** Panathēnea 2025 inaugural edition (main venue), cultural events year-round

### Technopolis City of Athens
- **Location:** Pireos 100, Gazi
- **Capacity:** Large — multiple buildings across former gasworks complex
- **Character:** Major cultural/event complex in converted 19th-century gasworks. Multiple indoor and outdoor spaces. Already known for concerts and festivals — increasingly used for startup summits.
- **Transport:** Kerameikos metro (Blue line), 5-min walk
- **Events:** Doers Summit 2025 & 2026, Death Disco Open Air, Athens Rebetiko Festival
- **Note:** Also profiled implicitly under live music/festival context. This entry covers startup summit use.

### EGG Hub (Eurobank egg Accelerator)
- **Location:** Thessalonikis 75 & Florinis, Moschato 18345
- **Capacity:** Purpose-built accelerator hub, multiple event/coworking spaces
- **Character:** Ultra-modern startup hub. Opened 2022, inaugurated by Minister of Digital Governance. Home to egg accelerator programs, Investor Days, Innovation Summits.
- **Transport:** Moschato — NOT central Athens. Bus from Syngrou-Fix metro (Red line) or taxi (~15 min from center, €10-15). No direct metro.
- **Events:** egg Investor Day (annual, February), egg Innovation & Investment Summit (Feb 2026), qualifying pitches (April)
- **Contact:** info@theegg.gr, +30 211 624 1700

---


## Exhibition / Gallery Venues

### EMST — National Museum of Contemporary Art — VERIFIED OPERATIONAL
- **Location:** Kallirrois Avenue & Amvrosiou Frantzi Street, near Syngrou-Fix
- **Capacity:** 18,142 sqm across eight levels
- **Entry:** €10 general; €5 reduced
- **Free:** Under 12; first Thursday of every month 18:00–22:00 (not Jul/Aug)
- **Hours:** Tue–Wed, Fri–Sun 11:00–19:00; **Thu 11:00–22:00** (key recurring event); closed Monday
- **Seasonal variation:** None — same hours year-round
- **Programming:** Permanent collection (Kounellis, Nan Goldin, Gary Hill, Kabakov, Chryssa; expanded with Daskalopoulos Collection Gift 2022) + rotating temporary exhibitions (migration, identity, technology, social justice themes)
- **Event programming:** Free admission at all exhibition openings; guided tours; children's workshops; art psychotherapy program; "EMST Without Borders" outreach
- **Character:** Greece's national contemporary art museum in Takis Zenetos' landmark 1960s Fix Brewery — post-war industrial modernism with rooftop terrace and Acropolis views.
- **Transport:** Syngrou-Fix metro (Red line), 5-min walk
- **Photography:** Personal use permitted, no flash/tripods
- **Pet-friendly:** Yes. Fully accessible: Yes.

### Museum of Cycladic Art
- **Location:** Main: 4 Neofytou Douka Street; Stathatos Mansion: 1 Irodotou & Vas. Sofias Ave, Kolonaki
- **Entry:** €12 general; €9 reduced; free under 18
- **Hours:** Mon, Wed, Fri, Sat 10:00–17:00; **Thu 10:00–20:00**; Sun 11:00–17:00; closed **Tuesday**
- **Programming:** Permanent collection (350+ Cycladic sculptures, 3200–2000 BC) + Stathatos Mansion major temporary exhibitions. Current: Jeff Koons "Venus Lespugue" (March–August 2026). Past: Picasso, Dalí, Ai Weiwei, Louise Bourgeois, Cy Twombly.
- **Character:** Refined Kolonaki institution. 5,000-year-old Cycladic figurines alongside contemporary blockbusters. Purpose-built modern gallery + 1895 Ziller neoclassical mansion.
- **Transport:** Evangelismos metro (Blue line), 500m; Syntagma metro (Red/Blue), 600m

### DESTE Foundation for Contemporary Art
- **Athens space:** Filellinon 11 & Em. Pappa, Nea Ionia (converted 1931 sock factory). Opens ONLY during exhibitions — Wed 12:00–20:00, Sat 10:00–14:00.
- **Hydra space:** Former Slaughterhouse, June–October. 2026: Nari Ward (opening June 23). Previous: Andra Ursuța (2025), George Condo (2024), Jeff Koons (2022).
- **Character:** Dakis Joannou's globally influential private foundation. No permanent display. Project-based.
- **Transport (Athens):** Not central — Nea Ionia requires bus or taxi.

### Bernier/Eliades Gallery
- **Location:** 11 Eptachalkou Street, Thissio
- **Hours:** Tue–Fri 11:00–18:30; Sat 12:00–16:00; closed Sun/Mon
- **Entry:** Free. **Founded:** 1977
- **Programming:** 4–6 shows/year. Represents Serra, Turrell, Abramović, Long, Gilbert & George.
- **Vernissages:** Typically **Thursdays 18:00–21:00**, open to public.
- **Character:** Athens' most historically significant international gallery. Neoclassical building. Also has Brussels space.
- **Transport:** Thissio metro (Green line)

### The Breeder Gallery
- **Location:** 45 Iasonos Street, Metaxourgeio
- **Hours:** Tue–Fri 11:00–19:00; Sat 11:00–17:00; closed Sun/Mon
- **Entry:** Free. **Founded:** 2002
- **Programming:** 6–8 shows/year. "Breeder Feeder" parallel space. Strong international fair circuit (Frieze, Art Basel).
- **Vernissages:** 19:00 on first day of each exhibition, open to public.
- **Character:** Converted 1970s ice cream factory. Heart of Metaxourgeio creative district.
- **Transport:** Metaxourgeio metro (Red line)

### CAN Christina Androulidaki Gallery
- **Location:** 19 Chalkokondili Street (relocated from Kolonaki — VERIFY ADDRESS)
- **Hours:** Tue–Fri 11:00–15:00 & 17:00–20:00 (split hours); Sat 11:00–16:00; closed Sun/Mon
- **Entry:** Free. **Founded:** 2012
- **Programming:** 6–8 shows/year. Contemporary photography, painting, mixed media.
- **Transport:** Omonia or Panepistimio metro (walk)

### Benaki Museum — Main Building
- **Location:** 1 Koumbari Street, Kolonaki
- **Entry:** €12 permanent; €8 temporary; €6 reduced
- **Free:** EU under 25; under 5; **every Thursday 18:00–midnight** (permanent collection only)
- **Hours:** Mon, Wed, Fri, Sat 10:00–18:00; **Thu 10:00–midnight**; Sun 10:00–18:00; closed **Tuesday**
- **Key recurring event:** **Thursday late opening to midnight** — free permanent collection. A distinctive Athens cultural tradition.
- **Character:** Privately-run museum in neoclassical mansion. Rooftop café with Acropolis views.
- **Transport:** Syntagma metro (Red/Blue), 5-min walk

### Benaki Museum — Pireos 138 — MOST IMPORTANT FOR EVENTS CALENDAR
- **Location:** 138 Pireos Street & Andronikou Street
- **Space:** 3,000 sqm exhibition (3 floors) + 850 sqm courtyard + 300-seat amphitheatre
- **Entry:** ~€9–12 per exhibition
- **Hours:** Thu & Sun 10:00–18:00; **Fri & Sat 10:00–22:00**; closed Mon/Tue/Wed; **closed in August**
- **Programming:** EXCLUSIVELY rotating temporary exhibitions. Contemporary art, photography, design, architecture.
- **Key events:** Primary venue for Athens Photo Festival (biennial, June–July). DESTE Foundation collaborations.
- **Character:** Athens' premier contemporary art venue — industrial-chic converted 1960s building. Most important photography exhibition space in Southeast Europe during Athens Photo Festival.
- **Transport:** Kerameikos metro (Blue line); also Petralona (Green line)

### National Archaeological Museum
- **Location:** 44 Patission Street, Exarchia
- **Entry:** **€20** (from January 2026; previously €12)
- **Free:** EU under 25; non-EU under 18; disabled + escort; unemployed
- **Free days:** First & third Sundays Nov–March; March 6; April 18; May 18; last weekend September; October 28
- **Summer hours (Apr–Oct):** Tue 13:00–20:00; Wed–Mon 8:00–20:00
- **Winter hours (Nov–Mar):** Tue 13:00–20:00; Wed–Mon 8:30–15:30 (NOTE: 4.5 hours shorter)
- **Booking:** **Timed-entry tickets required** since April 2024 via hhticket.gr
- **Renovation:** €40M Chipperfield/Tombazis renovation approved December 2025. Museum remains open.
- **Transport:** Victoria metro (Green line), 7-min walk

### Acropolis Museum
- **Location:** 15 Dionysiou Areopagitou Street, Makrigianni
- **Entry:** **€20** year-round (winter discount abolished April 2025)
- **Free:** EU under 25; under 5; disabled + escort; ICOM
- **Winter hours:** Mon–Thu 9:00–17:00; **Fri 9:00–22:00**; Sat–Sun 9:00–20:00
- **Summer hours:** Mon 9:00–17:00; Tue–Sun 9:00–20:00; **Fri 9:00–22:00**
- **Key recurring event:** **Friday late-night opening to 22:00 year-round**
- **Photography:** Permitted without flash; **NO photography in Archaic Acropolis Gallery**
- **Restaurant:** 2nd floor, Acropolis views; open Fri & Sat until midnight
- **Transport:** Akropoli metro (Red line), directly adjacent

### Byzantine and Christian Museum
- **Location:** 22 Vasilissis Sofias Avenue
- **Entry:** €8. **Free:** Under 18; disabled + escort
- **Winter hours:** Mon, Wed–Sun 8:30–15:30; closed Tuesday
- **Summer hours:** Mon, Wed–Sun 8:00–20:00; Tue 13:00–20:00
- **Character:** 1848 Villa Ilissia. Peaceful gardens. Contemplative oasis.
- **Transport:** Evangelismos metro (Blue line), 2-min walk

## Photography-Specific

### Athens Photo Festival
- **Organizer:** Hellenic Centre for Photography (HCP), founded 1986
- **Cadence:** Biennial (even years), June–July, ~7–8 weeks
- **2026 dates:** June 10–July 26
- **Main venue:** Benaki Pireos 138 (full 3,000+ sqm takeover)
- **Satellite venues:** 18+ additional spaces across Athens
- **Scale:** 70–100+ artists from 28–35 countries
- **History:** Founded 1987, one of five oldest photography festivals worldwide.
- **Website:** photofestival.gr

### Athens Photo World
- **Cadence:** Annual (8th year in 2026)
- **Focus:** Photojournalism. Founded in tribute to late Reuters photographer Yannis Behrakis.
- **Summer phase (Jun–Sep):** Free outdoor exhibitions on railings of National Garden and Megaron.
- **Website:** apw.gr

## Theater / Performance Venues

### Onassis Stégi (Στέγη Ιδρύματος Ωνάση) — VERIFIED OPERATIONAL (February 2026)
- **Location:** Syngrou Avenue 107-109, Neos Kosmos, 11745
- **Capacity:** Main Stage 880 seats. Upper Stage 185 seats. Exhibition Hall 700 sqm. 18,000 sqm total.
- **Character:** Athens' most internationally connected contemporary arts center. Interdisciplinary: art, science, technology. Strong XR, immersive, AI, digital art focus alongside theater, dance, music. ~300,000 annual visitors.
- **Language:** CRITICAL — simultaneous GREEK AND ENGLISH SURTITLES. Website/ticketing bilingual. Many performances IN English.
- **Practical:** Entry €7-45 tiered. Residents (Neos Kosmos/Koukaki): €7. Unemployed/disabled: €5. Many free events.
- **Booking:** tickets.onassis.org (EN/GR), +30 219 219 1000
- **Season:** October-July
- **Transport:** Syngrou-Fix metro (Red line), 12-minute walk. Bus to "Panteion" stop adjacent. Free underground parking (150 spaces).
- **Accessibility:** Wheelchair ramp, elevators all floors, 6 wheelchair positions Main Stage.
- **Website:** onassis.org / tickets.onassis.org
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

### National Theatre of Greece (Εθνικό Θέατρο) — VERIFIED OPERATIONAL (February 2026)
- **Location (Ziller):** Agiou Konstantinou 22-24, near Omonia. Neoclassical Ernst Ziller building.
- **Location (Rex):** 48 Panepistimiou Street.
- **Stages:** Main Stage 626 seats (Ziller), Marika Kotopouli ~600 (Rex, largest stage in Athens), Katina Paxinou 140 (Rex, experimental), Eleni Papadaki 342 (Rex basement).
- **Character:** Greece's national theater company, founded 1901. Artistic Director since Feb 2025: Argyro Chioti.
- **Language:** All performances in Greek. ENGLISH SURTITLES on select dates: n-t.gr/en/events/supertitlesevents
- **Practical:** €5-25. Students up to 28: €12. Disabled + companion: €5 each.
- **Transport:** Omonia metro (Red/Green) for Ziller. Panepistimio metro (Red) for Rex.
- **Website:** n-t.gr/en/
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

### Megaron Mousikis (Athens Concert Hall) — EXPANDED PROFILE
- **Location:** Vas. Sofias & Kokkali, near Hilton
- **Halls:** Christos Lambrakis (1,960 seats), Alexandra Trianti (~1,500), Dimitris Mitropoulos (~450), Nikos Skalkotas (380), Banqueting Hall (650).
- **Character:** Athens' premier classical/high-culture venue. Five halls with world-class acoustics.
- **Language:** International artists in original languages. English and Greek surtitles at major productions.
- **Practical:** €5-100. Booking: webtics.megaron.gr, box office Mon-Fri 10am-6pm.
- **Transport:** Megaro Moussikis metro (Blue line), directly adjacent.
- **2026 note:** Absorbing Athens & Epidaurus Festival programming displaced by Herodes Atticus renovation.
- **Website:** megaron.gr/en/
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

### SNFCC / Greek National Opera — EXPANDED PROFILE
- **Location:** Leof. Andrea Siggrou 364, Kallithea
- **Spaces:** Stavros Niarchos Hall (1,400 seats). Alternative Stage (300-400). Lighthouse/Pharos. Great Lawn (free outdoor events). Agora.
- **Character:** Renzo Piano design. €630M SNF gift. 21-hectare park. LEED Platinum certified.
- **Programming:** Full opera/ballet season Oct-Jul. Many FREE outdoor events. "Lyriki gia Olous": 6,000 free GNO tickets/season via lottery.
- **Language:** Opera in original language with GREEK AND ENGLISH SURTITLES on seat-back screens.
- **Transport:** NO direct metro. Free SNFCC shuttle from Syntagma → Syngrou-Fix → SNFCC. Tram Line 10. Taxi ~€7-10 from center.
- **Accessibility:** GOLD STANDARD. "All Together at the Opera": 30 accessible performances/season with GSL, audio description.
- **Websites:** snfcc.org/en/, nationalopera.gr/en/
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

### Theatre of the NO — Expanded Profile
- **Location:** Konstantinou Palaiologou 3 (opposite City Hall)
- **Capacity:** ~150
- **Entry:** Theater €10-15; music €10-12; Jazz Jam €10 (musicians free with drink)
- **Programming:** ALL THEATER IN ENGLISH — absurdist, classics, contemporary. Wednesday Jazz Jam (22:00), Saturday jazz concerts (22:30). Near-daily programming.
- **Language:** ENGLISH for all theater. Athens' ONLY dedicated English-language theater.
- **Opened:** April 18, 2024. Founded by Yoel Wulfhart. Cast from ~18 countries.
- **Transport:** Omonia or Metaxourgeio metro
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

### Porta Theatre (Θέατρο Πόρτα) — VERIFIED OPERATIONAL
- **Location:** Leoforos Mesogeion 59, Ambelokipoi
- **Capacity:** ~150-300 (not published). Artistically ambitious, not commercial.
- **Language:** Greek only. No surtitles.
- **Booking:** More.com, +30 210 7711333
- **Transport:** Ambelokipoi metro (Blue line)
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

### Apothiki (Θέατρο Αποθήκη) — VERIFIED OPERATIONAL
- **Location:** Sarri 40, Psiri
- **Capacity:** 208 seats
- **Entry:** €14-17
- **Language:** Greek only. No surtitles.
- **Character:** Converted warehouse. Part of Athinaika Theatra network.
- **Transport:** Monastiraki metro (Blue/Green)
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

### Odeon of Herodes Atticus (Ηρώδειο) — ⚠️ CLOSING LATE JULY 2026
- **Location:** Dionysiou Areopagitou Street, SW slope of Acropolis
- **Capacity:** ~4,680 seats (Pentelic marble)
- **Entry:** €15-100
- **Season:** June-August
- **Restrictions:** NO photography, NO high heels (marble), NO food/drink, NO entry after start, NO children under 6. Arrive 60 min early.
- **⚠️ RENOVATION:** Closing late July 2026 for minimum 3 years. 2026 IS THE LAST SEASON.
- **Character:** Built 160-174 AD.
- **Transport:** Akropoli metro (Red), ~10-min walk
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

### Lycabettus Theatre — VERIFIED OPERATIONAL (reopened Sep 2023)
- **Location:** Mount Lycabettus, Kolonaki
- **Capacity:** 3,950
- **Season:** Late May-October
- **Transport:** Evangelismos metro (Blue) + walk/cable car. Free shuttle on event days.
- **History:** Reopened Sep 2023 after 15-year closure. Has hosted Radiohead, Björk, Nick Cave.
- **Character:** 360-degree views from highest point in Athens center.
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

---

## Cinema Venues

**General:** Open-air cinema (therino sinema) is a defining Athens summer tradition. ~65 remain. Films shown in original language with Greek subtitles — NEVER dubbed (except children's). Ticket prices: open-air €7.50-9, indoor ~€8, Wednesday discounts common.

### Cine Thission
- **Location:** Apostolou Pavlou 7, Thissio
- **Capacity:** ~300+
- **Entry:** €8-9. Box office only — no online booking.
- **Season:** Late April/May to October
- **Programming:** Classic reissues, arthouse, quality contemporary.
- **Character:** Athens' most celebrated open-air cinema since 1935. CNN ranked world's best. Direct Acropolis view from left-side seats. Family-run (Maniakis family since 1980). Canteen famous for homemade cheese pie and vyssinada (sour cherry drink).
- **Practical:** Arrive 30+ min early for best seats (left side = Acropolis view). Cash at box office.
- **Transport:** Thissio metro (Green), 10-min walk along Acropolis pedestrian promenade.
- **Freshness:** FRESH (February 2026)

### Cine Paris
- **Location:** Kidathineon 22, Plaka (rooftop)
- **Capacity:** ~150
- **Entry:** €8-9 (discount Tue/Wed ~€5-6)
- **Season:** May to September/October
- **Programming:** Curated by Cinobo since 2024 reopening. Classics, arthouse, contemporary.
- **Character:** Rooftop cinema on neoclassical building. Dramatic elevated Acropolis view. Reopened 2024 after 4-year closure.
- **Transport:** Akropoli metro (Red), 5-min walk.
- **Freshness:** FRESH (February 2026)

### Aigli Cinema (Cine Aegli)
- **Location:** Zappeion Gardens
- **Entry:** €8.50-10. Online booking available.
- **Programming:** Broad range. Post-2024 renovation: 4K LASER projection, Dolby 7.1 surround.
- **Character:** Athens' oldest operating open-air cinema (since ~1910). Premium option. Part of Aigli Zappeiou complex.
- **Transport:** Syntagma metro (Red/Blue), 10-min walk through National Garden.
- **Freshness:** FRESH (February 2026)

### Cine Dexameni
- **Location:** Dexameni Square, Kolonaki
- **Entry:** ~€8. Box office only.
- **Character:** Locals' favorite in Kolonaki's most charming square. Arthouse. Partial Acropolis view.
- **Transport:** Evangelismos metro (Blue), 10-min walk uphill.
- **Freshness:** FRESH (February 2026)

### Cine Riviera
- **Location:** Valtetsiou 46, Exarchia
- **Entry:** €7-8. Curated by Cinobo.
- **Character:** Exarchia's neighborhood cinema since 1969. Courtyard garden. No Acropolis view.
- **Transport:** Omonoia or Panepistimio metro, 10-min walk.
- **Freshness:** FRESH (February 2026)

### Astor (Year-Round)
- **Location:** Korai 4, central Athens
- **Entry:** €8 (Wed €5.50)
- **Character:** Athens' premier arthouse cinema since 1962. AIFF festival venue.
- **Transport:** Panepistimio metro (Red), 2-min walk.
- **Freshness:** FRESH (February 2026)

### Danaos (Year-Round)
- **Location:** Leoforos Kifisias 109, Ambelokipoi
- **Entry:** €8 (students €6.50; Wed €5)
- **Character:** Athens' best year-round independent cinema. Two screens. AIFF festival venue.
- **Transport:** Ambelokipoi or Panormou metro (Blue).
- **Freshness:** FRESH (February 2026)

### Greek Film Archive / Tainiothiki (Year-Round)
- **Location:** Iera Odos 48 & Megalou Alexandrou 134-136
- **Entry:** ~€5
- **Character:** Greece's national film archive. Retrospectives, restorations, rare prints. AAGFF venue.
- **Transport:** Kerameikos metro (Blue), 5-min walk.
- **Freshness:** FRESH (February 2026)

---

## Venue Status Flags

### Verified Closures (2024)
- Bizzar â€” April 2024
- Lamda â€” April 2024
- Rembetiki Istoria â€” Early 2024 (permanent)
- Afrikana Jazz Bar â€” 2024 (permanent, confirmed January 2026)

### Verified Operational
- **Stoa Athanaton** â€” Confirmed operational January 2026
- **Zappeion Hall** — Confirmed operational, Panathēnea 2026 announced (May 27-29)
- **EGG Hub Moschato** — Confirmed operational, egg Innovation & Investment Summit held February 11-13, 2026
- **Technopolis** — Confirmed operational, Doers Summit October 2026 announced

---

# SECTION 3: NEIGHBORHOODS

### Mets
- Quiet residential, adjacent to Panathenaic Stadium and First Cemetery
- Metro: Akropoli (Red line), ~10 min walk uphill
- Character: Where you go for intimate venues, not nightlife. Leafy streets, quiet evenings.
- Peak hours: Venue-specific
- Key venues: Half Note Jazz Club

### Gazi
- Former industrial zone around the old gasworks (Technopolis), now Athens' primary nightlife/culture district
- Metro: Kerameikos (Blue line)
- Character: Clubs, live music, rooftop bars, art spaces. Can feel touristy on weekends, still the center of gravity for live music and electronic. Fills after 2am on weekends.
- Peak hours: 23:00-05:00
- Key venues: Gazarte, Bios, Temple, Astron Club, AUX Club, Steam Athens, Floyd Live Music Venue
- LGBTQ+: Sodade2 (since 2000), Shamone. Note: Bizzar and Lamda closed April 2024.

### Exarchia
- The anarchist/student/counterculture neighborhood
- Metro: Omonia (Red/Green line), 10-min walk. Or Panepistimio (Red line).
- Character: Street art, vinyl shops, independent bars, politicized. NOT gentrified. Night economy runs late.
- Peak hours: 21:00-03:00
- Key venues: AN Club (30+ years, Athens' oldest rock venue, bands after 22:00), IT Athens (electronic, Pulse Tribe Kollektiv), Kavouras (rebetiko, Fri/Sat only)

### Monastiraki / Psiri
- Tourist center meets nightlife transition zone
- Metro: Monastiraki (Blue/Green line)
- Character: Psiri has shifted from gritty bar district to more polished â€” gentrified but gems remain. Monastiraki is flea market, Acropolis views, tourist foot traffic. After dark, the small streets behind the square get interesting.
- Peak hours: 20:00-02:00
- Key venues: Six D.O.G.S, Death Disco, Baba au Rum (#25 World's Best Bars), The Clumsies (#47 World's Best Bars)

### Koukaki
- South of the Acropolis, residential-meets-Airbnb
- Metro: Syngrou-Fix (Red line)
- Character: Quiet streets, good restaurants, increasingly gentrified by tourism. Not a nightlife destination but good for neighborhood bars and intimate music. Sophisticated.
- Peak hours: 19:00-01:00
- Key venues: Underflow Records & Art Gallery (experimental/avant-garde jazz, ~80 capacity, most Fridays, â‚¬8-15)

### Metaxourgeio
- Transitional neighborhood, former industrial. Has "arrived."
- Metro: Metaxourgeio (Blue line)
- Character: Athens' most talked-about creative zone. Anchored by The Breeder, Rebecca Camhi, Alekos Fassianos Museum (opened 2023). Art galleries, studios, emerging food scene. Some edge remains. Also home to SMUT.
- Peak hours: 20:00-02:00
- Key venues: The Breeder Gallery, SMUT Athens

### Kolonaki
- Upscale neighborhood on Lycabettus hill slopes
- Metro: Evangelismos (Blue line) or Syntagma
- Character: Designer shops, upscale dining, gallery scene. Athens' established gallery district (Gagosian, Zoumboulakis, Kalfayan). Museum of Cycladic Art on Neofytou Douka. Conservative Athens. 50-100% higher prices.
- Peak hours: 19:00-01:00
- Key venues: Museum of Cycladic Art, Cine Dexameni

### Piraeus
- Athens' port city, technically separate municipality
- Metro: Piraeus (Green line, end of line, 30+ min from center)
- Character: Maritime Athens. Waterfront dining, ferries to islands. Has its own venue scene distinct from central Athens. Rembetiko history.
- Key venues: Veakeio Theatre (summer), waterfront bars

### Pagrati
- Residential, behind Panathenaic Stadium
- Character: Laid-back neighborhood with a strong local bar scene. Varnava Square is the social anchor. Not touristy, not flashy.
- Transport: No direct metro â€” bus or 15-20 min walk from Syntagma/Akropoli

### Kypseli
- Former working-class, now Athens' most diverse neighborhood
- Character: Immigrant communities, Fokionos Negri pedestrian boulevard, emerging cultural spaces. Real Athens, no tourist polish.
- Transport: No direct metro â€” bus from Omonia/Victoria

### Omonoia
- Central Athens, major transport junction
- Metro: Omonoia (Red/Blue line)
- Character: Gritty, transitional. Not a destination neighborhood but home to Romantso and near Stoa Athanaton (Central Meat Market).
- Key venues: Romantso, Stoa Athanaton

### Tavros
- Industrial area south of Gazi
- Metro: Tavros (Blue line)
- Character: Not a neighborhood you'd visit for atmosphere â€” you come for the venue and leave.
- Key venues: Fuzz Live Music Club

### Petralona
- Residential, west of Acropolis
- Metro: Petralona (Green line)
- Character: Local, unpretentious, growing food scene.
- Key venues: Hamam (rebetiko)

### Moschato
- Southern Athens, between Kallithea and Tavros
- Metro: No direct metro — bus from Syngrou-Fix (Red line) or Tavros (Blue line). Taxi ~15 min from center.
- Character: Residential/light industrial. Not a destination — you come for the EGG Hub and leave.
- Peak hours: Business hours for events
- Key venues: EGG Hub

### Neos Kosmos
- Residential, south of Acropolis along Syngrou Avenue
- Metro: Syngrou-Fix (Red line)
- Character: Home to Onassis Stégi and near EMST. Residential with growing cafe scene. Not touristy.
- Peak hours: Venue-specific
- Key venues: Onassis Stégi, EMST (nearby at Fix Brewery)

### Makrigianni
- Between Akropoli metro and the Acropolis Museum
- Metro: Akropoli (Red line)
- Character: Tourist-heavy, pedestrianized Dionysiou Areopagitou promenade. Acropolis Museum district.
- Peak hours: 9:00-20:00
- Key venues: Acropolis Museum, Odeon of Herodes Atticus (nearby)

### Kallithea
- Southern Athens, waterfront
- Metro: No direct station. SNFCC shuttle from Syntagma. Tram Line 10.
- Character: Transformed by SNFCC. Worth visiting for the park even without a performance.
- Peak hours: All day (park), evenings (performances)
- Key venues: SNFCC / Greek National Opera

### Alimos (Athens Riviera)
- Primary nightlife corridor along Akti tou Iliou and Poseidonos Avenue
- Tram: Kalamaki and Loutra Alimou stops (direct from Syntagma, ~30 min)
- Character: Beachfront clubs. Not a walking neighborhood — you come for the venue.
- Peak hours: 22:00-06:00 (summer)
- Key venues: Bolivar Beach Bar, Akanthus Summer Club

### Varkiza
- Coastal town 27km south of Athens
- Transport: Taxi only south of Voula tram terminus. €40-55 night.
- Character: You come exclusively for Island Athens Riviera and return to Athens after.
- Key venues: Island Athens Riviera

### Kato Petralona
- Sub-neighborhood of Petralona, south of Thissio
- Metro: Petralona (Green line)
- Character: Residential, growing local food scene. Found.ation incubator.
- Key venues: Found.ation

### Votanikos
- Industrial transition area at the Rouf/Gazi border
- Metro: Kerameikos (Blue), ~8-10 min walk.
- Character: Not a destination. Serafio municipal complex, Athens Digital Lab.
- Key venues: Serafio

### Eleonas
- Industrial district
- Transport: Taxi required (no metro)
- Character: Emerging large-format event space area. EON Athens warehouse.
- Key venues: EON Athens

---

# SECTION 4: COLLECTIVES & REGULAR NIGHTS

| Collective | Sound | Venues | Residents | Notes |
|------------|-------|--------|-----------|-------|
| **VLCT/Velocity** | 90s-influenced, industrial-tinged, rave-forward techno | AUX Club (club nights), Universe Arena (arena events), Oddity | Até, Salin, Cirkle | Own label (VLCT Records). DJ academy. Arena to club scale. Active ~2022. |
| **Blend Athens** | Full-spectrum techno (melodic house through hard/industrial) | Oddity (winter), Bolivar (summer), Universe/SUNEL Arena (large-scale) | Mikee, Manolaco | Athens' longest-running promoter (~20 yrs). 41K IG followers. |
| **Pulse Tribe Kollektiv** | Groove techno, Detroit electro, italo disco | IT Athens (primary), AUX, Romantso | Freeflow, Philip Paul, Crystal (GR) | New (~2024). Small but focused. Groove over volume. |
| **HARDVISION** | Hard techno, acid, industrial, schranz | Black Temple Athens, Temple, Oddity | No permanent residents (open platform) | Founded by Alisa Murphy. Monthly events. |
| **Slam!** | Eclectic queer: house, acid, electro, italo, progressive | Six D.O.G.S. (primary) | ClubKid (founder), .Fro. | Founded 2019. Bi-monthly. Hosted by Les Salopes. 29+ editions. |
| **π (Pi) Collective** | Dark/industrial techno, EBM, electro | Astron Club (primary) | 3.14, DΛS, Nemmett, Zorz, BMSK, Devika, Katra | Athens/Berlin axis. Est. 2014. Label: Pi Electronics. |
| **Academeia** | Hypnotic techno, modular, minimal | Astron Club | Keeptress, Atypikal (live), Xyro | Copenhagen/Athens/Berlin. Est. 2024. Own label. |
| **Matter** | Bass-heavy to deep techno | Astron Club | SRJ, Andreas Palmer | |
| **Purple Night** | Eclectic queer dance music | Various | The Dreamer, Denis d'or, Wrapped in Plastic | 10-year anniversary March 2026. |

---

# SECTION 4B: STARTUP ECOSYSTEM

## Flagship Startup Events (Athens)

### Panathēnea Festival
- **What:** Athens' answer to Web Summit. Tech, business, and art festival reimagining the ancient Panathenaia. Startup pitching competition, keynotes, exhibitions, networking, city-wide side events, closing street party under the Acropolis.
- **Dates 2026:** May 27-29
- **Venue 2026:** Zappeion Hall (2025 inaugural was Athens Conservatory)
- **Scale:** 10,000 target attendees (3,100+ at inaugural 2025 edition from 44 countries). 250+ speakers, 5 stages, 70+ side events.
- **Pitch competition:** Apply via Google Form at panathenea.org. Pre-seed and seed-stage companies. Pitch to Tier-1 VCs on main stage.
- **Confirmed 2026 speakers:** Neil Rimer (Index Ventures), George Robson (Sequoia), Anastasis Germanidis (Runway CTO), Laura Modiano (OpenAI), Christian Bach (Netlify co-founder), Ben Blume (Atomico), Kitty Mayo (Project Europe), Dean Dimizas (Cambridge Associates)
- **VCs attending 2026:** Lakestar, Index Ventures, Sequoia, Atomico confirmed
- **Format:** Mornings = stage content (keynotes, panels, pitches). Afternoons = networking + city-wide side events in galleries, cafés, rooftops, museums. Culminates in street party.
- **Special:** Founders Day (pre-festival, exclusive, private peer-learning). Talent Pass for 100 selected university students.
- **Organized by:** Nonprofit, student-led with experienced advisory board. Founded Athens 2024.
- **Tickets:** Early bird -50% available. Multiple tiers (Startup, Investor, Media, Talent).
- **Website:** panathenea.org

### Doers Summit
- **What:** Concentrated gathering of founders, investors, and operators from Emerging Europe & GCC. Startup showcase, pitch competitions, matchmaking, expo, keynotes.
- **Dates 2026:** October (Athens, exact dates TBA). Also: Limassol May 21-22, Dubai November.
- **Venue:** Technopolis City of Athens, Pireos 100, Gazi
- **Scale:** 2,000+ attendees (capped), 50+ speakers, 70+ exhibitors, 2 stages
- **Pitch competition:** Startup showcase — apply via doerssummit.com. Startups pitch on stage to VCs.
- **Matchmaking:** AI-powered Brella app for targeted networking and investor meetings.
- **2025 highlights:** 50%+ international exhibitor booths. Partners: Endeavor Greece, XM, Skroutz, National Bank of Greece. Speakers: Lars Rasmussen (Google Maps co-founder), Apostolos Apostolakis (VentureFriends).
- **Tickets:** €80 Doer / €200 Doer+ (lounge, parking, co-working) / €400-500 Investor (Investor Lounge, meeting rooms, roundtables)
- **Organized by:** The Doers Company (team behind Reflect Festival, Cyprus). Operating since 2017.
- **Website:** doerssummit.com

### egg Innovation & Investment Summit + Investor Day
- **What:** Eurobank's accelerator showcase. Startups pitch to VCs, corporate investors, and angel investors from Greece, CEE, Israel, US, Canada, UK. Greece's most established accelerator pipeline.
- **Latest:** Innovation & Investment Summit ran February 11-13, 2026 at EGG Hub. 18 startups presented in Bioscience, Sustainability, Deep Tech and Security. MoUs signed with BioInnovation Greece and EBAN.
- **Investor Day:** Annual, February. 40+ startups pitch to 100-200+ investors.
- **Qualifying pitches:** April 8-9, 2026. Acceleration starts May 1, 2026.
- **Venue:** EGG Hub, Thessalonikis 75, Moschato
- **Track record:** Since 2013. 460+ business groups, 1,600+ entrepreneurs, 230 companies formed, €55.7M raised by alumni, €49.2M cumulative turnover. FT/Statista ranked top European startup hub.
- **Partnerships:** DMZ Toronto, InnovX Romania, Cyprus Seeds, 10+ Greek universities, Corallia Ventures, EBAN.
- **How to participate:** Apply at theegg.gr. Greek, EU, or third-country citizens eligible. Start-Up platform (incubation) or Scale-Up platform (acceleration).
- **Website:** theegg.gr/en

## Accelerators & Incubators

| Organization | Type | Focus | Key Events | Website |
|-------------|------|-------|------------|---------|
| **egg (Eurobank)** | Accelerator | All sectors, emphasis on HealthTech, FinTech, DeepTech, Sustainability | Investor Day (Feb), Innovation Summit (Feb), Qualifying Pitches (Apr) | theegg.gr |
| **ACE AUEB** | University hub | AI, tech, all sectors | AI Hackathon Greece (Mar), workshops year-round | ace.aueb.gr |
| **Found.ation** | Incubator/support | Startups, digital | Workshops, demo days, mentoring. 67% program success rate. | thefoundation.gr |
| **Orange Grove** | Incubator | International startups in Greece | Workshops, training, demo days. Dutch Embassy-backed. Strong international network. | orangegrove.eu |
| **Impact Hub Athens** | Coworking + programs | Social impact, sustainability | Community events, workshops | impacthub.net/athens |
| **Endeavor Greece** | Scale-up support | High-impact entrepreneurs | Innovation Summit, mentoring, scale-up programs | endeavor.org.gr |

## Key VCs & Investors (Athens-based or Greece-focused)

| Fund | Stage | Focus | Notable |
|------|-------|-------|---------|
| **VentureFriends** | Pre-seed to Series A | FinTech, PropTech, B2C, Marketplaces, SaaS | €250M+ deployed across Europe, MENA, LatAm |
| **Metavallon VC** | Pre-seed, Seed | All sectors, Greek founders, global focus | |
| **Marathon Venture Capital** | Seed | Tech companies by ambitious founders | |
| **Big Pi Ventures** | Seed, Series A | DeepTech, science-based | |
| **Uni.Fund** | Pre-seed, Seed | University spin-offs, research-based | |
| **Growthfund (HDBI)** | Various | National development bank VC participations | |

## Government Programs

| Program | What | Relevance |
|---------|------|-----------|
| **Elevate Greece** | National Startup Registry | Registered startups get tax benefits, Golden Visa for startup investment |
| **Digital Nomad Visa** | Residency for remote workers | €3,500/month income requirement, 12-month renewable |
| **Startup Golden Visa** | Investment visa | €250K investment in registered startup |
| **PHAROS AI Factory** | National AI hub | Computing resources, datasets, tools for AI startups |

## Greek Startup Ecosystem Context (for enrichment writers)

Key numbers that inform event descriptions:
- **Total startup investment 2025:** €732.2M (AI accounts for 50%+ of global VC)
- **VC investment 2025:** €234M, projected €320M for 2026
- **Athens startups:** ~228 (75% of Greek total), ranked 47th globally
- **Notable exits:** Viva Wallet (€1.7B, J.P. Morgan), BETA CAE (€1.24B), InstaShop ($360M, Delivery Hero), Softomotive ($150M+, Microsoft), Beat (Daimler)
- **Active players:** Omilia, Persado, Workable, Blueground, Hack The Box, Skroutz

## Startup & Tech Events Calendar 2026

| Event | Dates | Venue | Type | Apply At |
|-------|-------|-------|------|----------|
| **egg Innovation Summit** | Feb 11-13 ✅ DONE | EGG Hub, Moschato | Summit | theegg.gr |
| **AI Hackathon Greece** | Mar 6-8 | ACE AUEB campus | Hackathon | hackathongreece.ai |
| **egg Qualifying Pitches** | Apr 8-9 | EGG Hub, Moschato | Pitch-night | theegg.gr |
| **Devoxx Greece** | Apr 23-25 | Megaron Athens | Conference | devoxx.gr |
| **Panathēnea** | May 27-29 | Zappeion Hall | Summit | panathenea.org |
| **Doers Summit** | October (TBA) | Technopolis, Gazi | Summit | doerssummit.com |
| **DevFest Athens** | November (TBA) | TBA | Conference | gdg.community.dev/gdg-athens |
| **Open Coffee Athens** | Monthly | Benaki Museum | Meetup | meetup.com/Open-Coffee-Athens |
| **GreeceJS** | Bi-monthly | Impact Hub Athens | Meetup | greecejs.org |

---

# SECTION 5: ARTISTS

## Greek Jazz Artists

Context for when these names appear in event listings:

| Artist | Instrument | Notes |
|--------|------------|-------|
| Stavros Lantsias | Piano | Berklee-trained, leading figure in Greek jazz |
| Andreas Polyzogopoulos | Trumpet | |
| Dimitris Kalantzis | Saxophone | |
| Petros Klampanis | Bass | |

## Greek Singer-Songwriter / Entechno

*Add verified artist profiles here as events are written. Include biographical facts, discography highlights, collaboration history, and what tradition they come from. Never fabricate â€” if you can't verify it, don't write it.*

## Electronic / DJ

### Collective Profiles

#### Velocity Collective (VLCT)
- **Slug:** velocity-collective
- **Name variants:** VLCT, Velocity, Velocity Collective
- **Role:** Collective / Promoter / Record label / DJ academy
- **Sound character:** 90s-influenced, industrial-tinged, rave-forward techno. Booking range: Amelie Lens, DVS1, I Hate Models, Speedy J, Oscar Mulero.
- **Active since:** ~2022
- **Active status:** Active
- **Key facts:** Own record label (VLCT Records). DJ education program (Velocity Academy). Sub-brands: Velocity Arena (arena-scale), VLCT Clubnight (intimate), VLCT Zero (conceptual heavy techno). Co-produced GREATH Festival (July 2025, Pireos 260) with Plisskën — lineup included Bicep, Modeselektor, Sofia Kourtesis.
- **Residents:** Até, Salin, Cirkle, VSSLS, NANA/NA/NA, Jinzo, Yanamaste
- **Athens venue associations:** AUX Club (primary), Universe S-2000 Arena, Oddity
- **Confidence:** Tier 1
- **Sources:** ra.co/promoters/113331, @velocity__collective (IG 18K), velocitycollective.gr
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

#### Blend Athens
- **Slug:** blend-athens
- **Role:** Promoter / Event organization
- **Sound character:** Full-spectrum electronic — from Solomun/Adriatique through Len Faki/Chris Liebing to I Hate Models/KI/KI.
- **Active since:** ~2005
- **Active status:** Active
- **Key facts:** Athens' longest-running electronic promoter. 41K IG followers. Co-produces "Velocity Arena" events. Summer programming at Bolivar/Cavo Paradiso (Mykonos).
- **Residents:** Mikee, Manolaco
- **Athens venue associations:** Oddity (primary winter), Bolivar (summer), Universe/SUNEL Arena (large-scale)
- **Confidence:** Tier 1
- **Sources:** blendathens.com, ra.co/promoters/35467, @blendathens (IG 41K)
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

#### Pulse Tribe Kollektiv
- **Slug:** pulse-tribe-kollektiv
- **Sound character:** Groove-focused, eclectic techno drawing from Detroit techno, electro, italo disco. "Techno-driven, groovy, and hypnotic."
- **Active since:** ~2024
- **Residents:** Freeflow, Philip Paul, Crystal (GR)
- **Athens venue associations:** IT Athens (primary), AUX Club, Romantso
- **Confidence:** Tier 2
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

#### HARDVISION
- **Slug:** hardvision
- **Role:** Open rave platform (no permanent residents)
- **Sound character:** Hard techno, acid, industrial, schranz with EBM/aggrotech undertones.
- **Active since:** ~2024
- **Key facts:** Founded by Alisa Murphy (Alexandra Fragkou). Monthly events at underground spots.
- **Athens venue associations:** Black Temple Athens, Temple, Oddity, Zed Athens
- **IMPORTANT:** The Italian label "HARD VISION" on Bandcamp is a separate entity.
- **Confidence:** Tier 2
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

#### Slam!
- **Slug:** slam-athens
- **Sound character:** Eclectic queer dance music — house, acid, electro, italo, progressive. Intentionally genre-fluid.
- **Active since:** 2019
- **Key facts:** Founded by ClubKid (Marios). Bi-monthly at Six D.O.G.S. 29+ editions. Hosted by drag collective Les Salopes. 10th edition was Valentine's Day special (Feb 2020). Community overlap with Purple Night.
- **Residents:** ClubKid, .Fro.
- **Athens venue associations:** Six D.O.G.S. (primary)
- **Confidence:** Tier 1
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

#### π (Pi) Collective
- **Slug:** pi-collective
- **Sound character:** Dark/industrial techno, EBM, electro. Athens-Berlin axis.
- **Active since:** 2014
- **Key facts:** Own label: Pi Electronics. Berghain Säule showcase. Members include 3.14, BMSK, DΛS.
- **Athens venue associations:** Astron Club (primary)
- **Confidence:** Tier 1
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

### Individual Artist Profiles

#### Até
- **Slug:** ate
- **Name variants:** Até (with accent — after Greek goddess Atē/Ἄτη)
- **Role/Instrument:** DJ, producer
- **Genre:** Industrial-tinged techno, rave, hard techno
- **Active since:** ~2020
- **Active status:** Active
- **Key facts:** Co-founder of Velocity Collective alongside Salin. EXHALE Records roster (Amelie Lens' label). Played Tomorrowland 2025. Teaches at Velocity Academy.
- **Label affiliations:** EXHALE Records, VLCT Records
- **Athens venue associations:** AUX Club (primary), Universe Arena
- **Confidence:** Tier 1
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

#### Salin
- **Slug:** salin
- **Role/Instrument:** DJ, producer
- **Genre:** Industrial-tinged techno, rave
- **Active status:** Active
- **Key facts:** Co-founder of Velocity Collective alongside Até. EXHALE Records roster. Played Tomorrowland 2025. Teaches at Velocity Academy.
- **Label affiliations:** EXHALE Records, VLCT Records
- **Athens venue associations:** AUX Club (primary), Universe Arena
- **Confidence:** Tier 1
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

#### BMSK
- **Slug:** bmsk
- **Role/Instrument:** DJ (vinyl-only), producer, venue owner
- **Genre:** Deep/dark techno, electro, EBM
- **Active status:** Active
- **Key facts:** Owner of Astron Club. Founding member of π (Pi) Collective. Vinyl-only all-night-long sets. Pi Electronics label.
- **Athens venue associations:** Astron Club (owner/resident)
- **Confidence:** Tier 1
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

#### ANFS
- **Slug:** anfs
- **Role/Instrument:** DJ, producer
- **Genre:** Industrial techno, electro, dark ambient
- **Active status:** Active
- **Key facts:** Founder of Vanila Records. Core artist on Modal Analysis label. Studio mastering engineer.
- **Label affiliations:** Modal Analysis, Vanila Records (founder)
- **Athens venue associations:** Astron Club, Temple
- **Confidence:** Tier 1
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

#### Manolaco
- **Slug:** manolaco
- **Real name:** Michalis Manolakos (Μιχάλης Μανολάκος)
- **Role/Instrument:** DJ, producer
- **Genre:** Melodic techno, progressive house, groove-driven
- **Active status:** Active
- **Key facts:** Blend Athens resident. International touring schedule. Deep Phase Records.
- **Athens venue associations:** Oddity, Bolivar (summer)
- **Confidence:** Tier 1
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

#### Mikee
- **Slug:** mikee
- **Real name:** Mihail Vacharis (Mike Harris used professionally)
- **Role/Instrument:** DJ, producer
- **Genre:** Groove-driven techno, tech house
- **Active status:** Active
- **Key facts:** Blend Athens resident/co-founder. Deep Phase Records.
- **Athens venue associations:** Oddity, Bolivar (summer)
- **Confidence:** Tier 1
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

#### ClubKid
- **Slug:** clubkid
- **Real name:** Marios
- **Role/Instrument:** DJ
- **Genre:** Eclectic queer dance music
- **Active status:** Active
- **Key facts:** Founder of Slam! party series. 29+ editions at Six D.O.G.S.
- **Athens venue associations:** Six D.O.G.S. (via Slam!)
- **Confidence:** Tier 1
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

#### ANNĒ
- **Slug:** anne-dj
- **Role/Instrument:** DJ
- **Genre:** Dark/experimental techno
- **Active status:** Active
- **Key facts:** SMUT resident 2024–2025. Astron regular. Uses macron: "ANNĒ" (not Anné or Anne).
- **Athens venue associations:** SMUT (resident), Astron Club
- **Confidence:** Tier 2
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

#### Alisa Murphy
- **Slug:** alisa-murphy
- **Real name:** Alexandra Fragkou (Αλεξάνδρα Φράγκου)
- **Role/Instrument:** DJ, promoter
- **Genre:** Hard techno, acid, industrial, EBM
- **Active status:** Active
- **Key facts:** Founder of HARDVISION platform. Also runs Electric Cave parallel project. Athens-based.
- **Athens venue associations:** Black Temple Athens, Temple, Oddity
- **Confidence:** Tier 2
- **Sources:** alivemind.gr/en/alisa-murphy/, afternoiz.gr
- **Last verified:** 2026-02-25
- **Freshness status:** FRESH

### Stub Profiles (Minimum Viable — Need Full Research)

- **AgainstMe** — DJ, SMUT resident 2024–2025, Greek-born Berlin-based, co-founder Society 3000. Tier 3.
- **DJ Scammer** — DJ, SMUT resident 2024–2025. Tier 3.
- **Figkott** — DJ, SMUT resident 2024–2025, also Slam! 29th edition. Tier 3.
- **Sp33dy Julie** — DJ, SMUT resident 2024–2025. Tier 3.
- **VIELL** — DJ, SMUT resident. Tier 3.
- **j biloba** — DJ, SMUT resident 2024–2025, originally Athens, rooted in Hamburg. Tier 3.
- **GRETA (GR)** — DJ, SMUT + Astron. Hosts BOTTA NOVA party. Tier 3.
- **Atypikal** — Live act (modular synth duo), Academeia collective, Koslif label. Tier 2.

## Rebetiko / Traditional

### Gnosto Trio (Klimataria House Band)
- **Greek name:** Γνωστό Τρίο
- **Slug:** gnosto-trio
- **Role/Instrument:** Rebetiko ensemble (bouzouki, guitar, contrabass)
- **Active since:** 1997 (named "Gnosto Trio" in 2010)
- **Members:** Tasos Giannousis (bouzouki/vocals), Panagiotis Katsimanis (guitar/vocals), Antonis Tzikas (contrabass/vocals)
- **Athens venue associations:** Klimataria (resident since 1997), Athens Rebetiko Festival
- **Confidence:** Tier 1
- **Last verified:** 2026-02-25

### Grigoris Vasilas
- **Greek name:** Γρηγόρης Βασίλας
- **Slug:** grigoris-vasilas
- **Role/Instrument:** Bouzouki, vocals
- **Active since:** 1992
- **Key facts:** Born 1969, raised on Lesbos with Asia Minor cultural influence. Musical director at Hamam. Leads ensemble PYRINAS. Performed internationally.
- **Collaboration history:** Alkisti Protopsalti, Stelios Vamvakaris
- **Athens venue associations:** Hamam (musical director), Athens Rebetiko Festival
- **Tradition:** Asia Minor-influenced rebetiko via Lesbos. Carries Piraeus and Smyrna school repertoire.
- **Confidence:** Tier 1
- **Last verified:** 2026-02-25

### Nikos Tatasopoulos
- **Greek name:** Νίκος Τατασόπουλος
- **Slug:** nikos-tatasopoulos
- **Role/Instrument:** Bouzouki
- **Key facts:** Son of legendary bouzouki player Giannis "Dillinger" Tatasopoulos. Leads Friday "White Rose of Athens" program at Hamam.
- **Athens venue associations:** Hamam (Friday program), Klimataria (guest)
- **Tradition:** Second-generation rebetiko — direct lineage.
- **Confidence:** Tier 1
- **Last verified:** 2026-02-25

### Dimitris Mystakidis
- **Greek name:** Δημήτρης Μυστακίδης
- **Slug:** dimitris-mystakidis
- **Name variants:** Mistakidis
- **Role/Instrument:** Guitar, oud, vocals, composer
- **Active since:** 1990s
- **Key facts:** Berklee-trained. Core rebetiko revivalist who bridges traditional and contemporary. Collaboration with Calexico (Feast of Wire, 2003). 7+ albums. Founder of "Smyrna" ensemble.
- **Athens venue associations:** Athens Rebetiko Festival, concert venues
- **Tradition:** Smyrna school revivalist with global collaborations.
- **Confidence:** Tier 1
- **Last verified:** 2026-02-25

### Giorgos Xintaris
- **Greek name:** Γιώργος Ξηντάρης
- **Slug:** giorgos-xintaris
- **Name variants:** Xindaris
- **Role/Instrument:** Bouzouki, vocals
- **Key facts:** Multi-generational rebetiko family. Sons Antonis and Thodoris also perform at festivals.
- **Athens venue associations:** Athens Rebetiko Festival
- **Confidence:** Tier 1
- **Last verified:** 2026-02-25

### Christos Nikolopoulos
- **Greek name:** Χρήστος Νικολόπουλος
- **Slug:** christos-nikolopoulos
- **Role/Instrument:** Bouzouki, composer
- **Key facts:** Musical director at Perivoli tou Ouranou (9th consecutive season, 2025-2026). Son of legendary Giannis Nikolopoulos.
- **Athens venue associations:** Perivoli tou Ouranou (musical director)
- **Confidence:** Tier 1
- **Last verified:** 2026-02-25

### Spyros Patras
- **Greek name:** Σπύρος Πατράς
- **Slug:** spyros-patras
- **Role/Instrument:** Bouzouki, vocals
- **Key facts:** Artistic director at Kavouras across multiple seasons. Central figure.
- **Athens venue associations:** Kavouras (artistic director)
- **Confidence:** Tier 2
- **Last verified:** 2026-02-25

### Historical Reference Profiles (DECEASED)

- **Vassilis Tsitsanis** (Βασίλης Τσιτσάνης, 1915–1984) — The bridge between old and new rebetiko. Composed 500+ songs.
- **Markos Vamvakaris** (Μάρκος Βαμβακάρης, 1905–1972) — "Patriarch of rebetiko." Founded the Famous Quartet of Piraeus.
- **Sotiria Bellou** (Σωτηρία Μπέλλου, 1921–1997) — Definitive female rebetiko voice. 80+ recording years with Tsitsanis.
- **Marika Ninou** (Μαρίκα Νίνου, 1918/22–1957) — The Ninou-Tsitsanis partnership is the benchmark for rebetiko vocal-bouzouki collaboration.
- **Giorgos Batis** (Γιώργος Μπάτης, c.1900s–1967) — "King of Piraeus." Founding member of the Famous Quartet.

## International Touring Artists

### Electronic / DJ (International)

#### Helena Hauff
- **Slug:** helena-hauff
- **Role:** DJ (vinyl-only), producer (analog hardware)
- **Genre:** Electro, acid techno, raw techno, EBM, industrial
- **Based:** Hamburg, Germany
- **Key facts:** BBC Radio 1 Essential Mix of the Year 2017 — first woman to win. Analog purist. Also active in Black Sites (with F#x).
- **Athens history:** Played Astron Bar ~2013–2014 (called it a career highlight in DJ Mag interview). Feb 2, 2024 Athens date confirmed.
- **Confidence:** Tier 1. **Last verified:** 2026-02-25

#### DJ Bone
- **Slug:** dj-bone
- **Role:** DJ (three-deck), producer
- **Genre:** Detroit techno, soulful techno, deep techno
- **Based:** Amsterdam (relocated from Detroit ~2018–19)
- **Key facts:** Second-generation Detroit techno. Mentored at The Music Institute. FURTHER Records profits fund Homeless Homies charity. 35+ years.
- **Athens history:** Played Astron Bar (confirmed by RA, Clubber.gr, SoundCloud recording). Exact date unknown.
- **Confidence:** Tier 1. **Last verified:** 2026-02-25

#### DVS1
- **Slug:** dvs1
- **Role:** DJ, producer, sound system designer
- **Genre:** Techno (purist/functional), raw techno, acid
- **Based:** Minneapolis, USA
- **Key facts:** Berghain resident since ~2009. Wall of Sound — massive speaker installation — is globally touring signature event. HUSH label.
- **Athens history:** Wall of Sound #1 — March 18, 2023, EON Athens (w/ Rrose). WoS #2 — March 30, 2024 (w/ Surgeon). WoS #3 — March 2025. Three consecutive annual events.
- **Confidence:** Tier 1. **Last verified:** 2026-02-25

#### Autechre
- **Slug:** autechre
- **Role:** Electronic duo (production, live)
- **Genre:** IDM, glitch, abstract electronic, algorithmic composition
- **Based:** Rochdale, Greater Manchester, England
- **Key facts:** Over three decades on Warp Records. Max/MSP-built compositions.
- **Athens history:** July 5, 2022 — Herodes Atticus (Athens Epidaurus Festival + Plisskën — landmark booking). Oct 3, 2026 — Universe Multivenue.
- **Confidence:** Tier 1. **Last verified:** 2026-02-25

#### Mala
- **Slug:** mala
- **Role:** DJ, producer, sound system operator
- **Genre:** Deep dubstep, dub, UK bass music
- **Based:** South London, UK
- **Key facts:** Co-founded dubstep as Digital Mystikz. Founding member of DMZ. Deep Medi Musik won DJ Mag UK Label of the Year 2024.
- **Athens history:** November 26, 2010 — Bios — "From Dub to Dubstep" event with Digital Mystikz, Pinch, Loefah, The Scientist.
- **Confidence:** Tier 1. **Last verified:** 2026-02-25

#### Objekt
- **Slug:** objekt
- **Role:** DJ, producer, DSP engineer
- **Genre:** Experimental electronic, techno, electro, IDM
- **Based:** Berlin (born Tokyo, raised Belgium/UK)
- **Key facts:** Mixmag DJ of the Year 2018. Also works as DSP engineer at Native Instruments.
- **Athens history:** Bios appearance stated in database but no independent date verification. Plausible.
- **Confidence:** Tier 3 (needs verification). **Last verified:** 2026-02-25

### Jazz (International)

#### Kenny Garrett
- **Slug:** kenny-garrett
- **Role:** Alto saxophone
- **Genre:** Post-bop, hard bop, soul-jazz
- **Based:** Detroit, Michigan, USA
- **Key facts:** "One of the most admired alto saxophonists after Charlie Parker" (NYT). Grammy winner. Miles Davis band 1987–92.
- **Athens history:** Gazarte (Main Stage) — at least 4 appearances (2017, ~2022, Nov 2025, Feb 2026). Gazarte describes itself as "his favorite."
- **Confidence:** Tier 1. **Last verified:** 2026-02-25

#### Billy Cobham
- **Slug:** billy-cobham
- **Role:** Drums, percussion
- **Genre:** Jazz fusion, jazz-funk
- **Based:** Zurich, Switzerland
- **Key facts:** "Generally acclaimed as fusion's greatest drummer" (AllMusic). Founding member Mahavishnu Orchestra. Played on Bitches Brew.
- **Athens history:** 4 appearances: Rodon Club (2004), Megaron (2011), Gazarte "Spectrum 50" (2023), Gazarte "Time Machine" (2025).
- **Confidence:** Tier 1. **Last verified:** 2026-02-25

#### John Medeski
- **Slug:** john-medeski
- **Role:** Piano, Hammond B3 organ, vintage keyboards
- **Genre:** Avant-garde jazz, jazz-funk, experimental improvisation
- **Based:** New York City area, USA
- **Key facts:** Most versatile keyboard player in contemporary improvised music. MMW crossover. Scored The Curse (2023).
- **Athens history:** December 6, 2025 — Gazarte Main Stage (solo piano, €25–40).
- **Confidence:** Tier 1. **Last verified:** 2026-02-25

### Post-Punk / Darkwave (International)

#### Peter Hook & The Light
- **Slug:** peter-hook-and-the-light
- **Role:** Bass, vocals; full band
- **Genre:** Post-punk, new wave — performing Joy Division and New Order catalogs
- **Based:** Manchester, England
- **Key facts:** Peter Hook co-founded Joy Division and New Order. Marathon 2–3 hour sets.
- **Athens history:** At least 6 appearances — EJEKT Festival (2013, 2017), Gagarin 205, Death Disco Open Air Technopolis (Sept 2025). One of Athens' most frequent returning post-punk visitors.
- **Confidence:** Tier 1. **Last verified:** 2026-02-25

#### Anne Clark
- **Slug:** anne-clark
- **Role:** Spoken word, poetry over electronic music (never sings)
- **Genre:** Spoken word/electronic, darkwave, proto-house
- **Based:** Norfolk, England
- **Key facts:** Pioneer of spoken-word music. "Our Darkness" (1984) among 20 best industrial records (Fact). Has songs titled "Athens" and "Acropolis" (1995).
- **Athens history:** 4+ appearances including Dec 20, 2008 — Gagarin 205; Sept 21, 2025 — Death Disco Open Air, Technopolis. Two songs named after Athens landmarks.
- **Confidence:** Tier 1. **Last verified:** 2026-02-25

#### The Chameleons
- **Slug:** the-chameleons
- **Role:** Band — vocals/bass (Mark Burgess), guitars, drums
- **Genre:** Post-punk, atmospheric rock — delay-drenched "sonic cathedrals"
- **Based:** Middleton, Greater Manchester, England
- **Key facts:** Cited as influence by Oasis, Interpol, The Verve, Slowdive. Arctic Moon (Sept 2025) = first album in 24 years.
- **Athens history:** Feb 8, 2020 — Gagarin 205. Sept 21, 2025 — Death Disco Open Air, Technopolis.
- **Confidence:** Tier 1. **Last verified:** 2026-02-25

### Rock / Metal (International)

#### Chelsea Wolfe
- **Slug:** chelsea-wolfe
- **Role:** Vocals, guitar
- **Genre:** Gothic rock, doom folk, darkwave — genre-fluid dark artist
- **Based:** Sacramento / Los Angeles, USA
- **Key facts:** Bridges underground extreme music and mainstream. Converge collaboration (Bloodmoon). Smoke The Fuzz is her exclusive Athens promoter.
- **Athens history:** April 29, 2017 — Piraeus 117 Academy (Smoke The Fuzz Fest). Nov 18, 2024 — Gagarin 205.
- **Confidence:** Tier 1. **Last verified:** 2026-02-25

#### Dark Funeral
- **Slug:** dark-funeral
- **Role:** Band — guitars (Lord Ahriman, founding), vocals, bass, drums
- **Genre:** Swedish black metal (second wave)
- **Based:** Stockholm, Sweden
- **Key facts:** Definitive Swedish black metal. 30+ years anchored by Lord Ahriman.
- **Athens history:** Sept 22, 2024 — Gagarin 205 (rescheduled from March 2024).
- **Confidence:** Tier 1. **Last verified:** 2026-02-25

#### Leprous
- **Slug:** leprous
- **Role:** Band — vocals/keys (Einar Solberg), guitars, bass, drums
- **Genre:** Progressive metal, art rock — evolved from technical metal
- **Based:** Notodden, Norway
- **Key facts:** "Redefined progressive metal for the 21st century" (Apple Music). Now selling two consecutive Gagarin 205 nights.
- **Athens history:** Nov 2011, March 2023, Jan 31 & Feb 1 2026 — all Gagarin 205. Two-night stand = growing demand.
- **Confidence:** Tier 1. **Last verified:** 2026-02-25


## Section 5B: Athens Electronic Labels

| Label | Key Artists | Sound | Notes |
|-------|-------------|-------|-------|
| **Modal Analysis** | ANFS, 3.14, Kondaktor | Industrial techno, electro, experimental | Intellectual spine of Athens' darker sounds |
| **Vanila Records** | ANFS (founder), Sawf, Morah | "Sound, blasphemy, and anomaly" | vanilarecs.bandcamp.com |
| **Pi Electronics** | 3.14 (founder), BMSK, DΛS | Dark/industrial techno, electro | Berghain Säule showcase |
| **VLCT Records** | Velocity residents | Hard/rave techno | Velocity Collective's label arm |
| **Deep Phase Records** | Mikee, Tech1ne | Detroit/Chicago-influenced techno/house | Blend Athens adjacent |
| **Phormix** | Morah (founder) | Industrial, EBM | Label + podcast + events |
| **Koslif** | Atypikal | Deep/hypnotic techno | Sublabel of Cosmicleaf Records |
| **Academeia** | Keeptress, Atypikal, Xyro | Hypnotic techno, modular | Copenhagen/Athens/Berlin |

---

# SECTION 6: PRICING REFERENCE

## Entry by Venue Type
| Type | Entry | Notes |
|------|-------|-------|
| Standard bars | Free - â‚¬5 | |
| Gazi clubs | â‚¬10-20 | Often includes one drink |
| SMUT/Astron | â‚¬10-20 | |
| Romantso | Free - â‚¬9 | Budget entry point |
| Six D.O.G.S. | â‚¬8-10 | â‚¬8 with wallet app |
| Live music | Ticket + first drink sometimes | |
| Concert tickets | â‚¬15-50 | Depends on act |
| Beach clubs | â‚¬6-160+ | Bolivar budget, Astir premium |

## Drinks
| Type | Price |
|------|-------|
| Domestic beer | â‚¬4-5 |
| Cocktails (standard) | â‚¬8-12 |
| Cocktails (premium/craft) | â‚¬12-15+ |
| Bios cocktails | â‚¬9 (noted as pricey) |
| Astron beer | â‚¬5 (Alfa only) |

## Bouzoukia (Mandatory for tables)
| Item | Price |
|------|-------|
| Bar entry | â‚¬20-30 (includes one drink, no seat guarantee) |
| Whisky/vodka bottle | â‚¬120-200 (serves 4-6) |
| Premium bottle | â‚¬230-300 |
| Minimum spend/person | â‚¬150-250 |
| Flower trays | â‚¬20+ each |

---

# SECTION 7: TIMING PATTERNS

## When Venues Fill
| Venue Type | Peak Time |
|------------|-----------|
| Gazi clubs | **2am** on weekends |
| Rebetiko | After **22:00** |
| AN Club/punk | Bands after **22:00** |
| Bouzoukia headliners | After **midnight** |

## Concert Timing
| Phase | Time |
|-------|------|
| Doors | 19:00-20:00 |
| Headliner | 21:30-22:00 |

## Gazarte Timing
| Phase | Time |
|-------|------|
| Doors | 20:00-21:00 |
| Music | ~21:30 |

---

# SECTION 8: TRANSPORT

## Metro Lines
| Line | Color | Key Stops |
|------|-------|-----------|
| M1 | Green | Piraeus, Thissio, Monastiraki, Victoria |
| M2 | Red | Akropoli, Syngrou-Fix, Neos Kosmos, Omonoia |
| M3 | Blue | Monastiraki, Syntagma, Kerameikos, Airport |

## Last Trains
| Day | Time |
|-----|------|
| Weekdays | ~00:15 |
| Fri/Sat/Sun | 01:30-02:00 |
| **Saturday Lines 2&3** | **24-HOUR SERVICE** |

## Taxis
| Info | Details |
|------|---------|
| Uber | Uber Taxi only (UberX banned 2018) |
| Preferred app | FreeNow (â‚¬1.20 surcharge/ride) |
| Syntagma to Gazi | â‚¬8-12 |
| Center to Vouliagmeni | â‚¬35-50 |
| Airport (day) | â‚¬40 fixed |
| Airport (night) | â‚¬55 fixed |

## General
- Central Athens is very walkable. Syntagma to Monastiraki 10 min, to Gazi 20 min, to Exarchia 15 min.
- Parking difficult and expensive in center. Don't recommend driving to events.
- Taxi surge after midnight, especially Fri/Sat. Saturday 24-hour metro on Lines 2 & 3 is a game-changer.

## Athens Tram (Riviera Access)
- Tram line runs Syntagma → Neos Kosmos → Alimos → Glyfada → Voula
- Key stops for nightlife: Kalamaki (Bolivar, Akanthus), Loutra Alimou (Lohan Seaside), Kolymbitirio (Asteria Glyfada)
- **Saturday 24-hour service** — tram runs overnight every ~25 min. Game-changer for Alimos/Glyfada venues.
- Terminates at Voula. NO tram to Vouliagmeni or Varkiza — taxi only south of Voula.
- Night bus 790 connects Glyfada to metro network (every 55-70 min, 00:30-04:30)
- Athens Riviera: Tram serves Alimos and Glyfada. Vouliagmeni and Varkiza: taxi only. Pre-book return rides via FreeNow for 3am departures.

---

# SECTION 9: SEASONAL CALENDAR

## Winter (October - April)
- Full indoor operations
- Half Note jazz (~250 concerts per season)
- Rebetiko venues active
- Bouzoukia in central locations (Gazi, Syngrou Ave)
- Onassis Stégi main season active
- National Theatre full indoor season; Megaron season
- GNO full opera/ballet season at SNFCC
- Open-air cinemas CLOSED
- This is when Athens' music scene is at its densest.

## Summer (May - September)
- Indoor clubs CLOSE or reduce programming significantly
- Half Note jazz CLOSED. Rebetiko venues CLOSED.
- Nightlife migrates to Athens Riviera
- Bouzoukia relocate from Gazi/Syngrou to Poseidonos Avenue (Posidonio, etc.)
- Rooftop venues open, open-air cinemas open (May-October), festival circuit
- Lycabettus Theatre opens (concerts, Athens & Epidaurus Festival)
- Herodes Atticus season (Athens & Epidaurus Festival) — ⚠️ LAST SEASON 2026
- Primary destinations: Bolivar (Alimos), Island (Varkiza), Akanthus (Alimos), Astir Beach (Vouliagmeni)
- Alimos tram-strip venues accessible via Saturday 24-hour tram

- Primary summer destinations: Bolivar (underground electronic, Alimos), Island (premium electronic, Varkiza), Akanthus (mainstream/Greek live, Alimos), Astir Beach (premium beach, Vouliagmeni), Posidonio (bouzoukia, Elliniko)
- Alimos tram-strip venues (Bolivar, Akanthus) accessible via Saturday 24-hour tram service — the only Riviera venues with reliable late-night public transport
- Bouzoukia migrate from Gazi/Syngrou to Poseidonos Avenue (Posidonio, Frangelico, etc.)
- Akanthus is the only Riviera music venue with year-round programming (winter Gazi location)

## Key Festivals
- **Athens & Epidaurus Festival** (Juneâ€“August): Dominates summer cultural calendar. Odeon of Herodes Atticus is the headline venue. Tickets via TicketServices.gr.
- **Death Disco Open Air** at Technopolis (September): 2025 â€” Peter Hook & The Light, Anne Clark, The Chameleons
- **Athens Rebetiko Festival** (October): â‚¬10 presale / â‚¬12 door
- **Death Disco Indoor Festival** at Fuzz (Nov-Dec): â‚¬35-40 daily, â‚¬65-70 weekend

## Other
- **Christmas/New Year:** Special programming across venues. Ticketed events sell out early.
- **Orthodox Easter:** Some venues close for the holy week. City empties slightly as Athenians travel to islands/villages.

---

# SECTION 10: PAYMENT

Cards mandatory since April 2024 (terminals required by law). BUT: carry â‚¬100-150 cash for nightlife â€” some venues still prefer or effectively require it.

---

# SECTION 11: DOOR POLICIES

| Venue | Policy |
|-------|--------|
| **SMUT** | STRICT â€” creative/fetish attire required many events |
| **Astron** | Berlin-lite â€” singles > groups, "look like you dance" |
| **AUX** | Inclusive â€” "come as you are" |
| **Six D.O.G.S.** | Relaxed |
| **Romantso** | Extremely relaxed |
| **Temple** | Some selection on big nights |
| **High-end bouzoukia** | Table reservations > guest lists |
| **Exclusive beach clubs** | Smart casual minimum, mixed groups preferred |

### General Guidance
- Smart casual to semi-formal works everywhere
- Shorts, sneakers, athletic wear fail at upscale venues
- Mixed-gender groups receive preferential treatment at selective venues

---

# SECTION 12: REBETIKO AUTHENTICITY MARKERS

### Signs of Authenticity
- Acoustic instruments only (bouzouki, guitar, violin, contrabass)
- Audience primarily Greek
- Hidden or unmarked entrance
- Smoking allowed
- Music starting after 22:00
- No English menus

### Signs of Tourist Trap
- **If plates are breaking = tourist performance**
- English menus prominent
- Touts outside
- Music before 21:00
- Amplified instruments

---

# SECTION 13: INFORMATION SOURCES

## Essential Monitoring
| Source | Purpose |
|--------|---------|
| @clubber.gr | Main scene hub since 2005 |
| @athens.rave.culture | Underground focus, 24K followers |
| Resident Advisor Athens | Electronic listings |
| Clubber.gr/events | Comprehensive listings |
| Individual venue Instagram | Most reliable for announcements |
| Athinorama | Greek-language, publishes Thursdays |
| thisisathens.org | Best official English coverage |

## Ticketing
| Platform | Coverage |
|----------|----------|
| more.com (formerly Viva.gr) | Main platform â€” Gazarte, Gagarin, Fuzz, Floyd |
| TicketServices.gr | Festivals (Athens Epidaurus) |
| Resident Advisor | Electronic events, SMUT tickets |

## Exhibition & Gallery Event Sources
| Source | What | Check Frequency |
|--------|------|-----------------|
| currentathens.gr | Best source for all Athens contemporary art exhibitions | Weekly |
| artsceneathens.com | Blog covering gallery openings | Weekly |
| photofestival.gr | Athens Photo Festival (biennial, even years) | Monthly |
| benaki.org | Benaki Museum exhibitions and events | Monthly |
| emst.gr | EMST exhibitions and events | Monthly |
| onassis.org | Onassis Stégi program | Monthly |
| cycladic.gr | Museum of Cycladic Art | Monthly |

## Tech Community Sources
| Source | What | Check Frequency |
|--------|------|-----------------|
| Meetup.com (Athens + tech) | Broadest coverage of recurring meetups | Weekly |
| AthTech.org | Developer meetup directory | Monthly |
| Athens Tech Circle newsletter | Curated ecosystem view | Weekly |
| lu.ma (Athens) | Founder + Web3 events | Weekly |

## Startup Event Sources
| Source | What | Check Frequency |
|--------|------|-----------------|
| panathenea.org | Panathēnea Festival — speakers, program, pitch applications | Monthly (weekly from March) |
| doerssummit.com | Doers Summit Athens — tickets, speakers, startup applications | Monthly (weekly from August) |
| theegg.gr/en | egg accelerator — Investor Day, Innovation Summit, cohort pitches | Monthly |
| eurobank.gr/en/group/grafeio-tupou | Eurobank press releases about egg events | Monthly |
| endeavor.org.gr/events | Endeavor Greece events, Innovation Summit | Monthly |
| startupgrind.com/athens | Startup Grind Athens fireside chats | Monthly |
| thefoundation.gr | Found.ation events, workshops, demo days | Monthly |
| orangegrove.eu | Orange Grove workshops, demo days | Monthly |
| vestbee.com/events-list | European startup events aggregator (filter: Athens/Greece) | Monthly |
| hellenic.org/all-events | Hellenic Innovation Network diaspora events | Monthly |
| elevategreece.gov.gr | Government startup programs, announcements | Quarterly |
| lu.ma (Athens + startup) | Community-organized startup events | Weekly |

---

# SECTION 14: SHOW-DON'T-TELL QUICK REFERENCE

| Instead of this (telling) | Write this (showing) |
|---------------------------|----------------------|
| "excellent sound quality" | "The bass hits your chest before you consciously hear it" |
| "authentic experience" | "Someone at the next table is mouthing the words without realizing it" |
| "great atmosphere" | "By 2am the room has reorganized itself around whoever's dancing hardest" |
| "popular venue" | "Regulars who've followed this collective through three venue changes" |
| "diverse crowd" | "Greek conversations mixing with English, the occasional burst of French" |
| "intimate setting" | "Close enough to the stage that you can hear the guitarist's pick on the strings" |
| "energetic performance" | "Three songs in, nobody's sitting anymore â€” including the people who came for dinner" |
| "beautiful location" | "The Acropolis lit up behind the stage, which is exactly the reason they put the stage there" |
| "great pitch competition" | "The founder who won last year's competition closed a seed round in the hallway before the closing party" |
| "top investors present" | "Sequoia, Index, and Atomico all have partners in the room — not associates, partners" |
| "supportive ecosystem" | "The mentor assigned to your team exited his own company for €50M three years ago" |
| "international event" | "Name badges from 44 countries, and the conversations switch between Greek, English, and French mid-sentence" |
| "valuable networking" | "By the second coffee break, you've exchanged more term sheet stories than LinkedIn connections" |
| "rising ecosystem" | "Three of the startups presenting today were in an egg cohort eighteen months ago — one just closed Series A" |

---

# SECTION 15: BANNED WORDS

These words signal lazy writing. Finding the specific detail is always better.

**Absolutely banned:** amazing, incredible, unique, vibrant, stunning, breathtaking, unforgettable, world-class, must-see, hidden gem

**Use with extreme caution (almost always better alternatives exist):** authentic, iconic, legendary, renowned, prestigious, exclusive, eclectic, bohemian, bustling, charming

**The test:** If the word works for ANY event at ANY venue, it's too generic. Find what's specific to THIS event in THIS room.

---



# SECTION 16: BILINGUAL CONVENTIONS

## Artist Name Storage

When adding artist profiles to Section 5, store names as follows:

| Field | Format | Example |
|-------|--------|---------|
| **Display name** | Latin transliteration (as professionally used) | Christos Thivaios |
| **Greek name** | Greek script (for source matching) | Χρήστος Θηβαίος |
| **Slug** | Lowercase, hyphenated Latin | christos-thivaios |
| **Name variants** | All known Latin and Greek variations | Hristos Thivaios, Θηβαίος Χ. |

## Transliteration Conventions

When no established Latin transliteration exists, follow these patterns:

| Greek | Latin | Notes |
|-------|-------|-------|
| Χ (chi) | Ch | Christos, not Hristos (unless artist uses H) |
| Θ (theta) | Th | Thivaios, not Tivaios |
| Γ (gamma) | G (before a, o, u) / Y (before e, i) | Georgios, Yiannis |
| ΟΥ (omicron-upsilon) | Ou | Ouranou |
| ΑΙ (alpha-iota) | Ai or E | Follow artist's own usage |
| ΕΙ (epsilon-iota) | Ei or I | Follow artist's own usage |

**Priority:** If the artist has an established Latin spelling (on their website, Spotify, Bandcamp, Resident Advisor), use that. Don't "correct" an artist's preferred transliteration.

## Song Title Handling

In descriptions: Latin transliteration only ("Vrochi Mou")
In database/entity storage: Both Latin and Greek ("Vrochi Mou" / "Βροχή Μου")

---

# SECTION 17: GEO WRITING STRATEGY

## The Core Equation

```
enrichment quality × structured data completeness × freshness = citability
```

You control **enrichment quality**. Every description you write directly populates:
- The Schema.org `description` field in JSON-LD (read by all AI engines)
- The `og:description` meta tag
- The `<meta name="description">` tag (first 150 chars of your enrichment replace the template)

Your opening sentence is literally the most visible piece of text about this event to every AI engine on the internet.

## What Happens After You Write

Your enrichment automatically flows through the infrastructure:

1. **Schema.org JSON-LD** `description` field → read by all AI engines
2. **`<meta name="description">`** → first ~150 chars of your enrichment replace the programmatic template
3. **`og:description`** → used by social previews and some AI engines
4. **Hub page event blocks** → your enrichment populates the "What is it? / Why it matters / What to expect" section
5. **Translation pipeline** → DeepL translates your English enrichment to Greek (or vice versa)

One enrichment session creates value across 5+ surfaces. The infrastructure multiplies your work automatically.

## Enrichment Priority Order

When choosing what to enrich next:

1. **Exhibitions** — longest active window = highest ROI per enrichment session
2. **Festivals** — parent pages first, then headline sub-events
3. **Kids/family** — growing family travel segment, underserved by competitors
4. **Concerts** — prioritize rebetiko, classical, jazz, Greek folk over mainstream
5. **Theater** — ancient drama at historical venues first
6. **Cinema** — last priority (strong competitor coverage from IMDB, Letterboxd)

Within each category, prioritize events that:
- Are currently live or upcoming (not past)
- Have longer remaining duration
- Are at major venues (Megaron, SNFCC, Onassis Stegi, Benaki, National Theatre, Herodion)

## Mandatory Hyperlocal Fields (Every Enrichment)

These fields are required for E-E-A-T compliance and must appear in every enrichment, regardless of event type:

1. **Neighborhood name** — Plaka, Kolonaki, Monastiraki, Gazi, Exarchia, Psyrri, Koukaki, Pangrati, Metaxourgeio, Petralona, Thiseio, Neos Kosmos, Kifisia
2. **Nearest metro station** — practical info that proves local expertise
3. **At least one "insider" detail** — something not available from the source listing (e.g., "arrive 30 minutes early for unreserved seating on the terrace" or "the museum's ground-floor cafe serves the best freddo in Kolonaki")

These three things separate agent-athens from any generic event aggregator.

## Verified Statistics Bank

Pre-researched and source-verified. Use these in enrichments and hub pages:

| Statistic | Source Context |
|---|---|
| Acropolis Museum: 2M visitors (2024) | Museum annual report |
| Athens: 8M foreign visitors (2024) | Tourism ministry data |
| SNFCC: 3.2M annual visits | SNFCC annual report |
| 65 open-air cinemas in Athens | Cultural survey |
| World Travel Awards: Cultural City 4 consecutive years | Award records |

Add to this bank as new verified statistics are discovered during research.

## Freshness Matters

Content updated within 30 days receives 3.2x more AI citations than content older than 90 days. This reinforces the priority order — exhibitions with their 8x searchability window get the most value per enrichment session. Enrichments should be treated as **living content**, not write-once assets. When an exhibition extends its dates, when a festival announces new headliners, or when venue details change — update the enrichment. The content-hash system will automatically update the page's freshness signals.

## Section Length for AI Citation

Keep sections between 120-180 words for optimal AI citation pickup. For longer enrichments (exhibitions, festivals), break into the three-part structure or the full 8-section structure rather than writing one continuous paragraph. 70% more ChatGPT citations occur at this section length versus longer blocks.

## Hub Page Editorial Content

When writing hub page editorial (the static content for `/concerts`, `/exhibitions`, etc.), follow the 5-part template:

1. **Answer capsule** (40-60 words) — directly answering "What are the best [category] events in Athens?"
2. **Comparison table** — name, venue, date, category, price, editor's pick (structured data, not prose)
3. **Event blocks** — using the three-part "What / Why / What to expect" pattern with attributed quote per block
4. **FAQ section** — 4-5 questions from the pre-researched question bank (these get FAQPage schema)
5. **Seasonal narrative** — 200-400 words of genuine seasonal context, updated quarterly

**Key metrics for hub editorial:**
- Include a statistic every 150-200 words
- Target 19+ data points per hub page
- 20%+ proper noun density
- 1,500-2,500 words total (ceiling, not floor)
- Q&A is the best-performing GEO format — the FAQ section is critical

---

*This file grows. Every event you write teaches you more about Athens. Add venue details, artist profiles, neighborhood insights, and transport logistics as you discover them. The richer this file gets, the stronger every description becomes.*
