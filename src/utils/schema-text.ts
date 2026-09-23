/**
 * Plain-text normalisation for strings emitted into JSON-LD.
 *
 * JSON-LD is not HTML: an entity such as `&amp;` or `&#171;` is shown
 * literally by every consumer. Pre-S154 rows store entity-encoded titles and
 * venue names, and pipeline markers (`<!-- timeliness-expires -->`) can ride
 * along in descriptions. Normalise at emission only — stored titles feed URL
 * slugs, which must not churn.
 */

import he from 'he';

export function schemaText(value: string): string {
  return he.decode(value.replace(/<!--[\s\S]*?-->\n?/g, ''));
}
