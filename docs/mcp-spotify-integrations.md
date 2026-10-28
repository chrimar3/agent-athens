# What the Spotify integrations in Claude and ChatGPT expose to the model

*Checked 2026-10-27 for spec 002 (M2.3). Re-check before relying on it: these
integrations change.*

**Bottom line:** no primary source says either assistant lets the model read a
user's top artists, recently played tracks, followed artists or saved library.
So the Agent Athens MCP server cannot count on a "favourite artists" list
arriving from a Spotify connection. `match_artists` works with whatever the
assistant passes:

- names the user mentions in the conversation; or
- artists the assistant already knows about the user.

When the assistant does have an artist's Spotify ID, for example from a
search, it can send `{ name, spotify_id }`. The ID then matches exactly through
Wikidata, and the name is the fallback.

## Claude

- **A first-party Spotify connector exists.** It was added in April 2026. Its
  listing names the tools `create_playlist`, `get_currently_playing`, `search`,
  `add_to_library`, `fetch_tracks` and `Remove_from_library`. Nothing on the
  page mentions listening history, top artists or followed artists.
  <https://claude.com/connectors/spotify> (fetched again and read on 2026-10-27).
- Spotify's announcement says Claude can make recommendations "based on their
  taste and listening history". It does not say the history is handed to the
  model, and no listed tool reads it.
  <https://newsroom.spotify.com/2026-04-23/claude-integration/> (2026-04-23).
- Custom remote MCP connectors, which is how Agent Athens would be added, are
  available on Claude's plans; the Free plan allows one.
  <https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities>
  (undated).

## ChatGPT

- **A first-party Spotify app exists.** It is opt-in and available to Free,
  Plus and Pro accounts in 145 countries, and later in the EU, UK and
  Switzerland. Spotify's page does not say which listening data the model can
  read.
  <https://newsroom.spotify.com/2025-10-06/spotify-personalized-prompts-chatgpt/>
  (2025-10-06, updated with later expansions).
- **Secondary source only:** TechCrunch, quoting launch material, says
  connecting gives access to "your likes and listening history". I found no
  OpenAI or Spotify page that confirms this.
  <https://techcrunch.com/2025/10/10/you-can-now-connect-your-spotify-account-to-chatgpt-heres-how-to-do-it/>
  (2025-10-10).
- **Not verified:** OpenAI's own help pages (help.openai.com, openai.com and
  chatgpt.com) returned HTTP 403 to automated fetching, so OpenAI's own
  description of the app's data access was not read.

## What real listening data would take

Spotify's Web API has the scopes `user-top-read`, `user-read-recently-played`,
`user-follow-read` and `user-library-read`
(<https://developer.spotify.com/documentation/web-api/concepts/scopes>). Using
them means OAuth with the user's Spotify account. Spec 002 rules that out for
this server (§5), because it stores nothing about users.
