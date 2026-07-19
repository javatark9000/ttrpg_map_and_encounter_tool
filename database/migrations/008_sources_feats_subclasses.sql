USE dnd_manager;

CREATE TABLE IF NOT EXISTS sources (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 system_id BIGINT UNSIGNED NOT NULL,
 code VARCHAR(80) NOT NULL,
 name VARCHAR(180) NOT NULL,
 abbreviation VARCHAR(30) NULL,
 description TEXT NULL,
 is_official BOOLEAN NOT NULL DEFAULT TRUE,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE(system_id, code),
 FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE actions
 ADD COLUMN IF NOT EXISTS source_material_id BIGINT UNSIGNED NULL AFTER created_by_user_id,
 ADD COLUMN IF NOT EXISTS source_page_text VARCHAR(80) NULL AFTER source_material_id,
 ADD INDEX IF NOT EXISTS idx_actions_source_material (source_material_id),
 ADD CONSTRAINT fk_actions_source_material FOREIGN KEY (source_material_id) REFERENCES sources(id) ON DELETE SET NULL;

ALTER TABLE creatures
 ADD COLUMN IF NOT EXISTS source_material_id BIGINT UNSIGNED NULL AFTER created_by_user_id,
 ADD COLUMN IF NOT EXISTS source_page_text VARCHAR(80) NULL AFTER source_material_id,
 ADD INDEX IF NOT EXISTS idx_creatures_source_material (source_material_id),
 ADD CONSTRAINT fk_creatures_source_material FOREIGN KEY (source_material_id) REFERENCES sources(id) ON DELETE SET NULL;

ALTER TABLE items
 ADD COLUMN IF NOT EXISTS source_material_id BIGINT UNSIGNED NULL AFTER created_by_user_id,
 ADD COLUMN IF NOT EXISTS source_page_text VARCHAR(80) NULL AFTER source_material_id,
 ADD INDEX IF NOT EXISTS idx_items_source_material (source_material_id),
 ADD CONSTRAINT fk_items_source_material FOREIGN KEY (source_material_id) REFERENCES sources(id) ON DELETE SET NULL;

ALTER TABLE species
 ADD COLUMN IF NOT EXISTS source_material_id BIGINT UNSIGNED NULL AFTER created_by_user_id,
 ADD COLUMN IF NOT EXISTS source_page_text VARCHAR(80) NULL AFTER source_material_id,
 ADD INDEX IF NOT EXISTS idx_species_source_material (source_material_id),
 ADD CONSTRAINT fk_species_source_material FOREIGN KEY (source_material_id) REFERENCES sources(id) ON DELETE SET NULL;

ALTER TABLE classes
 ADD COLUMN IF NOT EXISTS source_material_id BIGINT UNSIGNED NULL AFTER created_by_user_id,
 ADD COLUMN IF NOT EXISTS source_page_text VARCHAR(80) NULL AFTER source_material_id,
 ADD INDEX IF NOT EXISTS idx_classes_source_material (source_material_id),
 ADD CONSTRAINT fk_classes_source_material FOREIGN KEY (source_material_id) REFERENCES sources(id) ON DELETE SET NULL;

ALTER TABLE backgrounds
 ADD COLUMN IF NOT EXISTS source_material_id BIGINT UNSIGNED NULL AFTER created_by_user_id,
 ADD COLUMN IF NOT EXISTS source_page_text VARCHAR(80) NULL AFTER source_material_id,
 ADD INDEX IF NOT EXISTS idx_backgrounds_source_material (source_material_id),
 ADD CONSTRAINT fk_backgrounds_source_material FOREIGN KEY (source_material_id) REFERENCES sources(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS feats (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 system_id BIGINT UNSIGNED NOT NULL,
 visibility_level_id BIGINT UNSIGNED NOT NULL,
 source_feat_id BIGINT UNSIGNED NULL,
 created_by_user_id BIGINT UNSIGNED NULL,
 source_material_id BIGINT UNSIGNED NULL,
 source_page_text VARCHAR(80) NULL,
 name VARCHAR(160) NOT NULL,
 short_description VARCHAR(500) NULL,
 description MEDIUMTEXT NOT NULL,
 prerequisites_text TEXT NULL,
 benefits_text MEDIUMTEXT NULL,
 repeatable BOOLEAN NOT NULL DEFAULT FALSE,
 is_custom BOOLEAN NOT NULL DEFAULT FALSE,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_feats_search (system_id, name),
 INDEX idx_feats_visibility (visibility_level_id),
 INDEX idx_feats_source_material (source_material_id),
 FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE RESTRICT,
 FOREIGN KEY (visibility_level_id) REFERENCES visibility_levels(id) ON DELETE RESTRICT,
 FOREIGN KEY (source_feat_id) REFERENCES feats(id) ON DELETE SET NULL,
 FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
 FOREIGN KEY (source_material_id) REFERENCES sources(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subclasses (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 system_id BIGINT UNSIGNED NOT NULL,
 class_id BIGINT UNSIGNED NOT NULL,
 visibility_level_id BIGINT UNSIGNED NOT NULL,
 source_subclass_id BIGINT UNSIGNED NULL,
 created_by_user_id BIGINT UNSIGNED NULL,
 source_material_id BIGINT UNSIGNED NULL,
 source_page_text VARCHAR(80) NULL,
 name VARCHAR(160) NOT NULL,
 short_description VARCHAR(500) NULL,
 description MEDIUMTEXT NOT NULL,
 subclass_type_text VARCHAR(255) NULL,
 requirements_text TEXT NULL,
 is_custom BOOLEAN NOT NULL DEFAULT FALSE,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_subclasses_search (system_id, name),
 INDEX idx_subclasses_class (class_id),
 INDEX idx_subclasses_visibility (visibility_level_id),
 INDEX idx_subclasses_source_material (source_material_id),
 FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE RESTRICT,
 FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
 FOREIGN KEY (visibility_level_id) REFERENCES visibility_levels(id) ON DELETE RESTRICT,
 FOREIGN KEY (source_subclass_id) REFERENCES subclasses(id) ON DELETE SET NULL,
 FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
 FOREIGN KEY (source_material_id) REFERENCES sources(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO sources (system_id, code, name, abbreviation, is_official)
SELECT s.id, x.code, x.name, x.abbreviation, x.is_official
FROM systems s
JOIN (
 SELECT 'phb' code, 'Player''s Handbook' name, 'PHB' abbreviation, TRUE is_official UNION ALL
 SELECT 'dmg', 'Dungeon Master''s Guide', 'DMG', TRUE UNION ALL
 SELECT 'mm', 'Monster Manual', 'MM', TRUE UNION ALL
 SELECT 'xgte', 'Xanathar''s Guide to Everything', 'XGtE', TRUE UNION ALL
 SELECT 'tcoe', 'Tasha''s Cauldron of Everything', 'TCoE', TRUE UNION ALL
 SELECT 'motm', 'Mordenkainen Presents: Monsters of the Multiverse', 'MPMM', TRUE UNION ALL
 SELECT 'scag', 'Sword Coast Adventurer''s Guide', 'SCAG', TRUE UNION ALL
 SELECT 'vrgtr', 'Van Richten''s Guide to Ravenloft', 'VRGtR', TRUE UNION ALL
 SELECT 'ftod', 'Fizban''s Treasury of Dragons', 'FToD', TRUE UNION ALL
 SELECT 'homebrew', 'Homebrew', 'HB', FALSE
) x
WHERE s.code = 'dnd_5e'
ON DUPLICATE KEY UPDATE
 name = VALUES(name),
 abbreviation = VALUES(abbreviation),
 is_official = VALUES(is_official);
