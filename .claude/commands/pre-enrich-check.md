---
description: Pre-enrichment checklist — run before any enrichment session
---

# Pre-Enrichment Checklist

Before running enrichment, complete these checks:

## 1. Read Required Context
- [ ] Read `.claude/notes/mistakes.md` (especially Enrichment and Time Enrichment sections)
- [ ] Read `.claude/notes/patterns.md` (AI Enrichment Pattern, Time Extraction Pattern)
- [ ] Read `docs/MASTER-ENRICHMENT-TEMPLATE.md` for description standards
- [ ] Read `config/venue-intelligence.md` for venue context

## 2. Run Session Diagnostic
```bash
./scripts/session-diagnostic.sh
```
Note the "Enrichment Gaps" section — how many need enrichment, descriptions, and time.

## 3. Check Enrichment Queue
```bash
sqlite3 data/events.db "SELECT status, COUNT(*) FROM enrichment_queue GROUP BY status;"
sqlite3 data/events.db "SELECT tier, COUNT(*) FROM enrichment_queue GROUP BY tier;"
```

## 4. Decide Enrichment Scope
- Generate prompts: `bun run scripts/run-enrichment-pipeline.ts --prompts --count=10`
- Sync mode (interactive): `bun run scripts/run-enrichment-pipeline.ts --sync`
- Time enrichment: `bun run scripts/enrich-time.ts`

## 5. Critical Reminders
- **Claude Code IS the AI** — no external API module exists
- **CRITICAL: Do not fabricate information** — always include this in prompts
- Use "open" not "free" for pricing terminology
- Exhibitions use `end_date` — check with `COALESCE(CASE WHEN type='exhibition' THEN end_date...)`
- Greek time: `μ.μ.` = PM (add 12), `π.μ.` = AM

## 6. After Enrichment
- [ ] Validate enriched events: `bun run scripts/run-enrichment-pipeline.ts --validate --id=<ID>`
- [ ] Run `./scripts/session-diagnostic.sh` to confirm gap reduction
- [ ] Check enrichment queue status changed from 'pending' to 'completed'
