SET @multiple_focus_migration = IF(
    EXISTS(
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'scenario_map_focus'
          AND COLUMN_NAME = 'id'
    ),
    'SELECT 1',
    'ALTER TABLE scenario_map_focus DROP PRIMARY KEY, ADD COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST, ADD INDEX idx_scenario_map_focus_scenario (scenario_id)'
);
PREPARE multiple_focus_statement FROM @multiple_focus_migration;
EXECUTE multiple_focus_statement;
DEALLOCATE PREPARE multiple_focus_statement;
