import { getDb } from "./db";

export async function getSetting(key: string): Promise<string | null> {
  const sql = getDb();
  try {
    const res = await sql`SELECT value FROM app_settings WHERE key = ${key}`;
    if (res.length > 0 && res[0].value) {
      // jsonb strips quotes for strings if we just read it, but pg driver returns strings as strings.
      return String(res[0].value);
    }
  } catch (e) {
    // Table might not exist yet if not migrated
  }
  return null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${key}, to_jsonb(${value}::text), NOW())
    ON CONFLICT (key) DO UPDATE SET
      value = to_jsonb(${value}::text),
      updated_at = NOW()
  `;
}
