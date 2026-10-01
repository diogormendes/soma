/**
 * The phone's timezone, and the header that tells the server about it.
 *
 * ⛔ THE SERVER DECIDES "TODAY" FROM THE DEVICE'S ZONE, and until soma#1125 the app never told it. A
 * browser writes its zone into a cookie; the app has no cookie for this domain and sent only
 * `Authorization`, so every app request fell back to Athens wherever the phone was.
 *
 * A module of its own so `api.ts` can use it without importing `meal-capture`, which imports `api.ts`.
 */

/** The header the server reads before its cookie. Must match `TZ_HEADER` in web/lib/tz-cookie.ts. */
export const TZ_HEADER_NAME = "X-Soma-TZ";

/** The phone's IANA zone, or "" when the runtime cannot say, which the server treats as absent. */
export function deviceTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

/**
 * Put the zone on a shared headers object as a GETTER, so it is read afresh on every request.
 *
 * The app keeps one `AUTH_HEADERS` object and spreads it, or hands it straight to fetch, at dozens of
 * call sites. A getter means every one of them sends the phone's current zone, including after a flight,
 * with no change at any call site. Spread and `new Headers(...)` both read own enumerable properties,
 * so both trigger it.
 */
export function withDeviceTz<T extends Record<string, string>>(target: T, tz: () => string = deviceTz): T {
  Object.defineProperty(target, TZ_HEADER_NAME, { get: tz, enumerable: true, configurable: true });
  return target;
}
