# Enrichment Brief — Batch 1

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
- `exemplars/classical-magic-ticket.md` — Audience-specific framing, practical pricing

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

### PHARAOH Vinyl Selection
- **ID**: 008fd413d592ab71
- **Type**: dj_set
- **Venue**: Pharaoh
- **Price**: tba
- **Date**: 2026-02-26T20:30:00
- **Time**: 20:30
- **URL**: https://ra.co/events/2378584
- **Source**: residentadvisor
- **Venue intel**: Not in database. WebSearch "Pharaoh Athens" for context.

### Η φάρμα των ζώων – Η παράσταση αρχίζει!
- **ID**: 8cf81ecfdc6d4a9d
- **Type**: classical
- **Venue**: Μέγαρο Μουσικής Αθηνών
- **Price**: paid
- **Date**: 2026-02-26T11:30:00
- **Time**: 11:30
- **URL**: https://www.athinorama.gr/theatre/performance/i_farma_ton_zoon_%e2%80%93_i_parastasi_arxizei!-10079278/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Μέγαρο Μουσικής Αθηνών Athens" for context.

### Αθλητισμός για Όλους
- **ID**: 6f3e3398fa249671
- **Type**: sports
- **Venue**: ΚΠΙΣΝ
- **Price**: tba
- **Date**: 2026-03-01
- **Time**: 11:00
- **URL**: https://www.more.com/gr-el/tickets/sports/athlitismos-gia-olous/
- **Source**: more.com
- **Venue intel**: Not in database. WebSearch "ΚΠΙΣΝ Athens" for context.

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

After all events, create `temp-descriptions/batch-1-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| 8297d866e4f7e939 | Γιάννης Μάργαρης | /100 | | |
| bf03c503fbae62ad | SHADOW KNIGHT | /100 | | |
| 008fd413d592ab71 | PHARAOH Vinyl Selection | /100 | | |
| 8cf81ecfdc6d4a9d | Η φάρμα των ζώων – Η παράσταση αρχίζει! | /100 | | |
| 6f3e3398fa249671 | Αθλητισμός για Όλους | /100 | | |
