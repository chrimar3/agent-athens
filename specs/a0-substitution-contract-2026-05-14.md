# A0 Substitution-Ladder Deference — Contract Spec v1

**Filed:** 2026-05-14
**Authoritative source:** GEO Strategist routing turns 2026-05-13 (v0 draft) + 2026-05-14 (v1 Row 3 scope adjustment + ladder-load-bearing reframe)
**Reference:** `.claude/notes/decisions.md` 2026-05-14 entry 1 ("A0 Hard-Stop Calibration: Substitution-Ladder Deference") — contains full reasoning, sub-session sequencing, slip-gate discipline, and validation criteria. This artifact is the field-shape authority both sub-sessions implement against.

---

## Surface

`temp-descriptions/concerns.jsonl` — line-delimited JSON, one record per concern emitted by the agent brief during enrichment.

## New fields added to each concern record

| Field | Type | Required | Null semantics |
|---|---|---|---|
| `substitution_applied` | boolean | Required | If the substitution ladder did not fire for this concern, emit `false`. Never omit. |
| `substitution_summary` | string \| null | Required when `substitution_applied=true`; null otherwise | Concise human-readable summary of what the ladder did (≤200 chars). Examples: `"ticket merchant omitted — unverified URL"`, `"venue described qualitatively — no usable identifier in source"`. Null is the only acceptable value when `substitution_applied=false`. |

## Ingest contract (`save-batch.ts`)

- Both fields must be present in incoming JSON; missing field → ingest fails loudly (not silently defaults). Forces brief-template compliance.
- `substitution_applied=true` with `substitution_summary=null` → ingest fails. Forces meaningful pairing.
- `substitution_applied=false` with non-null `substitution_summary` → ingest warns but accepts (defensive; agent may overemit; not a correctness violation).

## Database shape (migration 013)

- `event_concerns.substitution_applied INTEGER NOT NULL DEFAULT 0` (boolean-as-int per SQLite convention)
- `event_concerns.substitution_summary TEXT NULL`
- CHECK constraint:
```sql
  CHECK (
    (substitution_applied = 0 AND substitution_summary IS NULL) OR
    (substitution_applied = 1 AND substitution_summary IS NOT NULL)
  )
```

## Exemption gate (`getHardStopExcludeIds` chokepoint at `src/db/database.ts:273-301`)

- Exemption applies when `substitution_applied=1` AND `concern_type IN ('entity-resolution-uncertain', 'ticket-merchant-unverified')`
- Other concern types (`date-conflict-or-unparseable`, `venue-mismatch-or-unknown`) NOT exempted — Sub-problem B catches via current rules; Sub-problem C handled structurally in Component B
- Telemetry JSONL fires at exemption decision point (one record per exempted event per build)

## JSONL telemetry shape (`logs/hardstop-would-have-fired.jsonl`)

```json
{
  "build_ts": "2026-05-20T03:14:22Z",
  "event_id": "...",
  "rule": "entity-resolution-uncertain",
  "concern_text": "...",
  "substitution_summary": "..."
}
```

## Example concern record (post-contract)

```json
{"event_id":"...","concern_type":"ticket-merchant-unverified","concern_text":"...","substitution_applied":true,"substitution_summary":"ticket merchant omitted — URL not in classifier registry"}
```

## Naming notes (v1 ruling)

`venue-mismatch-or-unknown` is **not** split into separate concern_types. The proposed `venue-normalization-failed` (upstream pipeline normalization) never fires in `concerns.jsonl` — it's a concern the agent never sees. Concern_type vocabulary belongs to the surface that emits it; the surface boundary (concerns.jsonl emits only what the agent can witness) is itself the disambiguation. Pipeline-side normalization failures, if they need their own logging surface, get separate vocabulary in a separate surface (build-time telemetry, Component B audit log) — not a concerns.jsonl rename.

## Reasoning

### On the named ladder as mechanism, not documentation

