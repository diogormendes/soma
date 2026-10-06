import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";

export async function GET() {
  const clientId = (await getSetting("STRAVA_CLIENT_ID")) || process.env.STRAVA_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/settings?error=strava_not_configured`);
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/strava/callback`;
  const scope = "activity:read_all,activity:write,profile:read_all";

  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("approval_prompt", "auto");

  return NextResponse.redirect(url.toString());
}
