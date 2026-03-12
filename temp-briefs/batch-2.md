# Enrichment Brief — Batch 2

## VERIFICATION CHECKLIST
- This is Batch 2
- Event IDs: f320b3e6fe10f0d6, 5d44911d829de25f, 0c3a3e3aa0e51e6e
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
- `exemplars/classical-lpo-jarvi.md` — structural reference
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

- "Resonances is a concert for two pianos at the Philippos Nakas Concert Hall on Ippokratous Street in central Athens, performed by Lydia Linardou and Hero Menegou."
- "Sneaky Club is a DJ night at Zelus on Ploutarchou 9 in Kolonaki, starting at 23:00 on Thursday 12 March 2026."
- "Parantaiz — I aithousa klimatizetai is a contemporary theater production at Theatre 104 in Gazi, written by Lena Kitsopoulou and directed by Giota Seremeti."
- "I Dynami tis Synithias vol."
- "Gynaika is a concert by the Athens Municipal Symphony Orchestra at Olympia Municipal Music Theater Maria Callas in central Athens, on 10 March 2026."
- "Aligatores is a psychological drama at Auditorium in central Athens, running through 31 March 2026."

---

## Events to Enrich

### &#171;Ρετρό Σάββατα με τον Δαυίδ Ναχμία&#187;
- **ID**: f320b3e6fe10f0d6
- **Type**: exhibition
- **Venue**: Ίδρυμα Β. & Μ. Θεοχαράκη
- **Price**: paid
- **Date**: 2026-03-21T20:30:00
- **Time**: 20:30
- **URL**: https://www.athinorama.gr/music/gig/retro_sabbata_me_ton_dauid_naxmia-10089494/
- **Source**: athinorama.gr
- **Category**: exhibition
- **Target words (English)**: 200-300
- **Target words (Greek)**: 170-260
- **Structure**: hybrid
- **HARD CONSTRAINT**: English description MUST be 200-300 words. Greek MUST be 170-260 words.
- **Venue intel**: Not in database. WebSearch "Ίδρυμα Β. & Μ. Θεοχαράκη Athens" for context.

### MAROUSSI CHERY VS ΠΕΡΙΣΤΕΡΙ BETSSON
- **ID**: 5d44911d829de25f
- **Type**: sports
- **Venue**: Κλειστό Γήπεδο Αμαρουσίου
- **Price**: paid
- **Date**: 2026-03-14T16:00:00
- **Time**: 16:00
- **URL**: https://www.more.com/gr-el/tickets/sports/maroussi-chery-vs-peristeri-betsson/
- **Source**: more.com
- **Category**: default
- **Target words (English)**: 120-200
- **Target words (Greek)**: 100-170
- **Structure**: hybrid
- **HARD CONSTRAINT**: English description MUST be 120-200 words. Greek MUST be 100-170 words.
- **Venue intel**: Not in database. WebSearch "Κλειστό Γήπεδο Αμαρουσίου Athens" for context.

### Δεν θα πεθάνουμε κιόλας
- **ID**: 0c3a3e3aa0e51e6e
- **Type**: show
- **Venue**: Red Jasper Cabaret Theatre
- **Price**: paid
- **Date**: 2026-03-12T21:00:00
- **Time**: 21:00
- **URL**: https://www.athinorama.gr/theatre/performance/den_tha_pethanoume_kiolas-10088694/
- **Source**: athinorama.gr
- **Category**: default
- **Target words (English)**: 120-200
- **Target words (Greek)**: 100-170
- **Structure**: hybrid
- **HARD CONSTRAINT**: English description MUST be 120-200 words. Greek MUST be 100-170 words.
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
5. **Write Greek description** (optional secondary): Write a condensed Greek version.
   Save to `temp-descriptions/batch-2/<event-id>.gr.md`. Greek word target shown per event above.
   ```bash
   bun run scripts/write-description.ts <event-id> --batch-dir=temp-descriptions/batch-2 --lang=gr "<greek description>"
   ```
   **Greek description rules**:
   - Cultural terms in Greek (e.g., ρεμπέτικο, λαϊκό, έντεχνο — not transliterated)
   - Use "ελεύθερη είσοδος" not "δωρεάν" for free events
   - Venue names MUST be in Greek script: Μέγαρο Μουσικής (not Megaron), Τεχνόπολη (not Technopolis), Στέγη Ωνάση (not Onassis Stegi), Εθνικό Θέατρο (not National Theatre)
   - Same 8-section structure, same factual content, but natural Greek voice
   - The Greek version is NOT a translation. Write it fresh for a local audience.
6. **Save decision** (after completing ALL events in this batch):
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
bun run scripts/auto-gate-check.ts temp-descriptions/batch-2/f320b3e6fe10f0d6.md \
  --tier=standard --event-id=f320b3e6fe10f0d6 \
  --event-type=exhibition --event-venue="Ίδρυμα Β. & Μ. Θεοχαράκη" \
  --event-title="&#171;Ρετρό Σάββατα με τον Δαυίδ Ναχμία&#187;" \
  --event-date=2026-03-21 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-2/5d44911d829de25f.md \
  --tier=standard --event-id=5d44911d829de25f \
  --event-type=sports --event-venue="Κλειστό Γήπεδο Αμαρουσίου" \
  --event-title="MAROUSSI CHERY VS ΠΕΡΙΣΤΕΡΙ BETSSON" \
  --event-date=2026-03-14 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-2/0c3a3e3aa0e51e6e.md \
  --tier=standard --event-id=0c3a3e3aa0e51e6e \
  --event-type=show --event-venue="Red Jasper Cabaret Theatre" \
  --event-title="Δεν θα πεθάνουμε κιόλας" \
  --event-date=2026-03-12 --event-price=paid
```

After all events, create `temp-descriptions/batch-2/batch-2-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| f320b3e6fe10f0d6 | &#171;Ρετρό Σάββατα με τον Δαυίδ Ναχμία&#187; | /100 | | |
| 5d44911d829de25f | MAROUSSI CHERY VS ΠΕΡΙΣΤΕΡΙ BETSSON | /100 | | |
| 0c3a3e3aa0e51e6e | Δεν θα πεθάνουμε κιόλας | /100 | | |
