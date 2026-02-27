# Enrichment Brief — Batch 0

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

## Exemplars (read for structural guidance)

- `exemplars/theater-cherry-orchard.md` — Historical depth, accessibility info
- `exemplars/concert-three-times-three.md` — Format explanation, cross-community appeal

## Anti-patterns

Read `docs/enrichment-anti-patterns.md` for 9 confirmed mistakes to avoid.

---

## Events to Enrich

### Γιάννης Μάργαρης
- **ID**: 8297d866e4f7e939
- **Type**: theater
- **Venue**: Καφεθέατρο
- **Price**: paid
- **Date**: 2026-02-26
- **Time**: 21:00
- **URL**: https://www.athinorama.gr/music/gig/giannis_margaris-10088899/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Καφεθέατρο Athens" for context.

### SHADOW KNIGHT
- **ID**: bf03c503fbae62ad
- **Type**: concert
- **Venue**: ΙΛΙΟΝ Plus
- **Price**: paid
- **Date**: 2026-02-26
- **Time**: 20:30
- **URL**: https://www.more.com/gr-el/tickets/music/shadow-knight-phyrosun-frs-live-ilion-plus/
- **Source**: more.com
- **Venue intel**: Not in database. WebSearch "ΙΛΙΟΝ Plus Athens" for context.

---

## Execution Instructions

For EACH event:

1. **Research**: WebSearch the event URL for details. Also search for artist/performer and venue.
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

After all events, create `temp-descriptions/batch-0-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| 8297d866e4f7e939 | Γιάννης Μάργαρης | /100 | | |
| bf03c503fbae62ad | SHADOW KNIGHT | /100 | | |
