# Enrichment Brief — Batch 1

## VERIFICATION CHECKLIST
- This is Batch 1
- Event IDs: 0f44f23bc6d9f2cc, a212a64d64754e1c, 1f9c77e72ae30c1d, fba1c7ce5b2ac36e, 68930d495ce2405d
- Write descriptions to: temp-descriptions/batch-1/
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

### Ο Του-του και η Τσαφ-τσουφ
- **ID**: 0f44f23bc6d9f2cc
- **Type**: theater
- **Venue**: Olvio
- **Price**: paid
- **Date**: 2026-03-03T10:30:00
- **Time**: 10:30
- **URL**: https://www.athinorama.gr/theatre/performance/o_tou_tou_kai_i_tsaf_tsouf-10066380/
- **Source**: athinorama.gr
- **Category**: theater_contemporary
- **Target words (Greek)**: 120-180
- **Target words (English)**: 100-155
- **Structure**: hybrid
- **HARD CONSTRAINT**: Greek description MUST be 120-180 words. English MUST be 100-155 words.
- **Venue intel**: Not in database. WebSearch "Olvio Athens" for context.

### Το μαγικό εισιτήριο
- **ID**: a212a64d64754e1c
- **Type**: concert
- **Venue**: Μέγαρο Μουσικής Αθηνών
- **Price**: paid
- **Date**: 2026-03-03T10:30:00
- **Time**: 10:30
- **URL**: https://www.athinorama.gr/theatre/performance/to_magiko_eisitirio-10088235/
- **Source**: athinorama.gr
- **Category**: premium_showcase
- **Target words (Greek)**: 400-600
- **Target words (English)**: 340-510
- **Structure**: full-8-section
- **HARD CONSTRAINT**: Greek description MUST be 400-600 words. English MUST be 340-510 words.
- **Venue intel**: Not in database. WebSearch "Μέγαρο Μουσικής Αθηνών Athens" for context.

### Αλιγάτορες
- **ID**: 1f9c77e72ae30c1d
- **Type**: dj_set
- **Venue**: AUDITORIUM
- **Price**: paid
- **Date**: 2026-03-03T21:00:00
- **Time**: 21:00
- **URL**: https://www.athinorama.gr/theatre/performance/aligatores-10081818/
- **Source**: athinorama.gr
- **Category**: concert_local
- **Target words (Greek)**: 80-120
- **Target words (English)**: 70-100
- **Structure**: three-part-block
- **HARD CONSTRAINT**: Greek description MUST be 80-120 words. English MUST be 70-100 words.
- **Venue intel**: Not in database. WebSearch "AUDITORIUM Athens" for context.

### FIGHT FOR GLORY III
- **ID**: fba1c7ce5b2ac36e
- **Type**: sports
- **Venue**: Christmas Theater
- **Price**: paid
- **Date**: 2026-03-07T18:00:00
- **Time**: 18:00
- **URL**: https://www.more.com/gr-el/tickets/sports/fight-for-glory-iii/
- **Source**: more.com
- **Category**: default
- **Target words (Greek)**: 120-200
- **Target words (English)**: 100-170
- **Structure**: hybrid
- **HARD CONSTRAINT**: Greek description MUST be 120-200 words. English MUST be 100-170 words.
- **Venue intel**: Not in database. WebSearch "Christmas Theater Athens" for context.

### Δεν θα πεθάνουμε κιόλας
- **ID**: 68930d495ce2405d
- **Type**: show
- **Venue**: Red Jasper Cabaret Theatre
- **Price**: paid
- **Date**: 2026-03-03T21:00:00
- **Time**: 21:00
- **URL**: https://www.athinorama.gr/theatre/performance/den_tha_pethanoume_kiolas-10088694/
- **Source**: athinorama.gr
- **Category**: default
- **Target words (Greek)**: 120-200
- **Target words (English)**: 100-170
- **Structure**: hybrid
- **HARD CONSTRAINT**: Greek description MUST be 120-200 words. English MUST be 100-170 words.
- **Venue intel**: Not in database. WebSearch "Red Jasper Cabaret Theatre Athens" for context.

---

## Execution Instructions

For EACH event:

1. **Research**: WebSearch the event URL for details. Search for artist/performer background. Also search the venue if writing sensory opening details about the physical space — unverified atmosphere (invented food smells, assumed decor) is a fabrication violation even if it sounds plausible.
2. **Write description**: Save to batch directory (temp-descriptions/batch-1/):
   ```bash
   bun run scripts/write-description.ts <event-id> --batch-dir=temp-descriptions/batch-1 "<description text>"
   ```
