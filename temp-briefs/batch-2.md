# Enrichment Brief — Batch 2

## VERIFICATION CHECKLIST
- This is Batch 2
- Event IDs: 071a4e10185f0b75, 282ef93b3f829ac6, 79414abc6088feb4, ec374fb369c6d2d8, f6a40f4ff749fa82
- Write descriptions to: temp-descriptions/batch-2/
- BEFORE writing any file, verify the event ID appears in this list
- ⚠️ DO NOT omit --batch-dir= from write commands. Files without --batch-dir go to a shared directory and contaminate other batches.

You are writing premium event descriptions for Agent Athens, an AI-curated cultural events calendar for Athens, Greece.

## Rules

1. **8-section structure**: Sensory opening → Credentials → Tribe → Details table → Experience → Filter → Logistics → Closer
2. **Voice**: Second person ("you"), present tense, sensory-first. Transport before inform.
3. **Word count**: Per-event target shown below each event (NOT always 400-600). Follow the target range — these are hard constraints, not suggestions.
4. **Details table**: 4 rows — Setting, Vibe, Sound, Door (or Format/Access for tech events)
5. **Filter section**: Always include "If you [don't want X]... But if you [want Y]..."
6. **Show don't tell**: No lazy adjectives (amazing, incredible, fantastic, wonderful, stunning, vibrant)
7. **Tribe**: Describe crowd by character/behavior, not demographics
8. **Logistics**: Metro station, walking distance, ticket prices, practical tips
9. **Closer**: One tight sentence — scarcity, uniqueness, or urgency
10. **CRITICAL: Do not fabricate information.** If you can't find a fact, omit it.
11. **Terminology**: Use "open" not "free". Latin transliteration for Greek names in prose.
12. **Description only**: No tags, no "Last verified", no info tables beyond Aspect/Details.
13. **VENUE OPENINGS**: If you write sensory details about a venue's physical space (smells, decor, lighting, food/drink), you MUST have found these through WebSearch or venue intel provided. Do not invent plausible atmosphere. If no venue details are available, open with the event's sound, the performer's first action, or the audience's energy instead.
14. **CREDENTIALS**: If you cannot verify a specific release, album, label, or credential through web search, do not include it. State what you can confirm. A missing detail is always better than a wrong one. If web search returns nothing on an artist, say so in batch-review.md and use a venue-forward approach.
15. **OPENING DIVERSITY**: Do not default to sound-first openings. After writing all descriptions in this batch, re-read your openings consecutively. If more than 2 of 5 use the same entry strategy (sound-first, space-first, action-first), rewrite one using a different approach. Options: visual detail, physical action, temporal framing, contrast/tension, a question the space poses.
16. **CLOSER DIVERSITY**: Do not reuse the word "combination" or the phrase "will not reassemble/recur" across multiple closers in the same batch. Each closer must find its own structural fact or framing.

## Exemplars (read for structural guidance)

- `exemplars/theater-tartuffe.md` — structural reference
- `exemplars/classical-lpo-jarvi.md` — structural reference
- `exemplars/exhibition-swinton.md` — structural reference

## Anti-patterns

Read `docs/enrichment-anti-patterns.md` for 10 confirmed mistakes to avoid.

## Entity Locking (English Descriptions)

These terms MUST remain untranslated in English descriptions:

- **Music genres**: rebetiko, rembetika, laiko, laika, entechno, nisiotika, dimotika, amanedhes, zeibekiko, tsifteteli, hasapiko, syrtos, kalamatianos, mandinades
- **Instruments**: bouzouki, baglamas, tzouras, oud, kanun, lyra, santouri, laouto
- **Venue types**: bouzoukia, steki, ouzeri, mezedopoleio, kafeneio, taverna, psistaria
- **Cultural concepts**: kefi, meraki, filotimo, parea, glendi, panigiri, kouventa
- **Venue names**: Inherit from DB (use Latin transliteration or established English name)
- **Neighborhoods**: Inherit from DB (use established transliterations)
- **Date format**: DD Month YYYY (e.g., '15 March 2026', never '15/3/2026' or 'March 15, 2026')
- **Time format**: 24h format with colon (e.g., '21:00', never '9 PM')
- **Currency**: EUR symbol before amount (e.g., '15 EUR' or 'EUR 15', never '$15')

---

## Events to Enrich

