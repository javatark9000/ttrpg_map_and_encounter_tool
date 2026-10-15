ALTER TABLE player_characters
    ADD COLUMN IF NOT EXISTS current_health INT NULL AFTER max_health;

UPDATE player_characters pc
SET pc.current_health = COALESCE(
    (
        SELECT sp.health
        FROM scenario_players sp
        WHERE sp.character_id = pc.id
        ORDER BY sp.placed DESC, sp.updated_at DESC, sp.id DESC
        LIMIT 1
    ),
    pc.max_health
)
WHERE pc.current_health IS NULL;

ALTER TABLE player_characters
    MODIFY COLUMN current_health INT NOT NULL DEFAULT 10 AFTER max_health;
