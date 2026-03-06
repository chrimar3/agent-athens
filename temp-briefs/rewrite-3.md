# Rewrite Brief — Batch R3

## VERIFICATION CHECKLIST
- This is Rewrite Batch R3
- Event IDs: 2c666d43169ce1f6, 324e622322bf5d02, 35cad09fa2e3a921, 431979faf50c0518, 441535e02d19594d
- Write descriptions to: temp-descriptions/rewrite-3/
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

- `exemplars/theater-tartuffe.md`
- `exemplars/classical-lpo-jarvi.md`
- `exemplars/exhibition-swinton.md`

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

### Γιαγκίνηδες (REWRITE)
- **ID**: 2c666d43169ce1f6
- **Type**: concert
- **Venue**: Gazarte
- **Price**: with-ticket
- **Date**: 2026-12-04T21:00:00+03:00
- **URL**: https://www.athinorama.gr/music/gig/giagkinides_-10088259/
- **Source**: athinorama.gr
- **Category**: concert_major
- **Target words (English)**: 120-200
- **Structure**: hybrid
- **Tier**: standard

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> Gazarte at night has a specific smell—wood and electricity and people who've been dancing for hours. You arrive, and there's already something moving through the air that isn't quite music yet. It's potential. Someone's about to make it physical.
> 
> Γιαγκίνηδες (Yiagkinides) are a collective that emerged from the Greek electronic underground and never left it. What they do is rooted in club culture but refuses to stay there—the sound is dance music that doesn't always let you dance, beats that exist to complicate rhythm rather than confirm it. They've played Berghain. They've played Fabric. They know what precision sounds like at volume.
> 
> This is the kind of Athens electronic act that represents something essential about contemporary Greek music culture: rooted in local tradition, globally fluent, technically sophisticated, and uninterested in simplification.
> 
> You'll sit with devoted electronic music followers, Berlin-trained producers who made the circuit and came home, Greeks following the work, and people who just heard something was happening at Gazarte. Everyone agrees on one thing: this is about sound, not scene. Phones stay away. Attention concentrates.
> 
> Gazarte's dance floor fills as the set develops. First hour establishes the palette (precision beats, carefully chosen frequencies, no filler). Second hour builds commitment (you're inside a movement now, not watching one). Final sequences are hypnotic—everyone's moved into synchronized breathing. By 1am, the room is a single organism that Yiagkinides is guiding through territories of texture.
> 
> | Aspect | Details |
> |--------|---------|
> | **Setting** | Gazarte Ground Stage, 500+ capacity, excellent sound system |
> | **Vibe** | Technical, focused, local-favorite, intellectually engaged |
> | **Format** | Live electronic set, 90-120 minutes |
> | **Doors** | Selection policy in effect; dress appropriately |
> 
> If you need top-40 beats or club energy that feels accessible, this won't be your night. The sound is demanding. But if you want to understand what Athens electronic music sounds like when it stops trying to impress anyone and just explores—when precision becomes the content—this is where it happens.
> 
> | Info | Details |
> |------|---------|
> | **Date** | Thursday, December 4, 2026 |
> | **Doors** | 22:00 |
> | **Performance starts** | ~23:00 |
> | **Peak time** | 00:30-02:00 |
> | **Duration** | ~100 minutes |
> | **Price** | €15 advance / €18 door |
> | **Tickets** | Viva.gr or Gazarte door |
> | **Address** | 34-36 Voutadon Street, Gazi |
> | **Getting there** | Kerameikos metro, 8-minute walk |
> | **Last metro** | 23:28 (show ends 1:45am; taxi home recommended) |
> | **Payment** | Cards and cash |
> | **Good to know** | Doors is strict about dress code—avoid heavy sportswear |

**GATE FAILURES TO FIX:**
- `LAZY_ADJECTIVES`: Remove lazy adjectives: excellent

**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.

**Venue intel:**
```
### Gazarte
| Field | Data |
|-------|------|
| **Address** | Voutadon Street, Gazi |
| **Metro** | Kerameikos (Blue) |
| **Spaces** | Main Stage (major acts), Ground Stage (rock/alt), Roof Stage (Greek/jazz, Acropolis views) |
| **Capacity** | 100-400 depending on space |
| **Tickets** | €15-35 typical, €40-50 premium (via more.com, formerly Viva.gr) |
| **Doors** | 20:00-21:00 |
| **Music starts** | ~21:30 |
```

