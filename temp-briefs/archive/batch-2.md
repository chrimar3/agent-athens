# Enrichment Brief — Batch 2

## VERIFICATION CHECKLIST
- This is Batch 2
- Event IDs: 039c065f65e9e68c, 9fe5c1b520ebef17, e6dba1f891ea5e9a
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

### Μυρτώ Βασιλείου
- **ID**: 039c065f65e9e68c
- **Type**: concert
- **Venue**: Σταυρός του Νότου
- **Price**: paid
- **Date**: 2026-03-06
- **Time**: 21:30
- **URL**: https://www.athinorama.gr/music/gig/murto_basileiou-10085504/
- **Source**: athinorama.gr
- **Category**: concert_major
- **Target words (English)**: 120-200
- **Target words (Greek)**: 100-170
- **Structure**: hybrid
- **HARD CONSTRAINT**: English description MUST be 120-200 words. Greek MUST be 100-170 words.
- **Venue intel**: Not in database. WebSearch "Σταυρός του Νότου Athens" for context.

### ΤΕΛΕΥΤΑΙΑ ΕΞΟΔΟΣ - ΡΙΤΑ ΧΕΙΓΟΥΟΡΘ
- **ID**: 9fe5c1b520ebef17
- **Type**: theater
- **Venue**: Άνεσις
- **Price**: paid
- **Date**: 2026-03-04T20:00:00
- **Time**: 20:00
- **URL**: https://www.more.com/gr-el/tickets/theater/teleftaiaexodos/
- **Source**: more.com
- **Category**: theater_contemporary
- **Target words (English)**: 120-180
- **Target words (Greek)**: 100-155
- **Structure**: hybrid
- **HARD CONSTRAINT**: English description MUST be 120-180 words. Greek MUST be 100-155 words.
- **Venue intel**: Not in database. WebSearch "Άνεσις Athens" for context.

### PRIMAL INSTINCT x SMUT with Chlär x Hadone x Vera Grace
- **ID**: e6dba1f891ea5e9a
- **Type**: dj_set
- **Venue**: SMUT Athens
- **Price**: tba
- **Date**: 2026-04-04T23:59:00
- **Time**: 23:59
- **URL**: https://ra.co/events/2377756
- **Source**: residentadvisor
- **Category**: concert_local
- **Target words (English)**: 80-120
- **Target words (Greek)**: 70-100
- **Structure**: three-part-block
- **HARD CONSTRAINT**: English description MUST be 80-120 words. Greek MUST be 70-100 words.
- **Venue intel** (from database):
  ```
  ### SMUT Athens
  | Field | Data |
  |-------|------|
  | **Address** | Vatsaxi 4 |
  | **Metro** | Varies by location |
  | **Capacity** | ~300 |
  | **Entry** | €15-20 via Resident Advisor |
  | **Door Policy** | STRICT — creative/fetish attire required for many events |
  | **Tickets** | RA tickets = priority, not guaranteed entry |
  | **Schedule** | Saturday nights (weekly institution) |
  | **Character** | Queer techno, identity-driven, serious community |
  | **Crowd** | Queer community and allies who understand dress codes |
  
  ---
  ```

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
bun run scripts/auto-gate-check.ts temp-descriptions/batch-2/039c065f65e9e68c.md \
  --tier=standard --event-id=039c065f65e9e68c \
  --event-type=concert --event-venue="Σταυρός του Νότου" \
  --event-title="Μυρτώ Βασιλείου" \
  --event-date=2026-03-06 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-2/9fe5c1b520ebef17.md \
  --tier=standard --event-id=9fe5c1b520ebef17 \
  --event-type=theater --event-venue="Άνεσις" \
  --event-title="ΤΕΛΕΥΤΑΙΑ ΕΞΟΔΟΣ - ΡΙΤΑ ΧΕΙΓΟΥΟΡΘ" \
  --event-date=2026-03-04 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-2/e6dba1f891ea5e9a.md \
  --tier=stub --event-id=e6dba1f891ea5e9a \
  --event-type=dj_set --event-venue="SMUT Athens" \
  --event-title="PRIMAL INSTINCT x SMUT with Chlär x Hadone x Vera Grace" \
  --event-date=2026-04-04 --event-price=tba
```

After all events, create `temp-descriptions/batch-2/batch-2-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| 039c065f65e9e68c | Μυρτώ Βασιλείου | /100 | | |
| 9fe5c1b520ebef17 | ΤΕΛΕΥΤΑΙΑ ΕΞΟΔΟΣ - ΡΙΤΑ ΧΕΙΓΟΥΟΡΘ | /100 | | |
| e6dba1f891ea5e9a | PRIMAL INSTINCT x SMUT with Chlär x Hadone x Vera Grace | /100 | | |
