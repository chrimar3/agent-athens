# Enrichment Brief — Batch 102

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

### Η φώκια
- **ID**: 10ba1fb33fc875e7
- **Type**: theater
- **Venue**: Θέατρο Άβατον
- **Price**: paid
- **Date**: 2026-03-01
- **Time**: 18:00
- **URL**: https://www.athinorama.gr/theatre/performance/i_fokia-10089242/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Θέατρο Άβατον Athens" for context.

### PanArmonia
- **ID**: db29f36b5e190688
- **Type**: concert
- **Venue**: Gazarte
- **Price**: tba
- **Date**: 2026-03-01
- **Time**: 20:30
- **URL**: https://www.athinorama.gr/music/gig/panarmonia-10089200/
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

### House On The Beach: Timmy Regisford + DJ Thai
- **ID**: 927f06b4e18b4c29
- **Type**: dj_set
- **Venue**: Burger Disco Club
- **Price**: paid
- **Date**: 2026-03-01T19:00:00
- **Time**: 19:00
- **URL**: https://www.clubber.gr/events/house-on-the-beach-timmy-regisford-dj-thai/
- **Source**: clubber.gr
- **Venue intel**: Not in database. WebSearch "Burger Disco Club Athens" for context.

### Η Μάσα και ο Αρκούδος, μια μεγάλη γιορτή
- **ID**: eaad803b8069c677
- **Type**: theater
- **Venue**: Διάνα
- **Price**: paid
- **Date**: 2026-03-01
- **Time**: 11:30
- **URL**: https://www.athinorama.gr/theatre/performance/i_masa_kai_o_arkoudos_mia_megali_giorti-10082608/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Διάνα Athens" for context.

### Χρήστος Μπότσης
- **ID**: 2c59d08e536b51d8
- **Type**: concert
- **Venue**: Σταυρός του Νότου
- **Price**: paid
- **Date**: 2026-03-01
- **Time**: 21:00
- **URL**: https://www.athinorama.gr/music/gig/xristos_mpotsis-10089208/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Σταυρός του Νότου Athens" for context.

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
   bun run scripts/save-batch.ts --manifest=temp-briefs/batch-102.manifest.json --session=batch-102 --batch=102 --clean
   ```
   Note "AUTO-SAVED" at the top of batch-102-review.md.
   - If ANY score is < 85 OR any have errors: do NOT run save-batch.ts.
     Note "LEFT FOR REVIEW" at the top of batch-102-review.md with reasons.

After all events, create `temp-descriptions/batch-102-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| 10ba1fb33fc875e7 | Η φώκια | /100 | | |
| db29f36b5e190688 | PanArmonia | /100 | | |
| 927f06b4e18b4c29 | House On The Beach: Timmy Regisford + DJ Thai | /100 | | |
| eaad803b8069c677 | Η Μάσα και ο Αρκούδος, μια μεγάλη γιορτή | /100 | | |
| 2c59d08e536b51d8 | Χρήστος Μπότσης | /100 | | |
