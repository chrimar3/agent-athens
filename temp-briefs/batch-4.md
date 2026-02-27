# Enrichment Brief — Batch 4

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

### Η Πριγκίπισσα των Αγίων Σαράντα!
- **ID**: 29bd95c043d11893
- **Type**: theater
- **Venue**: Coronet Theater
- **Price**: paid
- **Date**: 2026-02-26
- **Time**: 21:00
- **URL**: https://www.more.com/gr-el/tickets/theater/i-prigkipissa-ton-agion-saranta/
- **Source**: more.com
- **Venue intel**: Not in database. WebSearch "Coronet Theater Athens" for context.

### Ντενεκεδούπολη ξανά! Το μεγάλο ταξίδι του Μελένιου
- **ID**: 4cce17f27dd5a41d
- **Type**: concert
- **Venue**: Ίδρυμα Μιχάλης Κακογιάννης
- **Price**: tba
- **Date**: 2026-02-26T11:00:00
- **Time**: 11:00
- **URL**: https://www.athinorama.gr/theatre/performance/ntenekedoupoli_ksana!_to_megalo_taksidi_tou_meleniou-10083469/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Ίδρυμα Μιχάλης Κακογιάννης Athens" for context.

### Mama Athens with Lencasea / K.Perrakis
- **ID**: 3820a5a5e35e049d
- **Type**: dj_set
- **Venue**: B side Athens
- **Price**: tba
- **Date**: 2026-02-26T21:00:00
- **Time**: 21:00
- **URL**: https://ra.co/events/2379022
- **Source**: residentadvisor
- **Venue intel**: Not in database. WebSearch "B side Athens Athens" for context.

### Ο Καπετάν Σαματάς
- **ID**: 9ddc159aa7692542
- **Type**: classical
- **Venue**: Μέγαρο Μουσικής Αθηνών
- **Price**: paid
- **Date**: 2026-02-26T12:30:00
- **Time**: 12:30
- **URL**: https://www.athinorama.gr/theatre/performance/o_kapetan_samatas-10087293/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Μέγαρο Μουσικής Αθηνών Athens" for context.

### Yorgos Lanthimos: Photographs
- **ID**: 1b7ed35a3b33c973
- **Type**: exhibition
- **Venue**: Onassis Stegi
- **Price**: with-ticket
- **Date**: 2026-03-07T11:00:00
- **Time**: 11:00
- **URL**: https://www.onassis.org/onassis-stegi
- **Source**: onassis
- **Venue intel**: Not in database. WebSearch "Onassis Stegi Athens" for context.

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

After all events, create `temp-descriptions/batch-4-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| 29bd95c043d11893 | Η Πριγκίπισσα των Αγίων Σαράντα! | /100 | | |
| 4cce17f27dd5a41d | Ντενεκεδούπολη ξανά! Το μεγάλο ταξίδι του Μελένιου | /100 | | |
| 3820a5a5e35e049d | Mama Athens with Lencasea / K.Perrakis | /100 | | |
| 9ddc159aa7692542 | Ο Καπετάν Σαματάς | /100 | | |
| 1b7ed35a3b33c973 | Yorgos Lanthimos: Photographs | /100 | | |
