/**
 * The one inline event handler templates may emit: hide a broken card image
 * and reveal the placeholder sibling. The published-output gate
 * (src/validators/published-artifacts.ts) accepts exactly this value on an
 * <img> and fails the build on every other on*= attribute, so card templates
 * must use this constant rather than a hand-written handler.
 */
export const IMG_FALLBACK_ONERROR = "this.style.display='none';this.nextElementSibling.style.display=''";

/** The attribute as emitted, ready to drop into an <img> tag. */
export const IMG_FALLBACK_ATTR = `onerror="${IMG_FALLBACK_ONERROR}"`;
