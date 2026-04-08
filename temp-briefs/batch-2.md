# Enrichment Brief — Batch 2

## VERIFICATION CHECKLIST
- This is Batch 2
- Event IDs: ba1cb764c001ee17, 0ed4202c1aa2a351, 8cd851b811d8321f
- Write descriptions to: temp-descriptions/batch-2/
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

- `exemplars/exhibition-swinton.md` — structural reference
- `exemplars/festival-sonic-sisters.md` — structural reference

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

- "The curtain rises on a hospital bed."
- "What happens when you compress the largest battle in human history into a room with two actors and no scenery?"
- "Amalia Arseni walks onstage carrying her aunt's words."
- "The house lights dim in the Alexandra Trianti Hall and a living room appears on the screen — an American backyard, a broken tree, a family sitting in lawn chairs as if nothing is wrong."
- "A young man stumbles into a pub in County Mayo and announces he has killed his father."
- "Four musicians sit along the back wall."
- "Eleni Rantou stands alone onstage with a microphone and a lifetime of material."
- "A journalist sits across from Leni Riefenstahl and asks the question the twentieth century never settled: does the artist bear responsibility for what the art served?"
- "The sixth Caryatid returns from the British Museum."
- "Sacri Respiri brings countertenor Nikos Spanatis, the S.T.A.B."
- "By day Patision65 is a vintage clothing bazaar on 28is Oktovriou; by night it opens as a techno venue."
- "Inside Onassis Stegi, the Yorgos Lanthimos: Photographs exhibition is laid out in the shape of a classical Greek temple — a central altar-like space displaying 110 new photographs, ringed by three outer bodies of work drawn from the spaces of his recent films."
- "A Saturday in May, and the lawns of the Megaron Concert Hall garden have been turned over to ages three through twelve."
- "Evanthia Reboutsika and Aris Davarakis open their songbook at the Pallas."
- "Slaughter to Prevail bring their summer European tour to Floyd in Gazi on 24 July 2026."

---

## Events to Enrich

### Yorgos Lanthimos: Photographs
- **ID**: ba1cb764c001ee17
- **Type**: exhibition
- **Venue**: Onassis Stegi
- **Price**: with-ticket
- **Date**: 2026-05-17T11:00:00
- **Time**: 11:00
- **URL**: https://www.onassis.org/el/whats-on/yorgos-lanthimos-photographs
- **Source**: onassis
- **Category**: exhibition
- **Target words**: 200-300
- **Structure**: hybrid
- **HARD CONSTRAINT**: Description MUST be 200-300 words.
- **Venue intel**: Not in database. WebSearch "Onassis Stegi Athens" for context.

### 3ο Greek Beer Festival
- **ID**: 0ed4202c1aa2a351
- **Type**: festival
- **Venue**: Παλιό Αμαξοστάσιο ΟΣΥ
- **Price**: tba
- **Date**: 2027-03-27
- **URL**: https://www.athinorama.gr/music/gig/3o_greek_beer_festival-10089550/
- **Source**: athinorama.gr
- **Category**: festival_parent
- **Target words**: 250-400
- **Structure**: full-8-section
- **HARD CONSTRAINT**: Description MUST be 250-400 words.
- **Venue intel**: Not in database. WebSearch "Παλιό Αμαξοστάσιο ΟΣΥ Athens" for context.

### Γάτες με φράντζες
- **ID**: 8cd851b811d8321f
- **Type**: show
- **Venue**: Red Jasper Cabaret Theatre
- **Price**: paid
- **Date**: 2026-04-08T21:00:00
- **Time**: 21:00
- **URL**: https://www.athinorama.gr/theatre/performance/gates_me_frantzes-10089683/
- **Source**: athinorama.gr
- **Category**: default
- **Target words**: 120-200
- **Structure**: hybrid
- **HARD CONSTRAINT**: Description MUST be 120-200 words.
- **Venue intel**: Not in database. WebSearch "Red Jasper Cabaret Theatre Athens" for context.

---

## Execution Instructions

For EACH event:

1. **Research**: WebSearch the event URL for details. Search for artist/performer background. Also search the venue if writing sensory opening details about the physical space — unverified atmosphere (invented food smells, assumed decor) is a fabrication violation even if it sounds plausible.
2. **Write description**: Save to batch directory (temp-descriptions/batch-2/):
   ```bash
   bun run scripts/write-description.ts <event-id> --batch-dir=temp-descriptions/batch-2 "<description text>"
   ```
3. **Gate check**: Validate quality with metadata flags (no DB needed):
   ```bash
   bun run scripts/auto-gate-check.ts temp-descriptions/batch-2/<event-id>.md --tier=<tier> --event-id=<event-id> \
     --event-type=<type> --event-venue="<venue>" --event-title="<title>" \
     --event-date=<date> --event-price=<price>
   ```
   Tier mapping: three-part-block=stub, hybrid=standard, full-8-section=premium
4. **Write tags** (from taxonomy in docs/MASTER-ENRICHMENT-TEMPLATE.md):
   ```bash
   bun run scripts/write-tags.ts <event-id> --batch-dir=temp-descriptions/batch-2 Tag1 Tag2 Tag3...
   ```
5. **Save decision** (after completing ALL events in this batch):
   - If ALL gate scores are >= 80 AND all have 0 errors: auto-save to database:
   ```bash
   bun run scripts/save-batch.ts --manifest=temp-briefs/batch-2.manifest.json --session=batch-2 --batch=2 --clean
   ```
   Note "AUTO-SAVED" at the top of batch-2-review.md.
   - If ANY score is < 80 OR any have errors: do NOT run save-batch.ts.
     Note "LEFT FOR REVIEW" at the top of batch-2-review.md with reasons.

### Per-Event Gate Check Commands

Copy-paste these with the correct tier for each event:

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-2/ba1cb764c001ee17.md \
  --tier=standard --event-id=ba1cb764c001ee17 \
  --event-type=exhibition --event-venue="Onassis Stegi" \
  --event-title="Yorgos Lanthimos: Photographs" \
  --event-date=2026-05-17 --event-price=with-ticket
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-2/0ed4202c1aa2a351.md \
  --tier=premium --event-id=0ed4202c1aa2a351 \
  --event-type=festival --event-venue="Παλιό Αμαξοστάσιο ΟΣΥ" \
  --event-title="3ο Greek Beer Festival" \
  --event-date=2027-03-27 --event-price=tba
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-2/8cd851b811d8321f.md \
  --tier=standard --event-id=8cd851b811d8321f \
  --event-type=show --event-venue="Red Jasper Cabaret Theatre" \
  --event-title="Γάτες με φράντζες" \
  --event-date=2026-04-08 --event-price=paid
```

After all events, create `temp-descriptions/batch-2/batch-2-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| ba1cb764c001ee17 | Yorgos Lanthimos: Photographs | /100 | | |
| 0ed4202c1aa2a351 | 3ο Greek Beer Festival | /100 | | |
| 8cd851b811d8321f | Γάτες με φράντζες | /100 | | |
