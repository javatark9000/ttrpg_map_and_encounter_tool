-- Existing rolls remain d20. Percentile results are 1..100, with 00 + 0 = 100.
ALTER TABLE scenario_dice_rolls
    ADD COLUMN IF NOT EXISTS sides TINYINT UNSIGNED NOT NULL DEFAULT 20 AFTER roller_id;
