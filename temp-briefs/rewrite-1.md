# Rewrite Brief — Batch R1

## VERIFICATION CHECKLIST
- This is Rewrite Batch R1
- Event IDs: 0fdda85246671831, 12663b972c36ee87, 12a636c21c029493, 1504103a5eb31ba1, 161db7297a22697b
- Write descriptions to: temp-descriptions/rewrite-1/
- BEFORE writing any file, verify the event ID appears in this list
- DO NOT omit --batch-dir= from write commands.

You are REWRITING event descriptions that failed quality gates for Agent Athens.
Each event below has an existing description with specific issues flagged.

## Rules

1. **8-section structure**: Sensory opening → Credentials → Tribe → Details table → Experience → Filter → Logistics → Closer
2. **Voice**: Second person ("you"), present tense, sensory-first.
3. **Word count**: Per-event target shown below. Hard constraints.
4. **Show don't tell**: No lazy adjectives — legendary, immersive, iconic, captivating, mesmerizing, breathtaking, enchanting, amazing, incredible, fantastic, wonderful, stunning, vibrant, extraordinary, exceptional, world-class, phenomenal, remarkable
5. **No speculation**: Never write "likely", "perhaps", "probably", "promises to", "the show will". State only verified facts.
6. **CRITICAL: Do not fabricate information.**
7. **Terminology**: Use "open" not "free". Latin transliteration for Greek names in prose.
8. **Description only**: No tags, no metadata beyond Aspect/Details table.

## REWRITE INSTRUCTIONS

For each event:
- **Read the existing description** and the **gate failures** listed below
- **Preserve accurate factual content** (dates, prices, venue details, verified credentials)
- **Fix ALL flagged issues** — replace speculation with facts, remove lazy adjectives, fix entity locking
- **Tighten anything generic** while preserving the description's structure and voice
- **Do not introduce new speculation** to replace removed speculation — omit if you can't verify
- The rewritten description MUST pass all quality gates with 0 errors

## Exemplars (read for structural guidance)

- `exemplars/classical-lpo-jarvi.md`
- `exemplars/exhibition-swinton.md`
- `exemplars/festival-sonic-sisters.md`

## Anti-patterns

Read `docs/enrichment-anti-patterns.md` for confirmed mistakes to avoid.

## Entity Locking (English Descriptions)

These terms MUST remain untranslated in English descriptions:
- **Music genres**: rebetiko, rembetika, laiko, laika, entechno, nisiotika, dimotika, amanedhes, zeibekiko, tsifteteli, hasapiko, syrtos, kalamatianos, mandinades
- **Instruments**: bouzouki, baglamas, tzouras, oud, kanun, lyra, santouri, laouto
- **Venue types**: bouzoukia, steki, ouzeri, mezedopoleio, kafeneio, taverna, psistaria
- **Cultural concepts**: kefi, meraki, filotimo, parea, glendi, panigiri, kouventa

---

## Events to Rewrite

### Δημήτρης Κόψης (REWRITE)
- **ID**: 0fdda85246671831
- **Type**: concert
- **Venue**: ΕΞΑ - ΑΘΗΝΑ
- **Price**: paid
- **Date**: 2026-03-16
- **Time**: 21:30
- **URL**: https://www.ticketservices.gr/event/13539/
- **Source**: ticketservices
- **Category**: concert_local
- **Target words (English)**: 80-120
- **Structure**: three-part-block
- **Tier**: stub

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> The smoke curls through colored lights, catching the energy before you hear the first note. The room at EXA-ATHINA has that packed anticipation of a crowd that knows exactly who they came for. You feel the collective breath, the moment before everything starts.
> 
> Dimitris Kopsis takes the stage to deliver the kind of Greek contemporary music that lives between laiko tradition and modern production. His voice carries the emotional weight that Greek popular music demands — not just singing but conveying, not just performing but meaning it. The material connects with audiences who grew up hearing these sounds on family car radios and in summer tavernas.
> 
> Kopsis has built his following through songs that resonate with Greek experience. The lyrics speak to love, loss, longing — universal themes filtered through distinctly Greek sensibility. Live, the arrangements take on new force. The band behind him knows when to push and when to hold back, creating space for his voice to operate at its emotional peak.
> 
> EXA-ATHINA provides the scale this show requires. The venue handles larger crowds without sacrificing intimacy — the sound system reaches every corner, but the room feels connected rather than divided. When Kopsis hits the emotional crescendos, the response comes from everywhere at once.
> 
> The crowd fills with Greeks who know these songs from their lives. You hear lyrics sung back before the performer delivers them. The energy operates on recognition — not discovery but reunion with music that already matters. For visitors, it's witnessing Greek popular culture from the inside, seeing what songs mean when they're more than entertainment.
> 
> Greek concert nights run on their own schedule. The show starts when the room is ready, which means don't arrive expecting punctuality. The warm-up extends, the anticipation builds, and when the main act finally appears, the release is worth the wait. Use the early hours to absorb the atmosphere, to understand what you're part of.
> 
> If you need lyrics you can understand or sounds that translate without context, Kopsis's deeply Greek material may keep you at a distance. The connection requires either language or willingness to experience emotion through melody rather than meaning. But if you've been curious about what moves Greek audiences today, what fills venues and generates the sing-along energy — this is that music, delivered at its source.
> 
> | Info | Details |
> |------|---------|
> | **Date** | Monday, March 16, 2026 |
> | **Venue** | EXA-ATHINA |
> | **Type** | Concert |
> | **Language** | Greek |
> | **Audience** | Greek popular music enthusiasts |
> | **Tickets** | Check venue |
> 
> Dimitris Kopsis at EXA-ATHINA — Greek contemporary music performed for people who carry these songs in their hearts.

