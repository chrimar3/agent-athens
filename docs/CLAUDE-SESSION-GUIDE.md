# Claude Code Session Guide

This guide documents how to perform AI enrichment sessions for Agent Athens using Claude Code.

## Overview

Agent Athens uses a two-part update system:

1. **Automated (daily at 8 AM)**: Email ingestion, parsing, quality gates, site generation, deployment
2. **Manual (Claude Code session)**: AI-powered event description enrichment

The automated pipeline runs daily whether or not enrichment happens. Enrichment adds high-quality descriptions but isn't required for the site to function.

## Starting a Session

1. Open a terminal in the project directory
2. Run the session helper:

```bash
bun run scripts/daily-manual.ts
```

This shows:
- Pipeline status (what phases have run today)
- Database statistics
- Enrichment queue status
- Suggested commands

For a quick summary:
```bash
bun run scripts/daily-manual.ts --quick
```

## Enrichment Workflow

### Step 1: Check the Queue

```bash
bun run scripts/run-enrichment-pipeline.ts --stats
```

Output shows:
- Total verified events
- Already enriched count
- Pending enrichment count
- Progress percentage

### Step 2: List Events to Enrich

```bash
bun run scripts/list-unenriched.ts
```

Or to see the first 20:
```bash
bun run scripts/run-enrichment-pipeline.ts
```

### Step 3: Generate Prompts

```bash
bun run scripts/run-enrichment-pipeline.ts --prompts --count=5
```

This outputs prompts for the first 5 events. Each prompt includes:
- Event details (title, date, venue, type, genre, price)
- Event ID for saving

**IMPORTANT:** Always write descriptions following `docs/MASTER-ENRICHMENT-TEMPLATE.md`:
- 400-600 words, second person ("you"), present tense
- Sensory opening → Context → Tribe → Experience → Filter → Practical
- Show don't tell: "Bass hits your chest" NOT "excellent sound quality"

### Step 4: Generate Description

For each event:

1. Copy the prompt from the terminal
2. Paste it into Claude Code (this conversation!)
3. Claude will generate a description
4. Review the description for accuracy

### Step 5: Save Description

```bash
bun run scripts/run-enrichment-pipeline.ts --save --id=<EVENT_ID>
```

Then paste the description when prompted. Press Enter twice to confirm.

The script validates:
- Word count (400-600 per MASTER-ENRICHMENT-TEMPLATE.md)
- No filler phrases

### Step 6: Repeat

Continue with the remaining events. You can do as many or as few as time allows.

## Enrichment Best Practices

### MANDATORY: Follow the Master Template

**Always read `docs/MASTER-ENRICHMENT-TEMPLATE.md` before writing descriptions.**

This template defines:
- Voice: Second person ("you"), present tense, sensory-first
- Structure: Opening → Context → Tribe → Experience → Filter → Practical
- Length: 400-600 words
- Show don't tell: Evidence, not adjectives

### Key Requirements

| Element | Requirement |
|---------|-------------|
| **Opening** | Sensory experience, transport before inform, under 50 words |
| **Context** | Artist/event significance, timeliness hook ("why now") |
| **Tribe** | Describe crowd by CHARACTER, not demographics |
| **Experience** | Venue atmosphere, vibe, arc of the night |
| **Filter** | "If you... / If you..." honest self-selection |
| **Practical** | Table with all logistics |

### Voice Principles

**We Are:**
- Sensory first — make them feel it before they know it
- Second person — "you" puts the reader in the room
- Present tense — it's happening now
- Character-based — describe people by behavior, not demographics
- Evidence-driven — show, never tell

**We Are NOT:**
- Information-first — facts without feeling don't create action
- Third-person observers — "the venue features" is dead writing
- Adjective-dependent — "amazing" and "incredible" are lazy

### Show, Don't Tell

