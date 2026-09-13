/**
 * What a logged meal's `items` JSON holds. The column is free-form (the composer writes what it
 * knows), so every field is optional and the index signature keeps the rest; these are the ones
 * the web reads (soma#958).
 */
export interface MealItem {
  ingredient_id?: string;
  name?: string;
  grams?: number;
  cooked_grams?: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  [key: string]: unknown;
}

/** A preset's `items` column: either a bare list or a list plus its precomputed totals. */
export type PresetItems =
  | MealItem[]
  | {
      items?: MealItem[];
      calories?: number;
      protein?: number;
      carbs?: number;
      fat?: number;
      fiber?: number;
      [key: string]: unknown;
    };
