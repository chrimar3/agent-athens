# Enrichment Brief — Batch 2

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

## Exemplars (read for structural guidance)

- `exemplars/theater-cherry-orchard.md` — Historical depth, accessibility info
- `exemplars/concert-three-times-three.md` — Format explanation, cross-community appeal
- `exemplars/classical-magic-ticket.md` — Audience-specific framing, practical pricing

## Anti-patterns

Read `docs/enrichment-anti-patterns.md` for 10 confirmed mistakes to avoid.

---

## Events to Enrich

### Ο ΑΓΑΠΗΤΙΚΟΣ ΤΗΣ ΒΟΣΚΟΠΟΥΛΑΣ (ΓΙΑ ΠΕΡΙΟΡΙΣΜΕΝΟ ΑΡΙΘΜΟ ΠΑΡΑΣΤΑΣΕΩΝ)
- **ID**: 177079c6050bc903
- **Type**: theater
- **Venue**: Ακροπόλ
- **Price**: paid
- **Date**: 2026-02-26
- **URL**: https://www.more.com/gr-el/tickets/theater/oagapitikostisvoskopoulas/
- **Source**: more.com
- **Venue intel**: Not in database. WebSearch "Ακροπόλ Athens" for context.

### Shadow Knight, Phyrosun &amp; FRS
- **ID**: e2874bd3230feee7
- **Type**: concert
- **Venue**: Ίλιον Plus
- **Price**: paid
- **Date**: 2026-02-26
- **Time**: 20:30
- **URL**: https://www.athinorama.gr/music/gig/shadow_knight_phyrosun_kai_frs-10089212/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Ίλιον Plus Athens" for context.

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

After all events, create `temp-descriptions/batch-2-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| 177079c6050bc903 | Ο ΑΓΑΠΗΤΙΚΟΣ ΤΗΣ ΒΟΣΚΟΠΟΥΛΑΣ (ΓΙΑ ΠΕΡΙΟΡΙΣΜΕΝΟ ΑΡΙΘΜΟ ΠΑΡΑΣΤΑΣΕΩΝ) | /100 | | |
| e2874bd3230feee7 | Shadow Knight, Phyrosun &amp; FRS | /100 | | |
| 008fd413d592ab71 | PHARAOH Vinyl Selection | /100 | | |
| 8cf81ecfdc6d4a9d | Η φάρμα των ζώων – Η παράσταση αρχίζει! | /100 | | |
| 6f3e3398fa249671 | Αθλητισμός για Όλους | /100 | | |
