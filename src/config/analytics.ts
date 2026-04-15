/** GA4 Measurement ID — single source of truth for the gtag snippet.
 *  Set to empty string to emit no analytics tag (useful for local builds). */
export const GA_MEASUREMENT_ID = 'G-G7Y6RQ6RF9';

export function renderAnalytics(): string {
  if (!GA_MEASUREMENT_ID) return '';
  return `  <!-- Google Analytics (GA4) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${GA_MEASUREMENT_ID}');
  </script>`;
}