**GATE FAILURES TO FIX:**
- `EN_ENTITY_LOCK_VIOLATION`: "popular music" should stay as "laiko" (Entity Locking rule)

**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.


### Dimitria Kalantzis Quartet (REWRITE)
- **ID**: 12663b972c36ee87
- **Type**: concert
- **Venue**: Half Note Jazz Club
- **Price**: with-ticket
- **Date**: 2026-12-04T21:30:00+03:00
- **URL**: https://www.athinorama.gr/music/gig/dimitria_kalantzis_quartet-10088286/
- **Source**: athinorama.gr
- **Category**: concert_major
- **Target words (English)**: 120-200
- **Structure**: hybrid
- **Tier**: standard

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> The Half Note's lighting is perfect: just enough to see the musicians' hands, not enough to feel observed. Dimitria Kalantzis Quartet arrives like they've played this room before and love what it can do. The first phrase out of her cello tells you everything about her intelligence.
> 
> Kalantzis leads a project that sounds rooted in jazz tradition but thinks beyond it. Her composition work is intricate without being decorative. The quartet—cello, piano, bass, drums—creates a conversation where every instrument has an idea. The drummer isn't timekeeping; the bassist isn't accompanying. Everyone's thinking.
> 
> This is jazz that respects the tradition enough to risk changing it. The musicians know what came before well enough to ask it to mean something new.
> 
> You'll sit with Half Note regulars, musicians tracking what's happening in contemporary jazz, people who've heard the quartet and came back. The crowd respects what's being attempted. That respect creates permission to go into unexpected places.
> 
> The set unfolds through compositions that build on each other. Early pieces establish the quartet's language. Middle section deepens into complexity—you hear arrangements that surprise even the musicians. Final sequences often arrive through improvisation, which is where the actual conversation happens. The audience becomes part of the sound-making; your attention shapes what emerges.
> 
> | Aspect | Details |
> |--------|---------|
> | **Setting** | Half Note Jazz Club, 70-100 capacity, legendary acoustics |
> | **Vibe** | Sophisticated, serious, technically accomplished, present |
> | **Format** | Contemporary jazz quartet, ~70 minutes |
> | **Doors** | Walk-in friendly, no door policy; arrive early for good tables |
> 
> If you need straightforward jazz standards or background music for dinner, this will demand your full attention. But if you want to sit in one of Athens's most respected jazz spaces while musicians ask real questions about what the tradition can become—if you trust your own ear to follow improvisation as it develops—this is exactly where you belong.
> 
> | Info | Details |
> |------|---------|
> | **Date** | Thursday, December 4, 2026 |
> | **Doors** | 21:30 |
> | **Performance starts** | ~21:50 |
> | **Duration** | ~70 minutes |
> | **Price** | €20 advance / €25 door (drink minimum €5) |
> | **Tickets** | Half Note website or door |
> | **Address** | 34 Trivonianou Street, Mets |
> | **Getting there** | Syngrou-Fix metro, 10-minute walk |
> | **Last metro** | 23:28 (show ends ~22:50) |
> | **Payment** | Cards and cash |
> | **Good to know** | Reserve tables ahead; the space fills; Half Note's history is audible in the walls |

