USE dnd_manager;

CREATE TABLE IF NOT EXISTS systems (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 code VARCHAR(60) NOT NULL UNIQUE,
 name VARCHAR(120) NOT NULL,
 description TEXT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS roles (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 code VARCHAR(40) NOT NULL UNIQUE,
 name VARCHAR(80) NOT NULL,
 description TEXT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS role_permissions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 role_id BIGINT UNSIGNED NOT NULL,
 resource_type VARCHAR(80) NOT NULL,
 can_view BOOLEAN NOT NULL DEFAULT FALSE,
 can_create BOOLEAN NOT NULL DEFAULT FALSE,
 can_update BOOLEAN NOT NULL DEFAULT FALSE,
 can_delete BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE(role_id, resource_type),
 FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS action_categories (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 code VARCHAR(60) NOT NULL UNIQUE,
 name VARCHAR(100) NOT NULL,
 description TEXT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS activation_types (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 code VARCHAR(60) NOT NULL UNIQUE,
 name VARCHAR(100) NOT NULL,
 description TEXT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS visibility_levels (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 code VARCHAR(60) NOT NULL UNIQUE,
 name VARCHAR(100) NOT NULL,
 description TEXT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS magic_schools (
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

CREATE TABLE IF NOT EXISTS saving_throw_types (
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

CREATE TABLE IF NOT EXISTS attack_roll_types (
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

CREATE TABLE IF NOT EXISTS actions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 system_id BIGINT UNSIGNED NOT NULL,
 action_category_id BIGINT UNSIGNED NOT NULL,
 activation_type_id BIGINT UNSIGNED NULL,
 visibility_level_id BIGINT UNSIGNED NOT NULL,
 source_action_id BIGINT UNSIGNED NULL,
 created_by_user_id BIGINT UNSIGNED NULL,
 name VARCHAR(160) NOT NULL,
 short_description VARCHAR(500) NULL,
 description MEDIUMTEXT NOT NULL,
 range_text VARCHAR(255) NULL,
 duration_text VARCHAR(255) NULL,
 damage_text VARCHAR(255) NULL,
 healing_text VARCHAR(255) NULL,
 saving_throw_type_id BIGINT UNSIGNED NULL,
 attack_roll_type_id BIGINT UNSIGNED NULL,
 spell_level TINYINT UNSIGNED NULL,
 magic_school_id BIGINT UNSIGNED NULL,
 components_text VARCHAR(500) NULL,
 requires_concentration BOOLEAN NOT NULL DEFAULT FALSE,
 is_ritual BOOLEAN NOT NULL DEFAULT FALSE,
 resource_cost_text VARCHAR(255) NULL,
 scaling_text TEXT NULL,
 is_custom BOOLEAN NOT NULL DEFAULT FALSE,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_actions_search (system_id, name),
 INDEX idx_actions_category (action_category_id),
 INDEX idx_actions_visibility (visibility_level_id),
 FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE RESTRICT,
 FOREIGN KEY (action_category_id) REFERENCES action_categories(id) ON DELETE RESTRICT,
 FOREIGN KEY (activation_type_id) REFERENCES activation_types(id) ON DELETE SET NULL,
 FOREIGN KEY (visibility_level_id) REFERENCES visibility_levels(id) ON DELETE RESTRICT,
 FOREIGN KEY (source_action_id) REFERENCES actions(id) ON DELETE SET NULL,
 FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
 FOREIGN KEY (saving_throw_type_id) REFERENCES saving_throw_types(id) ON DELETE SET NULL,
 FOREIGN KEY (attack_roll_type_id) REFERENCES attack_roll_types(id) ON DELETE SET NULL,
 FOREIGN KEY (magic_school_id) REFERENCES magic_schools(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tags (
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

CREATE TABLE IF NOT EXISTS action_tags (
 action_id BIGINT UNSIGNED NOT NULL,
 tag_id BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY(action_id, tag_id),
 FOREIGN KEY (action_id) REFERENCES actions(id) ON DELETE CASCADE,
 FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS action_assignments (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 action_id BIGINT UNSIGNED NOT NULL,
 owner_type VARCHAR(60) NOT NULL,
 owner_id BIGINT UNSIGNED NOT NULL,
 notes TEXT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(action_id, owner_type, owner_id),
 INDEX idx_action_assignments_owner (owner_type, owner_id),
 FOREIGN KEY (action_id) REFERENCES actions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS action_permissions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 action_id BIGINT UNSIGNED NOT NULL,
 role_id BIGINT UNSIGNED NOT NULL,
 can_view BOOLEAN NOT NULL DEFAULT FALSE,
 can_update BOOLEAN NOT NULL DEFAULT FALSE,
 can_delete BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE(action_id, role_id),
 FOREIGN KEY (action_id) REFERENCES actions(id) ON DELETE CASCADE,
 FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO systems (code, name, description) VALUES
 ('dnd_5e', 'Dungeons & Dragons 5e', 'Default D&D 5e ruleset.')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

INSERT INTO roles (code, name, description) VALUES
 ('dm', 'Dungeon Master', 'Can manage and customize game content.'),
 ('player', 'Player', 'Can read permitted player-facing content.')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

INSERT INTO role_permissions (role_id, resource_type, can_view, can_create, can_update, can_delete)
SELECT r.id, 'action', TRUE, TRUE, TRUE, TRUE FROM roles r WHERE r.code = 'dm'
ON DUPLICATE KEY UPDATE can_view = VALUES(can_view), can_create = VALUES(can_create), can_update = VALUES(can_update), can_delete = VALUES(can_delete);

INSERT INTO role_permissions (role_id, resource_type, can_view, can_create, can_update, can_delete)
SELECT r.id, 'action', TRUE, FALSE, FALSE, FALSE FROM roles r WHERE r.code = 'player'
ON DUPLICATE KEY UPDATE can_view = VALUES(can_view), can_create = VALUES(can_create), can_update = VALUES(can_update), can_delete = VALUES(can_delete);

INSERT INTO action_categories (code, name, description) VALUES
 ('spell', 'Spell', 'Magical action such as a spell or cantrip.'),
 ('class_feature', 'Class Feature', 'Ability granted by a class.'),
 ('racial_trait', 'Racial Trait', 'Ability granted by ancestry, race, or species.'),
 ('monster_ability', 'Monster Ability', 'Ability normally used by monsters or NPC creatures.'),
 ('item_ability', 'Item Ability', 'Ability granted by an item.'),
 ('general_ability', 'General Ability', 'Generic or uncategorized ability.')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

INSERT INTO activation_types (code, name, description) VALUES
 ('action', 'Action', 'Requires a main action to use.'),
 ('bonus_action', 'Bonus Action', 'Requires a bonus action to use.'),
 ('reaction', 'Reaction', 'Requires a reaction to use.'),
 ('free_action', 'Free Action', 'Can be used without spending a main action.'),
 ('passive', 'Passive', 'Always active or does not require activation.'),
 ('short_rest', 'Short Rest', 'Used or restored around a short rest.'),
 ('long_rest', 'Long Rest', 'Used or restored around a long rest.'),
 ('special', 'Special', 'Uses special timing or activation rules.')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

INSERT INTO visibility_levels (code, name, description) VALUES
 ('public', 'Public', 'Visible to both DMs and players when permissions allow it.'),
 ('dm_only', 'DM Only', 'Intended only for DM-facing information.'),
 ('private', 'Private', 'Visible only to its owner or creator when supported.'),
 ('campaign_only', 'Campaign Only', 'Visible only inside a campaign when supported.')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

INSERT INTO magic_schools (system_id, code, name)
SELECT s.id, x.code, x.name
FROM systems s
JOIN (
 SELECT 'abjuration' code, 'Abjuration' name UNION ALL
 SELECT 'conjuration', 'Conjuration' UNION ALL
 SELECT 'divination', 'Divination' UNION ALL
 SELECT 'enchantment', 'Enchantment' UNION ALL
 SELECT 'evocation', 'Evocation' UNION ALL
 SELECT 'illusion', 'Illusion' UNION ALL
 SELECT 'necromancy', 'Necromancy' UNION ALL
 SELECT 'transmutation', 'Transmutation'
) x
WHERE s.code = 'dnd_5e'
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO saving_throw_types (system_id, code, name)
SELECT s.id, x.code, x.name
FROM systems s
JOIN (
 SELECT 'strength' code, 'Strength' name UNION ALL
 SELECT 'dexterity', 'Dexterity' UNION ALL
 SELECT 'constitution', 'Constitution' UNION ALL
 SELECT 'intelligence', 'Intelligence' UNION ALL
 SELECT 'wisdom', 'Wisdom' UNION ALL
 SELECT 'charisma', 'Charisma'
) x
WHERE s.code = 'dnd_5e'
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO attack_roll_types (system_id, code, name, description)
SELECT s.id, x.code, x.name, x.description
FROM systems s
JOIN (
 SELECT 'melee_spell' code, 'Melee Spell Attack' name, 'Spell attack made in melee range.' description UNION ALL
 SELECT 'ranged_spell', 'Ranged Spell Attack', 'Spell attack made at range.' UNION ALL
 SELECT 'melee_weapon', 'Melee Weapon Attack', 'Weapon attack made in melee range.' UNION ALL
 SELECT 'ranged_weapon', 'Ranged Weapon Attack', 'Weapon attack made at range.' UNION ALL
 SELECT 'special', 'Special Attack', 'Uses special attack rules.'
) x
WHERE s.code = 'dnd_5e'
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

INSERT INTO tags (system_id, code, name)
SELECT s.id, x.code, x.name
FROM systems s
JOIN (
 SELECT 'fire' code, 'Fire' name UNION ALL
 SELECT 'cold', 'Cold' UNION ALL
 SELECT 'lightning', 'Lightning' UNION ALL
 SELECT 'thunder', 'Thunder' UNION ALL
 SELECT 'acid', 'Acid' UNION ALL
 SELECT 'poison', 'Poison' UNION ALL
 SELECT 'necrotic', 'Necrotic' UNION ALL
 SELECT 'radiant', 'Radiant' UNION ALL
 SELECT 'psychic', 'Psychic' UNION ALL
 SELECT 'force', 'Force' UNION ALL
 SELECT 'healing', 'Healing' UNION ALL
 SELECT 'buff', 'Buff' UNION ALL
 SELECT 'debuff', 'Debuff' UNION ALL
 SELECT 'area_of_effect', 'Area of Effect' UNION ALL
 SELECT 'teleportation', 'Teleportation' UNION ALL
 SELECT 'summoning', 'Summoning' UNION ALL
 SELECT 'control', 'Control' UNION ALL
 SELECT 'utility', 'Utility'
) x
WHERE s.code = 'dnd_5e'
ON DUPLICATE KEY UPDATE name = VALUES(name);
