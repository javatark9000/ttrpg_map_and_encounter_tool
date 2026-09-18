CREATE TABLE IF NOT EXISTS scenario_dice_rolls (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    scenario_id BIGINT UNSIGNED NOT NULL,
    roller_id BIGINT UNSIGNED NOT NULL,
    result TINYINT UNSIGNED NOT NULL,
    in_combat BOOLEAN NOT NULL DEFAULT FALSE,
    round_no INT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revealed_at TIMESTAMP NULL,
    FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
    FOREIGN KEY (roller_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX(scenario_id,id),
    INDEX(scenario_id,revealed_at)
) ENGINE=InnoDB;
