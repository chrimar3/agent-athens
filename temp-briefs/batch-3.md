# Enrichment Brief — Batch 3

## VERIFICATION CHECKLIST
- This is Batch 3
- Event IDs: 7a3375a33dfdd28d, c635bf723dbf1529, 47aa1c5ccd3f4371, a69995ce11705178, 5eb0304ea7b10136
- Write descriptions to: temp-descriptions/batch-3/
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

### Η βασίλισσα των πάντων
- **ID**: 7a3375a33dfdd28d
- **Type**: concert
- **Venue**: Μέγαρο Μουσικής Αθηνών
- **Price**: paid
- **Date**: 2026-03-03T12:30:00
- **Time**: 12:30
- **URL**: https://www.athinorama.gr/theatre/performance/i_basilissa_ton_panton-10070185/
- **Source**: athinorama.gr
- **Category**: premium_showcase
- **Target words (Greek)**: 400-600
- **Target words (English)**: 340-510
- **Structure**: full-8-section
- **HARD CONSTRAINT**: Greek description MUST be 400-600 words. English MUST be 340-510 words.
- **Venue intel**: Not in database. WebSearch "Μέγαρο Μουσικής Αθηνών Athens" for context.

### ΚΟΛΟΣΣΟΣ H HOTELS - ΕΙΣΙΤΗΡΙΑ ΑΓΩΝΩΝ 2025-2026
- **ID**: c635bf723dbf1529
- **Type**: dj_set
- **Venue**: Κλειστό Καλλιθέας
- **Price**: paid
- **Date**: 2026-03-15
- **Time**: 12:45
- **URL**: https://www.more.com/gr-el/tickets/sports/kolossos-h-hotels-eisitiria-agonon-2025-2026/
- **Source**: more.com
- **Category**: concert_local
- **Target words (Greek)**: 80-120
- **Target words (English)**: 70-100
- **Structure**: three-part-block
- **HARD CONSTRAINT**: Greek description MUST be 80-120 words. English MUST be 70-100 words.
- **Venue intel**: Not in database. WebSearch "Κλειστό Καλλιθέας Athens" for context.

### Όταν ο Μίκης ήταν παιδί
- **ID**: 47aa1c5ccd3f4371
- **Type**: theater
- **Venue**: Ακροπόλ
- **Price**: paid
- **Date**: 2026-03-03T11:00:00
- **Time**: 11:00
- **URL**: https://www.athinorama.gr/theatre/performance/otan_o_mikis_itan_paidi-10087894/
- **Source**: athinorama.gr
- **Category**: kids_family
- **Target words (Greek)**: 120-180
- **Target words (English)**: 100-155
- **Structure**: hybrid
- **HARD CONSTRAINT**: Greek description MUST be 120-180 words. English MUST be 100-155 words.
- **Venue intel**: Not in database. WebSearch "Ακροπόλ Athens" for context.

### Ο Καπετάν Σαματάς
- **ID**: a69995ce11705178
- **Type**: concert
- **Venue**: Μέγαρο Μουσικής Αθηνών
- **Price**: paid
- **Date**: 2026-03-03T12:30:00
- **Time**: 12:30
- **URL**: https://www.athinorama.gr/theatre/performance/o_kapetan_samatas-10087293/
- **Source**: athinorama.gr
- **Category**: premium_showcase
- **Target words (Greek)**: 400-600
- **Target words (English)**: 340-510
- **Structure**: full-8-section
- **HARD CONSTRAINT**: Greek description MUST be 400-600 words. English MUST be 340-510 words.
- **Venue intel**: Not in database. WebSearch "Μέγαρο Μουσικής Αθηνών Athens" for context.

### Ρεσιτάλ Πιάνου Μαρία Ευστρατιάδη
- **ID**: 5eb0304ea7b10136
- **Type**: dj_set
- **Venue**: Parnassos Literary Society
- **Price**: paid
- **Date**: 2026-03-24T20:30:00
- **Time**: 20:30
- **URL**: https://www.ticketservices.gr/event/14199/
- **Source**: ticketservices
- **Category**: concert_local
- **Target words (Greek)**: 80-120
- **Target words (English)**: 70-100
- **Structure**: three-part-block
- **HARD CONSTRAINT**: Greek description MUST be 80-120 words. English MUST be 70-100 words.
- **Venue intel**: Not in database. WebSearch "Parnassos Literary Society Athens" for context.

