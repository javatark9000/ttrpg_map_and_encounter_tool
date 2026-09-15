-- Apply with the application stopped. Restart any in-progress encounter afterwards:
-- old turn history cannot reconstruct a complete scheduling snapshot.
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS turn_cursor_id BIGINT UNSIGNED NULL AFTER current_participant_id;
ALTER TABLE encounter_participants ADD COLUMN IF NOT EXISTS last_turn_round INT UNSIGNED NOT NULL DEFAULT 0 AFTER tie_order;
ALTER TABLE turn_delays ADD COLUMN IF NOT EXISTS ready BOOLEAN NOT NULL DEFAULT FALSE AFTER triggered;
ALTER TABLE encounter_turn_history ADD COLUMN IF NOT EXISTS scheduling_snapshot JSON NULL AFTER previous_turn_sequence;
ALTER TABLE encounters ADD FOREIGN KEY IF NOT EXISTS fk_encounter_cursor (turn_cursor_id) REFERENCES encounter_participants(id) ON DELETE SET NULL;

UPDATE encounters SET turn_cursor_id=current_participant_id WHERE turn_cursor_id IS NULL;
UPDATE encounter_participants p JOIN encounters e ON e.current_participant_id=p.id
SET p.last_turn_round=e.round_no;
