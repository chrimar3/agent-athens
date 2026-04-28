# Weekly Manual Citation Logging — GEO Strategist Workflow

For each of the 5 prompts in `tracked_prompts`, query each of 4 engines (ChatGPT, Perplexity, Gemini, Copilot) once, manually, in a fresh session. Record observations and paste an INSERT into Claude Code at end-of-week.

**Cadence:** Friday afternoons. Why Friday: P1 + P3 + P5 are "this weekend" prompts; Friday observations capture the highest engine confidence on those queries. P2 ("απόψε") and P4 ("this month") are less time-sensitive but logging them on the same cadence keeps the workflow simple.

**Time budget:** ~10 minutes total. 5 prompts × 4 engines = 20 observations.

---

## Pre-flight

Open the canonical prompts (do NOT paraphrase — engines respond differently to micro-rewordings):

```bash
sqlite3 data/kpi.db "SELECT prompt_id, lang, format, target_page, text FROM tracked_prompts WHERE rotated_out_at IS NULL ORDER BY prompt_id;"
```

Open 4 browser tabs (or app windows) — one per engine — in clean/private/no-personalization mode:

- ChatGPT: https://chat.openai.com (use a non-logged-in or fresh-session view to minimize personalization)
- Perplexity: https://www.perplexity.ai (Pro account if available; Anthropic auth ok)
- Gemini: https://gemini.google.com (Google account)
- Copilot: https://copilot.microsoft.com (Microsoft account or fresh session)

---

## For each prompt × engine

Paste the prompt text **verbatim** from the SQL query above. Wait for the response to fully render.

Record per cell:

- **Did agentathens.com appear in the response?** Y / N
  - "Appear" = mentioned, cited as source, linked, or named directly. Indirect description ("there's a site that…") doesn't count.
- **If Y: what rank?** 1 = first citation, 2 = second, …
  - If multiple URLs from agentathens.com cited, take the highest-ranked.
- **If Y: which page on agentathens.com?** Copy the URL.
- **Notes:** anything surprising — competitors cited, format anomalies, prompt rewriting by the engine, "I don't have access to live data" caveats.

---

## End-of-week INSERT pattern

Replace `<DATE>` with the Friday's ISO date (e.g., `'2026-05-01'`). Replace each row's values with observations. **Use `1` for cited, `0` for not cited** (SQLite boolean shorthand).

```sql
INSERT INTO manual_citation_log (prompt_id, engine, observed_at, cited, rank, cited_url, notes) VALUES
  ('p1', 'chatgpt',    '<DATE>', 0, NULL, NULL, NULL),
  ('p1', 'perplexity', '<DATE>', 0, NULL, NULL, NULL),
  ('p1', 'gemini',     '<DATE>', 0, NULL, NULL, NULL),
  ('p1', 'copilot',    '<DATE>', 0, NULL, NULL, NULL),

  ('p2', 'chatgpt',    '<DATE>', 0, NULL, NULL, NULL),
  ('p2', 'perplexity', '<DATE>', 0, NULL, NULL, NULL),
  ('p2', 'gemini',     '<DATE>', 0, NULL, NULL, NULL),
  ('p2', 'copilot',    '<DATE>', 0, NULL, NULL, NULL),

  ('p3', 'chatgpt',    '<DATE>', 0, NULL, NULL, NULL),
  ('p3', 'perplexity', '<DATE>', 0, NULL, NULL, NULL),
  ('p3', 'gemini',     '<DATE>', 0, NULL, NULL, NULL),
  ('p3', 'copilot',    '<DATE>', 0, NULL, NULL, NULL),

  ('p4', 'chatgpt',    '<DATE>', 0, NULL, NULL, NULL),
  ('p4', 'perplexity', '<DATE>', 0, NULL, NULL, NULL),
  ('p4', 'gemini',     '<DATE>', 0, NULL, NULL, NULL),
  ('p4', 'copilot',    '<DATE>', 0, NULL, NULL, NULL),

  ('p5', 'chatgpt',    '<DATE>', 0, NULL, NULL, NULL),
  ('p5', 'perplexity', '<DATE>', 0, NULL, NULL, NULL),
  ('p5', 'gemini',     '<DATE>', 0, NULL, NULL, NULL),
  ('p5', 'copilot',    '<DATE>', 0, NULL, NULL, NULL)
;
```

---

## Example — first cited observation

```sql
INSERT INTO manual_citation_log (prompt_id, engine, observed_at, cited, rank, cited_url, notes) VALUES
  ('p1', 'perplexity', '2026-05-15', 1, 2,
   'https://agentathens.com/this-weekend',
   'Cited as second source after timeout.com/athens. Quoted the page''s lead paragraph verbatim.');
```

Note the SQL escaping: single quotes inside the notes string are `''` (doubled), or use `$$ ... $$` heredoc syntax if pasting many.

---

## Apply

Paste the INSERT into Claude Code or directly into sqlite3:

```bash
sqlite3 data/kpi.db < /tmp/weekly-citations.sql   # or paste interactively
```

Sanity-check:

```bash
bun run scripts/kpi-init.ts --status   # tracked_prompts: 5, manual_citation_log: 20 (or 40 if 2 weeks logged)
sqlite3 data/kpi.db "SELECT engine, SUM(cited) AS cited, COUNT(*) AS observations FROM manual_citation_log GROUP BY engine;"
```

---

## Why this stays manual (do not auto-generate)

The act of looking at each engine's actual response — which competitors are cited, format anomalies, prompt rewriting — is the source of qualitative signal that automation can't capture. Auto-generating "all-zeros" rows would lose:
- Engine-specific citation order (Perplexity vs. ChatGPT lead-engine alignment)
- Whether the engine refused the query ("I don't have live data")
- What competitors are taking the citation slots
- Format mode (cited bullet, inline link, "according to X" phrasing)

The 10-min weekly cost is the price of keeping this signal, not a chore to optimize away.

---

## Rotation

Per GEO Strategist's 8-10 week rule: prompts get retired when they stop differentiating performance. To rotate a prompt out:

```sql
UPDATE tracked_prompts SET rotated_out_at = '2026-06-30' WHERE prompt_id = 'p4';
```

To add a new prompt: edit `config/tracked-prompts.json`, run `bun run scripts/kpi-seed-prompts.ts` (idempotent UPSERT). The historical `manual_citation_log` rows for a rotated prompt remain queryable via the foreign key.
