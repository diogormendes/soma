import { getDb } from "../lib/db";
import { runGarminIngest, syncDay, getStaleDates } from "../lib/garmin-ingest";
import { GarminAuth, DBTokenStore } from "garmin-auth";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) { console.error("[sync] DATABASE_URL not set"); process.exit(1); }

async function runBackfill() {
  const sql = getDb(databaseUrl);
  try {
    const auth = new GarminAuth({ store: new DBTokenStore(databaseUrl) });
    const client = await auth.client();
    const profile = (await client.connectapi("/userprofile-service/userprofile/user-settings")) as any;
    const display = profile?.userData?.displayName;

    console.log("Calculando dias perdidos (buscando 5 anos de histórico)...");
    const dates = await getStaleDates(sql, 365 * 5);
    
    console.log(`Encontrados ${dates.length} dias para sincronizar.`);
    for (const date of dates) {
      console.log(`Sincronizando ${date}...`);
      await syncDay(client, sql, display, date);
    }
    console.log("Backfill do Garmin concluído com sucesso!");
  } catch (e) {
    console.error("Falha no backfill:", e);
  } finally {
    await sql.end();
  }
}

runBackfill();
