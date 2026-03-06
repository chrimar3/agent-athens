# Rewrite Brief — Batch R4

## VERIFICATION CHECKLIST
- This is Rewrite Batch R4
- Event IDs: 1bd49c4dfd57ff56, 1dc9b2718e2de08b, 2ada537f08ee7037, 441535e02d19594d
- Write descriptions to: temp-descriptions/rewrite-4/
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
> Nikolai Lugansky at Parnassos — top-tier pianism in a hall built for listening.

**GATE FAILURES TO FIX:**
- `SPECULATION`: Speculative language detected: "likely", "will likely" — state verified facts only

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
3. **Write rewritten description**: Save to `temp-descriptions/rewrite-4/`:
   ```bash
   bun run scripts/write-description.ts <event-id> --batch-dir=temp-descriptions/rewrite-4 "<rewritten description>"
   ```
4. **Gate check**: Validate:
   ```bash
   bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-4/<event-id>.md --tier=<tier> --event-id=<event-id> \
     --event-type=<type> --event-venue="<venue>" --event-title="<title>" \
     --event-date=<date> --event-price=<price>
   ```
5. **Gate score must be >= 85 with 0 errors** before proceeding to next event.

### Per-Event Gate Check Commands

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-4/1bd49c4dfd57ff56.md \
  --tier=standard --event-id=1bd49c4dfd57ff56 \
  --event-type=theater --event-venue="Studio Μαυρομιχάλη" \
  --event-title="Taniko" \
  --event-date=2026-11-27 --event-price=with-ticket
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-4/1dc9b2718e2de08b.md \
  --tier=standard --event-id=1dc9b2718e2de08b \
  --event-type=show --event-venue="Doors" \
  --event-title="Vaginahood" \
  --event-date=2026-11-18 --event-price=with-ticket
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-4/2ada537f08ee7037.md \
  --tier=stub --event-id=2ada537f08ee7037 \
  --event-type=dj_set --event-venue="Parnassos Literary Society" \
  --event-title="Δύο ρεσιτάλ πιάνου του Nikolai Lugansky" \
  --event-date=2026-03-18 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-4/441535e02d19594d.md \
  --tier=stub --event-id=441535e02d19594d \
  --event-type=concert --event-venue="Piraeus Club Academy" \
  --event-title="Deus Culpa Album Presentation w/ Reversed @ Piraeus Club Academy" \
  --event-date=2026-03-21 --event-price=with-ticket
```

### Save Command

After all events pass gates:
```bash
bun run scripts/save-batch.ts --manifest=temp-briefs/rewrite-4.manifest.json --session=rewrite-4 --batch=R4 --clean
```
