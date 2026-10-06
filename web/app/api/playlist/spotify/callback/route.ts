import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/settings";

export const runtime = "nodejs";

function decodeState(raw: string): { nonce: string; verifier: string; returnTo: string } | null {
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const code = sp.get("code");
  const stateParam = sp.get("state");
  const error = sp.get("error");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3456";

  if (error || !code || !stateParam) {
    return NextResponse.redirect(`${baseUrl}/connections?error=spotify_denied`);
  }

  const clientId = (await getSetting("SPOTIFY_CLIENT_ID")) || process.env.SPOTIFY_CLIENT_ID;

  if (!clientId) {
    return NextResponse.redirect(`${baseUrl}/settings?error=spotify_not_configured`);
  }

  const stateData = decodeState(stateParam);
  if (!stateData?.verifier) {
    return NextResponse.redirect(`${baseUrl}/connections?error=spotify_invalid`);
  }

  const { verifier, returnTo } = stateData;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || `${baseUrl}/api/playlist/spotify/callback`;

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error("Spotify token exchange failed:", err);
    return NextResponse.redirect(`${baseUrl}/connections?error=spotify_token`);
  }

  const tokens = await tokenRes.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const profileRes = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = profileRes.ok ? await profileRes.json() : null;

  const sql = getDb();
  await sql`
    INSERT INTO platform_credentials (platform, auth_type, credentials, connected_at, expires_at, status)
    VALUES (
      'spotify',
      'oauth2',
      ${JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        display_name: profile?.display_name ?? null,
        spotify_user_id: profile?.id ?? null,
      })}::jsonb,
      NOW(),
      ${expiresAt},
      'active'
    )
    ON CONFLICT (platform) DO UPDATE SET
      credentials = EXCLUDED.credentials,
      expires_at = EXCLUDED.expires_at,
      connected_at = NOW(),
      status = 'active'
  `;

  return NextResponse.redirect(`${baseUrl}${returnTo}?connected=spotify`);
}
