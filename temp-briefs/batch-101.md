# Enrichment Brief — Batch 101

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

- `exemplars/concert-three-times-three.md` — Format explanation, cross-community appeal
- `exemplars/theater-cherry-orchard.md` — Historical depth, accessibility info

## Anti-patterns

Read `docs/enrichment-anti-patterns.md` for 10 confirmed mistakes to avoid.

---

## Events to Enrich

### Ad&#233;d&#232;j&#236;
- **ID**: 31a966329487fc7b
- **Type**: concert
- **Venue**: Half Note Jazz Club
- **Price**: paid
- **Date**: 2026-03-01
- **Time**: 21:30
- **URL**: https://www.athinorama.gr/music/gig/adedeji_-10076834/
- **Source**: athinorama.gr
- **Venue intel** (from database):
  ```
  ### Half Note Jazz Club
  | Field | Data |
  |-------|------|
  | **Address** | Trivonianou 17, Mets |
  | **Metro** | Akropoli (Red), then 10-min walk |
  | **Capacity** | ~200 |
  | **Entry** | Table €15-20, bar €10-15, special acts up to €51 |
  | **Season** | OCTOBER - MAY ONLY (closed summer) |
  | **Concerts** | ~250 per season |
  | **Reservations** | ESSENTIAL — book ahead, confirm same day, arrive 20 min early or lose seat 15 min after start |
  | **Since** | 1979 |
  
  ---
  ```

### Afterhours: ClubKid + Mikele + Stratos
- **ID**: 61e7be0b78b5590f
- **Type**: dj_set
- **Venue**: Skullbar
- **Price**: door
- **Date**: 2026-03-01T05:00:00
- **Time**: 05:00
- **URL**: https://www.clubber.gr/events/afterhours-clubkid-mikele-stratos/
- **Source**: clubber.gr
- **Venue intel**: Not in database. WebSearch "Skullbar Athens" for context.

### Θεόδωρος Κολοκοτρώνης: Ο Θεός έβαλε την υπογραφή Του…
- **ID**: 4fa575b838530c68
- **Type**: theater
- **Venue**: Θυμέλη Έλλης Βοζικιάδου
- **Price**: paid
- **Date**: 2026-03-01
- **Time**: 20:00
- **URL**: https://www.athinorama.gr/theatre/performance/theodoros_kolokotronis_o_theos_ebale_tin_upografi_tou-10089241/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Θυμέλη Έλλης Βοζικιάδου Athens" for context.

### Alcedo folk band
- **ID**: 5449a68378ecbb72
- **Type**: concert
- **Venue**: Μύρτιλλο
- **Price**: paid
- **Date**: 2026-03-01
- **Time**: 20:00
- **URL**: https://www.athinorama.gr/music/gig/alcedo_folk_band-10083433/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Μύρτιλλο Athens" for context.

### REVOLT hosts SHUFFLE with Paleman (UK)
- **ID**: 1647764215728394
- **Type**: dj_set
- **Venue**: TBA - ATHarea
- **Price**: paid
- **Date**: 2026-03-01T14:00:00
- **Time**: 14:00
- **URL**: https://ra.co/events/2373393
- **Source**: residentadvisor
- **Venue intel**: Not in database. WebSearch "TBA - ATHarea Athens" for context.

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
   bun run scripts/save-batch.ts --manifest=temp-briefs/batch-101.manifest.json --session=batch-101 --batch=101 --clean
   ```
   Note "AUTO-SAVED" at the top of batch-101-review.md.
   - If ANY score is < 85 OR any have errors: do NOT run save-batch.ts.
     Note "LEFT FOR REVIEW" at the top of batch-101-review.md with reasons.

After all events, create `temp-descriptions/batch-101-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| 31a966329487fc7b | Ad&#233;d&#232;j&#236; | /100 | | |
| 61e7be0b78b5590f | Afterhours: ClubKid + Mikele + Stratos | /100 | | |
| 4fa575b838530c68 | Θεόδωρος Κολοκοτρώνης: Ο Θεός έβαλε την υπογραφή Του… | /100 | | |
| 5449a68378ecbb72 | Alcedo folk band | /100 | | |
| 1647764215728394 | REVOLT hosts SHUFFLE with Paleman (UK) | /100 | | |
