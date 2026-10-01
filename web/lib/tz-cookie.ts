/**
 * The cookie the browser writes its timezone into.
 *
 * ⛔ ITS OWN MODULE ON PURPOSE. The name is needed by a client component and by a server helper,
 * and `request-tz.ts` imports `next/headers`, which cannot be pulled into a client bundle. Sharing
 * a constant is not worth dragging the server's cookie machinery into the browser.
 */
export const TZ_COOKIE = "soma_tz";
/** A year. A device's zone rarely changes, and a stale one is corrected on the next mount. */
export const TZ_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * The header the native app sends its timezone in (soma#1125). The app has no cookie jar for this
 * domain, only an `Authorization` header, so without this every app request fell back to Athens.
 * Lower-case because that is how Headers.get matches it; the app sends `X-Soma-TZ`.
 */
export const TZ_HEADER = "x-soma-tz";