| Telling (WRONG) | Showing (CORRECT) |
|-----------------|-------------------|
| "excellent sound quality" | "The bass hits your chest before you consciously hear it" |
| "authentic experience" | "The musicians play close enough to touch. Smoke curls through the low light." |
| "great atmosphere" | "By 2am the room has reorganized itself around whoever's dancing hardest" |

### Quality Checks

Before saving, verify:
- 400-600 words (NOT 150-300)
- Opens with sensory experience (NOT facts)
- Second person "you" throughout
- Tribe described by character (NOT demographics)
- Filter section present ("If you...")
- No superlatives without evidence
- No fabricated information

### Session Size

Recommended:
- **Quick session**: 5-10 events (15-20 minutes)
- **Full session**: 20-30 events (45-60 minutes)

You can stop at any time. Progress is saved automatically.

## After Enrichment

### Rebuild the Site

```bash
bun run build
```

This regenerates all pages with the new descriptions.

### Deploy

```bash
git add .
git commit -m "chore: enrichment session - X events"
git push
```

Netlify auto-deploys from the main branch.

### Verify

Check the live site at https://agent-athens.netlify.app to confirm:
- Events display correctly
- Descriptions appear
- No broken pages

## Troubleshooting

### "No events to enrich"

All verified events have descriptions. Great!

### Database locked error

Another process has the database open. Check:
```bash
lsof data/events.db
```

Close any other tools using the database.

### Wrong word count

The validation warns but allows saving. Review manually:
- Under 400 words: You're not following the MASTER-ENRICHMENT-TEMPLATE.md
- Over 600 words: Consider trimming, but more is usually better than less

### Event not found

Check the event ID is correct:
```bash
bun run scripts/run-enrichment-pipeline.ts --id=<EVENT_ID>
```

## Commands Reference

| Command | Purpose |
|---------|---------|
| `bun run scripts/daily-manual.ts` | Session overview |
| `bun run scripts/daily-manual.ts --quick` | Quick summary |
| `bun run scripts/run-enrichment-pipeline.ts --stats` | Enrichment statistics |
| `bun run scripts/run-enrichment-pipeline.ts` | List enrichment queue |
| `bun run scripts/run-enrichment-pipeline.ts --prompts` | Generate prompts |
| `bun run scripts/run-enrichment-pipeline.ts --prompts --count=N` | First N prompts |
| `bun run scripts/run-enrichment-pipeline.ts --id=<ID>` | Show specific event |
| `bun run scripts/run-enrichment-pipeline.ts --save --id=<ID>` | Save description |
| `bun run scripts/list-unenriched.ts` | Full unenriched list |
| `bun run build` | Regenerate site |

## Example Session

```bash
# 1. Start session
$ bun run scripts/daily-manual.ts

# 2. Check queue
$ bun run scripts/run-enrichment-pipeline.ts --stats
# Shows: 47 pending enrichment

# 3. Generate prompts
$ bun run scripts/run-enrichment-pipeline.ts --prompts --count=5

# 4. [Copy prompt, paste in Claude Code, get description]

# 5. Save first description
$ bun run scripts/run-enrichment-pipeline.ts --save --id=abc123def456
# [Paste description, press Enter twice]

# 6. Repeat steps 4-5 for remaining events

# 7. Rebuild and deploy
$ bun run build
$ git add . && git commit -m "chore: enriched 5 events" && git push
```

## Session Frequency

Recommended schedule:
- **Daily**: Quick 5-10 event session (if time allows)
- **Weekly**: Full 20-30 event session
- **As needed**: When there's a backlog

The site functions without enrichment, so sessions are optional but improve quality.

---

**See also:**
- **`docs/MASTER-ENRICHMENT-TEMPLATE.md`** - **MANDATORY** writing style for all enrichments
- `docs/LAUNCHD-SETUP.md` - Automated pipeline setup
- `scripts/daily-manual.ts` - Session helper script
- `.specify/memory/constitution.md` - Project governance
