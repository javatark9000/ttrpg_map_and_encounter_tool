USE dnd_manager;

CREATE TABLE IF NOT EXISTS feat_types (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 code VARCHAR(60) NOT NULL UNIQUE,
 name VARCHAR(100) NOT NULL,
 description TEXT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

ALTER TABLE feats
 ADD COLUMN IF NOT EXISTS feat_type_id BIGINT UNSIGNED NULL AFTER visibility_level_id,
 ADD INDEX IF NOT EXISTS idx_feats_type (feat_type_id),
 ADD CONSTRAINT fk_feats_type FOREIGN KEY (feat_type_id) REFERENCES feat_types(id) ON DELETE SET NULL;

INSERT INTO feat_types (code, name, description) VALUES
 ('regular', 'Regular Feat', 'General feat from the main feat list.'),
 ('racial', 'Racial Feat', 'Feat tied to a race, species, lineage, or ancestry requirement.')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);
