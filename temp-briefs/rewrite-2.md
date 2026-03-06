# Rewrite Brief — Batch R2

## VERIFICATION CHECKLIST
- This is Rewrite Batch R2
- Event IDs: 1bd49c4dfd57ff56, 1dc9b2718e2de08b, 242e47fb0c022e62, 2ada537f08ee7037, 2b73d0705f4a1483
- Write descriptions to: temp-descriptions/rewrite-2/
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

### Taniko (REWRITE)
- **ID**: 1bd49c4dfd57ff56
- **Type**: theater
- **Venue**: Studio Μαυρομιχάλη
- **Price**: with-ticket
- **Date**: 2026-11-27T21:00:00+03:00
- **URL**: https://www.athinorama.gr/theatre/performance/taniko-10087879/
- **Source**: athinorama.gr
- **Category**: theater_contemporary
- **Target words (English)**: 120-180
- **Structure**: hybrid
- **Tier**: standard

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> The stage becomes a space between realities. Taniko enters Studio Mavromihali with the weight of Japanese theatrical tradition filtered through contemporary sensibility. The performance promises transformation — of space, of understanding, of how you relate to movement and meaning.
> 
> Taniko likely brings Japanese theater forms — possibly Noh, possibly Butoh, possibly contemporary work informed by classical aesthetics. These forms operate on principles foreign to Western dramatic tradition. The movement is economical, the silence weighted, the audience's role as much imaginative as observational. What you bring to the performance matters as much as what the artists provide.
> 
> Studio Mavromihali configures for theater that demands close attention. The venue's reputation for experimental work means audiences arrive prepared for forms that challenge conventional expectations. The space will likely be used non-traditionally — the audience positioned to understand the performance as collaborative conversation between stage and observers.
> 
> The performance will reward patient attention. Japanese theater often requires different viewing muscles than Western drama. The pacing might feel slow until you understand that slowness isn't pace but precision. The repetition might feel excessive until you recognize it as meditative rather than redundant. By performance's end, you'll have learned new ways of seeing.
> 
> The crowd arrives predisposed to cultural exchange. Japan-enthusiasts and theater heads. People interested in non-Western aesthetics. Dancers and choreographers studying movement traditions beyond their own. The conversations before the show establish the shared context for what's about to occur.
> 
> If you need accessible narratives or performances that reward conventional viewing, Taniko will require different engagement. The form itself is the content. The meaning lies in how the body moves, not what story the movement illustrates. But if you've been seeking to experience theatrical traditions outside Western convention — Studio Mavromihali holds this particular transformation.
> 
> | Info | Details |
> |------|---------| 
> | **Date** | Thursday, November 27, 2026 |
> | **Time** | Evening |
> | **Venue** | Studio Mavromichali |
> | **Title** | Taniko |
> | **Genre** | Theater / Japanese Form |
> | **Language** | Non-verbal or Japanese |
> | **Price** | Check venue |
> 
> Taniko — Japanese theatrical tradition brought alive.

**GATE FAILURES TO FIX:**
- `SPECULATION`: Speculative language detected: "likely", "will likely" — state verified facts only

**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.


### Vaginahood (REWRITE)
- **ID**: 1dc9b2718e2de08b
- **Type**: show
- **Venue**: Doors
- **Price**: with-ticket
- **Date**: 2026-11-18T21:15:00+03:00
- **URL**: https://www.athinorama.gr/theatre/performance/vaginahood-10087756/
- **Source**: athinorama.gr
- **Category**: default
- **Target words (English)**: 120-200
- **Structure**: hybrid
- **Tier**: standard

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> The title hits you before the curtain opens. Vaginahood. Doors theater fills with the knowledge that you're about to encounter a performance that refuses polite distance from women's bodily reality. The play announces itself, your choice to enter now a statement.
> 
> Vaginahood presents female sexual autonomy and bodily knowledge as centerpiece rather than subtext. The performance likely ranges from comedic to confrontational, from tender to aggressive, refusing single-register treatment of its subject. The staging will probably use the body as primary visual element, refusing text-only approaches to material this physically rooted.
> 
> Doors theater provides the appropriate setting for performances that demand edginess. The venue's reputation for pushing boundaries means audiences arrive prepared for discomfort as productive. The intimate capacity creates intensity that larger theaters dilute. The proximity becomes part of the work — you're not observing from safe distance but participating in the conversation.
> 
> The performance will likely explore women's relationships to their own bodies — pleasure, pain, autonomy, naming, knowledge. The comedy that threads through will make the serious moments hit harder. The aggression that surfaces will clarify what's at stake. By performance's end, you'll have been reminded that embodiment remains political.
> 
> The crowd self-selects for willingness to engage with explicitly female-centered content. Women seeking mirror for their own experiences. Men willing to witness perspectives beyond their own. Theater enthusiasts seeking work that risks. The conversations after the show will be more alive than pre-show small talk.
> 
> If you need distanced observation or performances that maintain polite boundaries around bodily reality, Vaginahood will exceed your comfort tolerance. This is unapologetically female-embodied work. But if you've been seeking theater willing to center women's perspectives and bodily knowledge — Doors holds this particular reclamation.
> 
> | Info | Details |
> |------|---------| 
> | **Date** | Tuesday, November 18, 2026 |
> | **Time** | Evening |
> | **Venue** | Doors |
> | **Title** | Vaginahood |
> | **Genre** | Drama / Performance Art |
> | **Content** | Explicit, feminist |
> | **Language** | Greek |
> | **Price** | Check venue |
> 
> Vaginahood — female embodiment as centerpiece.

