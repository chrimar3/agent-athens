# Per-Source English Coverage Tracker — agent-athens

**Baseline**: see [`specs/en-deployment-state-2026-05-13.md`](en-deployment-state-2026-05-13.md) §6 for the 2026-05-14 source-level coverage data + classification verdict (rule-based, source-driven).

**Quarterly review schedule**: next due **Q3 2026**. Review re-runs §6's source-bucket probe + updates tier assignments below.

---

## Four-Tier Framework

**Tier bands are defined by coverage-rate ranges, not by current occupant values.** Cells under "Current occupants" list the source's empirical rate at the snapshot date; replicating cities will populate the same bands at different values.

| Tier | Coverage band (definition) | Current occupants (agent-athens, 2026-05-14) | Watch-for signal |
|---|---|---|---|
| **Tier 1** | 100% English coverage (categorical) | `megaron.gr`, `halfnote`, `onassis`, `greeksin.ai`, `manual` | Regression. A drop to <100% means source-side editorial shift (e.g. source stopped publishing in English, or per-source enrichment policy was relaxed). Investigate at next-quarter review. |
| **Tier 2** | 50–99% English coverage (band) | `more.com` (70.1%), `clubber.gr` (66.7%), `residentadvisor` (57.4%), `ticketservices` (57.1%) — "others between" Tier 1 and Tier 3 in §6 | **Upward convergence**. Movement toward 100% is positive forcing function for future Greek-rollout planning — indicates source-side editorial maturity. Movement downward signals source dropping bilingual posture. |
| **Tier 3** | 1–49% English coverage (band) | `athinorama.gr` (25.0%) — current Tier 3 occupant value, not the band definition | Either direction. Upward = source improving bilingual coverage. Downward = source contracting toward Greek-only. Both signals worth surfacing. A future source landing in Tier 3 at any value 1–49% triggers the same either-direction-watch stance. |
| **Tier 4** | 0% English coverage (categorical) | `meetup` (0%), `benaki`, `snfcc`, `clubber`, `eventbrite`, `manual` (small sample), `devoxx.gr`, `hackathongreece.ai` (variable) — sources with little or no English description output | Watch for source-side bilingual onboarding. New English content from a Tier 4 source promotes the source to Tier 3 next quarter. |

(Tier assignments above use the §6 upcoming-events flow rate, not all-events stock rate. The stock rate is ~11% (all events); the flow rate is ~53% (upcoming events). Tiering is decided on flow rate because that's the forward-looking metric for content posture.)

---

## Replicability — Cross-City Template

This tracker is the **canonical filename** for cross-city replication. As the agent platform forks to additional cities (planned: agent-barcelona, agent-berlin, agent-rome, agent-lisbon), each city ships its own `specs/per-source-coverage-tracker.md` with the same four-tier framework filled in against that city's source list.

Per-city aspects expected to vary:
- **Source list**: each city has different scraping sources (Athens uses `megaron.gr`/`athinorama.gr`/etc.; Barcelona would use its local equivalents).
- **Tier threshold values**: the 100% / 50–99% / 25% / 0% bands are the agent-athens-current shape; if a different city has a different distribution (e.g. all sources cluster at 80–100%), the band thresholds adapt to that city's empirical distribution rather than enforcing Athens-style banding.
- **Quarterly review cadence**: per-city decision; default is Q3 2026 here.

Per-city aspects expected to stay constant:
- **Framework shape**: four tiers, banded by source-side English coverage percent.
- **Source-driven verdict**: per-city probes will likely surface the same "rule-based, source-driven" classification — the source's editorial posture, not the per-event enrichment decision, drives coverage. This is the durable framework insight.
- **File path**: `specs/per-source-coverage-tracker.md` at city repo root.

---

## Policy Reference

Per GEO Strategist Item #3 fork decision (2026-05-13):

1. **Accept current source posture**: the framework is a measurement tool, not an enrichment trigger. Per-source coverage rates reflect source-side editorial reality; the agent platform does not attempt to override that reality.
2. **Do not synthetically translate**: do not activate machine translation or LLM-assisted Greek-to-English content generation to artificially boost Tier 3/4 coverage. Doing so would emit incorrect `inLanguage` claims (synthetic English text labeled as native) and create English URLs over semantically Greek event entities — both of which damage citation equity and search-engine trust.
3. **Do not contract existing /en/ pages**: if a Tier 1 source drops below 100% (e.g. starts publishing some Greek-only content), do NOT take down already-shipped /en/ pages for events that previously had English descriptions. Bilateral hreflang is more forgiving than missing hreflang; canonical-to-root posture from S139 covers the partial-coverage state safely.
4. **Framework is measurement only**: tier movement quarter-over-quarter is signal for GEO Strategist's review packets, not a trigger for engineering action. Engineering action is scoped per separate session briefs.

---

## Linkage

- Baseline data: [`specs/en-deployment-state-2026-05-13.md`](en-deployment-state-2026-05-13.md) §6 (coverage classification) + §7 (root-only content-language probe)
- S138 / S139 commits relevant to bilingual scaffolding: `d1cee688a` (card save-state mechanism), `c8be54049` (canonical-to-root posture), `0ba844148` (Netlify deploy gotcha bank — operational, not directly relevant to coverage tracking)
- Future linkage: S140 brief (description-field locale-awareness + content-pages parity verifier extension) — will reference §6 + §7 + this tracker.

---

**Filename precedent established**: this is the canonical name. When forking to additional cities, copy this template, replace the agent-athens source list + tier assignments, and keep the framework + policy sections.
