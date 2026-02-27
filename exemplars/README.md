# Enrichment Exemplars

7 gold-standard descriptions from calibration batches 0-3 (2026-02-26), user-corrected and approved.

## Files

| File | ID | Type | Gate Score | Key Lesson |
|------|----|------|------------|------------|
| `theater-cherry-orchard.md` | `42503c43d0d8e57e` | theater | 85 | Historical depth (3rd in 60 years), tribe section, accessibility info |
| `theater-medea.md` | `adee3f915b020a61` | theater | 84 | Site-specific staging, counter-tenor acoustics, temperature advice |
| `concert-mattrey.md` | `69b5e3bad5341b32` | concert | 85 | Basement venue detail, credentials chain, proximity selling point |
| `concert-three-times-three.md` | `944f6f629770adfd` | concert | 84 | Random pairing format, dance+music crossover, monthly series |
| `classical-magic-ticket.md` | `3bfb9d0c8c4f0ff8` | classical | 84 | Toddler audience, cushion seating, adult+child pricing |
| `dj-set-pharaoh.md` | `008fd413d592ab71` | dj_set | 85 | Venue-as-concept framing, verified sensory details, tribe split (diners vs listeners) |
| `exhibition-lanthimos.md` | `1b7ed35a3b33c973` | exhibition | 89 | Space-first opening, two-audience tribe split, Format/Access table |

## 8-Section Structure (all exemplars demonstrate)

1. **Sensory Opening** — "You" in a specific moment, physical details (smell, sound, light)
2. **Credentials** — Artist/director background, specific works, collaborators
3. **Tribe** — Who attends, why they come, what binds them
4. **Details Table** — Setting, Vibe, Sound, Door (markdown table)
5. **Experience** — What you'll actually see/hear/feel during the event
6. **Filter** — "If you [don't want X]... But if you [want Y]..." self-selection
7. **Logistics** — Metro, address, times, ticket prices, practical tips
8. **Closer** — One-line scarcity/uniqueness statement

## How to Use

Subagent briefs should REFERENCE these files by path + 1-line annotation, NOT embed full text.
The subagent reads the files directly for structural guidance.

## Type Coverage

| Type | Exemplar(s) | Queue Size | Status |
|------|-------------|------------|--------|
| theater | cherry-orchard, medea | 303 | Well covered |
| concert | mattrey, three-times-three | 194 | Well covered |
| classical | magic-ticket | 37 | Covered |
| dj_set | pharaoh | 91 | Covered (batch 1) |
| exhibition | lanthimos | varies | Covered (batch 3) |

## Pattern Watch

Issues observed during calibration that subagents should learn from:

### Opening Diversity
The five exemplars demonstrate different sensory entry points:
- **Cherry Orchard**: Emotional weight of the room before curtain
- **Medea**: Footsteps echoing, mineral stillness, voice beginning
- **Mattrey**: Physical entry (pushing through a door), smell, proximity
- **Three Times Three**: Sound of dancers' feet, structure revealed
- **Magic Ticket**: Soft lights, floor cushions, child's perspective

- **Lanthimos**: Temple structure, photographs not explaining themselves, forced proximity

Subagents must vary openings across a batch. If two events are in similar venues, find different sensory anchors.

### Tribe Section
**Show behavior, not segments.** Don't list audience types ("theater regulars, music fans, gallery visitors"). Instead, show what people do in the space:
- What they look at before the show starts
- How they position themselves
- What they talk about
- How silence or noise functions in the room

Best example: `concert-three-times-three.md` — "choreographers watching how musicians respond to physical cues, sound artists studying how dancers translate rhythm into gesture."

### Closer
**Demonstrate scarcity with structural facts.** Don't state "this is rare" — show WHY:
- Cherry Orchard: "Three productions in sixty years. The interval was four decades."
- Mattrey: "An international improviser playing a room this small only happens because Athens' scene operates at intimate scale."
- Magic Ticket: Programming stats contrasting Megaron (two per season) with other halls (zero).

One clause. No restatement of earlier points.

### Sensory Extrapolation Boundary
PHARAOH demonstrates the line between verified sensory detail and fabrication. The wood-fire smoke detail is earned because the kitchen is Michelin-documented as cooking exclusively with fire. The metal record cabinet is confirmed by EK Magazine. **Extrapolate from verified facts; never invent from nothing.** If you can't find a source for a venue detail, use the event's sound, performer action, or audience energy instead.

## Gate Score Context

Calibration scores are 84-85/100 (batches 0-1). Lanthimos scores 89/100 (batch 3) — above the calibration baseline, reflecting improved rule adherence after rules 13-16 were added. Warnings about missing SCHEMA_MISSING, MISSING_SECTION (practical/tags/last-verified) are expected — those sections are rendered by the site generator from DB fields, not part of the narrative description text.

The scores measure narrative quality only: sensory language, "you" presence, word count, banned words, timeliness, and differentiation.
