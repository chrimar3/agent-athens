# Enrichment Brief — Batch 121

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

---

## Events to Enrich

### Ο τρομερός εχθρός και ο αλυσοδεμένος ελέφαντας
- **ID**: c1cf579a32ab1ec8
- **Type**: theater
- **Venue**: Studio Μαυρομιχάλη
- **Price**: paid
- **Date**: 2026-03-02T11:30:00
- **Time**: 11:30
- **URL**: https://www.athinorama.gr/theatre/performance/o_tromeros_exthros_kai_o_alusodemenos_elefantas-10053307/
- **Source**: athinorama.gr
- **Category**: theater_contemporary
- **Target words**: 120-180
- **Structure**: hybrid
- **HARD CONSTRAINT**: Description MUST be 120-180 words.
- **Venue intel**: Not in database. WebSearch "Studio Μαυρομιχάλη Athens" for context.

### Lo
- **ID**: 9e364860d2d3bd3f
- **Type**: concert
- **Venue**: Bios Ρομάντσο
- **Price**: paid
- **Date**: 2026-03-02T21:00:00
- **Time**: 21:00
- **URL**: https://www.athinorama.gr/theatre/performance/lo-10088966/
- **Source**: athinorama.gr
- **Category**: concert_local
- **Target words**: 80-120
- **Structure**: three-part-block
- **HARD CONSTRAINT**: Description MUST be 80-120 words.
- **Venue intel** (from database):
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
  | **Character** | Multi-space arts center, Bauhaus building |
  
  ---
  ```

### Kaizen Klub with Chloé Robinson, Madam X (Bday Spesh), Poor J'Darr & Runner
- **ID**: bb35da04f5b13a73
- **Type**: dj_set
- **Venue**: Bios Ρομάντσο
- **Price**: paid
- **Date**: 2026-03-21T23:00:00
- **Time**: 23:00
- **URL**: https://ra.co/events/2378438
- **Source**: residentadvisor
- **Category**: concert_local
- **Target words**: 80-120
- **Structure**: three-part-block
- **HARD CONSTRAINT**: Description MUST be 80-120 words.
- **Venue intel** (from database):
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
  | **Character** | Multi-space arts center, Bauhaus building |
  
  ---
  ```

### Η φάρμα των ζώων – Η παράσταση αρχίζει!
- **ID**: 5a822c497d340dc7
- **Type**: theater
- **Venue**: Μέγαρο Μουσικής Αθηνών
- **Price**: paid
- **Date**: 2026-03-02T11:30:00
- **Time**: 11:30
- **URL**: https://www.athinorama.gr/theatre/performance/i_farma_ton_zoon_%e2%80%93_i_parastasi_arxizei!-10079278/
- **Source**: athinorama.gr
- **Category**: premium_showcase
- **Target words**: 400-600
- **Structure**: full-8-section
- **HARD CONSTRAINT**: Description MUST be 400-600 words.
- **Venue intel**: Not in database. WebSearch "Μέγαρο Μουσικής Αθηνών Athens" for context.

### (κρότος)
- **ID**: 7c2d68da8e52c38e
- **Type**: concert
- **Venue**: Ίδρυμα Μιχάλης Κακογιάννης
- **Price**: paid
- **Date**: 2026-03-02T21:30:00
- **Time**: 21:30
- **URL**: https://www.athinorama.gr/theatre/performance/krotos-10088778/
- **Source**: athinorama.gr
- **Category**: concert_local
- **Target words**: 80-120
- **Structure**: three-part-block
- **HARD CONSTRAINT**: Description MUST be 80-120 words.
- **Venue intel**: Not in database. WebSearch "Ίδρυμα Μιχάλης Κακογιάννης Athens" for context.

---

## Execution Instructions

For EACH event:

1. **Research**: WebSearch the event URL for details. Search for artist/performer background. Also search the venue if writing sensory opening details about the physical space — unverified atmosphere (invented food smells, assumed decor) is a fabrication violation even if it sounds plausible.
2. **Write description**: Save to file:
   ```bash
   bun run scripts/write-description.ts <event-id> "<description text>"
   ```
3. **Gate check**: Validate quality (use the tier shown for each event):
   ```bash
   bun run scripts/auto-gate-check.ts temp-descriptions/<event-id>.md --tier=<tier> --event-id=<event-id>
   ```
   Tier mapping: three-part-block=stub, hybrid=standard, full-8-section=premium
4. **Write tags** (from taxonomy in docs/MASTER-ENRICHMENT-TEMPLATE.md):
   ```bash
   bun run scripts/write-tags.ts <event-id> Tag1 Tag2 Tag3...
   ```
5. **Save decision** (after completing ALL events in this batch):
   - If ALL gate scores are >= 85 AND all have 0 errors: auto-save to database:
   ```bash
   bun run scripts/save-batch.ts --manifest=temp-briefs/batch-121.manifest.json --session=batch-121 --batch=121 --clean
   ```
   Note "AUTO-SAVED" at the top of batch-121-review.md.
   - If ANY score is < 85 OR any have errors: do NOT run save-batch.ts.
     Note "LEFT FOR REVIEW" at the top of batch-121-review.md with reasons.

After all events, create `temp-descriptions/batch-121-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| c1cf579a32ab1ec8 | Ο τρομερός εχθρός και ο αλυσοδεμένος ελέφαντας | /100 | | |
| 9e364860d2d3bd3f | Lo | /100 | | |
| bb35da04f5b13a73 | Kaizen Klub with Chloé Robinson, Madam X (Bday Spesh), Poor J'Darr & Runner | /100 | | |
| 5a822c497d340dc7 | Η φάρμα των ζώων – Η παράσταση αρχίζει! | /100 | | |
| 7c2d68da8e52c38e | (κρότος) | /100 | | |
