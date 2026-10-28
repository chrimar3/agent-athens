# DRAFT ISSUE: advertise the MCP endpoint in `llms.txt` and on the homepage

*Spec 002, M4.3. This is a draft and has not been applied. Both changes are
site-wide: one edit to the `llms.txt` generator or the homepage template ships
to every visitor and crawler. The owner decides.*

## Precondition

**Do this only after `https://mcp.agentathens.com/mcp` is deployed and
answers.** Advertising an endpoint that returns errors is worse than not
advertising it. Check it with:

```bash
npx @modelcontextprotocol/inspector@2.10.1 --cli https://mcp.agentathens.com/mcp --transport http --method tools/list
```

It is also better to wait until the feed is fresh again. Today
`/api/events.json` was last written on 2026-10-06 (see REPORT.md, M1.2).

## 1. `llms.txt`

`llms.txt` is written by `src/generate-site.ts`, around the
`writeFileIfChangedSync(join(DIST_DIR, 'llms.txt'), content)` call (about line
1738). Add a short section near the top, after the summary block:

```markdown
## For AI assistants

- [MCP server](https://mcp.agentathens.com/mcp): read-only Model Context Protocol server over Streamable HTTP, no auth. Tools: search_events, get_event, list_venues, match_artists. Same data as the [event feed](https://agentathens.com/api/events.json) (CC BY 4.0).
```

A generator test should pin it, so that removing the line fails CI.

## 2. Homepage

Add one line to the homepage footer, or to an "About" or "For developers"
area, in both languages:

- EN: "Use Agent Athens in Claude, ChatGPT or Gemini: add the connector
  `https://mcp.agentathens.com/mcp`."
- EL: «Χρησιμοποιήστε το Agent Athens στο Claude, στο ChatGPT ή στο Gemini:
  προσθέστε τον σύνδεσμο `https://mcp.agentathens.com/mcp`.»

Link it to a short how-to page, or to the directory listings once they exist.
Keep it out of the hero, since it is for a minority of visitors.

## Things to decide

- Whether the homepage line waits for the directory listings, which would
  allow one-click installs rather than a URL to paste.
- Whether `mcp.agentathens.com` also gets a human-readable page at `/`. Today
  `GET /` returns JSON describing the server.
