# Enrichment Brief — Batch 26

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

### Θάνατος παλληκαριού
- **ID**: 72c731e7d8a2fae2
- **Type**: theater
- **Venue**: Μικρός Κεραμεικός
- **Price**: paid
- **Date**: 2026-02-28
- **Time**: 21:00
- **URL**: https://www.athinorama.gr/theatre/performance/thanatos_pallikariou-10089239/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Μικρός Κεραμεικός Athens" for context.

### Βασίλης Λέκκας
- **ID**: 3ae9de55073081f0
- **Type**: concert
- **Venue**: Caja de Música
- **Price**: paid
- **Date**: 2026-02-28
- **Time**: 22:00
- **URL**: https://www.athinorama.gr/music/gig/basilis_lekkas-10017422/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Caja de Música Athens" for context.

### Disco Night - 80s-90s Party
- **ID**: cb0416af396b6973
- **Type**: dj_set
- **Venue**: Gazarte
- **Price**: tba
- **Date**: 2026-02-28
- **Time**: 21:00
- **URL**: https://www.athinorama.gr/music/gig/disco_night___80s_90s_party-10089130/
- **Source**: athinorama.gr
- **Venue intel** (from database):
  ```
  ### Gazarte
  | Field | Data |
  |-------|------|
  | **Address** | Voutadon Street, Gazi |
  | **Metro** | Kerameikos (Blue) |
  | **Spaces** | Main Stage (major acts), Ground Stage (rock/alt), Roof Stage (Greek/jazz, Acropolis views) |
  | **Capacity** | 100-400 depending on space |
  | **Tickets** | €15-35 typical, €40-50 premium (via more.com, formerly Viva.gr) |
  | **Doors** | 20:00-21:00 |
  | **Music starts** | ~21:30 |
  | **Consumption** | NOT mandatory |
  | **Tables** | Reservations essential for rooftop (email/phone) |
  | **Food** | Real kitchen, taken seriously |
  | **Notable 2025** | Kenny Garrett, Billy Cobham's Time Machine, John Medeski |
  
  ```

### CARMEN by Antonio Gades & Carlos Saura – Με την Compañía Antonio Gades
- **ID**: 76812621a28658a5
- **Type**: dance
- **Venue**: Μέγαρο Μουσικής Αθηνών
- **Price**: with-ticket
- **Date**: 2026-04-24T20:30:00+03:00
- **URL**: https://www.megaron.gr/event/carmen-by-antonio-gades-carlos-saura-me-tin-compania-antonio-gades/
- **Source**: megaron.gr
- **Venue intel**: Not in database. WebSearch "Μέγαρο Μουσικής Αθηνών Athens" for context.

### Δεν θα πεθάνουμε κιόλας
- **ID**: 80c77c476a038719
- **Type**: show
- **Venue**: Red Jasper Cabaret Theatre
- **Price**: paid
- **Date**: 2026-02-28T21:00:00
- **Time**: 21:00
- **URL**: https://www.athinorama.gr/theatre/performance/den_tha_pethanoume_kiolas-10088694/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Red Jasper Cabaret Theatre Athens" for context.

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
   bun run scripts/save-batch.ts --session=batch-26 --batch=26
   ```
   Note "AUTO-SAVED" at the top of batch-26-review.md.
   - If ANY score is < 85 OR any have errors: do NOT run save-batch.ts.
     Note "LEFT FOR REVIEW" at the top of batch-26-review.md with reasons.

After all events, create `temp-descriptions/batch-26-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| 72c731e7d8a2fae2 | Θάνατος παλληκαριού | /100 | | |
| 3ae9de55073081f0 | Βασίλης Λέκκας | /100 | | |
| cb0416af396b6973 | Disco Night - 80s-90s Party | /100 | | |
| 76812621a28658a5 | CARMEN by Antonio Gades & Carlos Saura – Με την Compañía Antonio Gades | /100 | | |
| 80c77c476a038719 | Δεν θα πεθάνουμε κιόλας | /100 | | |
