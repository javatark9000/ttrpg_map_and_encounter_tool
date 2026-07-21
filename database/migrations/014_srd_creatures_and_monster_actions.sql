USE dnd_manager;

-- Extra SRD fields needed to preserve the structured 2014/2024 monster data.
-- Existing text columns remain the main app-facing fields; these columns keep source fidelity.

ALTER TABLE creatures
 ADD COLUMN IF NOT EXISTS rules_revision VARCHAR(20) NULL AFTER source_page_text,
 ADD COLUMN IF NOT EXISTS srd_index VARCHAR(120) NULL AFTER rules_revision,
 ADD COLUMN IF NOT EXISTS srd_url VARCHAR(255) NULL AFTER srd_index,
 ADD COLUMN IF NOT EXISTS subtype_text VARCHAR(120) NULL AFTER description,
 ADD COLUMN IF NOT EXISTS alignment_text VARCHAR(120) NULL AFTER subtype_text,
 ADD COLUMN IF NOT EXISTS hit_dice_text VARCHAR(120) NULL AFTER hit_points_text,
 ADD COLUMN IF NOT EXISTS hit_points_roll_text VARCHAR(120) NULL AFTER hit_dice_text,
 ADD COLUMN IF NOT EXISTS proficiency_bonus TINYINT UNSIGNED NULL AFTER charisma,
 ADD COLUMN IF NOT EXISTS armor_class_json LONGTEXT NULL AFTER armor_class_text,
 ADD COLUMN IF NOT EXISTS speed_json LONGTEXT NULL AFTER speed_text,
 ADD COLUMN IF NOT EXISTS senses_json LONGTEXT NULL AFTER senses_text,
 ADD COLUMN IF NOT EXISTS image_url VARCHAR(255) NULL AFTER environment_text,
 ADD COLUMN IF NOT EXISTS experience_points_in_lair INT UNSIGNED NULL AFTER experience_points,
 ADD COLUMN IF NOT EXISTS raw_data_json LONGTEXT NULL AFTER image_url,
 ADD UNIQUE KEY IF NOT EXISTS uq_creatures_srd_revision_index (system_id, rules_revision, srd_index),
 ADD INDEX IF NOT EXISTS idx_creatures_rules_revision (rules_revision);

ALTER TABLE actions
 ADD COLUMN IF NOT EXISTS rules_revision VARCHAR(20) NULL AFTER source_page_text,
 ADD COLUMN IF NOT EXISTS srd_index VARCHAR(160) NULL AFTER rules_revision,
 ADD COLUMN IF NOT EXISTS srd_url VARCHAR(255) NULL AFTER srd_index,
 ADD COLUMN IF NOT EXISTS attack_bonus SMALLINT NULL AFTER damage_text,
 ADD COLUMN IF NOT EXISTS difficulty_class_text VARCHAR(255) NULL AFTER attack_bonus,
 ADD COLUMN IF NOT EXISTS usage_text VARCHAR(255) NULL AFTER resource_cost_text,
 ADD COLUMN IF NOT EXISTS legendary_cost TINYINT UNSIGNED NULL AFTER usage_text,
 ADD COLUMN IF NOT EXISTS action_order SMALLINT UNSIGNED NULL AFTER legendary_cost,
 ADD COLUMN IF NOT EXISTS raw_data_json LONGTEXT NULL AFTER action_order,
 ADD INDEX IF NOT EXISTS idx_actions_srd_reference (system_id, rules_revision, srd_index),
 ADD INDEX IF NOT EXISTS idx_actions_order (action_order);

INSERT INTO sources (system_id, code, name, abbreviation, description, is_official)
SELECT s.id, x.code, x.name, x.abbreviation, x.description, TRUE
FROM systems s
JOIN (
 SELECT 'srd_2014' code, 'D&D 5e SRD 2014' name, 'SRD 2014' abbreviation, 'Systems Reference Document 5.1 / 2014 structured data.' description UNION ALL
 SELECT 'srd_2024', 'D&D 5e SRD 2024', 'SRD 2024', 'Systems Reference Document 5.2 / 2024 structured data.'
) x
WHERE s.code = 'dnd_5e'
ON DUPLICATE KEY UPDATE
 name = VALUES(name),
 abbreviation = VALUES(abbreviation),
 description = VALUES(description),
 is_official = VALUES(is_official);