---

## Execution Instructions

For EACH event:

1. **Research**: WebSearch the event URL for details. Search for artist/performer background. Also search the venue if writing sensory opening details about the physical space — unverified atmosphere (invented food smells, assumed decor) is a fabrication violation even if it sounds plausible.
2. **Write description**: Save to batch directory (temp-descriptions/batch-3/):
   ```bash
   bun run scripts/write-description.ts <event-id> --batch-dir=temp-descriptions/batch-3 "<description text>"
   ```
3. **Gate check**: Validate quality with metadata flags (no DB needed):
   ```bash
   bun run scripts/auto-gate-check.ts temp-descriptions/batch-3/<event-id>.md --tier=<tier> --event-id=<event-id> \
     --event-type=<type> --event-venue="<venue>" --event-title="<title>" \
     --event-date=<date> --event-price=<price>
   ```
   Tier mapping: three-part-block=stub, hybrid=standard, full-8-section=premium
4. **Write tags** (from taxonomy in docs/MASTER-ENRICHMENT-TEMPLATE.md):
   ```bash
   bun run scripts/write-tags.ts <event-id> --batch-dir=temp-descriptions/batch-3 Tag1 Tag2 Tag3...
   ```
5. **Write English description**: Write a parallel English version of the description.
   Save to `temp-descriptions/batch-3/<event-id>.en.md`. English word target shown per event above.
   ```bash
   bun run scripts/write-description.ts <event-id> --batch-dir=temp-descriptions/batch-3 --lang=en "<english description>"
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
   bun run scripts/save-batch.ts --manifest=temp-briefs/batch-3.manifest.json --session=batch-3 --batch=3 --clean
   ```
   Note "AUTO-SAVED" at the top of batch-3-review.md.
   - If ANY score is < 85 OR any have errors: do NOT run save-batch.ts.
     Note "LEFT FOR REVIEW" at the top of batch-3-review.md with reasons.

### Per-Event Gate Check Commands

Copy-paste these with the correct tier for each event:

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-3/7a3375a33dfdd28d.md \
  --tier=premium --event-id=7a3375a33dfdd28d \
  --event-type=concert --event-venue="Μέγαρο Μουσικής Αθηνών" \
  --event-title="Η βασίλισσα των πάντων" \
  --event-date=2026-03-03 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-3/c635bf723dbf1529.md \
  --tier=stub --event-id=c635bf723dbf1529 \
  --event-type=dj_set --event-venue="Κλειστό Καλλιθέας" \
  --event-title="ΚΟΛΟΣΣΟΣ H HOTELS - ΕΙΣΙΤΗΡΙΑ ΑΓΩΝΩΝ 2025-2026" \
  --event-date=2026-03-15 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-3/47aa1c5ccd3f4371.md \
  --tier=standard --event-id=47aa1c5ccd3f4371 \
  --event-type=theater --event-venue="Ακροπόλ" \
  --event-title="Όταν ο Μίκης ήταν παιδί" \
  --event-date=2026-03-03 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-3/a69995ce11705178.md \
  --tier=premium --event-id=a69995ce11705178 \
  --event-type=concert --event-venue="Μέγαρο Μουσικής Αθηνών" \
  --event-title="Ο Καπετάν Σαματάς" \
  --event-date=2026-03-03 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-3/5eb0304ea7b10136.md \
  --tier=stub --event-id=5eb0304ea7b10136 \
  --event-type=dj_set --event-venue="Parnassos Literary Society" \
  --event-title="Ρεσιτάλ Πιάνου Μαρία Ευστρατιάδη" \
  --event-date=2026-03-24 --event-price=paid
```

After all events, create `temp-descriptions/batch-3/batch-3-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| 7a3375a33dfdd28d | Η βασίλισσα των πάντων | /100 | | |
| c635bf723dbf1529 | ΚΟΛΟΣΣΟΣ H HOTELS - ΕΙΣΙΤΗΡΙΑ ΑΓΩΝΩΝ 2025-2026 | /100 | | |
| 47aa1c5ccd3f4371 | Όταν ο Μίκης ήταν παιδί | /100 | | |
| a69995ce11705178 | Ο Καπετάν Σαματάς | /100 | | |
| 5eb0304ea7b10136 | Ρεσιτάλ Πιάνου Μαρία Ευστρατιάδη | /100 | | |
