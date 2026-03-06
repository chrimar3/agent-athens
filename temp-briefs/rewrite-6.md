# Rewrite Brief — Batch R6

## VERIFICATION CHECKLIST
- This is Rewrite Batch R6
- Event IDs: a7a05d59d0b6dcbb, b7cf9f6e3e70f94e, eff502c25197a121, f7e6dde4e19f4a0b
- Write descriptions to: temp-descriptions/rewrite-6/
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

### DEVISER (REWRITE)
- **ID**: a7a05d59d0b6dcbb
- **Type**: dj_set
- **Venue**: Temple
- **Price**: paid
- **Date**: 2026-03-07T20:00:00
- **Time**: 20:00
- **URL**: https://www.athinorama.gr/music/gig/deviser-4007630/
- **Source**: athinorama.gr
- **Category**: concert_local
- **Target words (English)**: 80-120
- **Structure**: three-part-block
- **Tier**: stub

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> You take the stairs down at Temple and the concrete walls close in and the sound meets you halfway — the raw, full-spectrum roar of amplified guitars pushing through a room not designed to contain them. The Funktion-One rig handles it. Your ribs confirm.
> 
> Deviser formed in Chania, Crete, in 1989 — a one-man project by Manthos Matt Hnaras, who was eighteen and writing black-death-thrash metal before most of the Hellenic scene had coalesced. The band relocated to Athens in 1992, and across six studio albums — from Unspeakable Cults in 1996 through Evil Summons Evil in 2023, mixed and mastered by Psychon of Septicflesh at Soundabuse Productions — Deviser have operated as one of the longer-running threads in Greek extreme metal. This show marks thirty-five years since their first demo in 1990. Support comes from LLOTH, returning to the stage after seven years with their album Archees Legeones (mixed by George Emmanuel of Lucifer's Child, ex-Rotting Christ) and Ignominous from Thessaloniki, playing Athens for the first time with material from their debut and unreleased compositions from a forthcoming second record.
> 
> The crowd for a Deviser anniversary show draws from a specific geology of the Athens metal scene. People who bought Unspeakable Cults on cassette and still own it. Younger metalheads who found Evil Summons Evil through the Hellenic metal underground and want to see if the live performance matches the studio weight. Friends and fellow musicians from bands that have shared stages, labels, and rehearsal spaces with Deviser across three decades.
> 
> | Aspect | Details |
> |--------|---------|
> | **Setting** | Temple, Iakhou 17, Gazi — ~600 capacity, two floors, basement is the peak experience |
> | **Vibe** | Loud, loyal, celebratory — a scene reunion disguised as a concert |
> | **Sound** | Funktion-One system, full-volume black-death-thrash metal, three bands |
> | **Door** | Presale €15 via cometogether.live, also at Metal Era (Emmanouil Benaki 22) and Esqueleto Cafe Bar (Char. Trikoupi 145) |
> 
> Three bands build the evening in ascending intensity. Ignominous opens, LLOTH follows with their first live presentation of Archees Legeones, and Deviser closes with a set that spans thirty-five years of catalogue. The anniversary framing means the setlist will likely reach deeper than a standard headline show — early material alongside the newer work, the kind of retrospective that rewards the people who have been listening longest.
> 
> If you want a seated, curated listening experience or a night where the music stays at conversation level, Temple on a metal night is none of those things — the volume is physical and the pit is real. But if you want to stand in a concrete basement while a band that has been writing extreme metal since 1989 plays through its own history at the volume that history was intended to be heard, this is the night.
> 
> Temple is at Iakhou 17 in Gazi, a short walk from Kerameikos metro. Doors open at 20:00. Presale tickets are €15 through cometogether.live or at the two physical presale points. Some door selection applies on big nights, but arriving by doors-open for a three-band bill means you are in without issue. The after-party continues at the venue.
> 
> Thirty-five years from first demo to anniversary headline. The bands that last this long in the Greek underground do not do it for the money.

**GATE FAILURES TO FIX:**
- `SPECULATION`: Speculative language detected: "likely", "will likely" — state verified facts only

**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.

**Venue intel:**
```
### Temple Athens
| Field | Data |
|-------|------|
| **Address** | Iakhou 17, Gazi |
| **Metro** | Kerameikos (Blue) |
| **Capacity** | ~600 |
| **Entry** | €15-25 |
| **Door Policy** | Some selection on big nights |
| **Sound** | Funktion-One, serious laser rig |
| **Character** | Big-room techno, two floors, basement is the peak experience |
```

### Release Athens 2026 / Moby (REWRITE)
- **ID**: b7cf9f6e3e70f94e
- **Type**: concert
- **Venue**: Πλατεία Νερού
- **Price**: with-ticket
- **Date**: 2026-06-24T20:00:00+03:00
- **Time**: 18:00
- **URL**: https://www.more.com/gr-el/tickets/music/festival/release-athens-2026/moby/
- **Source**: more.com
- **Category**: concert_local
- **Target words (English)**: 80-120
- **Structure**: three-part-block
- **Tier**: stub

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> Moby arrives at Piazza Nerú on the festival's final day carrying 35 years of electronic music history: from techno minimalism (early 1990s) through the moment when dance music became stadium-scale (Play album, 1999) through retreat into ambient composition. You're watching someone who understood the trajectory of electronic music before most people heard it, who chose to go backwards into complexity after achieving massive commercial success.
> 
> The live setup is visual: screens, lights, sound design. Moby typically tours with a live band (drums, bass, additional layers) mixed with electronic elements. The show treats electronic music as a collaborative performance, not a DJ pressing play. The setlist might include "Porcelain," "Play era hits," plus newer ambient material — the show respects his entire evolution, not just the moments that charted.
> 
> The crowd on festival day three is the residual serious audience: people for whom Moby is the reason they stayed through the weekend, people who understand his recent work rather than just his 1990s fame, younger people discovering him through his ambient compositions. The energy is celebratory but reflective. Everyone here has invested in the whole festival; they're finishing strong.
> 
> Piazza Nerú after two days of festival operations is settled, understood, comfortable. The crowd knows where things are. The infrastructure is tested. The vibe is less "arrival" and more "conclusion" — this is the moment where people commit to the night because they've already committed to the weekend.
> 
> | Aspect | Details |
> |--------|---------|
> | **Setting** | Piazza Nerú, Faliron — open-air festival stage, water views |
> | **Vibe** | Festival conclusion, serious audiences, contemplative but energetic |
> | **Sound** | Live electronic performance with visual elements, festival sound system |
> | **Door** | Festival entry |
> 
> If you need maximum energy, day three of festivals is often when people are tired. But if you want to see Moby close a three-day festival with full commitment to both his repertoire and the crowd he's built over 35 years — this is where that happens.
> 
> | Info | Details |
> |------|---------|
> | **Date** | Wednesday, June 24, 2026 |
> | **Doors** | 15:00 (or varies if festival continues) |
> | **Music starts** | ~16:00 (if daytime), ~21:00+ (Moby, if evening closer) |
> | **Duration** | Full day or evening |
> | **Price** | 3-day pass (if still valid) or single-day pass €45-60 |
> | **Tickets** | Festival website |
> | **Address** | Piazza Nerú, Faliron |
> | **Getting there** | Metro to Faliron (Red Line), 10 minutes, or taxi €8-10 |
> | **Last metro** | 01:30 (Wednesday night, minimal service) |
> | **Payment** | Cards and cash |
> | **Good to know** | Confirm timing with Release Athens organizers — June 24 might be outside official festival dates. This could be a separate ticketed show rather than festival. Verify before assuming day-pass validity. |

**GATE FAILURES TO FIX:**
- `SPECULATION`: Speculative language detected: "might include", "could be" — state verified facts only

**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.


### Professor BRIAN COX: Emergence (REWRITE)
- **ID**: eff502c25197a121
- **Type**: theater
- **Venue**: Christmas Theater
- **Price**: with-ticket
- **Date**: 2026-09-24T20:00:00+03:00
- **Time**: 20:00
- **URL**: https://www.viva.gr/gr-el/tickets/professor-brian-cox-in-athens/
- **Source**: more.com
- **Category**: theater_contemporary
- **Target words (English)**: 120-180
- **Structure**: hybrid
- **Tier**: standard

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> The lights lower and the stage becomes a lecturer's podium converted into something that feels like science theater. Brian Cox arrives, and you settle into seats knowing that the next hours will expand your understanding of how the universe works while making you laugh at least twice. Christmas Theater fills with people who've decided that emergency and emergence deserve equal attention.
> 
> Brian Cox brings his particular alchemy to scientific communication. The physicist understands that wonder is the gateway to understanding, that humor disarms defensiveness, that complexity becomes digestible when presented by someone genuinely excited about the subject. His shows function as TED talks that remember TED invented the format to make ideas matter.
> 
> "Emergence" as a concept encompasses everything from particle physics through consciousness. Cox will likely explore how complex systems develop from simple rules, how patterns emerge from chaos, why consciousness remains simultaneously explicable and mysterious. The presentation will include slides, likely video, and Cox's particular skill at making the abstract concrete through analogy and example.
> 
> Christmas Theater provides the theatrical frame this kind of presentation requires. The venue's dramatic history — over a century of performances — adds weight to an evening already conceptually dense. The stage technology allows for sophisticated visual support, the sound system carries Cox's sometimes-rapid speech clearly, the seating positions audiences for genuine engagement rather than passive reception.
> 
> The crowd mixes demographics in specific ways. Scientists and science students. Teachers building curricula. Families introducing children to cosmic perspective. Cox enthusiasts who follow his media work. The conversations before the show compare favorite books or podcasts, establish the shared context that makes this kind of event meaningful.
> 
> Cox's delivery will determine the evening's success. His credibility rests on genuine expertise — he works at CERN, publishes peer-reviewed research, understands physics at levels most communicators don't approach. When he explains why quantum mechanics challenges our intuitions, he's speaking from deep knowledge translated into accessibility.
> 
> If you need entertainment divorced from intellectual demand, Brian Cox will frustrate expectations. This is genuinely educational content, delivered with production values. But if you've been seeking science communication that treats audiences like intelligent beings capable of grasping sophisticated concepts — Christmas Theater holds this particular enlightenment.
> 
> | Info | Details |
> |------|---------| 
> | **Date** | Thursday, September 24, 2026 |
> | **Time** | Evening |
> | **Venue** | Christmas Theater |
> | **Presenter** | Brian Cox |
> | **Topic** | Emergence |
> | **Price** | Check venue |
> | **Duration** | ~2 hours |
> 
> Brian Cox on Emergence — science as wonder, clarity as gift.

**GATE FAILURES TO FIX:**
- `SPECULATION`: Speculative language detected: "likely", "will likely" — state verified facts only

**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.


### WAVMAP: Panel Discussion & Club Night (REWRITE)
- **ID**: f7e6dde4e19f4a0b
- **Type**: dj_set
- **Venue**: Bios Ρομάντσο
- **Price**: paid
- **Date**: 2026-03-06T20:00:00
- **Time**: 20:00
- **URL**: https://ra.co/events/2381641
- **Source**: residentadvisor
- **Category**: concert_local
- **Target words (English)**: 80-120
- **Structure**: three-part-block
- **Tier**: stub

**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**

> The Bauhaus facade on Pireos 84 gives nothing away — concrete, industrial, a former printing house that looks like it could be anything. You walk through the ground-floor bar, past the cocktail crowd at Tesla, and follow the staircase down to the basement where the Funktion-One system waits behind a wall of low light.
> 
> WAVMAP is a European platform built to connect independent electronic music scenes across borders — an interactive map that tracks collectives, labels, venues, and artists working outside the mainstream circuit. This Athens stop is part of their 2026 European tour, and the format splits the evening in two: a panel discussion upstairs exploring what it takes to sustain an electronic music ecosystem — club infrastructure, festival networks, government support, the economics of running a scene — followed by a club night in the basement where the conversation meets the dance floor. The panel asks a question Athens has been answering for a decade: how does a city with no major festival circuit and limited venue infrastructure produce a scene that draws bookings from Autechre to Objekt?
> 
> The crowd is scene-adjacent: promoters, label runners, DJs who aren't playing tonight, and the dancers who follow the collectives rather than the headliners. People who have opinions about sound systems and know which Athens basements have Funktion-One rigs. A handful of visitors from other European cities on the WAVMAP network, comparing notes.
> 
> | Aspect | Details |
> |--------|---------|
> | **Setting** | Bios Romantso — multi-space arts center, Bauhaus building, ~300 capacity across floors |
> | **Vibe** | Discursive then kinetic — conversation dissolves into movement |
> | **Sound** | Panel upstairs, Funktion-One basement club night — the system carries the low end through the concrete |
> | **Door** | Ticketed |
> 
> The panel runs first, likely in the ground-floor Tesla bar space, with practitioners from across Europe's independent scenes. Expect straight talk about money, policy, and sustainability — this isn't a branding exercise, it's a working conversation between people who book shows and balance budgets. When the panel wraps, the night migrates downstairs. The basement at Bios is one of Athens' better-kept small rooms: concrete walls, the Funktion-One rig, capacity around a hundred and fifty when it fills, and a sound that travels through the floor before it reaches your ears.
> 
> If you want a straightforward club night with a big name on the flyer, WAVMAP is more idea than spectacle — the panel is the point, and the club night is where the ideas get tested on the dance floor. But if you want to hear how Athens fits into Europe's independent electronic network, from the people building it, and then dance in one of Gazi's best basements — this is the room.
> 
> Bios is at Pireos 84, a five-minute walk from Kerameikos metro station. Doors at 20:00 for the panel discussion, with the club night following. Cocktails at the Tesla bar run around €9 — on the pricier side for Athens. The door policy is relaxed. Lines 2 and 3 of the metro run twenty-four hours on Saturdays, so getting home from a Friday-night event means checking the last train around midnight, though cabs from Gazi to the center run €8-12.
> 
> A platform that maps Europe's underground, testing its thesis in one of the basements that proves the point.

**GATE FAILURES TO FIX:**
- `SPECULATION`: Speculative language detected: "likely", "could be" — state verified facts only

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

---

## Execution Instructions

For EACH event:

1. **Read existing description** and understand what's being said
2. **Research**: WebSearch the event URL to verify facts. Search for any claims you're unsure about.
3. **Write rewritten description**: Save to `temp-descriptions/rewrite-6/`:
   ```bash
   bun run scripts/write-description.ts <event-id> --batch-dir=temp-descriptions/rewrite-6 "<rewritten description>"
   ```
4. **Gate check**: Validate:
   ```bash
   bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-6/<event-id>.md --tier=<tier> --event-id=<event-id> \
     --event-type=<type> --event-venue="<venue>" --event-title="<title>" \
     --event-date=<date> --event-price=<price>
   ```
5. **Gate score must be >= 85 with 0 errors** before proceeding to next event.

### Per-Event Gate Check Commands

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-6/a7a05d59d0b6dcbb.md \
  --tier=stub --event-id=a7a05d59d0b6dcbb \
  --event-type=dj_set --event-venue="Temple" \
  --event-title="DEVISER" \
  --event-date=2026-03-07 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-6/b7cf9f6e3e70f94e.md \
  --tier=stub --event-id=b7cf9f6e3e70f94e \
  --event-type=concert --event-venue="Πλατεία Νερού" \
  --event-title="Release Athens 2026 / Moby" \
  --event-date=2026-06-24 --event-price=with-ticket
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-6/eff502c25197a121.md \
  --tier=standard --event-id=eff502c25197a121 \
  --event-type=theater --event-venue="Christmas Theater" \
  --event-title="Professor BRIAN COX: Emergence" \
  --event-date=2026-09-24 --event-price=with-ticket
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/rewrite-6/f7e6dde4e19f4a0b.md \
  --tier=stub --event-id=f7e6dde4e19f4a0b \
  --event-type=dj_set --event-venue="Bios Ρομάντσο" \
  --event-title="WAVMAP: Panel Discussion & Club Night" \
  --event-date=2026-03-06 --event-price=paid
```

### Save Command

After all events pass gates:
```bash
bun run scripts/save-batch.ts --manifest=temp-briefs/rewrite-6.manifest.json --session=rewrite-6 --batch=R6 --clean
```
