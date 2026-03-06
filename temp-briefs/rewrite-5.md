# Rewrite Brief — Batch R5

## VERIFICATION CHECKLIST
- This is Rewrite Batch R5
- Event IDs: 51c1ba90b9b030b8, 53fd6789904b3cfb, 556bbebc8881d699, 5c3d4270c85cb46a
- Write descriptions to: temp-descriptions/rewrite-5/
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

### DORO PESCH (REWRITE)
- **ID**: 51c1ba90b9b030b8
- **Type**: concert
- **Venue**: Fuzz Club
- **Price**: with-ticket
- **Date**: 2026-10-09T20:00:00+03:00
- **Time**: 20:00
- **URL**: https://www.viva.gr/gr-el/tickets/music/doro-pesch/
- **Source**: more.com
- **Category**: concert_major
- **Target words (English)**: 120-200
- **Structure**: hybrid
- **Tier**: standard

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> The leather jacket enters the room before the amplifier does. Doro Pesch carries the particular authority that comes from forty-plus years of metal commitment. Fuzz Club fills with voices raised in recognition, the room adjusting its energy to match what's about to happen. This is traditional metal, presented by someone who's never questioned whether the path matters.
> 
> Doro Pesch brings Warlock's legacy and her solo career to audiences that span generations. The voice remains extraordinary — a presence that survives the decades, weathering rather than fading. Her catalogue ranges from the 1980s darkness through to recent material that proves the form remains viable for artists willing to invest in its traditions.
> 
> Fuzz Club provides the intimate setting that Doro's shows deserve. The 2,000 capacity creates connection without requiring theatricality, the audience close enough to see the precision of her performance. The venue's sound system carries her voice with clarity essential for an artist whose instrument has always been this instrument.
> 
> The setlist will likely span eras. Warlock deep cuts that devoted fans have kept alive. Solo career moments that defined her post-Warlock identity. Covers or collaborations demonstrating her influence on subsequent metal generations. By set's end, the room will have experienced not just performance but historical arc — a reminder of where metal has traveled and proof it's still going.
> 
> The crowd carries a particular composition. Original Warlock fans now in their 50s and 60s. Metal heads across all ages who respect tradition. Musicians studying her approach to vocal performance. Women in metal gathering to witness one of their most consequential voices. The demographic diversity speaks to Doro's longevity.
> 
> Metal shows in 2026 carry certain expectations about physical intensity and energy. Doro's performances meet and exceed these anticipations. The voice remains powerful. The band understands its role as support for this particular instrument. The evening doesn't apologize for operating in traditional metal territory.
> 
> If you need current trends or music positioned outside metal history, Doro Pesch will challenge your positioning. She represents continuity rather than innovation, tradition rather than experimentation. But if you've been seeking artists who've remained committed to their art despite changing fashions — Fuzz Club holds this particular integrity.
> 
> | Info | Details |
> |------|---------| 
> | **Date** | Friday, October 9, 2026 |
> | **Venue** | Fuzz Club |
> | **Artist** | Doro Pesch |
> | **Genre** | Metal / Hard Rock |
> | **Price** | Check venue |
> | **Capacity** | ~2,000 |
> 
> Doro Pesch at Fuzz — metal as lifetime commitment.

**GATE FAILURES TO FIX:**
- `LAZY_ADJECTIVES`: Remove lazy adjectives: extraordinary
- `SPECULATION`: Speculative language detected: "likely", "will likely" — state verified facts only

**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.


### Ένας καταπληκτικός καταθλιπτικός (REWRITE)
- **ID**: 53fd6789904b3cfb
- **Type**: show
- **Venue**: Art 63
- **Price**: with-ticket
- **Date**: 2026-12-02T21:00:00+03:00
- **Time**: 21:00
- **URL**: https://www.athinorama.gr/theatre/performance/enas_katapliktikos_katathliptikos-10082932/
- **Source**: athinorama.gr
- **Category**: default
- **Target words (English)**: 120-200
- **Structure**: hybrid
- **Tier**: standard

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> The title announces depression with exclamation mark. "An Amazing Depressive!" enters Art 63 like a paradox the moment demands examining. The performance promises comedy sourced from mental health, from the specific dark humor that people living with depression develop as survival tool.
> 
> The show likely explores how depression and creativity coexist, how mental illness can become asset in artistic hands, how naming darkness sometimes requires humor. The monologue format means one person carrying the whole emotional weight — the intensity of solo performance amplifying the intimacy of the subject.
> 
> Art 63 provides the appropriate setting for performance that centers psychological difficulty. The venue's track record with intelligent programming means audiences arrive expecting sophistication. The intimate scale creates uncomfortable proximity — you can't hide from the performance's directness, and the performer can't hide from your recognition.
> 
> The show will likely move between funny and devastating. The jokes will catch you laughing at moments you feel guilty laughing. The serious passages will hit harder because the context was just laughter. The performance refuses register consistency — it lets you feel the complexity of living with depression, the way pain and humor coexist in actually lived experience.
> 
> The crowd arrives predisposed to engagement with mental health content. People with direct experience seeking recognition. Theater enthusiasts respecting work that takes emotional risks. Those interested in how comedy can handle serious subjects. The conversations after the show will extend longer than typical comedy setups.
> 
> If you need light entertainment or performances that maintain emotional distance, "An Amazing Depressive!" will demand vulnerability. The show announces its subject, your entry a statement. But if you've been seeking performances that honor the complexity of living with mental illness — Art 63 holds this particular recognition.
> 
> | Info | Details |
> |------|---------| 
> | **Date** | Wednesday, December 2, 2026 |
> | **Time** | Evening |
> | **Venue** | Art 63 |
> | **Title** | An Amazing Depressive! |
> | **Genre** | Comedy / Monologue |
> | **Content** | Mental health-focused |
> | **Language** | Greek |
> | **Price** | Check venue |
> 
> An Amazing Depressive — comedy from the depths.

