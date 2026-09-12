-- soma#926: a plan the user dropped keeps its rows and its history; the timestamp says when.
ALTER TABLE training_plan ADD COLUMN IF NOT EXISTS dropped_at timestamptz;