**GATE FAILURES TO FIX:**
- `LAZY_ADJECTIVES`: Remove lazy adjectives: perfect, legendary

**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.

**Venue intel:**
```
### Half Note Jazz Club
| Field | Data |
|-------|------|
| **Address** | Trivonianou 17, Mets |
| **Metro** | Akropoli (Red), then 10-min walk |
| **Capacity** | ~200 |
| **Entry** | Table €15-20, bar €10-15, special acts up to €51 |
| **Season** | OCTOBER - MAY ONLY (closed summer) |
| **Concerts** | ~250 per season |
| **Reservations** | ESSENTIAL — book ahead, confirm same day, arrive 20 min early or lose seat 15 min after start |
```

### ΓΙΑΝΝΗΣ ΧΑΡΟΥΛΗΣ (REWRITE)
- **ID**: 12a636c21c029493
- **Type**: concert
- **Venue**: Σταυρός του Νότου
- **Price**: tba
- **Date**: 2026-03-05
- **URL**: https://www.more.com/gr-el/tickets/music/giannis-xaroulis-stauros-tou-notou/
- **Source**: more.com
- **Category**: concert_major
- **Target words (English)**: 120-200
- **Structure**: hybrid
- **Tier**: standard

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> Giannis Charoulis at Stavros tou Notou is a four-night concert residency in Neos Kosmos, running every Thursday in March — his first appearance on this stage in thirteen years. The laouto cuts through conversation before you see the stage, and three hundred people fall quiet at once.
> 
> Born in Heraklio and raised in Exo Lakonia in Crete's Lassithi region, Charoulis learned mandolin from his father at six and picked up the laouto soon after. By fifteen he was playing professionally at Cretan festivals. His Athens debut came in 2002 at Lycabettus Theatre, singing in a concert honoring Nikos Xylouris — the Archangel of Crete. The recording became the album Otan Erthoun oi Filoi mou, Mana in 2003 and launched a career spanning five studio albums, a gold record for Magganies in 2012, and a live album — Hilia Kalos Esmixame — that entered the Greek charts at number one. He has shared stages with Mikis Theodorakis, Stavros Xarchakos, Dionysis Savvopoulos, and Nana Mouskouri. He plays roughly a hundred shows a year, but it is the small rooms where the architecture of his music reveals itself.
> 
> What happens inside a Greek traditional music night cannot be separated from what the audience brings. When Charoulis drops into a Cretan rizitiko or a mantinada, voices rise from the tables unprompted. Palms strike tabletops in time. Someone will stand. The line between performer and listener has never been clearly drawn — the music exists in the space between the stage and the crowd, completed only when the room participates.
> 
> Stavros tou Notou is a multi-level music hall at Frantzi and Tharypou 37 in Neos Kosmos — balcony seating, non-smoking, Cretan folk roots meeting entechno orchestration and rock energy. The ensemble is seven musicians deep: Lefteris Andriotis on lyra, Giorgos Dousos on woodwinds, Vassilis Nissopoulos on bass, Sotiris Mavronasios on drums, Alekos Voulgarakis on guitar, Christos Spiliopoulos on trombone, and Tassos Valkanis on trumpet. That brass section is the tell. Charoulis has always pushed Cretan tradition outward, layering it with rock dynamics and orchestral weight, building arrangements that honor the roots while refusing to museum-piece them.
> 
> If you want a polished pop concert with fixed choreography and predictable setlists, this is the wrong room. But if you want to hear what happens when one of Crete's most accomplished musicians returns to a stage small enough to see the calluses on his fretting hand, with a crowd that knows every word and has no intention of staying quiet — this is your Thursday.
> 
> Stavros tou Notou is a five-minute walk from Syngrou-Fix metro. Doors open at 20:30, music at 21:00. Tickets are seventeen euros through more.com. Four Thursdays: March 5, 12, 19, and 26.
> 
> Thirteen years since he last stood on this particular stage. Four nights to make up for it.

**GATE FAILURES TO FIX:**
- `EN_ENTITY_LOCK_VIOLATION`: "music hall" should stay as "bouzoukia" (Entity Locking rule)

**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.


