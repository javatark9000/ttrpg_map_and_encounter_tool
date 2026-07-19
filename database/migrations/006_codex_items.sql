USE dnd_manager;

CREATE TABLE IF NOT EXISTS item_types (
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

CREATE TABLE IF NOT EXISTS item_rarities (
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

CREATE TABLE IF NOT EXISTS items (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 system_id BIGINT UNSIGNED NOT NULL,
 item_type_id BIGINT UNSIGNED NULL,
 item_rarity_id BIGINT UNSIGNED NULL,
 visibility_level_id BIGINT UNSIGNED NOT NULL,
 source_item_id BIGINT UNSIGNED NULL,
 created_by_user_id BIGINT UNSIGNED NULL,
 name VARCHAR(160) NOT NULL,
 short_description VARCHAR(500) NULL,
 description MEDIUMTEXT NOT NULL,
 requires_attunement BOOLEAN NOT NULL DEFAULT FALSE,
 weight_text VARCHAR(255) NULL,
 value_text VARCHAR(255) NULL,
 armor_class_text VARCHAR(255) NULL,
 damage_text VARCHAR(255) NULL,
 properties_text TEXT NULL,
 charges_text VARCHAR(255) NULL,
 resource_cost_text VARCHAR(255) NULL,
 requirements_text TEXT NULL,
 is_magical BOOLEAN NOT NULL DEFAULT FALSE,
 is_consumable BOOLEAN NOT NULL DEFAULT FALSE,
 is_custom BOOLEAN NOT NULL DEFAULT FALSE,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_items_search (system_id, name),
 INDEX idx_items_type (item_type_id),
 INDEX idx_items_rarity (item_rarity_id),
 INDEX idx_items_visibility (visibility_level_id),
 FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE RESTRICT,
 FOREIGN KEY (item_type_id) REFERENCES item_types(id) ON DELETE SET NULL,
 FOREIGN KEY (item_rarity_id) REFERENCES item_rarities(id) ON DELETE SET NULL,
 FOREIGN KEY (visibility_level_id) REFERENCES visibility_levels(id) ON DELETE RESTRICT,
 FOREIGN KEY (source_item_id) REFERENCES items(id) ON DELETE SET NULL,
 FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO item_types (system_id, code, name)
SELECT s.id, x.code, x.name
FROM systems s
JOIN (
 SELECT 'weapon' code, 'Weapon' name UNION ALL
 SELECT 'armor', 'Armor' UNION ALL
 SELECT 'shield', 'Shield' UNION ALL
 SELECT 'potion', 'Potion' UNION ALL
 SELECT 'scroll', 'Scroll' UNION ALL
 SELECT 'wand', 'Wand' UNION ALL
 SELECT 'rod', 'Rod' UNION ALL
 SELECT 'staff', 'Staff' UNION ALL
 SELECT 'ring', 'Ring' UNION ALL
 SELECT 'wondrous_item', 'Wondrous Item' UNION ALL
 SELECT 'tool', 'Tool' UNION ALL
 SELECT 'adventuring_gear', 'Adventuring Gear' UNION ALL
 SELECT 'ammunition', 'Ammunition' UNION ALL
 SELECT 'treasure', 'Treasure' UNION ALL
 SELECT 'quest_item', 'Quest Item'
) x
WHERE s.code = 'dnd_5e'
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO item_rarities (system_id, code, name)
SELECT s.id, x.code, x.name
FROM systems s
JOIN (
 SELECT 'common' code, 'Common' name UNION ALL
 SELECT 'uncommon', 'Uncommon' UNION ALL
 SELECT 'rare', 'Rare' UNION ALL
 SELECT 'very_rare', 'Very Rare' UNION ALL
 SELECT 'legendary', 'Legendary' UNION ALL
 SELECT 'artifact', 'Artifact' UNION ALL
 SELECT 'unknown', 'Unknown'
) x
WHERE s.code = 'dnd_5e'
ON DUPLICATE KEY UPDATE name = VALUES(name);
