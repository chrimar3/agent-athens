# Enrichment Brief — Batch 34

You are writing premium event descriptions for Agent Athens, an AI-curated cultural events calendar for Athens, Greece.

## Rules

1. **8-section structure**: Sensory opening → Credentials → Tribe → Details table → Experience → Filter → Logistics → Closer
2. **Voice**: Second person ("you"), present tense, sensory-first. Transport before inform.
3. **Word count**: 400-600 words of pure narrative per event
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

- `exemplars/theater-cherry-orchard.md` — Historical depth, accessibility info
- `exemplars/concert-three-times-three.md` — Format explanation, cross-community appeal

## Anti-patterns

Read `docs/enrichment-anti-patterns.md` for 10 confirmed mistakes to avoid.

---

## Events to Enrich

### Ο γύρος του κόσμου σε 80 ημέρες
- **ID**: cb5234866db87627
- **Type**: theater
- **Venue**: Θέατρο Χορν
- **Price**: paid
- **Date**: 2026-02-28T11:30:00
- **Time**: 11:30
- **URL**: https://www.athinorama.gr/theatre/performance/o_guros_tou_kosmou_se_80_imeres-10087687/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Θέατρο Χορν Athens" for context.

### Ντενεκεδούπολη ξανά! Το μεγάλο ταξίδι του Μελένιου
- **ID**: 3805dbea0d47e809
- **Type**: concert
- **Venue**: Ίδρυμα Μιχάλης Κακογιάννης
- **Price**: tba
- **Date**: 2026-02-28T11:00:00
- **Time**: 11:00
- **URL**: https://www.athinorama.gr/theatre/performance/ntenekedoupoli_ksana!_to_megalo_taksidi_tou_meleniou-10083469/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Ίδρυμα Μιχάλης Κακογιάννης Athens" for context.

### Techno Underdogs | Free Entrance
- **ID**: af507bd891e13968
- **Type**: dj_set
- **Venue**: B side Athens
- **Price**: paid
- **Date**: 2026-02-28T22:00:00
- **Time**: 22:00
- **URL**: https://ra.co/events/2360057
- **Source**: residentadvisor
- **Venue intel**: Not in database. WebSearch "B side Athens Athens" for context.

### Δον Κιχώτης
- **ID**: fd12a6049fb796d1
- **Type**: theater
- **Venue**: Κάππα
- **Price**: paid
- **Date**: 2026-02-28T11:30:00
- **Time**: 11:30
- **URL**: https://www.athinorama.gr/theatre/performance/don_kixotis-10083146/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Κάππα Athens" for context.

### Η βασίλισσα των πάντων
- **ID**: 0e2c5d9a2b4d10e4
- **Type**: concert
- **Venue**: Μέγαρο Μουσικής Αθηνών
- **Price**: paid
- **Date**: 2026-02-28T12:30:00
- **Time**: 12:30
- **URL**: https://www.athinorama.gr/theatre/performance/i_basilissa_ton_panton-10070185/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Μέγαρο Μουσικής Αθηνών Athens" for context.

---

## Execution Instructions

For EACH event:

1. **Research**: WebSearch the event URL for details. Search for artist/performer background. Also search the venue if writing sensory opening details about the physical space — unverified atmosphere (invented food smells, assumed decor) is a fabrication violation even if it sounds plausible.
2. **Write description**: Save to file:
   ```bash
   bun run scripts/write-description.ts <event-id> "<description text>"
   ```
3. **Gate check**: Validate quality:
   ```bash
   bun run scripts/auto-gate-check.ts temp-descriptions/<event-id>.md --tier=premium --event-id=<event-id>
   ```
4. **Write tags** (from taxonomy in docs/MASTER-ENRICHMENT-TEMPLATE.md):
   ```bash
   bun run scripts/write-tags.ts <event-id> Tag1 Tag2 Tag3...
   ```
5. **Save decision** (after completing ALL events in this batch):
   - If ALL gate scores are >= 85 AND all have 0 errors: auto-save to database:
   ```bash
   bun run scripts/save-batch.ts --session=batch-34 --batch=34
   ```
   Note "AUTO-SAVED" at the top of batch-34-review.md.
   - If ANY score is < 85 OR any have errors: do NOT run save-batch.ts.
     Note "LEFT FOR REVIEW" at the top of batch-34-review.md with reasons.

After all events, create `temp-descriptions/batch-34-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| cb5234866db87627 | Ο γύρος του κόσμου σε 80 ημέρες | /100 | | |
| 3805dbea0d47e809 | Ντενεκεδούπολη ξανά! Το μεγάλο ταξίδι του Μελένιου | /100 | | |
| af507bd891e13968 | Techno Underdogs | Free Entrance | /100 | | |
| fd12a6049fb796d1 | Δον Κιχώτης | /100 | | |
| 0e2c5d9a2b4d10e4 | Η βασίλισσα των πάντων | /100 | | |