### ΑΠΟΣΤΟΛΗΣ ΜΠΑΡΜΠΑΓΙΑΝΝΗΣ Τσολιάς εν δε Τσόλια Μπαντ «ΟΠΕΚΕΜΠΛΕ» (REWRITE)
- **ID**: 324e622322bf5d02
- **Type**: concert
- **Venue**: ΣΤΑΥΡΟΣ ΤΟΥ ΝΟΤΟΥ
- **Price**: paid
- **Date**: 2026-03-18
- **Time**: 20:30
- **URL**: https://www.ticketservices.gr/event/13919/
- **Source**: ticketservices
- **Category**: concert_local
- **Target words (English)**: 80-120
- **Structure**: three-part-block
- **Tier**: stub

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> The bouzouki strings catch the light as the room settles into its rhythm. Stavros tou Notou smells of wine and warm wood, the particular atmosphere that authentic Greek music venues cultivate over decades. You've found your seat close enough to watch fingers move across frets.
> 
> Apostolis Barbayannis brings Opekemple to one of Athens' most respected stages for traditional Greek music. The group's name suggests the eclectic approach — drawing from folk traditions while refusing to be contained by them. Barbayannis leads with a voice that has absorbed the old recordings and emerged with something contemporary, anchored but not trapped.
> 
> Opekemple operates in territory that Greek music historians and adventurous listeners share. The arrangements pull from Asia Minor traditions, island songs, mainland folk — the full geographic and emotional range of Greek musical heritage. But these aren't museum pieces. The performances breathe with present-tense energy, making old material newly urgent.
> 
> Stavros tou Notou has earned its reputation through decades of hosting exactly this kind of evening. The venue understands what traditional music requires — acoustic honesty, proximity between performer and audience, a room that listens. The house sound system stays invisible, letting the instruments speak at human scale.
> 
> The crowd here knows the difference. These are listeners who've sought out the venues where tradition gets transmitted rather than merely preserved. Some remember these songs from village grandparents. Others discovered Greek folk through deliberate searching. Both groups find common ground in shared attention when the music starts.
> 
> Greek folk music at this level rewards patience. The songs unfold across extended forms, verses building on verses, instrumental passages that carry their own weight. Barbayannis knows how to guide these journeys, when to intensify and when to let the melody float. The emotional peaks earn their impact through the valleys preceding them.
> 
> If you need quick hits or obvious hooks, traditional Greek folk works at different timescales. The satisfaction here is cumulative, the beauty revealed through repetition and variation. But if you've been searching for Greek music before the synthesizers, before the production, the songs as they existed when communities sang them together — Stavros tou Notou holds that living tradition.
> 
> | Info | Details |
> |------|---------|
> | **Date** | Wednesday, March 18, 2026 |
> | **Venue** | Stavros tou Notou |
> | **Genre** | Greek folk / traditional |
> | **Setting** | Intimate traditional music venue |
> | **Season** | Winter venue (October-April) |
> | **Tickets** | Check venue |
> 
> Apostolis Barbayannis and Opekemple — Greek folk music performed where it belongs, for people who understand why it matters.

**GATE FAILURES TO FIX:**
- `EN_ENTITY_LOCK_VIOLATION`: "folk music" should stay as "dimotika" (Entity Locking rule)

**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.


