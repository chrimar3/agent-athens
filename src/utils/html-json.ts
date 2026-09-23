import he from 'he';

/** Escape serialized JSON at the HTML boundary, without changing its data.
 * The HTML parser recognizes </script> even inside a JSON string. */
export function escapeJsonForHtml(json: string): string {
  return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

const ENTITY = /&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i;

/** Decode HTML entities inside JSON-LD string values (pre-S154 rows are
 * stored entity-encoded; AI answers quote JSON-LD verbatim). Works on parsed
 * values so a decoded quote stays valid JSON; JSON with no entity is returned
 * unchanged, byte for byte. */
// Some pre-S154 rows are double-encoded ("&amp;#8211;"). Attribute mode keeps
// semicolon-less legacy names in URLs ("&region=", "&copy=") literal.
function decodeToFixedPoint(value: string): string {
  let out = value;
  for (let i = 0; i < 3; i++) {
    const next = he.decode(out, { isAttributeValue: true });
    if (next === out) break;
    out = next;
  }
  return out;
}

export function decodeJsonLdEntities(json: string): string {
  if (!ENTITY.test(json)) return json;
  const decode = (v: unknown): unknown =>
    typeof v === 'string' ? decodeToFixedPoint(v)
      : Array.isArray(v) ? v.map(decode)
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]))
      : v;
  return JSON.stringify(decode(JSON.parse(json)));
}
