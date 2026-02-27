# Enrichment Brief — Batch 12

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
- `exemplars/classical-magic-ticket.md` — Audience-specific framing, practical pricing

## Anti-patterns

Read `docs/enrichment-anti-patterns.md` for 10 confirmed mistakes to avoid.

---

## Events to Enrich

### ΓΕΡΜΑ - Η ανεκπλήρωτη
- **ID**: e15adc27997408d1
- **Type**: theater
- **Venue**: Θέατρο Τέχνης
- **Price**: paid
- **Date**: 2026-02-27
- **URL**: https://www.more.com/gr-el/tickets/theater/germa-i-anekpliroti/
- **Source**: more.com
- **Venue intel**: Not in database. WebSearch "Θέατρο Τέχνης Athens" for context.

### Κατερίνα Ντίνου
- **ID**: d6980de0eb72f0a3
- **Type**: concert
- **Venue**: Caja de Música
- **Price**: tba
- **Date**: 2026-02-27
- **Time**: 22:00
- **URL**: https://www.athinorama.gr/music/gig/katerina_ntinou-10050361/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Caja de Música Athens" for context.

### Αλιγάτορες
- **ID**: 9b5fc52ce4463908
- **Type**: dj_set
- **Venue**: AUDITORIUM
- **Price**: paid
- **Date**: 2026-02-27T21:00:00
- **Time**: 21:00
- **URL**: https://www.athinorama.gr/theatre/performance/aligatores-10081818/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "AUDITORIUM Athens" for context.

### Ρεσιτάλ Φλάουτου
- **ID**: a4472e3506f7e492
- **Type**: classical
- **Venue**: Ωδείο Αθηνών
- **Price**: tba
- **Date**: 2026-03-07
- **Time**: 19:00
- **URL**: https://www.athinorama.gr/music/gig/resital_flaoutou-10089252/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Ωδείο Αθηνών Athens" for context.

### The AI Thing - AI Essentials to Advance Your Career Workshop Athens
- **ID**: 24ca7ac187977df1
- **Type**: workshop
- **Venue**: Leof. Mesogeion 15
- **Price**: open
- **Date**: 2026-03-10T10:00:00 to 2026-03-10
- **Time**: 10:00
- **URL**: https://www.eventbrite.com/e/the-ai-thing-ai-essentials-to-advance-your-career-workshop-athens-tickets-1980913124480
- **Source**: eventbrite
- **Venue intel**: Not in database. WebSearch "Leof. Mesogeion 15 Athens" for context.

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
   bun run scripts/save-batch.ts --session=batch-12 --batch=12
   ```
   Note "AUTO-SAVED" at the top of batch-12-review.md.
   - If ANY score is < 85 OR any have errors: do NOT run save-batch.ts.
     Note "LEFT FOR REVIEW" at the top of batch-12-review.md with reasons.

After all events, create `temp-descriptions/batch-12-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| e15adc27997408d1 | ΓΕΡΜΑ - Η ανεκπλήρωτη | /100 | | |
| d6980de0eb72f0a3 | Κατερίνα Ντίνου | /100 | | |
| 9b5fc52ce4463908 | Αλιγάτορες | /100 | | |
| a4472e3506f7e492 | Ρεσιτάλ Φλάουτου | /100 | | |
| 24ca7ac187977df1 | The AI Thing - AI Essentials to Advance Your Career Workshop Athens | /100 | | |