Enrichment Writer's pre-flight verification surfaced that the substitution ladder, as observed by the audit, was not four agent-recognizable runtime steps — it was a mix of uniform policy (ticket-merchant: merchants are never named in prose), adjacent-rule scaffolding (entity-resolution: handled implicitly by credential-fabrication and thin-context policies), upstream pipeline normalization plus qualitative fallback (venue-mismatch: parent-venue resolution runs upstream of agent, agent-side handles only the qualitative-description case), and not-applicable-by-design (date-conflict: no agent-time substitution).

The audit's output observation was correct; the discrete-step inference was overspecified. Addition A (named ladder steps in the agent brief) is therefore not documentation of existing behavior but the mechanism that makes structured self-reporting possible at all. The agent cannot self-report on a step it's currently taking implicitly without first being given the vocabulary to recognize that step. This upgrades the Enrichment Writer sub-session from parallel-nice-to-have to load-bearing for fix correctness — the slip-gate at T-10 retains its position and gains importance, because incomplete Addition A means Addition B emits nothing useful.

### On Row 3 scope split (upstream vs agent-time)

Parent-venue resolution stays upstream (out of agent scope, out of ladder vocabulary). Agent-side L3 is qualitative-fallback only — invoked when even upstream resolution couldn't disambiguate and the agent must describe the venue qualitatively rather than name it.

This is cleaner than the v0 framing because it correctly locates the work. v0 implicitly bundled two distinct mechanisms under one ladder step, which would have created agent-brief confusion about what L3 actually means at runtime. The phrasing — `"venue described qualitatively — no usable identifier in source"` — accurately describes the agent-side action and gives self-reporting something concrete to anchor to.

Component B reminder (out of current-session scope): sub-location handling (Verdi-class case) lives at the pipeline-normalization layer, not at L3. Component B's spec, when it drafts, will note that parent-venue resolution and sub-location matching are both pipeline-side operations the agent never witnesses; the agent-side L3 fallback handles only the residual case where pipeline normalization couldn't produce a usable identifier.

## L3 fixture validation note

Row 3 (venue-mismatch-or-unknown, agent-side qualitative-fallback case) had no anchor coverage in the audit's 10-rep fixture set. Enrichment Writer's Addition A test fixtures may use a synthesized L3 case rather than a real-data case (labeled with `synthetic_l3_fixture: true` flag for provenance). Validate the synthetic shape against real-world shape in the first 14 days post-deploy: JSONL telemetry captures real L3 exemptions as they accumulate; if their shape diverges materially from the synthesized fixture, brief template's L3 vocabulary receives a v2 revision via a separate Enrichment Writer session.

## Replicability check

**SPEC universal.** Field names, types, null semantics, ingest validation rules, CHECK constraint, exemption-gate concern_type scoping, JSONL telemetry pattern, L3 synthetic-fixture-with-post-deploy-verification protocol — all city-agnostic.

**DATA per-city.** Each city's agent brief template emits its own `substitution_summary` phrasing in its own language. Each city's audit produces its own dated backfill script naming city-specific event_ids. The 22-event full-cohort count (12 entity-resolution + 10 ticket-merchant) is Athens-specific; agent-barcelona and agent-berlin will surface their own cohort sizes at their respective audit moments.

---

## Implementation tracking

Both sub-sessions implement against this spec independently:

- **Dev Planner sub-session:** migration 013 + ingest validation + exemption gate + JSONL telemetry. Owns `src/db/database.ts`, `src/db/migrations/013-*.sql`, `scripts/save-batch.ts`, `src/utils/hardstop-telemetry.ts`.
- **Enrichment Writer sub-session:** brief template update (Addition A named ladder + Addition B structured emission). Owns `scripts/generate-enrichment-brief.ts`.

Cross-project verification at T-10 (EOD May 19): sample `concerns.jsonl` from Enrichment Writer's validation run → Dev Planner ingest dry-run. Joint deploy if dry-run passes; abort to Option 3 (defer to post-Παναθήναια) if not.

Field-shape questions surfaced during sub-session work → flag back to GEO Strategist for contract spec revision before either sub-session commits.
