import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { computeDrinkEntry, DRINK_DATABASE } from "macro-engine-core";

// nodejs (not edge): imports the CJS macro-engine-core package for the alcohol
// helpers, matching the other nutrition routes.
export const runtime = "nodejs";

// The drink table and the maths per drink (ethanol density, the fat-oxidation pause) come from
// macro-engine-core (drink-db, alcohol), so soma and the package cannot drift apart.

export async function GET() {
  return NextResponse.json({ drinks: DRINK_DATABASE });
}

export async function POST(req: NextRequest) {
  const sql = getDb();
  const { date, drink_type, quantity = 1 } = (await req.json()) as {
    date: string;
    drink_type: string;
    quantity?: number;
  };

  if (!date || !drink_type) {
    return NextResponse.json(
      { error: "date and drink_type are required" },
      { status: 400 }
    );
  }

  const drink = DRINK_DATABASE[drink_type];
  if (!drink) {
    return NextResponse.json(
      { error: `Unknown drink_type: ${drink_type}` },
      { status: 400 }
    );
  }

  const totalMl = drink.default_ml * quantity;
  const entry = computeDrinkEntry(drink_type, quantity)!;
  // Whole calories, as the log has always stored them. Carbs, alcohol and the pause keep the
  // package's one decimal.
  const calories = Math.round(entry.calories);
  const carbs = entry.carbs;
  const alcoholGrams = entry.alcohol_grams;
  const pauseHours = entry.fat_oxidation_pause_hours;

  // Ensure nutrition_day row exists for this date
  await sql`
    INSERT INTO nutrition_day (date)
    VALUES (${date})
    ON CONFLICT (date) DO NOTHING
  `;

  const result = await sql`
    INSERT INTO drink_log (date, drink_type, name, quantity, quantity_ml, calories, carbs, alcohol_grams, fat_oxidation_pause_hours)
    VALUES (
      ${date},
      ${drink_type},
      ${drink.name},
      ${quantity},
      ${totalMl},
      ${calories},
      ${carbs},
      ${alcoholGrams},
      ${pauseHours}
    )
    RETURNING id
  `;

  return NextResponse.json({
    id: result[0].id,
    calories,
    alcohol_grams: alcoholGrams,
    fat_oxidation_pause_hours: pauseHours,
  });
}

export async function DELETE(req: NextRequest) {
  const sql = getDb();
  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await sql`DELETE FROM drink_log WHERE id = ${Number(id)}`;

  return NextResponse.json({ deleted: true });
}
