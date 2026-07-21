USE dnd_manager;

ALTER TABLE creatures
 ADD COLUMN IF NOT EXISTS custom_identifier VARCHAR(120) NULL AFTER source_page_text,
 ADD COLUMN IF NOT EXISTS custom_tag VARCHAR(80) NULL AFTER custom_identifier,
 ADD INDEX IF NOT EXISTS idx_creatures_custom_identifier (custom_identifier),
 ADD INDEX IF NOT EXISTS idx_creatures_custom_tag (custom_tag);

ALTER TABLE items
 ADD COLUMN IF NOT EXISTS custom_identifier VARCHAR(120) NULL AFTER source_page_text,
 ADD COLUMN IF NOT EXISTS custom_tag VARCHAR(80) NULL AFTER custom_identifier,
 ADD INDEX IF NOT EXISTS idx_items_custom_identifier (custom_identifier),
 ADD INDEX IF NOT EXISTS idx_items_custom_tag (custom_tag);

CREATE TABLE IF NOT EXISTS codex_record_tags (
 owner_type VARCHAR(60) NOT NULL,
 owner_id BIGINT UNSIGNED NOT NULL,
 tag_id BIGINT UNSIGNED NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(owner_type, owner_id, tag_id),
 INDEX idx_codex_record_tags_tag (tag_id),
 INDEX idx_codex_record_tags_owner (owner_type, owner_id),
 FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO tags (system_id, code, name)
SELECT system_id, CONCAT('creature_type_', code), name FROM creature_types
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO tags (system_id, code, name)
SELECT system_id, CONCAT('creature_size_', code), name FROM creature_sizes
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO tags (system_id, code, name)
SELECT system_id, CONCAT('item_type_', code), name FROM item_types
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO tags (system_id, code, name)
SELECT system_id, CONCAT('item_rarity_', code), name FROM item_rarities
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT IGNORE INTO codex_record_tags (owner_type, owner_id, tag_id)
SELECT 'creature', c.id, t.id
FROM creatures c
JOIN creature_types ct ON ct.id = c.creature_type_id
JOIN tags t ON t.system_id = c.system_id AND t.code = CONCAT('creature_type_', ct.code);

INSERT IGNORE INTO codex_record_tags (owner_type, owner_id, tag_id)
SELECT 'creature', c.id, t.id
FROM creatures c
JOIN creature_sizes cs ON cs.id = c.creature_size_id
JOIN tags t ON t.system_id = c.system_id AND t.code = CONCAT('creature_size_', cs.code);

INSERT IGNORE INTO codex_record_tags (owner_type, owner_id, tag_id)
SELECT 'item', i.id, t.id
FROM items i
JOIN item_types it ON it.id = i.item_type_id
JOIN tags t ON t.system_id = i.system_id AND t.code = CONCAT('item_type_', it.code);

INSERT IGNORE INTO codex_record_tags (owner_type, owner_id, tag_id)
SELECT 'item', i.id, t.id
FROM items i
JOIN item_rarities ir ON ir.id = i.item_rarity_id
JOIN tags t ON t.system_id = i.system_id AND t.code = CONCAT('item_rarity_', ir.code);