### Jazz στο Μουσείο: Idylle Piano Trio – «Μουσική δωματίου με το Idylle Piano Trio» (REWRITE)
- **ID**: 1504103a5eb31ba1
- **Type**: concert
- **Venue**: Μουσείο Γουλανδρή
- **Price**: with-ticket
- **Date**: 2026-04-03T20:00:00+03:00
- **Time**: 20:30
- **URL**: https://www.viva.gr/gr-el/tickets/music/jazz-sto-mouseio-idylle-piano-trio/
- **Source**: more.com
- **Category**: concert_local
- **Target words (English)**: 80-120
- **Structure**: three-part-block
- **Tier**: stub

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> The piano phrase enters the gallery space and the sculptures seem to lean closer. You're standing in the Goulandris Museum, surrounded by art that spans centuries, waiting for jazz that spans continents. The Idylle Piano Trio is about to prove why museums and music belong together.
> 
> Jazz at the Museum has established itself as the series that brings improvised music into spaces designed for visual contemplation. Tonight's program continues that mission, placing a piano trio in dialogue with the permanent collection. The Idylle Piano Trio brings their sound into this conversation, the interplay between players enhanced by the interplay between music and art.
> 
> What happens when jazz enters a museum differs from what happens in a club. The acoustics reward subtlety rather than volume. The audience listens with the attention they bring to artwork, that focused engagement that museums cultivate. The musicians respond to this attention, adjusting their dynamics to the space.
> 
> The Goulandris Museum provides exceptional context. The collection includes works by Cezanne, Van Gogh, Picasso, alongside significant Greek modernists. The architecture creates spaces that flow into each other, the music reaching listeners positioned among masterworks. When the trio finds a groove, it becomes soundtrack to visual contemplation.
> 
> The audience for Jazz at the Museum blends constituencies. You'll find museum regulars curious about musical programming, jazz devotees willing to hear familiar forms in unfamiliar settings, and culturally curious visitors drawn by the unusual combination. The dress code suggests something between gallery opening and concert hall.
> 
> The piano trio format offers jazz at its most transparent. Each player is exposed, every choice audible. The Idylle Piano Trio works within this exposure with the confidence of experienced collaborators, their interplay suggesting years of shared stages.
> 
> If you need the energy of a proper jazz club, the Goulandris will feel too contemplative. This is jazz for sitting with, not dancing to. But if you're ready to hear improvised music in conversation with visual art, to experience what happens when two forms of attention meet, you find your way to the museum.
> 
> | Info | Details |
> |------|---------|
> | **Date** | Friday, April 3, 2026 |
> | **Venue** | Goulandris Museum, Athens |
> | **Price** | Check museum |
> | **Getting there** | Check museum website |
> 
> Jazz at the Museum: where the ears and eyes share attention.

**GATE FAILURES TO FIX:**
- `LAZY_ADJECTIVES`: Remove lazy adjectives: exceptional

**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.


