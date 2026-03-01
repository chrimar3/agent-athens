# Enrichment Brief — Batch 107

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

## Recent Openings (DO NOT REUSE)

These opening sentences were used in recent batches. Use a DIFFERENT entry strategy:

- "A small hand reaches toward the stage and a puppet car rolls forward to meet it."
- "You climb to the third floor of a Pagrati apartment building and step into eighty square meters where the boundaries between rehearsal, experiment, and performance have been deliberately dissolved."
- "The bass reaches you before you reach the door."
- "The theater has become a museum — or the museum has become a theater."
- "The lights go down and a child near you draws a breath so sharp you hear it."
- "A single chair sits under a work light."
- "The first chord rings out and you can tell from the way it lingers that this is a room built for listening, not for volume."
- "You step off the street and the bass finds you before your eyes adjust."
- "The hall carries the weight of 160 years."
- "The tables are tight and the stage is not much more than a clearing at the front of the room."
- "A small hand reaches toward the stage and a puppet car rolls forward to meet it."
- "You climb to the third floor of a Pagrati apartment building and step into eighty square meters where the boundaries between rehearsal, experiment, and performance have been deliberately dissolved."
- "The bass reaches you before you reach the door."
- "The theater has become a museum — or the museum has become a theater."
- "The lights go down and a child near you draws a breath so sharp you hear it."

---

## Events to Enrich

### Lockbird
- **ID**: e346b31bb645a369
- **Type**: dj_set
- **Venue**: Cantina Social
- **Price**: door
- **Date**: 2026-03-04T21:00:00
- **Time**: 21:00
- **URL**: https://www.clubber.gr/events/lockbird-27/
- **Source**: clubber.gr
- **Venue intel**: Not in database. WebSearch "Cantina Social Athens" for context.

### Το ταξίδι της Σοφίας στις 4 εποχές
- **ID**: 7acfabaa8d8ebdb8
- **Type**: theater
- **Venue**: Βαφείο - Λάκης Καραλής
- **Price**: paid
- **Date**: 2026-03-01T11:00:00
- **Time**: 11:00
- **URL**: https://www.athinorama.gr/theatre/performance/to_taksidi_tis_sofias_stis_4_epoxes-10089244/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Βαφείο - Λάκης Καραλής Athens" for context.

### Ο Καπετάν Σαματάς
- **ID**: 031266674456664e
- **Type**: concert
- **Venue**: Μέγαρο Μουσικής Αθηνών
- **Price**: paid
- **Date**: 2026-03-01T12:30:00
- **Time**: 12:30
- **URL**: https://www.athinorama.gr/theatre/performance/o_kapetan_samatas-10087293/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Μέγαρο Μουσικής Αθηνών Athens" for context.

### Devoufloba
- **ID**: ebfaac086bc37cba
- **Type**: dj_set
- **Venue**: Cantina Social
- **Price**: door
- **Date**: 2026-03-05T21:00:00
- **Time**: 21:00
- **URL**: https://www.clubber.gr/events/devoufloba-3/
- **Source**: clubber.gr
- **Venue intel**: Not in database. WebSearch "Cantina Social Athens" for context.

### Χίλιοι λόγοι για να τσακωθείς
- **ID**: 6c92e91636f50b8b
- **Type**: theater
- **Venue**: 104
- **Price**: paid
- **Date**: 2026-03-01T11:00:00
- **Time**: 11:00
- **URL**: https://www.athinorama.gr/theatre/performance/xilioi_logoi_gia_na_tsakotheis_-10089259/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "104 Athens" for context.

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
   bun run scripts/save-batch.ts --manifest=temp-briefs/batch-107.manifest.json --session=batch-107 --batch=107 --clean
   ```
   Note "AUTO-SAVED" at the top of batch-107-review.md.
   - If ANY score is < 85 OR any have errors: do NOT run save-batch.ts.
     Note "LEFT FOR REVIEW" at the top of batch-107-review.md with reasons.

After all events, create `temp-descriptions/batch-107-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| e346b31bb645a369 | Lockbird | /100 | | |
| 7acfabaa8d8ebdb8 | Το ταξίδι της Σοφίας στις 4 εποχές | /100 | | |
| 031266674456664e | Ο Καπετάν Σαματάς | /100 | | |
| ebfaac086bc37cba | Devoufloba | /100 | | |
| 6c92e91636f50b8b | Χίλιοι λόγοι για να τσακωθείς | /100 | | |
