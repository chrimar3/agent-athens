# Enrichment Brief — Batch 100

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

### Μαντώ
- **ID**: 0c2742b18caedeb9
- **Type**: theater
- **Venue**: Καφεθέατρο
- **Price**: paid
- **Date**: 2026-03-01
- **Time**: 21:30
- **URL**: https://www.athinorama.gr/music/gig/manto-10079631/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Καφεθέατρο Athens" for context.

### Παναγιώτης Μάργαρης
- **ID**: 42f11248de5a242f
- **Type**: concert
- **Venue**: Μέγαρο Μουσικής Αθηνών
- **Price**: paid
- **Date**: 2026-03-01
- **Time**: 20:30
- **URL**: https://www.athinorama.gr/music/gig/panagiotis_margaris-10038294/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Μέγαρο Μουσικής Αθηνών Athens" for context.

### Ms.Lefki + S.ant + Daedalus
- **ID**: 2c034ce8a0f42b81
- **Type**: dj_set
- **Venue**: El Chapo
- **Price**: door
- **Date**: 2026-03-01T01:30:00
- **Time**: 01:30
- **URL**: https://www.clubber.gr/events/ms-lefki-s-ant-daedalus/
- **Source**: clubber.gr
- **Venue intel**: Not in database. WebSearch "El Chapo Athens" for context.

### Δεν θα πεθάνουμε κιόλας
- **ID**: 1757906a7c262ecf
- **Type**: show
- **Venue**: Red Jasper Cabaret Theatre
- **Price**: paid
- **Date**: 2026-03-01T21:00:00
- **Time**: 21:00
- **URL**: https://www.athinorama.gr/theatre/performance/den_tha_pethanoume_kiolas-10088694/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Red Jasper Cabaret Theatre Athens" for context.

### ALEF
- **ID**: 56b29678f03d5bf9
- **Type**: theater
- **Venue**: Theatre Of The No
- **Price**: paid
- **Date**: 2026-03-01
- **Time**: 21:00
- **URL**: https://www.athinorama.gr/music/gig/alef_-10089216/
- **Source**: athinorama.gr
- **Venue intel** (from database):
  ```
  ### Theatre of the No
  | Field | Data |
  |-------|------|
  | **Address** | Konstantinou Palaiologou 3 (opposite City Hall) |
  | **Metro** | Syntagma |
  | **Capacity** | ~100 |
  | **Entry** | €10 (musicians free with drink) |
  | **Schedule** | Jazz Jam Wednesdays, 22:00 |
  | **House band** | Serafeim Bellos (drums), Phoebe Pehlivanidi (piano), George Pantazopoulos (bass) |
  | **Note** | Athens' first English-speaking theater — accessible for visitors |
  
  ---
  ```

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
   bun run scripts/save-batch.ts --manifest=temp-briefs/batch-100.manifest.json --session=batch-100 --batch=100 --clean
   ```
   Note "AUTO-SAVED" at the top of batch-100-review.md.
   - If ANY score is < 85 OR any have errors: do NOT run save-batch.ts.
     Note "LEFT FOR REVIEW" at the top of batch-100-review.md with reasons.

After all events, create `temp-descriptions/batch-100-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| 0c2742b18caedeb9 | Μαντώ | /100 | | |
| 42f11248de5a242f | Παναγιώτης Μάργαρης | /100 | | |
| 2c034ce8a0f42b81 | Ms.Lefki + S.ant + Daedalus | /100 | | |
| 1757906a7c262ecf | Δεν θα πεθάνουμε κιόλας | /100 | | |
| 56b29678f03d5bf9 | ALEF | /100 | | |