**GATE FAILURES TO FIX:**
- `LAZY_ADJECTIVES`: Remove lazy adjectives: amazing
- `SPECULATION`: Speculative language detected: "likely", "will likely", "The show will" — state verified facts only

**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.


### WAVVES (REWRITE)
- **ID**: 556bbebc8881d699
- **Type**: concert
- **Venue**: Bios Ρομάντσο
- **Price**: with-ticket
- **Date**: 2026-03-05T20:00:00+03:00
- **Time**: 20:00
- **URL**: https://www.viva.gr/gr-el/tickets/music/wavves/
- **Source**: more.com
- **Category**: concert_local
- **Target words (English)**: 80-120
- **Structure**: three-part-block
- **Tier**: stub

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> The room at Bios Romantso has that specific charge that arrives when an international act is about to play. The sound check finished hours ago, but you can still feel where the bass tested the walls. WAVVES is about to remind Athens what California noise-pop sounds like at proper volume.
> 
> Nathan Williams has spent fifteen years building WAVVES into a vehicle for surf-damaged guitar music. The sound pulls from punk, shoegaze, and the particular kind of distortion that emerges when you're not trying too hard to be clean. Live, the energy amplifies — the recordings are blueprints, the performances are the buildings. Tonight Williams brings the current lineup to Athens, and the room is ready.
> 
> Indie rock touring acts find natural homes at Bios Romantso. The space accommodates the volume these performances require, the layout creates natural density near the stage. The room has hosted enough similar acts that it knows how to configure itself — where to stand for the best sound, where to retreat when the pit inevitably forms.
> 
> The crowd arriving tonight mixes WAVVES faithful with Athens indie heads curious about the hype. You recognize the devotees by the older merch, the references to specific albums that shaped teenage years. The local contingent evaluates with different eyes, measuring this California import against what they know. By the third song, evaluation becomes experience.
> 
> WAVVES shows run loud and fast. The setlist will likely pull from across the catalog — the breakthrough material from "King of the Beach," newer songs, deep cuts that reward long-term listeners. The performance style favors energy over precision, the kind of playing that trusts the noise to cover the edges.
> 
> If you need delicate acoustics or seated comfort, WAVVES at volume will overwhelm your preferences. This is standing-room chaos, hearing protection recommended, the kind of show you feel in your body for days afterward. But if you've been waiting for guitar music that reminds you why you cared about guitar music — this is the room.
> 
> | Info | Details |
> |------|---------|
> | **Date** | Thursday, March 5, 2026 |
> | **Doors** | 20:00 |
> | **Music** | ~21:30 |
> | **Venue** | Bios Romantso, Pireos 84, Gazi |
> | **Getting there** | Kerameikos Metro, 5 min walk |
> | **Price** | Check venue |
> 
> WAVVES in Athens — California noise-pop meeting Greek enthusiasm at maximum volume.

**GATE FAILURES TO FIX:**
- `SPECULATION`: Speculative language detected: "likely", "will likely" — state verified facts only

**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.

**Venue intel:**
```
### Bios
| Field | Data |
|-------|------|
| **Address** | Pireos 84, Gazi |
| **Metro** | Kerameikos (Blue) |
| **Capacity** | ~300 across spaces |
| **Spaces** | Tesla bar (ground, winter), basement (Funktion-One), rooftop (summer, Acropolis views) |
| **Drinks** | Cocktails €9 (pricey for Athens) |
| **Door Policy** | Relaxed |
| **Notable acts** | Autechre, Mala, Objekt |
```

