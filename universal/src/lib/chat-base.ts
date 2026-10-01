/**
 * Where the app reaches the chat (soma#1136).
 *
 * The chat runs on the Mac and is reached over the tailnet mount (soma#670); Vercel answers 410 for
 * /api/chat*. The website reads NEXT_PUBLIC_SOMA_CHAT_BASE for this, and the app reads the same
 * address from EXPO_PUBLIC_SOMA_CHAT_BASE. Unset (a dev build against a local server) means the chat
 * lives on the API host itself.
 */
export function chatBaseFrom(configured: string | undefined, apiBase: string): string {
  const base = (configured ?? "").trim().replace(/\/+$/, "");
  return base || apiBase.replace(/\/+$/, "");
}

/** The badge the chat sheet shows for where it is talking to. */
export function chatTransportFor(configured: string | undefined, apiBase: string): "local" | "tailnet" | "proxy" {
  const base = chatBaseFrom(configured, apiBase);
  if (/\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:|\/|$)/.test(base)) return "local";
  return (configured ?? "").trim() ? "tailnet" : "proxy";
}
