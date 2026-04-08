# Enrichment Brief — Batch 1

## VERIFICATION CHECKLIST
- This is Batch 1
- Event IDs: 622c91f79ff05653, bc87c431744831de, b5206cdd1c122400
- Write descriptions to: temp-descriptions/batch-1/
- BEFORE writing any file, verify the event ID appears in this list
- ⚠️ DO NOT omit --batch-dir= from write commands. Files without --batch-dir go to a shared directory and contaminate other batches.

You are writing premium event descriptions for Agent Athens, an AI-curated cultural events calendar for Athens, Greece.

## Rules

1. **8-section structure**: Sensory opening → Credentials → Tribe → Details table → Experience → Filter → Logistics → Closer
2. **Voice**: Second person ("you"), present tense, sensory-first. Transport before inform.
3. **Word count**: Per-event target shown below each event (NOT always 400-600). Follow the target range — these are hard constraints, not suggestions.
4. **Details table**: 4 rows — Setting, Vibe, Sound, Door (or Format/Access for tech events)
5. **Filter section**: Always include "If you [don't want X]... But if you [want Y]..."
6. **Show don't tell**: No lazy adjectives — legendary, immersive, iconic, captivating, mesmerizing, breathtaking, enchanting, amazing, incredible, fantastic, wonderful, stunning, vibrant, extraordinary, exceptional, world-class, phenomenal, remarkable
7. **No speculation**: Never write "likely", "perhaps", "probably", "promises to", "the show will". State only verified facts. If you don't know something, omit it — don't guess.
8. **Tribe**: Describe crowd by character/behavior, not demographics
9. **Logistics**: Say "accessible by metro" or "X-minute walk from [station name]". Do NOT include metro LINE NUMBERS or LINE COLORS — these change and have a 20% historical error rate. Ticket prices, practical tips.
10. **Closer**: One tight sentence — scarcity, uniqueness, or urgency
11. **CRITICAL: Do not fabricate information.** If you can't find a fact, omit it.
12. **Terminology**: Use "open" not "free". Latin transliteration for Greek names in prose.
13. **Description only**: No tags, no "Last verified", no info tables beyond Aspect/Details.
14. **VENUE OPENINGS**: If you write sensory details about a venue's physical space (smells, decor, lighting, food/drink), you MUST have found these through WebSearch or venue intel provided. Do not invent plausible atmosphere. If no venue details are available, open with the event's sound, the performer's first action, or the audience's energy instead.
15. **CREDENTIALS**: If you cannot verify a specific release, album, label, or credential through web search, do not include it. State what you can confirm. A missing detail is always better than a wrong one. If web search returns nothing on an artist, say so in batch-review.md and use a venue-forward approach.
16. **OPENING DIVERSITY**: Do not default to sound-first openings. After writing all descriptions in this batch, re-read your openings consecutively. If more than 2 of 5 use the same entry strategy (sound-first, space-first, action-first), rewrite one using a different approach. Options: visual detail, physical action, temporal framing, contrast/tension, a question the space poses.
17. **CLOSER DIVERSITY**: Do not reuse the word "combination" or the phrase "will not reassemble/recur" across multiple closers in the same batch. Each closer must find its own structural fact or framing.

## Exemplars (read for structural guidance)

- `exemplars/theater-tartuffe.md` — structural reference
- `exemplars/classical-lpo-jarvi.md` — structural reference
- `exemplars/exhibition-swinton.md` — structural reference

## Anti-patterns

Read `docs/enrichment-anti-patterns.md` for 10 confirmed mistakes to avoid.

## Entity Locking (English Descriptions)

These terms MUST remain untranslated in English descriptions:

- **Music genres**: rebetiko, rembetika, laiko, laika, entechno, nisiotika, dimotika, amanedhes, zeibekiko, tsifteteli, hasapiko, syrtos, kalamatianos, mandinades
- **Instruments**: bouzouki, baglamas, tzouras, oud, kanun, lyra, santouri, laouto
- **Venue types**: bouzoukia, steki, ouzeri, mezedopoleio, kafeneio, taverna, psistaria
- **Cultural concepts**: kefi, meraki, filotimo, parea, glendi, panigiri, kouventa
- **Venue names**: Inherit from DB (use Latin transliteration or established English name)
- **Neighborhoods**: Inherit from DB (use established transliterations)
- **Date format**: DD Month YYYY (e.g., '15 March 2026', never '15/3/2026' or 'March 15, 2026')
- **Time format**: 24h format with colon (e.g., '21:00', never '9 PM')
- **Currency**: EUR symbol before amount (e.g., '15 EUR' or 'EUR 15', never '$15')

## Recent Openings (DO NOT REUSE)

These opening sentences were used in recent batches. Use a DIFFERENT entry strategy:

- "A man in overalls walks to the center of the stage, draws a cave painting on an invisible wall, and starts explaining why his wife sends him to buy one thing at the supermarket and he comes back with seven wrong items."
- "The curtain rises on a hospital bed."
- "What happens when you compress the largest battle in human history into a room with two actors and no scenery?"
- "Amalia Arseni walks onstage carrying her aunt's words."
- "The house lights dim in the Alexandra Trianti Hall and a living room appears on the screen — an American backyard, a broken tree, a family sitting in lawn chairs as if nothing is wrong."
- "A young man stumbles into a pub in County Mayo and announces he has killed his father."
- "Four musicians sit along the back wall."
- "Eleni Rantou stands alone onstage with a microphone and a lifetime of material."
- "A journalist sits across from Leni Riefenstahl and asks the question the twentieth century never settled: does the artist bear responsibility for what the art served?"
- "The sixth Caryatid returns from the British Museum."