3. **Gate check**: Validate quality with metadata flags (no DB needed):
   ```bash
   bun run scripts/auto-gate-check.ts temp-descriptions/batch-1/<event-id>.md --tier=<tier> --event-id=<event-id> \
     --event-type=<type> --event-venue="<venue>" --event-title="<title>" \
     --event-date=<date> --event-price=<price>
   ```
   Tier mapping: three-part-block=stub, hybrid=standard, full-8-section=premium
4. **Write tags** (from taxonomy in docs/MASTER-ENRICHMENT-TEMPLATE.md):
   ```bash
   bun run scripts/write-tags.ts <event-id> --batch-dir=temp-descriptions/batch-1 Tag1 Tag2 Tag3...
   ```
5. **Write English description**: Write a parallel English version of the description.
   Save to `temp-descriptions/batch-1/<event-id>.en.md`. English word target shown per event above.
   ```bash
   bun run scripts/write-description.ts <event-id> --batch-dir=temp-descriptions/batch-1 --lang=en "<english description>"
   ```
   **Entity Locking rules** (terms that MUST stay untranslated — see below):
   - Greek music genres: rebetiko, laiko, entechno, etc. (never "urban folk" or "art song")
   - Venue names: use Latin transliteration or established English brand name
   - Neighborhoods: Koukaki, Exarchia, Psyrri (never translate)
   - Cultural concepts: kefi, meraki, parea, glendi (never translate)
   - Dates: DD Month YYYY format. Times: 24h format. Currency: EUR.
   - The English version is NOT a translation. Write it fresh for an international audience.
   - Same 8-section structure, same factual content, but natural English voice.
6. **Save decision** (after completing ALL events in this batch):
   - If ALL gate scores are >= 85 AND all have 0 errors: auto-save to database:
   ```bash
   bun run scripts/save-batch.ts --manifest=temp-briefs/batch-1.manifest.json --session=batch-1 --batch=1 --clean
   ```
   Note "AUTO-SAVED" at the top of batch-1-review.md.
   - If ANY score is < 85 OR any have errors: do NOT run save-batch.ts.
     Note "LEFT FOR REVIEW" at the top of batch-1-review.md with reasons.

### Per-Event Gate Check Commands

Copy-paste these with the correct tier for each event:

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-1/0f44f23bc6d9f2cc.md \
  --tier=standard --event-id=0f44f23bc6d9f2cc \
  --event-type=theater --event-venue="Olvio" \
  --event-title="Ο Του-του και η Τσαφ-τσουφ" \
  --event-date=2026-03-03 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-1/a212a64d64754e1c.md \
  --tier=premium --event-id=a212a64d64754e1c \
  --event-type=concert --event-venue="Μέγαρο Μουσικής Αθηνών" \
  --event-title="Το μαγικό εισιτήριο" \
  --event-date=2026-03-03 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-1/1f9c77e72ae30c1d.md \
  --tier=stub --event-id=1f9c77e72ae30c1d \
  --event-type=dj_set --event-venue="AUDITORIUM" \
  --event-title="Αλιγάτορες" \
  --event-date=2026-03-03 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-1/fba1c7ce5b2ac36e.md \
  --tier=standard --event-id=fba1c7ce5b2ac36e \
  --event-type=sports --event-venue="Christmas Theater" \
  --event-title="FIGHT FOR GLORY III" \
  --event-date=2026-03-07 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-1/68930d495ce2405d.md \
  --tier=standard --event-id=68930d495ce2405d \
  --event-type=show --event-venue="Red Jasper Cabaret Theatre" \
  --event-title="Δεν θα πεθάνουμε κιόλας" \
  --event-date=2026-03-03 --event-price=paid
```

After all events, create `temp-descriptions/batch-1/batch-1-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| 0f44f23bc6d9f2cc | Ο Του-του και η Τσαφ-τσουφ | /100 | | |
| a212a64d64754e1c | Το μαγικό εισιτήριο | /100 | | |
| 1f9c77e72ae30c1d | Αλιγάτορες | /100 | | |
| fba1c7ce5b2ac36e | FIGHT FOR GLORY III | /100 | | |
| 68930d495ce2405d | Δεν θα πεθάνουμε κιόλας | /100 | | |