**GATE FAILURES TO FIX:**
- `SPECULATION`: Speculative language detected: "likely", "probably", "will likely", "the show will" — state verified facts only

**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.


### ΑΠΟΣΤΟΛΗΣ ΜΠΑΡΜΠΑΓΙΑΝΝΗΣ Τσολιάς εν δε Τσόλια Μπαντ «ΟΠΕΚΕΜΠΛΕ» (REWRITE)
- **ID**: 242e47fb0c022e62
- **Type**: concert
- **Venue**: ΣΤΑΥΡΟΣ ΤΟΥ ΝΟΤΟΥ
- **Price**: paid
- **Date**: 2026-03-11
- **Time**: 20:30
- **URL**: https://www.ticketservices.gr/event/13919/
- **Source**: ticketservices
- **Category**: concert_local
- **Target words (English)**: 80-120
- **Structure**: three-part-block
- **Tier**: stub

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> The bouzouki strings catch the light as the player adjusts his grip. You're settling into a seat at Stavros tou Notou, close enough to see the calluses on the musician's fingers, close enough that when Apostolis Barbagiannis begins to sing, the vibration reaches you before the amplification does.
> 
> Barbagiannis carries forward a tradition that runs deep in Greek musical memory. His approach to laiko and dimotika — the folk songs that predate rebetiko and stretch back into village life — treats the material as living inheritance rather than museum artifact. The voice operates without modern affectation, the phrasing shaped by the songs themselves rather than contemporary production values. When he reaches for the high notes, he reaches the way his teachers taught him.
> 
> Stavros tou Notou has built its reputation on exactly this kind of programming. The venue's name translates to "Stavros of the South," and the atmosphere delivers on that promise — a warmth that feels Mediterranean rather than clinical. The room holds enough people to generate collective energy, small enough that every seat offers proximity to the performers. Tables cluster around the stage in the traditional arrangement that Greek music venues have used for generations.
> 
> The crowd filtering in tonight carries specific knowledge. These aren't tourists hunting authentic experiences but Greeks who grew up with these songs playing at family gatherings, who know when a phrase lands correctly and when it drifts from the tradition. Between songs, conversations compare this version to remembered performances, locate tonight in a longer timeline of how these songs have traveled.
> 
> Greek folk music at this level operates through nuance rather than spectacle. The instrumentation might sound simple — bouzouki, guitar, perhaps violin or santouri — but the interplay between players reveals complexity that rewards attention. When the rhythm section locks in and Barbagiannis finds his groove, the room responds not with dancing necessarily but with that particular Greek engagement: voices joining on choruses, glasses raised, the boundary between performer and audience blurring.
> 
> The evening will run long by Northern European standards. Greek musical events start late and end later, with the best moments often arriving after midnight when the formality has dissolved and the music becomes conversation. Barbagiannis knows how to read a room, when to deliver the songs everyone came for and when to surprise with deeper catalog.
> 
> If you need English lyrics or familiar reference points, this evening will leave you at a distance. The material operates entirely in Greek, the emotional resonance requires cultural context that can't be quickly acquired. But if you've been looking for Greek folk music performed without compromise or condescension, where the tradition lives because someone is keeping it alive — Stavros tou Notou holds this evening for you.
> 
> | Info | Details |
> |------|---------|
> | **Date** | Wednesday, March 11, 2026 |
> | **Venue** | Stavros tou Notou |
> | **Genre** | Greek folk / Laiko / Dimotika |
> | **Setting** | Traditional music venue, table seating |
> | **Price** | Check venue |
> | **Language** | Greek |
> 
> Apostolis Barbagiannis carrying forward the songs that shaped Greek musical memory.

**GATE FAILURES TO FIX:**
- `EN_ENTITY_LOCK_VIOLATION`: "folk music" should stay as "dimotika" (Entity Locking rule)

**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.