### The Gathering (NL) live in Greece (REWRITE)
- **ID**: 5c3d4270c85cb46a
- **Type**: concert
- **Venue**: Πολλαπλοί Χώροι
- **Price**: with-ticket
- **Date**: 2026-09-24T20:00:00+03:00
- **Time**: 20:00
- **URL**: https://www.more.com/gr-el/tickets/music/the-gathering-nl-live-in-greece/
- **Source**: more.com
- **Category**: concert_local
- **Target words (English)**: 80-120
- **Structure**: three-part-block
- **Tier**: stub

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> The guitars arrive like weather. Multiple venues across Athens hold The Gathering's performance, each space connected by the energy of a band that's spent years building something genuinely heavy. You're not sure which location hosts them, but the sound carries the same intention — crushing, hypnotic, designed to make you feel music as physical force rather than entertainment.
> 
> The Gathering represents Dutch metal at its most ambitious. Since the 1980s, the band has evolved from straightforward heavy metal into something more sophisticated — production that respects dynamics, vocals that range across registers, songwriting that rewards repeated listening. Anneke van Giersbergen's voice carries the maturity of decades, the power of someone who's learned that strength doesn't require volume.
> 
> "Multiple Venues" in the event title suggests a decentralized approach. Perhaps different band members perform in different spaces, projections connect locations, the crowd moves between installations. Or perhaps it's straightforward programming across multiple rooms in a single complex. Either way, the format acknowledges that The Gathering has earned enough devotion to require expansive space.
> 
> The crowd arriving tonight carries particular characteristics. Metal heads who've followed the band since "Mandylion" in the 1990s. Newer fans who discovered them through collaborations or soundtrack work. The common thread is appreciation for metal that respects intelligence, that understands "heavy" can coexist with sophistication.
> 
> Van Giersbergen's performance will anchor the evening. Her voice handles the dynamics that The Gathering's compositions require — moments of genuine intimacy, passages of overwhelming intensity. The band's setlist will likely span eras, acknowledging how significantly their sound has evolved while honoring the albums that built their reputation.
> 
> The multiple venue format creates both opportunity and challenge. You'll see what you see. The conversations afterward will compare experiences, different people in different rooms having meaningfully different evenings. This is the adventure of such programming — your night becomes uniquely yours rather than identical to thousands of others'.
> 
> If you need intimate gatherings or music that whispers rather than declares, The Gathering will test your tolerance for intensity. This is metal as commitment, music that demands presence. But if you've been hunting for heavy music that proves heaviness and sophistication aren't opposites — the multiple venues hold what you're seeking.
> 
> | Info | Details |
> |------|---------| 
> | **Date** | Thursday, September 24, 2026 |
> | **Venue** | Multiple Venues across Athens |
> | **Band** | The Gathering |
> | **Genre** | Metal / Progressive |
> | **Price** | Check venue listings |
> | **Format** | Multi-location show |
> | **Prepare for** | Heavy, intense, theatrical |
> 
> The Gathering across Athens — metal as orchestral experience.

**GATE FAILURES TO FIX:**
- `SPECULATION`: Speculative language detected: "likely", "Perhaps", "will likely" — state verified facts only

**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.


---

## Execution Instructions

For EACH event:

1. **Read existing description** and understand what's being said
2. **Research**: WebSearch the event URL to verify facts. Search for any claims you're unsure about.
3. **Write rewritten description**: Save to `temp-descriptions/rewrite-5/`:
   ```bash
   bun run scripts/write-description.ts <event-id> --batch-dir=temp-descriptions/rewrite-5 "<rewritten description>"
   ```
4. **Gate check**: Validate:
   ```bash
   bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-5/<event-id>.md --tier=<tier> --event-id=<event-id> \
     --event-type=<type> --event-venue="<venue>" --event-title="<title>" \
     --event-date=<date> --event-price=<price>
   ```
5. **Gate score must be >= 85 with 0 errors** before proceeding to next event.

### Per-Event Gate Check Commands

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-5/51c1ba90b9b030b8.md \
  --tier=standard --event-id=51c1ba90b9b030b8 \
  --event-type=concert --event-venue="Fuzz Club" \
  --event-title="DORO PESCH" \
  --event-date=2026-10-09 --event-price=with-ticket
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-5/53fd6789904b3cfb.md \
  --tier=standard --event-id=53fd6789904b3cfb \
  --event-type=show --event-venue="Art 63" \
  --event-title="Ένας καταπληκτικός καταθλιπτικός" \
  --event-date=2026-12-02 --event-price=with-ticket
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-5/556bbebc8881d699.md \
  --tier=stub --event-id=556bbebc8881d699 \
  --event-type=concert --event-venue="Bios Ρομάντσο" \
  --event-title="WAVVES" \
  --event-date=2026-03-05 --event-price=with-ticket
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-5/5c3d4270c85cb46a.md \
  --tier=stub --event-id=5c3d4270c85cb46a \
  --event-type=concert --event-venue="Πολλαπλοί Χώροι" \
  --event-title="The Gathering (NL) live in Greece" \
  --event-date=2026-09-24 --event-price=with-ticket
```

### Save Command

After all events pass gates:
```bash
bun run scripts/save-batch.ts --manifest=temp-briefs/rewrite-5.manifest.json --session=rewrite-5 --batch=R5 --clean
```
