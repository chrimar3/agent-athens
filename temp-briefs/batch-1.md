# Enrichment Brief — Batch 1

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

### Κούκου, μια βόλτα στο δάσος
- **ID**: fef7e513929aa8f8
- **Type**: theater
- **Venue**: Μορφές Έκφρασης
- **Price**: paid
- **Date**: 2026-03-02T11:30:00
- **Time**: 11:30
- **URL**: https://www.athinorama.gr/theatre/performance/koukou_mia_bolta_sto_dasos-10051151/
- **Source**: athinorama.gr
- **Category**: theater_contemporary
- **Target words**: 120-180
- **Structure**: hybrid
- **HARD CONSTRAINT**: Description MUST be 120-180 words.
- **Venue intel**: Not in database. WebSearch "Μορφές Έκφρασης Athens" for context.

### Καραγκιοζοπαίχτης νυν και αεί
- **ID**: 655db2e2cc39cca6
- **Type**: concert
- **Venue**: Ίδρυμα Μιχάλης Κακογιάννης
- **Price**: paid
- **Date**: 2026-03-02T20:00:00
- **Time**: 20:00
- **URL**: https://www.athinorama.gr/theatre/performance/karagkiozopaixtis_nun_kai_aei-10088892/
- **Source**: athinorama.gr
- **Category**: concert_local
- **Target words**: 80-120
- **Structure**: three-part-block
- **HARD CONSTRAINT**: Description MUST be 80-120 words.
- **Venue intel**: Not in database. WebSearch "Ίδρυμα Μιχάλης Κακογιάννης Athens" for context.

### CLUB BOTTOM
- **ID**: 4419e83d5ccfb8a2
- **Type**: dj_set
- **Venue**: Don't be a Dick
- **Price**: paid
- **Date**: 2026-03-15T20:00:00
- **Time**: 20:00
- **URL**: https://ra.co/events/2364676
- **Source**: residentadvisor
- **Category**: concert_local
- **Target words**: 80-120
- **Structure**: three-part-block
- **HARD CONSTRAINT**: Description MUST be 80-120 words.
- **Venue intel**: Not in database. WebSearch "Don't be a Dick Athens" for context.

### Ο κουρέας της Σεβίλλης
- **ID**: 4eaa98f21a596514
- **Type**: theater
- **Venue**: Πορεία at Victoria
- **Price**: paid
- **Date**: 2026-03-02T11:30:00
- **Time**: 11:30
- **URL**: https://www.athinorama.gr/theatre/performance/o_koureas_tis_sebillis-10087640/
- **Source**: athinorama.gr
- **Category**: theater_contemporary
- **Target words**: 120-180
- **Structure**: hybrid
- **HARD CONSTRAINT**: Description MUST be 120-180 words.
- **Venue intel**: Not in database. WebSearch "Πορεία at Victoria Athens" for context.

### Ο Γιάννης το βούδι
- **ID**: 2b7bc03a56e1effc
- **Type**: concert
- **Venue**: Ίδρυμα Μιχάλης Κακογιάννης
- **Price**: paid
- **Date**: 2026-03-02T20:30:00
- **Time**: 20:30
- **URL**: https://www.athinorama.gr/theatre/performance/o_giannis_to_boudi-10084390/
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
   bun run scripts/save-batch.ts --manifest=temp-briefs/batch-1.manifest.json --session=batch-1 --batch=1 --clean
   ```
   Note "AUTO-SAVED" at the top of batch-1-review.md.
   - If ANY score is < 85 OR any have errors: do NOT run save-batch.ts.
     Note "LEFT FOR REVIEW" at the top of batch-1-review.md with reasons.

After all events, create `temp-descriptions/batch-1-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| fef7e513929aa8f8 | Κούκου, μια βόλτα στο δάσος | /100 | | |
| 655db2e2cc39cca6 | Καραγκιοζοπαίχτης νυν και αεί | /100 | | |
| 4419e83d5ccfb8a2 | CLUB BOTTOM | /100 | | |
| 4eaa98f21a596514 | Ο κουρέας της Σεβίλλης | /100 | | |
| 2b7bc03a56e1effc | Ο Γιάννης το βούδι | /100 | | |
