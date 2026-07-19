USE dnd_manager;

CREATE TABLE IF NOT EXISTS creature_types (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 system_id BIGINT UNSIGNED NOT NULL,
 code VARCHAR(60) NOT NULL,
 name VARCHAR(100) NOT NULL,
 description TEXT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE(system_id, code),
 FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS creature_sizes (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 system_id BIGINT UNSIGNED NOT NULL,
 code VARCHAR(60) NOT NULL,
 name VARCHAR(100) NOT NULL,
 description TEXT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE(system_id, code),
 FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS creatures (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 system_id BIGINT UNSIGNED NOT NULL,
 creature_type_id BIGINT UNSIGNED NULL,
 creature_size_id BIGINT UNSIGNED NULL,
 visibility_level_id BIGINT UNSIGNED NOT NULL,
 source_creature_id BIGINT UNSIGNED NULL,
 created_by_user_id BIGINT UNSIGNED NULL,
 name VARCHAR(160) NOT NULL,
 short_description VARCHAR(500) NULL,
 description MEDIUMTEXT NOT NULL,
 armor_class_text VARCHAR(255) NULL,
 hit_points_text VARCHAR(255) NULL,
 speed_text VARCHAR(255) NULL,
 strength TINYINT UNSIGNED NULL,
 dexterity TINYINT UNSIGNED NULL,
 constitution TINYINT UNSIGNED NULL,
 intelligence TINYINT UNSIGNED NULL,
 wisdom TINYINT UNSIGNED NULL,
 charisma TINYINT UNSIGNED NULL,
 saving_throws_text VARCHAR(500) NULL,
 skills_text VARCHAR(500) NULL,
 damage_resistances_text VARCHAR(500) NULL,
 damage_immunities_text VARCHAR(500) NULL,
 damage_vulnerabilities_text VARCHAR(500) NULL,
 condition_immunities_text VARCHAR(500) NULL,
 senses_text VARCHAR(500) NULL,
 languages_text VARCHAR(500) NULL,
 challenge_rating_text VARCHAR(80) NULL,
 experience_points INT UNSIGNED NULL,
 traits_text MEDIUMTEXT NULL,
 equipment_text TEXT NULL,
 environment_text VARCHAR(500) NULL,
 is_custom BOOLEAN NOT NULL DEFAULT FALSE,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_creatures_search (system_id, name),
 INDEX idx_creatures_type (creature_type_id),
 INDEX idx_creatures_size (creature_size_id),
 INDEX idx_creatures_visibility (visibility_level_id),
 FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE RESTRICT,
 FOREIGN KEY (creature_type_id) REFERENCES creature_types(id) ON DELETE SET NULL,
 FOREIGN KEY (creature_size_id) REFERENCES creature_sizes(id) ON DELETE SET NULL,
 FOREIGN KEY (visibility_level_id) REFERENCES visibility_levels(id) ON DELETE RESTRICT,
 FOREIGN KEY (source_creature_id) REFERENCES creatures(id) ON DELETE SET NULL,
 FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO creature_types (system_id, code, name)
SELECT s.id, x.code, x.name
FROM systems s
JOIN (
 SELECT 'aberration' code, 'Aberration' name UNION ALL
 SELECT 'beast', 'Beast' UNION ALL
 SELECT 'celestial', 'Celestial' UNION ALL
 SELECT 'construct', 'Construct' UNION ALL
 SELECT 'dragon', 'Dragon' UNION ALL
 SELECT 'elemental', 'Elemental' UNION ALL
 SELECT 'fey', 'Fey' UNION ALL
 SELECT 'fiend', 'Fiend' UNION ALL
 SELECT 'giant', 'Giant' UNION ALL
 SELECT 'humanoid', 'Humanoid' UNION ALL
 SELECT 'monstrosity', 'Monstrosity' UNION ALL
 SELECT 'ooze', 'Ooze' UNION ALL
 SELECT 'plant', 'Plant' UNION ALL
 SELECT 'undead', 'Undead'
) x
WHERE s.code = 'dnd_5e'
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO creature_sizes (system_id, code, name)
SELECT s.id, x.code, x.name
FROM systems s
JOIN (
 SELECT 'tiny' code, 'Tiny' name UNION ALL
 SELECT 'small', 'Small' UNION ALL
 SELECT 'medium', 'Medium' UNION ALL
 SELECT 'large', 'Large' UNION ALL
 SELECT 'huge', 'Huge' UNION ALL
 SELECT 'gargantuan', 'Gargantuan'
) x
WHERE s.code = 'dnd_5e'
ON DUPLICATE KEY UPDATE name = VALUES(name);
