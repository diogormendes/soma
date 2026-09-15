/**
 * Request-time date arithmetic for the server pages, kept out of component bodies: the
 * react-hooks purity rule reads Date.now() during render as an impure call (soma#958), and a
 * page's cutoff is a value of the request, not of the render.
 */
export function cutoffIso(days: number, now: number = Date.now()): string {
  return new Date(now - days * 86400000).toISOString().split("T")[0];
}

/** Whole days from now until an ISO date's local midnight; negative when it has passed. */
export function daysUntil(isoDate: string, now: number = Date.now()): number {
  return Math.ceil((new Date(isoDate + "T00:00:00").getTime() - now) / 86400000);
}