### Rave Ritual
- **ID**: 071a4e10185f0b75
- **Type**: dj_set
- **Venue**: Temple
- **Price**: paid
- **Date**: 2026-03-27T23:59:00
- **Time**: 23:59
- **URL**: https://ra.co/events/2367186
- **Source**: residentadvisor
- **Category**: concert_local
- **Target words (English)**: 80-120
- **Target words (Greek)**: 70-100
- **Structure**: three-part-block
- **HARD CONSTRAINT**: English description MUST be 80-120 words. Greek MUST be 70-100 words.
- **Venue intel** (from database):
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
  
  ---
  ```

### Duo Duende
- **ID**: 282ef93b3f829ac6
- **Type**: concert
- **Venue**: Ωδείο Αθηνών
- **Price**: paid
- **Date**: 2026-03-06
- **Time**: 20:30
- **URL**: https://www.athinorama.gr/music/gig/duo_duende-10089251/
- **Source**: athinorama.gr
- **Category**: concert_local
- **Target words (English)**: 80-120
- **Target words (Greek)**: 70-100
- **Structure**: three-part-block
- **HARD CONSTRAINT**: English description MUST be 80-120 words. Greek MUST be 70-100 words.
- **Venue intel**: Not in database. WebSearch "Ωδείο Αθηνών Athens" for context.

### ΜΑΡΤΥΡΑΣ ΚΑΤΗΓΟΡΙΑΣ 3ος Χρόνος
- **ID**: 79414abc6088feb4
- **Type**: theater
- **Venue**: Θέατρο Χορν
- **Price**: paid
- **Date**: 2026-03-04T20:00:00
- **Time**: 20:00
- **URL**: https://www.more.com/gr-el/tickets/theater/martyras-katigorias/
- **Source**: more.com
- **Category**: theater_contemporary
- **Target words (English)**: 120-180
- **Target words (Greek)**: 100-155
- **Structure**: hybrid
- **HARD CONSTRAINT**: English description MUST be 120-180 words. Greek MUST be 100-155 words.
- **Venue intel**: Not in database. WebSearch "Θέατρο Χορν Athens" for context.

### SOCIETY 3000 invites Ben Pest (Live)
- **ID**: ec374fb369c6d2d8
- **Type**: dj_set
- **Venue**: Astron
- **Price**: paid
- **Date**: 2026-03-28T23:00:00
- **Time**: 23:00
- **URL**: https://ra.co/events/2370430
- **Source**: residentadvisor
- **Category**: concert_local
- **Target words (English)**: 80-120
- **Target words (Greek)**: 70-100
- **Structure**: three-part-block
- **HARD CONSTRAINT**: English description MUST be 80-120 words. Greek MUST be 70-100 words.
- **Venue intel** (from database):
  ```
  ### Astron Club
  | Field | Data |
  |-------|------|
  | **Address** | Leoforos Konstantinoupoleos 121, Gazi |
  | **Metro** | Kerameikos (Blue) |
  | **Capacity** | ~150 ("the box") |
  | **Entry** | €10-15 |
  | **Door Policy** | Berlin-lite selection — singles > groups, couples sometimes rejected, "look like you dance" |
  | **Drinks** | Alfa beer ONLY, €5 |
  | **Finding it** | NO SIGN — look for shaking windows |
  | **Acts** | Helena Hauff, DJ Bone caliber |
  | **Note** | Relocated to Gazi summer 2024 |
  
  ---
  ```

### Divas Drive Trio
- **ID**: f6a40f4ff749fa82
- **Type**: concert
- **Venue**: Μέγαρο Μουσικής Αθηνών
- **Price**: paid
- **Date**: 2026-03-06
- **Time**: 20:00
- **URL**: https://www.ticketservices.gr/event/14174/
- **Source**: ticketservices
- **Category**: premium_showcase
- **Target words (English)**: 400-600
- **Target words (Greek)**: 340-510
- **Structure**: full-8-section
- **HARD CONSTRAINT**: English description MUST be 400-600 words. Greek MUST be 340-510 words.
- **Venue intel**: Not in database. WebSearch "Μέγαρο Μουσικής Αθηνών Athens" for context.

---

## Execution Instructions

For EACH event:

1. **Research**: WebSearch the event URL for details. Search for artist/performer background. Also search the venue if writing sensory opening details about the physical space — unverified atmosphere (invented food smells, assumed decor) is a fabrication violation even if it sounds plausible.
2. **Write description**: Save to batch directory (temp-descriptions/batch-2/):
   ```bash
   bun run scripts/write-description.ts <event-id> --batch-dir=temp-descriptions/batch-2 "<description text>"
   ```
3. **Gate check**: Validate quality with metadata flags (no DB needed):
   ```bash
   bun run scripts/auto-gate-check.ts temp-descriptions/batch-2/<event-id>.md --tier=<tier> --event-id=<event-id> \
     --event-type=<type> --event-venue="<venue>" --event-title="<title>" \
     --event-date=<date> --event-price=<price>
   ```
   Tier mapping: three-part-block=stub, hybrid=standard, full-8-section=premium
4. **Write tags** (from taxonomy in docs/MASTER-ENRICHMENT-TEMPLATE.md):
   ```bash
   bun run scripts/write-tags.ts <event-id> --batch-dir=temp-descriptions/batch-2 Tag1 Tag2 Tag3...
   ```
5. **Write Greek description** (optional secondary): Write a condensed Greek version.
   Save to `temp-descriptions/batch-2/<event-id>.gr.md`. Greek word target shown per event above.
   ```bash
   bun run scripts/write-description.ts <event-id> --batch-dir=temp-descriptions/batch-2 --lang=gr "<greek description>"
   ```
   **Greek description rules**:
   - Cultural terms in Greek (e.g., ρεμπέτικο, λαϊκό, έντεχνο — not transliterated)
   - Use "ελεύθερη είσοδος" not "δωρεάν" for free events
   - Venue names in Greek script where available
   - Same 8-section structure, same factual content, but natural Greek voice
   - The Greek version is NOT a translation. Write it fresh for a local audience.
6. **Save decision** (after completing ALL events in this batch):
   - If ALL gate scores are >= 85 AND all have 0 errors: auto-save to database:
   ```bash
   bun run scripts/save-batch.ts --manifest=temp-briefs/batch-2.manifest.json --session=batch-2 --batch=2 --clean
   ```
   Note "AUTO-SAVED" at the top of batch-2-review.md.
   - If ANY score is < 85 OR any have errors: do NOT run save-batch.ts.
     Note "LEFT FOR REVIEW" at the top of batch-2-review.md with reasons.

### Per-Event Gate Check Commands

Copy-paste these with the correct tier for each event:

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-2/071a4e10185f0b75.md \
  --tier=stub --event-id=071a4e10185f0b75 \
  --event-type=dj_set --event-venue="Temple" \
  --event-title="Rave Ritual" \
  --event-date=2026-03-27 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-2/282ef93b3f829ac6.md \
  --tier=stub --event-id=282ef93b3f829ac6 \
  --event-type=concert --event-venue="Ωδείο Αθηνών" \
  --event-title="Duo Duende" \
  --event-date=2026-03-06 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-2/79414abc6088feb4.md \
  --tier=standard --event-id=79414abc6088feb4 \
  --event-type=theater --event-venue="Θέατρο Χορν" \
  --event-title="ΜΑΡΤΥΡΑΣ ΚΑΤΗΓΟΡΙΑΣ 3ος Χρόνος" \
  --event-date=2026-03-04 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-2/ec374fb369c6d2d8.md \
  --tier=stub --event-id=ec374fb369c6d2d8 \
  --event-type=dj_set --event-venue="Astron" \
  --event-title="SOCIETY 3000 invites Ben Pest (Live)" \
  --event-date=2026-03-28 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-2/f6a40f4ff749fa82.md \
  --tier=premium --event-id=f6a40f4ff749fa82 \
  --event-type=concert --event-venue="Μέγαρο Μουσικής Αθηνών" \
  --event-title="Divas Drive Trio" \
  --event-date=2026-03-06 --event-price=paid
```

After all events, create `temp-descriptions/batch-2/batch-2-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| 071a4e10185f0b75 | Rave Ritual | /100 | | |
| 282ef93b3f829ac6 | Duo Duende | /100 | | |
| 79414abc6088feb4 | ΜΑΡΤΥΡΑΣ ΚΑΤΗΓΟΡΙΑΣ 3ος Χρόνος | /100 | | |
| ec374fb369c6d2d8 | SOCIETY 3000 invites Ben Pest (Live) | /100 | | |
| f6a40f4ff749fa82 | Divas Drive Trio | /100 | | |