### Ο ΑΝΤΩΝΗΣ ΡΕΜΟΣ ΕΡΜΗΝΕΥΕΙ ΜΙΚΗ ΘΕΟΔΩΡΑΚΗ (REWRITE)
- **ID**: 35cad09fa2e3a921
- **Type**: theater
- **Venue**: Christmas Theater
- **Price**: with-ticket
- **Date**: 2026-03-11T20:00:00+03:00
- **Time**: 20:30
- **URL**: https://www.more.com/gr-el/tickets/music/dromoi-palioi-dromoi-kainourgioi/
- **Source**: more.com
- **Category**: theater_contemporary
- **Target words (English)**: 120-180
- **Structure**: hybrid
- **Tier**: standard

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> The orchestra settles into position, the anticipation in the Christmas Theater reaching that particular tension that precedes significant performance. Two thousand seats hold breath. Antonis Remos prepares to inhabit material that belongs to another voice entirely — the songs of Mikis Theodorakis, Greece's most consequential composer.
> 
> Theodorakis shaped the soundtrack of Greek life across seven decades. His compositions carried resistance during dictatorship, gave voice to the poets Ritsos and Elytis, reached international audiences through Zorba while remaining deeply rooted in Greek musical identity. To interpret this catalog is to accept responsibility for something larger than entertainment. Remos, one of contemporary Greece's most commercially successful voices, takes on that weight tonight.
> 
> The intersection of Remos and Theodorakis might seem unlikely — the pop star meets the revolutionary composer. But Remos built his career on interpretive power, the ability to inhabit songs completely. Tonight tests whether that power extends to material that resists easy consumption, songs that demand understanding of their historical moment alongside their melodic content.
> 
> Christmas Theater provides the setting these compositions require. The venue's acoustic architecture treats orchestral music seriously, allowing the dynamics that Theodorakis built into his arrangements to register properly. When the strings swell to climax, the room contains without distorting. When a solo voice emerges from silence, the silence is complete enough to hold it.
> 
> The audience arriving tonight carries complicated relationships with this material. Older listeners remember when these songs meant something urgent, when singing Theodorakis constituted political act. Younger ones encounter the compositions as heritage, knowing they matter without having lived the context that made them matter. Remos bridges these audiences — familiar enough to the contemporary Greek music scene to draw the young, respectful enough of the source to honor those who remember.
> 
> Greek concert halls on these occasions generate energy distinct from entertainment venues. The reverence cuts with celebration — these are songs to be honored, but also songs meant to be felt. When Remos hits the phrases that everyone knows, the collective response acknowledges both the performer's achievement and the composer's enduring presence.
> 
> If you need light entertainment or unfamiliar with Greek cultural context, the evening's weight might feel heavy. The material demands engagement, the duration extends beyond casual listening. But if you've been looking for a contemporary voice engaging seriously with Greece's most important composer, for an evening that treats popular music as capable of carrying meaning — Christmas Theater holds this performance.
> 
> | Info | Details |
> |------|---------|
> | **Date** | Wednesday, March 11, 2026 |
> | **Venue** | Christmas Theater |
> | **Artist** | Antonis Remos |
> | **Program** | The songs of Mikis Theodorakis |
> | **Capacity** | ~2,000 |
> | **Price** | Check venue |
> 
> Antonis Remos interpreting Mikis Theodorakis — contemporary voice meets revolutionary composer.

**GATE FAILURES TO FIX:**
- `EN_ENTITY_LOCK_VIOLATION`: "popular music" should stay as "laiko" (Entity Locking rule)

**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.


