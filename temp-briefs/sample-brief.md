# Enrichment Brief — Batch SAMPLE

You are writing premium event descriptions for Agent Athens, an AI-curated cultural events calendar for Athens, Greece.

## Rules (condensed)

1. **8-section structure**: Sensory opening → Credentials → Tribe → Details table → Experience → Filter → Logistics → Closer
2. **Voice**: Second person ("you"), present tense, sensory-first. Transport before inform.
3. **Word count**: 400-600 words of pure narrative per event
4. **Details table**: 4 rows — Setting, Vibe, Sound, Door (or Format/Access for tech events)
5. **Filter section**: Always include "If you [don't want X]... But if you [want Y]..." for honest self-selection
6. **Show don't tell**: No lazy adjectives (amazing, incredible, fantastic, wonderful, stunning, vibrant). Use concrete details.
7. **Tribe**: Describe crowd by character and behavior, not demographics
8. **Logistics**: Metro station, walking distance, ticket prices, practical tips
9. **Closer**: One sentence — scarcity, uniqueness, or urgency. Tight, one clause.
10. **NEVER fabricate information.** If you can't find a fact, omit it. Do not guess.

## What goes in the description vs DB

- Description = **pure narrative only**. No tags, no "Last verified", no JSON-LD, no info tables beyond the Aspect/Details table.
- Tags, timestamps, prices, dates, venue addresses are stored in separate DB fields and rendered by the site template.

## Terminology

- Use "open" not "free" for non-ticketed events (project terminology)
- Use Latin transliteration for Greek names: "Thivaios" not "Θηβαίος"
- Venue names can stay in Greek if that's the canonical name

## Exemplars (read these for structural guidance)

- `exemplars/theater-cherry-orchard.md` — Historical depth, accessibility info
- `exemplars/concert-mattrey.md` — Basement venue detail, credentials chain, proximity selling
- `exemplars/classical-magic-ticket.md` — Audience-specific framing, practical pricing
- `exemplars/concert-three-times-three.md` — Format explanation, cross-community appeal
- `exemplars/theater-medea.md` — Site-specific staging, temperature advice

## Anti-patterns (avoid these)

Read `docs/enrichment-anti-patterns.md` for 9 confirmed mistakes to avoid. Key ones:
- No info/metadata tables in description (DB handles it)
- No tags in prose (use write-tags.ts separately)
- No "Last verified" in prose
- No generic openings ("[Event] opens at [venue] on [date]")
- Greek names in Latin transliteration only
- Every description needs a self-selection filter ("If you...")

---

## Events to Enrich

### Event 1: SHADOW KNIGHT
- **ID**: bf03c503fbae62ad
- **Type**: concert
- **Venue**: ΙΛΙΟΝ Plus
- **Price**: paid
- **Date**: 2026-02-26
- **Time**: 20:30
- **URL**: https://www.more.com/gr-el/tickets/music/shadow-knight-phyrosun-frs-live-ilion-plus/
- **Source**: more.com
- **Venue intel**: Not in venue database. WebSearch "ΙΛΙΟΝ Plus Athens live music venue" for context.

### Event 2: ΤΑΡΤΟΥΦΟΣ του Μολιέρου
- **ID**: 90b7606bdd629df3
- **Type**: theater
- **Venue**: Θέατρο Αλκυονίς
- **Price**: paid
- **Date**: 2026-02-26
- **Time**: 20:00
- **URL**: https://www.more.com/gr-el/tickets/theater/tartoufos-tou-molierou-2/
- **Source**: more.com
- **Venue intel**: Not in venue database. WebSearch "Θέατρο Αλκυονίς Athens" for context.

### Event 3: PHARAOH Vinyl Selection
- **ID**: 008fd413d592ab71
- **Type**: dj_set
- **Venue**: Pharaoh
- **Price**: tba
- **Date**: 2026-02-26
- **Time**: 20:30
- **URL**: https://ra.co/events/2378584
- **Source**: residentadvisor
- **Venue intel**: Not in venue database. WebSearch "Pharaoh bar Athens vinyl" for context.

### Event 4: Alexia Mouza – Rachmaninoff IV
- **ID**: 21fbbeae70952831
- **Type**: classical
- **Venue**: Μέγαρο Μουσικής Αθηνών (Athens Concert Hall / Megaron)
- **Price**: with-ticket
- **Date**: 2026-02-26
- **Time**: 20:30
- **URL**: https://www.megaron.gr/event/alexia-mouza-rachmaninof-iv/
- **Source**: megaron.gr
- **Venue intel**: Megaron is Athens' premier concert hall, adjacent to Megaro Moussikis metro station (Blue line). Multiple halls. Formal programming.

### Event 5: Mama Athens with Lencasea / K.Perrakis
- **ID**: 3820a5a5e35e049d
- **Type**: dj_set
- **Venue**: B side Athens
- **Price**: tba
- **Date**: 2026-02-26
- **Time**: 21:00
- **URL**: https://ra.co/events/2379022
- **Source**: residentadvisor
- **Venue intel**: Not in venue database. WebSearch "B side Athens bar" for context.

---

## Execution Instructions

For EACH event:

1. **Research**: WebSearch the event URL for details. Also search for the artist/performer and venue.
2. **Write description**: Write the description following the 8-section structure. Save to `temp-descriptions/<event-id>.md`
   ```bash
   bun run scripts/write-description.ts <event-id> "<description text>"
   ```
3. **Gate check**: Run quality validation on each description:
   ```bash
   bun run scripts/auto-gate-check.ts temp-descriptions/<event-id>.md --tier=premium --event-id=<event-id>
   ```
4. **Write tags**: Apply tags from the taxonomy:
   ```bash
   bun run scripts/write-tags.ts <event-id> Tag1 Tag2 Tag3...
   ```

## Output Format

After completing all events, create `temp-descriptions/batch-SAMPLE-review.md` with:

| Event ID | Title | Gate Score | Issues | Your Confidence |
|----------|-------|------------|--------|-----------------|
| ... | ... | .../100 | ... | high/medium/low |

Include any research notes or decisions you made.
