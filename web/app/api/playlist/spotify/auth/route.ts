import { NextRequest, NextResponse } from "next/server";
import { SPOTIFY_SCOPES } from "@/lib/spotify-client";
import { getSetting } from "@/lib/settings";

async function sha256Base64url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function randomBase64url(n: number): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export async function GET(req: NextRequest) {
  const clientId = (await getSetting("SPOTIFY_CLIENT_ID")) || process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/settings?error=spotify_not_configured`);
  }

  const verifier = randomBase64url(64);
  const challenge = await sha256Base64url(verifier);
  const nonce = randomBase64url(16);
  const returnTo = req.nextUrl.searchParams.get("return_to") ?? "/connections";

  const state = btoa(JSON.stringify({ nonce, verifier, returnTo }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/playlist/spotify/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
  });

  return NextResponse.redirect(`https://accounts.spotify.com/authorize?${params}`);
}
