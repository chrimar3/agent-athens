/**
 * Shared test helpers for @graph envelope assertions (S139).
 *
 * Use these instead of mirroring @graph structure in fixtures (S101a-B
 * lesson — fixtures that re-encode the JSON-LD shape re-encode bugs).
 * Tests should assert on member presence + @id + ordering, never on
 * the surrounding envelope literal.
 */

export interface GraphEnvelope {
  '@context'?: string;
  '@graph': Record<string, any>[];
}

/**
 * Extract the single JSON-LD `<script>` block from an HTML page and parse it.
 * Asserts that exactly one such block exists — pages emitting more than one
 * (or zero) fail this helper with a descriptive message. Use this when a page
 * is expected to have a single @graph envelope (per S138 + S139 design).
 */
export function extractSingleJsonLdBlock(html: string): any {
  const matches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
  if (!matches || matches.length === 0) {
    throw new Error('No JSON-LD <script> block found in HTML');
  }
  if (matches.length > 1) {
    throw new Error(`Expected 1 JSON-LD <script> block, found ${matches.length}`);
  }
  const inner = matches[0].replace(/^<script type="application\/ld\+json">/, '').replace(/<\/script>$/, '').trim();
  return JSON.parse(inner);
}

/**
 * Return the `@graph` array from an envelope, asserting it is present.
 */
export function getGraph(envelope: any): Record<string, any>[] {
  if (!envelope || !Array.isArray(envelope['@graph'])) {
    throw new Error('Envelope does not have an @graph array');
  }
  return envelope['@graph'];
}

/**
 * Find the first entity in the @graph matching the given field/value pair.
 * Returns undefined if not found (caller asserts presence explicitly).
 */
export function findEntity(
  envelope: any,
  by: string,
  value: string,
): Record<string, any> | undefined {
  return getGraph(envelope).find(member => member[by] === value);
}

/**
 * Convenience for the common case of looking up by @type.
 */
export function findEntityByType(envelope: any, type: string): Record<string, any> | undefined {
  return findEntity(envelope, '@type', type);
}
