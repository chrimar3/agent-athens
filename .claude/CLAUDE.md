# Agent Athens

AI-curated cultural events calendar for Athens. Bun + TypeScript + SQLite + Netlify.
Live: https://agentathens.com

---

## 🚨 TIER 1 RULES (These cause bugs — memorize them)

### Exhibitions use end_date, not start_date
```sql
-- ❌ WRONG: Deletes running exhibitions
WHERE start_date < date('now')

-- ✅ CORRECT: Check end_date for exhibitions
WHERE COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) < date('now')
```

### Use "open" not "free"
```typescript
price: "open" | "with-ticket"  // ✅ CORRECT
price: "free" | "paid"         // ❌ WRONG — project terminology
```

### Greek time formats
```typescript
"8.30 μ.μ." → 20:30  // μ.μ. = PM, add 12
"10 π.μ."   → 10:00  // π.μ. = AM
```

### Venue variations — add ALL forms
```json
{
  "canonical_name": "Θέατρο Κάρολος Κουν",
  "variations": ["«Κάρολος Κουν»", "&#171;Κάρολος Κουν&#187;", "Καρολος Κουν", "'Κάρολος Κουν'"]
}
```

### Same venue name, different cities
**Always verify addresses.** Use exact match, not `LIKE '%name%'`.

### Claude Code is interactive — no API module
```typescript
// ❌ WRONG — no such module
const { callToolAgent } = await import('../src/enrichment/tool-agent');
// ✅ CORRECT — Claude Code IS the AI, design scripts to output data
```

### Never fabricate event data
Always include in prompts: `CRITICAL: Do not fabricate information.`

### Timezone — always Europe/Athens
```typescript
const today = DateTime.now().setZone('Europe/Athens').toISODate();
```

### Runtime — Bun, never Node.js

### Institutional memory is historical record

Applies to: `docs/session-log.md`, `docs/known-issues.md`, `.claude/notes/mistakes.md`, `.claude/notes/patterns.md`, `.claude/notes/decisions.md`.

Do not retrofit fields, normalize structure, or assert negatives (e.g. "None", "N/A") for entries that predate the current format. Format changes apply going forward only. Older entries using different field names (e.g. "Next priority" instead of "Open items") are signal about how the process evolved — do not rewrite them to match the current template.

Policy decisions about what fields to keep, drop, or compress in these files belong to the user, not the executor. If tempted to compress for file size, stop and ask first.

---

## Commands

```bash
# Session planning
./scripts/session-diagnostic.sh

# Daily pipeline
./scripts/daily-automated.sh

# Scrapers
bun run scripts/scrape-all.ts [--dry-run] [--source=name]

# Venue management
bun run scripts/review-venues.ts --list
bun run scripts/filter-athens-only.ts
bun run scripts/auto-verify-venues.ts

# Enrichment
bun run scripts/run-enrichment-pipeline.ts --sync
bun run scripts/run-enrichment-pipeline.ts --prompts --count=N
bun run scripts/run-enrichment-pipeline.ts --save --id=ID
bun run scripts/run-enrichment-pipeline.ts --validate --id=ID

# Build & deploy
bun run src/generate-site.ts
bun test && git push origin main

# Database checks
sqlite3 data/events.db "SELECT location_status, COUNT(*) FROM events GROUP BY location_status;"
sqlite3 data/events.db "SELECT source, COUNT(*) FROM events GROUP BY source;"
```

---

## Location Filter

```
Event arrives
  ├─ "Πολλαπλοί Χώροι" ────► pass_through (show)
  ├─ Contains "Θεσσαλονίκη" ► rejected_non_athens (delete)
  ├─ "TBA" or generic ──────► problematic (review)
  ├─ Known Athens venue ────► verified_athens (show)
  └─ Unknown venue ─────────► unverified (hidden)
```
Site shows: `verified_athens` + `pass_through` only.

---

## Data Model

```typescript
type EventType = "concert" | "dj_set" | "exhibition" | "cinema" | "theater" | "festival" | "performance" | "show" | "workshop" | "tech" | "dance" | "other";
type LocationStatus = "verified_athens" | "pass_through" | "unverified" | "rejected_non_athens" | "problematic";
type Price = "open" | "with-ticket";
```

---

## Reference Docs (read BEFORE working on that area)

| When working on... | Read first |
|---------------------|-----------|
| Anything | `.claude/notes/mistakes.md` ← **START HERE** |
| Code changes | `.claude/notes/patterns.md` |
| Architecture decisions | `.claude/notes/decisions.md` |
| DB schema / full architecture | `docs/SYSTEM-REFERENCE.md` |
| Writing descriptions | `docs/MASTER-ENRICHMENT-TEMPLATE.md` (v2.5) |
| Greek descriptions | `docs/greek-enrichment-addendum.md` |
| Enrichment knowledge (venues, artists, collectives) | `config/enrichment-knowledge.md` |
| Entity research & deduplication | `docs/entity-resolution-workflow.md` |
| Enrichment anti-patterns | `docs/enrichment-anti-patterns.md` |
| Enrichment quality exemplars | `exemplars/README.md` |
| Fact-checking post-save | `docs/fact-check-prompt.md` |
| Venue whitelist | `config/athens-venues.json` |

---

## Workflow Checklists

Before scraping: `/project:pre-scrape-check`
Before enrichment: `/project:pre-enrich-check`
Before venue changes: `/project:pre-venue-check`

---

## After Every Session

Update with anything new discovered:

**Always:**
- `.claude/notes/mistakes.md` — bugs found (format: `| What | Why | Fix |`)
- `.claude/notes/patterns.md` — patterns discovered
- `.claude/notes/decisions.md` — architecture choices
- `docs/session-log.md` — append `### Session N — Title` entry (Plan / What happened / Verified / Learnings / Open items). Session number = last + 1.

**Only when relevant:**
- `docs/known-issues.md` — add or update ONLY if the session surfaced a recurring issue, or changed an existing entry's Status. One-shot bug fixes belong in `mistakes.md`, not here. Use severity tiers (🔴/🟡/🟢) and always fill in First seen / Frequency / Symptoms / Workaround / Fix plan / Status.