### Δύο ρεσιτάλ πιάνου του Nikolai Lugansky (REWRITE)
- **ID**: 2ada537f08ee7037
- **Type**: dj_set
- **Venue**: Parnassos Literary Society
- **Price**: paid
- **Date**: 2026-03-18
- **Time**: 20:30
- **URL**: https://www.ticketservices.gr/event/13543/
- **Source**: ticketservices
- **Category**: concert_local
- **Target words (English)**: 80-120
- **Structure**: three-part-block
- **Tier**: stub

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> The piano gleams under concert lighting, its curves reflecting the anticipation in the hall. Parnassos holds its particular gravity — a venue where Greek cultural life has gathered for generations. You settle into your seat as Nikolai Lugansky prepares to transform silence into Chopin.
> 
> Two recitals. The format itself announces ambition. Lugansky returns to Athens not for a single evening but for a paired journey through the piano repertoire. Russian training meeting French elegance meeting the unique acoustics of this Greek institution. The hands that will touch these keys have earned their reputation through decades of international performance.
> 
> Lugansky belongs to the lineage of Russian pianists whose technique serves expression rather than display. His Chopin breathes with rubato that feels organic rather than mannered. His Russian repertoire carries the weight of heritage without the burden of imitation. Tonight's program will likely span the material that has defined his career — the nocturnes, the etudes, the works that audiences return to because they reveal new depths with each hearing.
> 
> Parnassos provides the acoustic intimacy that solo piano demands. The hall's scale allows every dynamic shade to register — the whisper of pianissimo passages, the thunder of climactic moments. When Lugansky drops to near-silence, the room holds its collective breath. When he builds to fortissimo, the walls contain without competing.
> 
> The audience for these recitals carries particular characteristics. Classical devotees who follow international touring schedules, Greek music lovers who understand what it means to host a pianist of this caliber, students who come to study as much as experience. Between movements, the silence is respectful. At conclusions, the appreciation is informed.
> 
> Classical piano recitals ask something specific from their audiences. Two hours or more of focused listening, attention sustained across extended forms, the willingness to let music work at its own pace. Lugansky rewards this investment with performances that repay attention with revelation.
> 
> If you need variety or visual spectacle, a piano recital offers something different — the drama contained in dynamics, the spectacle of fingers producing these sounds from wood and wire. But if you've been waiting for international classical performance at the highest level to arrive in Athens, for a chance to hear a master in a room built for exactly this — Parnassos holds these evenings.
> 
> | Info | Details |
> |------|---------|
> | **Date** | Wednesday, March 18, 2026 |
> | **Venue** | Parnassos Literary Society |
> | **Format** | Solo piano recital (two recitals) |
> | **Artist** | Nikolai Lugansky |
> | **Metro** | Syntagma or Monastiraki |
> | **Tickets** | Check venue |
> 
> Nikolai Lugansky at Parnassos — world-class pianism in a hall built for listening.

**GATE FAILURES TO FIX:**
- `FILLER_PHRASES`: Remove filler phrases: world-class
- `SPECULATION`: Speculative language detected: "likely", "will likely" — state verified facts only

**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.


