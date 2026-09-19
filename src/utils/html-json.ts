/** Escape serialized JSON at the HTML boundary, without changing its data.
 * The HTML parser recognizes </script> even inside a JSON string. */
export function escapeJsonForHtml(json: string): string {
  return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
