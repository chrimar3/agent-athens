import he from 'he';

/** Plain text for HTML text nodes and quoted attributes, including legacy entities. */
export function escapeHtml(text: string): string {
  return he.decode(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