---

## Events to Enrich

### «ΤΑ ΠΑΘΗ»
- **ID**: 622c91f79ff05653
- **Type**: concert
- **Venue**: St. Paul's Anglican Church
- **Price**: tba
- **Date**: 2026-04-07
- **Time**: 21:00
- **URL**: https://www.ticketservices.gr/event/14161/
- **Source**: ticketservices
- **Category**: concert_local
- **Target words**: 80-120
- **Structure**: three-part-block
- **HARD CONSTRAINT**: Description MUST be 80-120 words.
- **Venue intel**: Not in database. WebSearch "St. Paul's Anglican Church Athens" for context.

### Θα σ’ αγαπώ και του χρόνου
- **ID**: bc87c431744831de
- **Type**: theater
- **Venue**: ARROYO THEATER
- **Price**: paid
- **Date**: 2026-04-07T10:30:00
- **Time**: 10:30
- **URL**: https://www.athinorama.gr/theatre/performance/tha_s%e2%80%99_agapo_kai_tou_xronou-10082867/
- **Source**: athinorama.gr
- **Category**: theater_contemporary
- **Target words**: 120-180
- **Structure**: hybrid
- **HARD CONSTRAINT**: Description MUST be 120-180 words.
- **Venue intel**: Not in database. WebSearch "ARROYO THEATER Athens" for context.

### Occult Practices vol.II
- **ID**: b5206cdd1c122400
- **Type**: dj_set
- **Venue**: Patision65
- **Price**: paid
- **Date**: 2026-04-10T22:30:00
- **Time**: 22:30
- **URL**: https://ra.co/events/2404037
- **Source**: residentadvisor
- **Category**: concert_local
- **Target words**: 80-120
- **Structure**: three-part-block
- **HARD CONSTRAINT**: Description MUST be 80-120 words.
- **Venue intel**: Not in database. WebSearch "Patision65 Athens" for context.

---

## Execution Instructions

For EACH event:

1. **Research**: WebSearch the event URL for details. Search for artist/performer background. Also search the venue if writing sensory opening details about the physical space — unverified atmosphere (invented food smells, assumed decor) is a fabrication violation even if it sounds plausible.
2. **Write description**: Save to batch directory (temp-descriptions/batch-1/):
   ```bash
   bun run scripts/write-description.ts <event-id> --batch-dir=temp-descriptions/batch-1 "<description text>"
   ```
3. **Gate check**: Validate quality with metadata flags (no DB needed):
   ```bash
   bun run scripts/auto-gate-check.ts temp-descriptions/batch-1/<event-id>.md --tier=<tier> --event-id=<event-id> \
     --event-type=<type> --event-venue="<venue>" --event-title="<title>" \
     --event-date=<date> --event-price=<price>
   ```
   Tier mapping: three-part-block=stub, hybrid=standard, full-8-section=premium
4. **Write tags** (from taxonomy in docs/MASTER-ENRICHMENT-TEMPLATE.md):
   ```bash
   bun run scripts/write-tags.ts <event-id> --batch-dir=temp-descriptions/batch-1 Tag1 Tag2 Tag3...
   ```
5. **Save decision** (after completing ALL events in this batch):
   - If ALL gate scores are >= 80 AND all have 0 errors: auto-save to database:
   ```bash
   bun run scripts/save-batch.ts --manifest=temp-briefs/batch-1.manifest.json --session=batch-1 --batch=1 --clean
   ```
   Note "AUTO-SAVED" at the top of batch-1-review.md.
   - If ANY score is < 80 OR any have errors: do NOT run save-batch.ts.
     Note "LEFT FOR REVIEW" at the top of batch-1-review.md with reasons.

### Per-Event Gate Check Commands

Copy-paste these with the correct tier for each event:

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-1/622c91f79ff05653.md \
  --tier=stub --event-id=622c91f79ff05653 \
  --event-type=concert --event-venue="St. Paul's Anglican Church" \
  --event-title="«ΤΑ ΠΑΘΗ»" \
  --event-date=2026-04-07 --event-price=tba
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-1/bc87c431744831de.md \
  --tier=standard --event-id=bc87c431744831de \
  --event-type=theater --event-venue="ARROYO THEATER" \
  --event-title="Θα σ’ αγαπώ και του χρόνου" \
  --event-date=2026-04-07 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-1/b5206cdd1c122400.md \
  --tier=stub --event-id=b5206cdd1c122400 \
  --event-type=dj_set --event-venue="Patision65" \
  --event-title="Occult Practices vol.II" \
  --event-date=2026-04-10 --event-price=paid
```

After all events, create `temp-descriptions/batch-1/batch-1-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| 622c91f79ff05653 | «ΤΑ ΠΑΘΗ» | /100 | | |
| bc87c431744831de | Θα σ’ αγαπώ και του χρόνου | /100 | | |
| b5206cdd1c122400 | Occult Practices vol.II | /100 | | |