### ΣΥΛΛΟΓΟΣ ΚΕΦΙ  «ΜΑΖΙ ΓΙΑ ΤΗΝ ΖΩΗ» (REWRITE)
- **ID**: 431979faf50c0518
- **Type**: concert
- **Venue**: Θέατρο Ολύμπια
- **Price**: paid
- **Date**: 2026-03-03
- **Time**: 20:00
- **URL**: https://www.ticketservices.gr/event/14079/
- **Source**: ticketservices
- **Category**: concert_local
- **Target words (English)**: 80-120
- **Structure**: three-part-block
- **Tier**: stub

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> Mazi gia tin Zoi is a charity concert at the Olympia Municipal Music Theatre on Akademias Street in central Athens, on March 3, 2026. Three voices from different decades of Greek songwriting share a stage the National Opera held for fifty years.
> 
> Nena Venetsanou has spent four decades balancing classical vocal technique with Greek folk song. She trained at the Hellenic Conservatory before studying singing in Paris with Irma Kolasi and art history at the University of Franche-Comte. Her settings of poetry by Greek, French, and Italian writers — Michel Deguy, Paul Eluard, Alberto Savinio — place her at the crossroads of art song and popular tradition. Kostas Thomaidis, born in Thessaloniki in 1953, has served Greek song for half a century, interpreting poetry by Seferis, Cavafy, and Kavvadias set to music by Thanos Mikroutsikos. He worked with the Nouveau Theatre de Belgique under director Henri Ronse from 1982 to 1988 before returning to Athens. Miltos Paschalidis, the youngest of the three, grew up in Kalamata, came to Athens as a founding member of Chainides, and has built a solo career across entechno and rock since his 1995 debut Paramythi me Lypimeno Telos. Soloist Diana Vranousi joins the ensemble on piano.
> 
> The evening is organized by Syllogos K.E.F.I. — the Association of Cancer Patients, Volunteers, Friends, and Doctors — to support Mazi kai sto Spiti, a program providing at-home psychosocial and palliative care for end-stage cancer patients. The ticket you hold funds something specific: a nurse or counselor arriving at a patient's door when the hospital stay has ended but the need has not.
> 
> The audience at a benefit concert of this caliber splits between two impulses: people who come for the cause and discover the music, and people who come for the music and discover the cause. The Olympia — named after Maria Callas, whose voice once filled the room — seats both comfortably.
> 
> The program moves through the distinct repertoires of each headliner. Venetsanou's classical-folk hybrids accompanied by Giorgos Tosikian on classical guitar. Thomaidis's poetry-settings carried by Thymios Papadopoulos on woodwinds and Yannis Belonis on piano. Paschalidis's rock-inflected entechno that shifts the room's energy forward. The contrast between them is the point — different generations, different traditions, the same stage.
> 
> If you want a late-night concert with encores and standing ovations, this is a seated evening at a formal music theater that ends before midnight. But if you want to hear three voices that span fifty years of Greek songwriting in a hall built for exactly this kind of sound, and you want the ticket to mean something beyond your own evening, this is the night.
> 
> The Olympia is at Akademias 59, within walking distance of Panepistimio metro. Curtain at 20:00. Tickets range from ten euros through twenty, thirty, and fifty for box seats, available through TicketServices with a five-percent online discount. The event runs under the auspices of Athens Municipality.
> 
> Three performers, three traditions, one cause that needs the room full.

**GATE FAILURES TO FIX:**
- `EN_ENTITY_LOCK_VIOLATION`: "art song" should stay as "entechno" (Entity Locking rule)

**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.


### Deus Culpa Album Presentation w/ Reversed @ Piraeus Club Academy (REWRITE)
- **ID**: 441535e02d19594d
- **Type**: concert
- **Venue**: Piraeus Club Academy
- **Price**: with-ticket
- **Date**: 2026-03-21T20:00:00+03:00
- **Time**: 21:00
- **URL**: https://www.viva.gr/gr-el/tickets/music/deus-culpa-piraeus-club-academy/
- **Source**: more.com
- **Category**: concert_local
- **Target words (English)**: 80-120
- **Structure**: three-part-block
- **Tier**: stub

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> The bass frequencies arrive before you clear the stairs. Piraeus Club Academy has configured itself for metal — the sound system ready to handle the low-end punishment that makes this music work. You find your position as Deus Culpa prepares to unveil their new album.
> 
> Album release shows carry particular weight in metal. Tonight marks the moment when studio compositions become live ammunition. Deus Culpa presents the work they've been building toward, the songs that exist as recordings now facing the test of audience reaction. Reversed joins the bill, adding depth to an evening already heavy with significance.
> 
> Greek metal has carved its own space in the broader scene. The bands emerging from Athens and Thessaloniki carry Mediterranean influences beneath the aggression — melodic sensibilities that distinguish them from Nordic or American counterparts. Deus Culpa operates in this tradition, heavy but not mindlessly so, technical but serving the songs.
> 
> Piraeus Club Academy provides the venue this music requires. The room has hosted enough metal shows to understand the basics — crowd flow, sound levels, sight lines to the stage. The technical setup handles the dynamic range these performances demand, from quiet buildups to crushing breakdowns without distortion or loss.
> 
> The crowd tonight represents metal's dedicated community. These are listeners who follow Greek bands through demo releases and festival slots, who understand that supporting local metal means showing up when it counts. The album release brings casual fans and devoted supporters together, the room united by shared appreciation.
> 
> Metal shows reward physical engagement. The standing arrangement allows the movement that this music generates — heads nodding, bodies swaying, the occasional pit formation when the tempo demands. Deus Culpa's material will likely span their catalog, the new songs introduced within the context of what's already known.
> 
> If you need seated comfort or moderate volume, metal at venue level will overwhelm your preferences. The experience here is full-body, the sound designed to be felt as much as heard. But if you've been tracking Greek metal and want to witness a band at a pivotal career moment — Piraeus Club Academy holds this night.
> 
> | Info | Details |
> |------|---------|
> | **Date** | Saturday, March 21, 2026 |
> | **Venue** | Piraeus Club Academy |
> | **Genre** | Metal |
> | **Event** | Deus Culpa album presentation |
> | **Support** | Reversed |
> | **Tickets** | Check venue |
> 
> Deus Culpa album release with Reversed — Greek metal at a career-defining moment.

