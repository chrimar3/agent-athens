# Enrichment Brief — Batch 28

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

### The Mr and Mrs Bubble Show
- **ID**: 7690cef6908b44e4
- **Type**: theater
- **Venue**: Ρεκτιφιέ
- **Price**: paid
- **Date**: 2026-02-28
- **Time**: 17:30
- **URL**: https://www.athinorama.gr/theatre/performance/the_mr_and_mrs_bubble_show-10089261/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Ρεκτιφιέ Athens" for context.

### Ath Dub Unity w/ Tr Tactics
- **ID**: cf433cca45183b99
- **Type**: concert
- **Venue**: Aux Club
- **Price**: tba
- **Date**: 2026-02-28
- **URL**: https://www.athinorama.gr/music/gig/ath_dub_unity_w_tr_tactics-10089204/
- **Source**: athinorama.gr
- **Venue intel** (from database):
  ```
  ### AUX Club
  | Field | Data |
  |-------|------|
  | **Address** | Agiou Orous 15, Gazi |
  | **Metro** | Kerameikos (Blue) |
  | **Capacity** | ~200 |
  | **Entry** | €8-12 (varies by event) |
  | **Door Policy** | Inclusive — "come as you are" stated ethos |
  | **Regular nights** | Velocity, Pulse Tribe |
  | **Rising artists** | Home to Até & Salin (EXHALE Records, Tomorrowland 2025) |
  | **Character** | New wave, explicitly welcoming, quality without gatekeeping |
  
  ---
  ```

### PHARAOH Vinyl Selection
- **ID**: 20d61fc6266765a8
- **Type**: dj_set
- **Venue**: Pharaoh
- **Price**: tba
- **Date**: 2026-02-28T20:00:00
- **Time**: 20:00
- **URL**: https://ra.co/events/2378594
- **Source**: residentadvisor
- **Venue intel**: Not in database. WebSearch "Pharaoh Athens" for context.

### Παντελής Αμπαζής
- **ID**: bfbca1938acff682
- **Type**: theater
- **Venue**: Theatre Of The No
- **Price**: paid
- **Date**: 2026-02-28
- **Time**: 22:00
- **URL**: https://www.athinorama.gr/music/gig/pantelis_ampazis-10053071/
- **Source**: athinorama.gr
- **Venue intel** (from database):
  ```
  ### Theatre of the No
  | Field | Data |
  |-------|------|
  | **Address** | Konstantinou Palaiologou 3 (opposite City Hall) |
  | **Metro** | Syntagma |
  | **Capacity** | ~100 |
  | **Entry** | €10 (musicians free with drink) |
  | **Schedule** | Jazz Jam Wednesdays, 22:00 |
  | **House band** | Serafeim Bellos (drums), Phoebe Pehlivanidi (piano), George Pantazopoulos (bass) |
  | **Note** | Athens' first English-speaking theater — accessible for visitors |
  
  ---
  ```

### Βιβιλένα
- **ID**: 34fc7512698b13ab
- **Type**: concert
- **Venue**: Γυάλινο Μουσικό Θέατρο
- **Price**: paid
- **Date**: 2026-02-28
- **Time**: 21:00
- **URL**: https://www.athinorama.gr/music/gig/bibilena-10089217/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Γυάλινο Μουσικό Θέατρο Athens" for context.

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
   bun run scripts/save-batch.ts --session=batch-28 --batch=28
   ```
   Note "AUTO-SAVED" at the top of batch-28-review.md.
   - If ANY score is < 85 OR any have errors: do NOT run save-batch.ts.
     Note "LEFT FOR REVIEW" at the top of batch-28-review.md with reasons.

After all events, create `temp-descriptions/batch-28-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| 7690cef6908b44e4 | The Mr and Mrs Bubble Show | /100 | | |
| cf433cca45183b99 | Ath Dub Unity w/ Tr Tactics | /100 | | |
| 20d61fc6266765a8 | PHARAOH Vinyl Selection | /100 | | |
| bfbca1938acff682 | Παντελής Αμπαζής | /100 | | |
| 34fc7512698b13ab | Βιβιλένα | /100 | | |