### «Μεγάλες Κυρίες τραγουδούν…» (REWRITE)
- **ID**: 161db7297a22697b
- **Type**: concert
- **Venue**: Το Τρένο στο Ρουφ
- **Price**: with-ticket
- **Date**: 2026-12-04T20:30:00+03:00
- **URL**: https://www.athinorama.gr/music/gig/megales_kuries_tragoudoun-10083518/
- **Source**: athinorama.gr
- **Category**: concert_local
- **Target words (English)**: 80-120
- **Structure**: three-part-block
- **Tier**: stub

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> The venue is literally a train car. You walk through a conductor's cabin and into a dining space that moves. The music starts—and the space moves with it, intimate and impossible and completely real.
> 
> "Μεγάλες Κυρίες τραγουδούν…" (Great Ladies Sing...) is cabaret theater that takes the Orient Express setting seriously. The performers—voices trained in different traditions, some classical, some theatrical—move through the carriage as though traveling together. The set moves. The audience moves with it. Music becomes an experience of displacement, which is exactly what a train should produce.
> 
> This is theater that understands nostalgia as a legitimate emotion, but doesn't settle for it. The "great ladies" singing are real musicians, not caricatures. The songs span traditions: there's aria, there's chanson, there's composition written specifically for this piece. The Orient Express isn't decoration; it's the statement itself—we are moved through space by what we hear.
> 
> You'll find people here who love theatrical spectacle, who understand cabaret as an art form, who came specifically for the train experience. The crowd contains theater professionals, nostalgia tourists, and people who just trusted the concept. Everyone settles into the same generosity once the train starts moving.
> 
> The experience unfolds through stations. Early sections introduce the performers and the conceit (we are traveling together). Middle movements shift through different territories of song—classical becomes theatrical becomes contemporary. Final sequences feel like arrival, though you're still inside the car.
> 
> | Aspect | Details |
> |--------|---------|
> | **Setting** | Orient Express replica train car, 60-80 seats, mobile venue |
> | **Vibe** | Luxurious but human, theatrical, nostalgic without being kitsch, intimate |
> | **Format** | Cabaret-theater with live music, ~75 minutes |
> | **Doors** | Reservation only; arrive 15 minutes early for boarding |
> 
> If you need a traditional theater experience, this won't deliver it. The movement is the content. But if you want to sit in a moving train while trained voices take you somewhere through song—if you trust theatrical spectacle as a legitimate art form—this is where the evening lives.
> 
> | Info | Details |
> |------|---------|
> | **Date** | Thursday, December 4, 2026 |
> | **Doors** | 20:15 (boarding) |
> | **Performance starts** | 20:30 |
> | **Duration** | ~75 minutes, continuous |
> | **Price** | €65 fixed (includes one drink) |
> | **Tickets** | Reservation required via Το Τρένο στο Ρουφ |
> | **Address** | Πλατεία Αγ. Γεωργίου, Rouf |
> | **Getting there** | Rouf area, taxi recommended (€8-12 from center) |
> | **Last metro** | Varied; taxi home recommended |
> | **Payment** | Cash preferred, cards accepted |
> | **Good to know** | Mobile venue; movement is integral; arrive early for full arrival experience |

**GATE FAILURES TO FIX:**
- `LAZY_ADJECTIVES`: Remove lazy adjectives: great

**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.


---

## Execution Instructions

For EACH event:

1. **Read existing description** and understand what's being said
2. **Research**: WebSearch the event URL to verify facts. Search for any claims you're unsure about.
3. **Write rewritten description**: Save to `temp-descriptions/rewrite-1/`:
   ```bash
   bun run scripts/write-description.ts <event-id> --batch-dir=temp-descriptions/rewrite-1 "<rewritten description>"
   ```
4. **Gate check**: Validate:
   ```bash
   bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-1/<event-id>.md --tier=<tier> --event-id=<event-id> \
     --event-type=<type> --event-venue="<venue>" --event-title="<title>" \
     --event-date=<date> --event-price=<price>
   ```
5. **Gate score must be >= 85 with 0 errors** before proceeding to next event.

### Per-Event Gate Check Commands

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-1/0fdda85246671831.md \
  --tier=stub --event-id=0fdda85246671831 \
  --event-type=concert --event-venue="ΕΞΑ - ΑΘΗΝΑ" \
  --event-title="Δημήτρης Κόψης" \
  --event-date=2026-03-16 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-1/12663b972c36ee87.md \
  --tier=standard --event-id=12663b972c36ee87 \
  --event-type=concert --event-venue="Half Note Jazz Club" \
  --event-title="Dimitria Kalantzis Quartet" \
  --event-date=2026-12-04 --event-price=with-ticket
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-1/12a636c21c029493.md \
  --tier=standard --event-id=12a636c21c029493 \
  --event-type=concert --event-venue="Σταυρός του Νότου" \
  --event-title="ΓΙΑΝΝΗΣ ΧΑΡΟΥΛΗΣ" \
  --event-date=2026-03-05 --event-price=tba
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-1/1504103a5eb31ba1.md \
  --tier=stub --event-id=1504103a5eb31ba1 \
  --event-type=concert --event-venue="Μουσείο Γουλανδρή" \
  --event-title="Jazz στο Μουσείο: Idylle Piano Trio – «Μουσική δωματίου με το Idylle Piano Trio»" \
  --event-date=2026-04-03 --event-price=with-ticket
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-1/161db7297a22697b.md \
  --tier=stub --event-id=161db7297a22697b \
  --event-type=concert --event-venue="Το Τρένο στο Ρουφ" \
  --event-title="«Μεγάλες Κυρίες τραγουδούν…»" \
  --event-date=2026-12-04 --event-price=with-ticket
```

### Save Command

After all events pass gates:
```bash
bun run scripts/save-batch.ts --manifest=temp-briefs/rewrite-1.manifest.json --session=rewrite-1 --batch=R1 --clean
```
