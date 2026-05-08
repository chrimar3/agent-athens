// Locale-aware URL builder for cornerstone hub paths.
// Date created: 2026-05-08 (S101a-1)
//
// English is the default locale and renders prefix-less (matches the
// English-first launch posture). Non-default locales (e.g. 'el' for Greek)
// render with a locale prefix segment, forward-compatible with bilingual
// rollout. Output always carries a trailing slash to match the rest of the
// site's URL convention.

/**
 * Build a locale-aware site URL for a hub or page slug.
 *
 * @param path   Slug without leading or trailing slashes (e.g., 'this-weekend').
 *               Leading/trailing slashes are tolerated and stripped — callers
 *               are not expected to pass them, but defensive normalization
 *               avoids silent double-slash bugs.
 * @param locale BCP-47 short code. Default 'en' renders prefix-less.
 *               Any other value renders with a `/${locale}/` prefix.
 * @returns      Site path with trailing slash. Empty path returns the
 *               locale's root (`/` for 'en', `/${locale}/` otherwise).
 *
 * @example
 *   localeUrl('this-weekend')       // → '/this-weekend/'
 *   localeUrl('this-weekend', 'el') // → '/el/this-weekend/'
 *   localeUrl('')                    // → '/'
 *   localeUrl('', 'el')              // → '/el/'
 */
export function localeUrl(path: string, locale: string = "en"): string {
  const normalized = path.replace(/^\/+|\/+$/g, "");

  if (locale === "en") {
    return normalized === "" ? "/" : `/${normalized}/`;
  }

  return normalized === "" ? `/${locale}/` : `/${locale}/${normalized}/`;
}
