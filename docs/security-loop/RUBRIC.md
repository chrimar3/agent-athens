# Security loop — judging rubric

Fixed rubric for the three-judge security panel. Every round is scored against
this file unchanged, so scores are comparable across rounds. Changing an anchor
restarts the baseline; record any change in the round log.

**Question the panel answers:** agent-athens is a public, open-source repo whose
pipeline runs unattended on the owner's MacBook, processes untrusted input
(scraped web pages, newsletter emails, AI enrichment sessions over that text)
and publishes a website. How hard is it for a bad actor to (a) harm the MacBook
or the owner's accounts, or (b) harm the project — its code, data, website,
visitors or reputation?

**Target:** overall score ≥ 8.0, where overall = mean of the per-aspect medians.

## Rules for judges

- **Independent.** You see only this rubric, your brief and the project. You
  never see another judge's scores or notes.
- **Evidence or it did not happen.** Every score cites what you inspected: a
  file:line, a command and its output, a URL and what it showed. A control you
  could not verify is "not verified" and cannot raise a score. Claims in docs
  that the code does not back up count against the Documentation of the
  relevant aspect, not for it.
- **Mac state is out of reach.** You cannot inspect the owner's MacBook. Score
  what the repository enforces or ships (code, config, scripts, container
  definitions, documented and scripted setup). Advice alone earns little.
- **Integers 0–10**, using the anchors below. 9–10 needs positive evidence of
  excellence, not merely the absence of found defects.
- **Read-only and harmless.** Never modify project files, never commit, never
  deploy, never run scrapers, the pipeline or `claude`. Never send requests to
  third-party sites. Plain GET/HEAD requests to https://agentathens.com are
  allowed. Never attempt an exploit against a live system — describe it.
- **No secrets in output.** If you find a secret, report its file:line and type
  only, never its value.
- **Responsible disclosure.** Reports stay private until the defect is fixed.
  Write for the owner, not the public.

## Anchors (apply to every aspect)

| Score | Meaning |
|---|---|
| 0–2 | Exploitable now with little skill; no meaningful control. |
| 3–4 | Controls exist in places; realistic attack paths remain open. |
| 5–6 | Main paths covered; clear gaps a motivated attacker would find. |
| 7 | Solid. Remaining gaps need unusual access or chained conditions. |
| 8 | Strong. Defence in depth; hard to find a practical path; gaps are edge cases. |
| 9 | Excellent. Comparable to well-run security-conscious open-source projects, with evidence. |
| 10 | Exemplary; nothing material found after a thorough search. |

## Aspects

1. **Host isolation & least privilege** — what code that handles untrusted input
   (scrapers, headless Chrome, email parsing, `claude -p`) can reach on the Mac:
   filesystem, home directory, keychain/credentials, other projects, local
   network, processes. Sandboxing/containerisation, browser sandbox, user
   privileges, scheduled-job configuration.
2. **AI agent & prompt-injection safety** — how enrichment/agent sessions are
   constrained: tool allowlists, permission modes, hooks, write scopes, what an
   injected instruction in scraped text or an issue could make an agent do, and
   the blast radius if it succeeds.
3. **Untrusted input handling** — scrapers, email ingestion, URL/redirect
   validation, SSRF, path traversal, shell/command injection, SQL injection,
   parser robustness, resource exhaustion.
4. **Published-site output safety** — escaping of scraped content (HTML, JSON-LD,
   attributes, URLs), stored XSS, open redirects, security headers (CSP, HSTS,
   nosniff, frame-ancestors, referrer policy), serverless functions' input
   validation, third-party scripts.
5. **Secrets management** — no secrets in the repo or its history, ignore rules,
   where tokens live on the Mac and with what scope and file permissions,
   rotation guidance, secret scanning.
6. **CI/CD & GitHub repository security** — workflow permissions,
   `pull_request_target`/fork handling, action pinning, what an outside
   contributor's PR or issue can trigger, branch protection and required checks,
   CODEOWNERS, path-guard effectiveness.
7. **Supply chain & dependencies** — lockfile and frozen installs, install-time
   scripts, version pinning of runtimes/CLIs/images, unused or risky packages,
   known-vulnerable versions, automated update/audit.
8. **Deploy & publishing integrity** — what must be true before something
   reaches production, who/what holds deploy credentials and with what blast
   radius, provenance, rollback, whether a malicious commit or poisoned data can
   publish automatically.
9. **Data integrity & recovery** — protection of `data/events.db` and other
   state from corruption or tampering, backups, restore procedure, guards
   against destructive writes.
10. **Detection & incident response** — would the owner notice a compromise or
    tampering; alerting, audit trail, SECURITY.md, runbooks for a leaked token
    or a defaced site.
11. **Open-source contribution safety** — vulnerability disclosure policy,
    contributor guidance, what strangers can influence (PRs, issues, forks,
    automations that read issue/PR text), maintainer review safeguards.
12. **Security testing & verification** — automated tests and gates that guard
    security properties (escaping, allowlists, guards, headers), SAST / secret
    scanning / dependency audit in CI, and whether a regression would be caught.

## Output format (per judge)

A JSON file with, for each aspect: `aspect`, `score` (integer), `evidence`
(list of concrete observations with file:line / command / URL), `top_defects`
(up to 3, each `{ "defect", "attack_scenario", "fix", "effort": "S|M|L",
"severity": "critical|high|medium|low", "protected_path": bool }`), and
`what_would_make_it_8` (one or two sentences). Plus `critical_findings`
(anything exploitable now, most severe first) and `overall_notes`.
`protected_path` is true when the fix must edit a path listed in
`.github/path-guard.json`.
