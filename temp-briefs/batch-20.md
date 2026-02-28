# Enrichment Brief — Batch 20

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

### Οι περιπέτειες της Πέππα
- **ID**: 1e9bf98cb0f8bc12
- **Type**: theater
- **Venue**: Θέατρο Βέμπο
- **Price**: paid
- **Date**: 2026-02-27T11:30:00
- **Time**: 11:30
- **URL**: https://www.athinorama.gr/theatre/performance/oi_peripeteies_tis_peppa-10086835/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Θέατρο Βέμπο Athens" for context.

### Laura Agnusdei &amp; Free Piece of Tape
- **ID**: 629c869f54864b79
- **Type**: concert
- **Venue**: Κέντρο Ελέγχου Τηλεοράσεων
- **Price**: paid
- **Date**: 2026-02-27
- **Time**: 20:30
- **URL**: https://www.athinorama.gr/music/gig/laura_agnusdei_kai_free_piece_of_tape-10089220/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Κέντρο Ελέγχου Τηλεοράσεων Athens" for context.

### MĪMĪ x FY All Night Long
- **ID**: c05ef35e5749b317
- **Type**: dj_set
- **Venue**: Zelus
- **Price**: tba
- **Date**: 2026-02-27T23:00:00
- **Time**: 23:00
- **URL**: https://ra.co/events/2380644
- **Source**: residentadvisor
- **Venue intel**: Not in database. WebSearch "Zelus Athens" for context.

### Ο τρομερός εχθρός και ο αλυσοδεμένος ελέφαντας
- **ID**: 25e6d4f87103bed0
- **Type**: theater
- **Venue**: Studio Μαυρομιχάλη
- **Price**: paid
- **Date**: 2026-02-27T11:30:00
- **Time**: 11:30
- **URL**: https://www.athinorama.gr/theatre/performance/o_tromeros_exthros_kai_o_alusodemenos_elefantas-10053307/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Studio Μαυρομιχάλη Athens" for context.

### Ζωρζ Πιλαλί
- **ID**: d46b3db6e422c6a0
- **Type**: concert
- **Venue**: ARCH Club
- **Price**: tba
- **Date**: 2026-02-27
- **Time**: 22:00
- **URL**: https://www.athinorama.gr/music/gig/zorz_pilali-10024445/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "ARCH Club Athens" for context.

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
   bun run scripts/save-batch.ts --session=batch-20 --batch=20
   ```
   Note "AUTO-SAVED" at the top of batch-20-review.md.
   - If ANY score is < 85 OR any have errors: do NOT run save-batch.ts.
     Note "LEFT FOR REVIEW" at the top of batch-20-review.md with reasons.

After all events, create `temp-descriptions/batch-20-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| 1e9bf98cb0f8bc12 | Οι περιπέτειες της Πέππα | /100 | | |
| 629c869f54864b79 | Laura Agnusdei &amp; Free Piece of Tape | /100 | | |
| c05ef35e5749b317 | MĪMĪ x FY All Night Long | /100 | | |
| 25e6d4f87103bed0 | Ο τρομερός εχθρός και ο αλυσοδεμένος ελέφαντας | /100 | | |
| d46b3db6e422c6a0 | Ζωρζ Πιλαλί | /100 | | |
