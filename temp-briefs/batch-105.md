# Enrichment Brief — Batch 105

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

### Ο Του-του και η Τσαφ-τσουφ
- **ID**: 64835bab950213c9
- **Type**: theater
- **Venue**: Olvio
- **Price**: paid
- **Date**: 2026-03-01T10:30:00
- **Time**: 10:30
- **URL**: https://www.athinorama.gr/theatre/performance/o_tou_tou_kai_i_tsaf_tsouf-10066380/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Olvio Athens" for context.

### 0+Thetis
- **ID**: 5cff359feb56ae55
- **Type**: concert
- **Venue**: Ον Off Studio
- **Price**: paid
- **Date**: 2026-03-01
- **Time**: 21:00
- **URL**: https://www.athinorama.gr/music/gig/0kaithetis-10089233/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Ον Off Studio Athens" for context.

### MUZIK SAVEZ pres. Manolaco
- **ID**: 1f72ab0e2e737583
- **Type**: dj_set
- **Venue**: Cozmo Athens
- **Price**: paid
- **Date**: 2026-03-01T22:00:00
- **Time**: 22:00
- **URL**: https://ra.co/events/2379485
- **Source**: residentadvisor
- **Venue intel**: Not in database. WebSearch "Cozmo Athens Athens" for context.

### In motion: Ένα άγαλμα που το ’σκασε
- **ID**: 3c7b04ff97c3fe50
- **Type**: theater
- **Venue**: Δημοτικό Θέατρο Πειραιά
- **Price**: tba
- **Date**: 2026-03-01T11:00:00
- **Time**: 11:00
- **URL**: https://www.athinorama.gr/theatre/performance/in_motion_ena_agalma_pou_to_%e2%80%99skase-10088271/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Δημοτικό Θέατρο Πειραιά Athens" for context.

### Το μαγικό εισιτήριο
- **ID**: d06adeb6c87eb25d
- **Type**: concert
- **Venue**: Μέγαρο Μουσικής Αθηνών
- **Price**: paid
- **Date**: 2026-03-01T10:30:00
- **Time**: 10:30
- **URL**: https://www.athinorama.gr/theatre/performance/to_magiko_eisitirio-10088235/
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
   bun run scripts/save-batch.ts --manifest=temp-briefs/batch-105.manifest.json --session=batch-105 --batch=105 --clean
   ```
   Note "AUTO-SAVED" at the top of batch-105-review.md.
   - If ANY score is < 85 OR any have errors: do NOT run save-batch.ts.
     Note "LEFT FOR REVIEW" at the top of batch-105-review.md with reasons.

After all events, create `temp-descriptions/batch-105-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| 64835bab950213c9 | Ο Του-του και η Τσαφ-τσουφ | /100 | | |
| 5cff359feb56ae55 | 0+Thetis | /100 | | |
| 1f72ab0e2e737583 | MUZIK SAVEZ pres. Manolaco | /100 | | |
| 3c7b04ff97c3fe50 | In motion: Ένα άγαλμα που το ’σκασε | /100 | | |
| d06adeb6c87eb25d | Το μαγικό εισιτήριο | /100 | | |
