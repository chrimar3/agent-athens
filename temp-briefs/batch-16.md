# Enrichment Brief — Batch 16

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

### Χίλιοι λόγοι για να τσακωθείς
- **ID**: 085bff52ff532244
- **Type**: theater
- **Venue**: 104
- **Price**: paid
- **Date**: 2026-02-27T11:00:00
- **Time**: 11:00
- **URL**: https://www.athinorama.gr/theatre/performance/xilioi_logoi_gia_na_tsakotheis_-10089259/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "104 Athens" for context.

### Εισβολέας
- **ID**: d406548e2284d3d6
- **Type**: concert
- **Venue**: Fuzz Club
- **Price**: tba
- **Date**: 2026-02-27
- **Time**: 21:30
- **URL**: https://www.athinorama.gr/music/gig/eisboleas-10067518/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Fuzz Club Athens" for context.

### Greta b2b Miss Trouli + KOKETAMC b2b Socrates Antypas
- **ID**: 9d2c62a70f05d8a3
- **Type**: dj_set
- **Venue**: Astron
- **Price**: paid
- **Date**: 2026-02-27T23:00:00
- **Time**: 23:00
- **URL**: https://www.clubber.gr/events/greta-b2b-miss-trouli-koketamc-b2b-socrates-antypas/
- **Source**: clubber.gr
- **Venue intel** (from database):
  ```
  ### Astron Club
  | Field | Data |
  |-------|------|
  | **Address** | Leoforos Konstantinoupoleos 121, Gazi |
  | **Metro** | Kerameikos (Blue) |
  | **Capacity** | ~150 ("the box") |
  | **Entry** | €10-15 |
  | **Door Policy** | Berlin-lite selection — singles > groups, couples sometimes rejected, "look like you dance" |
  | **Drinks** | Alfa beer ONLY, €5 |
  | **Finding it** | NO SIGN — look for shaking windows |
  | **Acts** | Helena Hauff, DJ Bone caliber |
  | **Note** | Relocated to Gazi summer 2024 |
  
  ---
  ```

### KOJAM ORCHESTRA
- **ID**: 4ad745aafcfe8890
- **Type**: classical
- **Venue**: Concert #1 Baumstrasse
- **Price**: paid
- **Date**: 2026-03-12
- **Time**: 21:00
- **URL**: https://www.ticketservices.gr/event/14155/
- **Source**: ticketservices
- **Venue intel**: Not in database. WebSearch "Concert #1 Baumstrasse Athens" for context.

### Α μπε μπα μπλε
- **ID**: bc39b63723a75125
- **Type**: theater
- **Venue**: Olvio
- **Price**: paid
- **Date**: 2026-02-27T11:30:00
- **Time**: 11:30
- **URL**: https://www.athinorama.gr/theatre/performance/a_mpe_mpa_mple-10075520/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Olvio Athens" for context.

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
   bun run scripts/save-batch.ts --session=batch-16 --batch=16
   ```
   Note "AUTO-SAVED" at the top of batch-16-review.md.
   - If ANY score is < 85 OR any have errors: do NOT run save-batch.ts.
     Note "LEFT FOR REVIEW" at the top of batch-16-review.md with reasons.

After all events, create `temp-descriptions/batch-16-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| 085bff52ff532244 | Χίλιοι λόγοι για να τσακωθείς | /100 | | |
| d406548e2284d3d6 | Εισβολέας | /100 | | |
| 9d2c62a70f05d8a3 | Greta b2b Miss Trouli + KOKETAMC b2b Socrates Antypas | /100 | | |
| 4ad745aafcfe8890 | KOJAM ORCHESTRA | /100 | | |
| bc39b63723a75125 | Α μπε μπα μπλε | /100 | | |
