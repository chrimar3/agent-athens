# Enrichment Brief — Batch 8

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

### Yiannis Kassetas
- **ID**: c7e9c8aee4d0e709
- **Type**: theater
- **Venue**: Theatre Of The No
- **Price**: tba
- **Date**: 2026-02-27
- **Time**: 21:30
- **URL**: https://www.athinorama.gr/music/gig/yiannis_kassetas-10052168/
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

### Θάνος Ολύμπιος &amp; Σωτήρης Προίσκος «Στον ήλιο των τραγουδιών» Μαζί τους η Νατάσα Χαμπίδου
- **ID**: 33c32f6e5296df30
- **Type**: concert
- **Venue**: Μέγαρο Μουσικής Αθηνών
- **Price**: paid
- **Date**: 2026-02-27
- **Time**: 20:00
- **URL**: https://www.ticketservices.gr/event/14056/
- **Source**: ticketservices
- **Venue intel**: Not in database. WebSearch "Μέγαρο Μουσικής Αθηνών Athens" for context.

### Skullcrush Fest
- **ID**: f9d313043f98394d
- **Type**: dj_set
- **Venue**: Temple
- **Price**: paid
- **Date**: 2026-02-27
- **Time**: 20:00
- **URL**: https://www.athinorama.gr/music/gig/skullcrush_fest-10089226/
- **Source**: athinorama.gr
- **Venue intel** (from database):
  ```
  ### Temple Athens
  | Field | Data |
  |-------|------|
  | **Address** | Iakhou 17, Gazi |
  | **Metro** | Kerameikos (Blue) |
  | **Capacity** | ~600 |
  | **Entry** | €15-25 |
  | **Door Policy** | Some selection on big nights |
  | **Sound** | Funktion-One, serious laser rig |
  | **Character** | Big-room techno, two floors, basement is the peak experience |
  
  ---
  ```

### ΠΑΝΑΓΙΩΤΗΣ ΜΑΡΓΑΡΗΣ
- **ID**: 29495798aed83acf
- **Type**: classical
- **Venue**: Μέγαρο Μουσικής Αθηνών
- **Price**: paid
- **Date**: 2026-03-01
- **Time**: 20:30
- **URL**: https://www.more.com/gr-el/tickets/music/panagiotis-margaris-mesogeios/
- **Source**: more.com
- **Venue intel**: Not in database. WebSearch "Μέγαρο Μουσικής Αθηνών Athens" for context.

### By Heart | Tiago Rodrigues
- **ID**: 0573ab33c1544927
- **Type**: theater
- **Venue**: Onassis Stegi
- **Price**: with-ticket
- **Date**: 2026-05-12
- **URL**: https://www.onassis.org/el/whats-on/heart
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
5. **Save decision** (after completing ALL events in this batch):
   - If ALL gate scores are >= 85 AND all have 0 errors: auto-save to database:
   ```bash
   bun run scripts/save-batch.ts --session=batch-8 --batch=8
   ```
   Note "AUTO-SAVED" at the top of batch-8-review.md.
   - If ANY score is < 85 OR any have errors: do NOT run save-batch.ts.
     Note "LEFT FOR REVIEW" at the top of batch-8-review.md with reasons.

After all events, create `temp-descriptions/batch-8-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| c7e9c8aee4d0e709 | Yiannis Kassetas | /100 | | |
| 33c32f6e5296df30 | Θάνος Ολύμπιος &amp; Σωτήρης Προίσκος «Στον ήλιο των τραγουδιών» Μαζί τους η Νατάσα Χαμπίδου | /100 | | |
| f9d313043f98394d | Skullcrush Fest | /100 | | |
| 29495798aed83acf | ΠΑΝΑΓΙΩΤΗΣ ΜΑΡΓΑΡΗΣ | /100 | | |
| 0573ab33c1544927 | By Heart | Tiago Rodrigues | /100 | | |
