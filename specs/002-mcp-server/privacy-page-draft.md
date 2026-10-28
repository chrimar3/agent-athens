# DRAFT: privacy page for the Agent Athens MCP server

*Status: draft for the owner (spec 002, M4.2). **Not published.** Adding a page
to agentathens.com is a site-wide change and the owner's decision. Before
publishing, check each statement against the deployed Worker's settings,
especially the Cloudflare logging line, which depends on the dashboard.
Proposed URL: `https://agentathens.com/privacy/mcp/` (or a section of an
existing privacy page).*

---

## Agent Athens in AI assistants: privacy

Agent Athens offers a connector for AI assistants such as Claude and ChatGPT,
at `https://mcp.agentathens.com/mcp`. When you ask your assistant about events
in Athens, it can look them up through this connector. This page explains what
happens to your information when it does.

### What the connector receives

When your assistant uses the connector, it sends a search, for example
"concerts this weekend", the name of a venue or neighbourhood, or a list of
artists you like. Your assistant decides what to send, based on your
conversation with it.

The connector does **not** receive your conversation, your name, your account
or your contacts. It also does not receive your listening history or other
data from music apps, unless your assistant puts an artist's name or ID into
the search itself.

### What we do with it

The connector uses your search to pick matching events from Agent Athens'
public event list, sends the results back to your assistant, and then forgets
the search. Specifically:

- **We store nothing about you.** The connector has no database, no user
  accounts, no profiles, no cookies and no saved history.
- **We do not log your searches.** The connector's code writes no logs.
- **We do not track you.** Links to Agent Athens and to ticket sellers carry no
  tracking parameters.

The connector runs on Cloudflare. Like any website host, Cloudflare processes
the technical details of each request, such as IP address and time, to deliver
it and protect it from abuse. *[Owner: describe here the Cloudflare logging
and analytics settings actually enabled for the Worker, with a link to
Cloudflare's privacy policy. If Workers Logs or Logpush are turned on, say
what they keep and for how long.]*

### Event cards and images

In assistants that show results as cards, the cards are displayed inside your
assistant. Event images load only from agentathens.com. Images that are hosted
elsewhere are replaced by a placeholder, so other websites do not learn that
you looked at an event. A link opens only when you press its button.

### Your assistant's own privacy policy

Your conversation and what your assistant remembers about you are handled by
the company that makes the assistant, under its own privacy policy. Agent
Athens does not see them.

### Where the event information comes from

The event listings come from Agent Athens' public event feed
(`https://agentathens.com/api/events.json`), licensed CC BY 4.0. They contain
no information about you.

### Contact

Questions about this page: *[Owner: support contact]*.

*Last updated: [date of publication]*

---

## Η ιδιωτικότητά σας (Greek summary for the same page)

Ο σύνδεσμος (connector) του Agent Athens για ψηφιακούς βοηθούς όπως το Claude
και το ChatGPT λαμβάνει μόνο την αναζήτηση που στέλνει ο βοηθός σας, για
παράδειγμα «συναυλίες αυτό το Σαββατοκύριακο» ή ονόματα καλλιτεχνών. Τη
χρησιμοποιεί για να βρει εκδηλώσεις στη δημόσια λίστα του Agent Athens και
μετά την ξεχνά. Δεν αποθηκεύουμε τίποτα για εσάς: δεν έχουμε βάση δεδομένων,
λογαριασμούς ή cookies, και δεν καταγράφουμε τις αναζητήσεις σας. Οι
σύνδεσμοι δεν έχουν παραμέτρους παρακολούθησης. Οι εικόνες φορτώνονται μόνο
από το agentathens.com. Η συνομιλία σας με τον βοηθό διέπεται από την πολιτική
απορρήτου της εταιρείας του βοηθού.