### RELEASE ATHENS 2026 X SNF NOSTOS / DAVID BYRNE: WHO IS THE SKY TOUR (REWRITE)
- **ID**: 2b73d0705f4a1483
- **Type**: concert
- **Venue**: ΚΠΙΣΝ
- **Price**: with-ticket
- **Date**: 2026-06-21T20:00:00+03:00
- **Time**: 18:00
- **URL**: https://www.viva.gr/gr-el/tickets/music/festival/release-athens-2026-x-snf-nostos/david-byrne-who-is-the-sky-tour/
- **Source**: more.com
- **Category**: premium_showcase
- **Target words (English)**: 400-600
- **Structure**: full-8-section
- **Tier**: premium

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> David Byrne in a museum setting isn't incidental — it's a thesis about what concert experience becomes when you remove the stadium equation. You're at ΚΠΙΣΝ Ξέφωτο (SNF Nostos), watching a performer who spent the Talking Heads era understanding that performance is architecture, that audience psychology can be shaped through space as much as through music. "Who Is The Sky Tour" is the latest iteration of a 45-year career that's consistently proven that intelligence in music doesn't sacrifice accessibility.
> 
> David Byrne plays guitar and voice; his band (varying lineup, typically 4-5 musicians) follows. The setlist might include Talking Heads material, his solo work, recent compositions — the show treats his entire catalog as a conversation rather than a museum of hits. The arrangements are often different than recordings; the band plays live. The focus is on how sound works in a room with actual human beings, not how it travels through a PA.
> 
> The crowd will be older (Talking Heads fans are now 50-65), mixed with younger people discovering Byrne through his recent work or his cultural influence on subsequent artists. Music industry professionals. Tourists who know this is an opportunity. The education level is notably high — people here read about the show, understand the context, didn't arrive by accident.
> 
> ΚΠΙΣΝ Ξέφωτο (KPIESN Xefoeto, meaning "Clearing") is an outdoor terrace within SNFCC: architectural, designed, seating available but minimal. The capacity is maybe 300-400. The sound system is professional but not festival-scale. The focus is performance, not production. The lights matter, but they're architectural rather than spectacular.
> 
> | Aspect | Details |
> |--------|---------|
> | **Setting** | ΚΠΙΣΝ Ξέφωτο, SNFCC — outdoor terrace, ~300-400 capacity, seating limited |
> | **Vibe** | Sophisticated, intellectually engaged audience, artist-focused |
> | **Sound** | Live band, intimate concert setting |
> | **Door** | Festival entry, no selection |
> 
> If you need stadium energy, this is a terrace. But if you want to understand what David Byrne means to people who've followed his entire trajectory — if you understand that intelligence in music is a radical act — this is where it crystallizes.
> 
> | Info | Details |
> |------|---------|
> | **Date** | Sunday, June 21, 2026 |
> | **Doors** | 19:00 |
> | **Music starts** | ~20:00-20:30 |
> | **Duration** | 90 minutes |
> | **Price** | €50-70 (varies by SNF tier) |
> | **Tickets** | SNFCC website, SNF Nostos, more.com |
> | **Address** | ΚΠΙΣΝ Ξέφωτο, Iera Odos, Gazi |
> | **Getting there** | Kerameikos Metro (Blue), 8-10 minute walk, or taxi €8-12 |
> | **Last metro** | 01:30 (Sunday night) |
> | **Payment** | Cards and cash |
> | **Good to know** | This is part of Release Athens + SNF Nostos but functions as a separate ticketed event. Seating is very limited; standing space is primary. The venue is outdoors but covered. If David Byrne is your priority, buy dedicated tickets; don't rely on festival access. |

**GATE FAILURES TO FIX:**
- `LAZY_ADJECTIVES`: Remove lazy adjectives: spectacular

**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.


---

## Execution Instructions

For EACH event:

1. **Read existing description** and understand what's being said
2. **Research**: WebSearch the event URL to verify facts. Search for any claims you're unsure about.
3. **Write rewritten description**: Save to `temp-descriptions/rewrite-2/`:
   ```bash
   bun run scripts/write-description.ts <event-id> --batch-dir=temp-descriptions/rewrite-2 "<rewritten description>"
   ```
4. **Gate check**: Validate:
   ```bash
   bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-2/<event-id>.md --tier=<tier> --event-id=<event-id> \
     --event-type=<type> --event-venue="<venue>" --event-title="<title>" \
     --event-date=<date> --event-price=<price>
   ```
5. **Gate score must be >= 85 with 0 errors** before proceeding to next event.

### Per-Event Gate Check Commands

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-2/1bd49c4dfd57ff56.md \
  --tier=standard --event-id=1bd49c4dfd57ff56 \
  --event-type=theater --event-venue="Studio Μαυρομιχάλη" \
  --event-title="Taniko" \
  --event-date=2026-11-27 --event-price=with-ticket
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-2/1dc9b2718e2de08b.md \
  --tier=standard --event-id=1dc9b2718e2de08b \
  --event-type=show --event-venue="Doors" \
  --event-title="Vaginahood" \
  --event-date=2026-11-18 --event-price=with-ticket
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-2/242e47fb0c022e62.md \
  --tier=stub --event-id=242e47fb0c022e62 \
  --event-type=concert --event-venue="ΣΤΑΥΡΟΣ ΤΟΥ ΝΟΤΟΥ" \
  --event-title="ΑΠΟΣΤΟΛΗΣ ΜΠΑΡΜΠΑΓΙΑΝΝΗΣ Τσολιάς εν δε Τσόλια Μπαντ «ΟΠΕΚΕΜΠΛΕ»" \
  --event-date=2026-03-11 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-2/2ada537f08ee7037.md \
  --tier=stub --event-id=2ada537f08ee7037 \
  --event-type=dj_set --event-venue="Parnassos Literary Society" \
  --event-title="Δύο ρεσιτάλ πιάνου του Nikolai Lugansky" \
  --event-date=2026-03-18 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-2/2b73d0705f4a1483.md \
  --tier=premium --event-id=2b73d0705f4a1483 \
  --event-type=concert --event-venue="ΚΠΙΣΝ" \
  --event-title="RELEASE ATHENS 2026 X SNF NOSTOS / DAVID BYRNE: WHO IS THE SKY TOUR" \
  --event-date=2026-06-21 --event-price=with-ticket
```

### Save Command

After all events pass gates:
```bash
bun run scripts/save-batch.ts --manifest=temp-briefs/rewrite-2.manifest.json --session=rewrite-2 --batch=R2 --clean
```
