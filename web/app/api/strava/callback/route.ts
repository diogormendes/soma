import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3456";

  if (error || !code) {
    return NextResponse.redirect(`${baseUrl}/connections?error=strava_denied`);
  }

  const clientId = (await getSetting("STRAVA_CLIENT_ID")) || process.env.STRAVA_CLIENT_ID;
  const clientSecret = (await getSetting("STRAVA_CLIENT_SECRET")) || process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${baseUrl}/settings?error=strava_not_configured`);
  }

  const tokenRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    console.error("Strava auth failed:", await tokenRes.text());
    return NextResponse.redirect(`${baseUrl}/connections?error=strava_token`);
  }

  const tokens = await tokenRes.json();
  const expiresAt = new Date(tokens.expires_at * 1000).toISOString();

  const sql = getDb();
  await sql`
    INSERT INTO platform_credentials (platform, auth_type, credentials, connected_at, expires_at, status)
    VALUES (
      'strava',
      'oauth2',
      ${JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        athlete_id: tokens.athlete.id,
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

  return NextResponse.redirect(`${baseUrl}/connections?connected=strava`);
}