**GATE FAILURES TO FIX:**
- `SPECULATION`: Speculative language detected: "likely", "will likely" — state verified facts only

**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.


---

## Execution Instructions

For EACH event:

1. **Read existing description** and understand what's being said
2. **Research**: WebSearch the event URL to verify facts. Search for any claims you're unsure about.
3. **Write rewritten description**: Save to `temp-descriptions/rewrite-3/`:
   ```bash
   bun run scripts/write-description.ts <event-id> --batch-dir=temp-descriptions/rewrite-3 "<rewritten description>"
   ```
4. **Gate check**: Validate:
   ```bash
   bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-3/<event-id>.md --tier=<tier> --event-id=<event-id> \
     --event-type=<type> --event-venue="<venue>" --event-title="<title>" \
     --event-date=<date> --event-price=<price>
   ```
5. **Gate score must be >= 85 with 0 errors** before proceeding to next event.

### Per-Event Gate Check Commands

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-3/2c666d43169ce1f6.md \
  --tier=standard --event-id=2c666d43169ce1f6 \
  --event-type=concert --event-venue="Gazarte" \
  --event-title="Γιαγκίνηδες" \
  --event-date=2026-12-04 --event-price=with-ticket
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-3/324e622322bf5d02.md \
  --tier=stub --event-id=324e622322bf5d02 \
  --event-type=concert --event-venue="ΣΤΑΥΡΟΣ ΤΟΥ ΝΟΤΟΥ" \
  --event-title="ΑΠΟΣΤΟΛΗΣ ΜΠΑΡΜΠΑΓΙΑΝΝΗΣ Τσολιάς εν δε Τσόλια Μπαντ «ΟΠΕΚΕΜΠΛΕ»" \
  --event-date=2026-03-18 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-3/35cad09fa2e3a921.md \
  --tier=standard --event-id=35cad09fa2e3a921 \
  --event-type=theater --event-venue="Christmas Theater" \
  --event-title="Ο ΑΝΤΩΝΗΣ ΡΕΜΟΣ ΕΡΜΗΝΕΥΕΙ ΜΙΚΗ ΘΕΟΔΩΡΑΚΗ" \
  --event-date=2026-03-11 --event-price=with-ticket
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-3/431979faf50c0518.md \
  --tier=stub --event-id=431979faf50c0518 \
  --event-type=concert --event-venue="Θέατρο Ολύμπια" \
  --event-title="ΣΥΛΛΟΓΟΣ ΚΕΦΙ  «ΜΑΖΙ ΓΙΑ ΤΗΝ ΖΩΗ»" \
  --event-date=2026-03-03 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-3/441535e02d19594d.md \
  --tier=stub --event-id=441535e02d19594d \
  --event-type=concert --event-venue="Piraeus Club Academy" \
  --event-title="Deus Culpa Album Presentation w/ Reversed @ Piraeus Club Academy" \
  --event-date=2026-03-21 --event-price=with-ticket
```

### Save Command

After all events pass gates:
```bash
bun run scripts/save-batch.ts --manifest=temp-briefs/rewrite-3.manifest.json --session=rewrite-3 --batch=R3 --clean
```
