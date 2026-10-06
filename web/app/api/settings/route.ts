import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings";

export async function GET() {
  try {
    const sql = getDb();
    // Ensure table exists (auto-migration for self-hosters)
    await sql`
      CREATE TABLE IF NOT EXISTS public.app_settings (
        key character varying(50) PRIMARY KEY,
        value jsonb NOT NULL,
        updated_at timestamp with time zone DEFAULT now()
      )
    `;

    const stravaId = await getSetting("STRAVA_CLIENT_ID");
    const stravaSecret = await getSetting("STRAVA_CLIENT_SECRET");
    const spotifyId = await getSetting("SPOTIFY_CLIENT_ID");
    const spotifySecret = await getSetting("SPOTIFY_CLIENT_SECRET");

    return NextResponse.json({
      stravaId: stravaId || process.env.STRAVA_CLIENT_ID || "",
      stravaSecret: stravaSecret ? "********" : (process.env.STRAVA_CLIENT_SECRET ? "********" : ""),
      spotifyId: spotifyId || process.env.SPOTIFY_CLIENT_ID || "",
      spotifySecret: spotifySecret ? "********" : (process.env.SPOTIFY_CLIENT_SECRET ? "********" : ""),
    });
  } catch (e) {
    console.error("DB error in settings API:", e);
    return NextResponse.json({
      stravaId: "", stravaSecret: "", spotifyId: "", spotifySecret: "",
      error: "No database connection"
    });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.stravaId !== undefined) await setSetting("STRAVA_CLIENT_ID", body.stravaId);
    if (body.stravaSecret && body.stravaSecret !== "********") await setSetting("STRAVA_CLIENT_SECRET", body.stravaSecret);
    if (body.spotifyId !== undefined) await setSetting("SPOTIFY_CLIENT_ID", body.spotifyId);
    if (body.spotifySecret && body.spotifySecret !== "********") await setSetting("SPOTIFY_CLIENT_SECRET", body.spotifySecret);
    
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Failed to save to database" }, { status: 500 });
  }
}
