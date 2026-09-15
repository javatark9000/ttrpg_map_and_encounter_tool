CREATE DATABASE IF NOT EXISTS ttrpg_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ttrpg_manager;

CREATE TABLE users (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(80) NOT NULL,
 email VARCHAR(190) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 role ENUM('DM','PLAYER','GUEST') NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE auth_tokens (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 selector CHAR(24) NOT NULL UNIQUE,
 validator_hash CHAR(64) NOT NULL,
 last_used_at DATETIME NULL,
 revoked_at DATETIME NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE campaigns (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(120) NOT NULL,
 description TEXT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE campaign_members (
 campaign_id BIGINT UNSIGNED NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY(campaign_id,user_id),
 FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE assets (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 owner_id BIGINT UNSIGNED NOT NULL,
 mime VARCHAR(80) NOT NULL,
 size_bytes INT UNSIGNED NOT NULL,
 width INT UNSIGNED NOT NULL,
 height INT UNSIGNED NOT NULL,
 path VARCHAR(255) NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE player_characters (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 owner_id BIGINT UNSIGNED NOT NULL,
 campaign_id BIGINT UNSIGNED NOT NULL,
 name VARCHAR(100) NOT NULL,
 avatar_asset_id BIGINT UNSIGNED NULL,
 drawing_color VARCHAR(20) NOT NULL DEFAULT '#ffffff',
 max_health INT NOT NULL DEFAULT 10,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
 FOREIGN KEY (avatar_asset_id) REFERENCES assets(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE dm_player_notes (
 campaign_id BIGINT UNSIGNED NOT NULL,
 player_id BIGINT UNSIGNED NOT NULL,
 notes MEDIUMTEXT NOT NULL,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(campaign_id,player_id),
 FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
 FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE scenarios (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 campaign_id BIGINT UNSIGNED NOT NULL,
 name VARCHAR(120) NOT NULL,
 width TINYINT UNSIGNED NOT NULL,
 height TINYINT UNSIGNED NOT NULL,
 background_asset_id BIGINT UNSIGNED NULL,
 active BOOLEAN NOT NULL DEFAULT FALSE,
 is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
 version BIGINT UNSIGNED NOT NULL DEFAULT 0,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
 FOREIGN KEY (background_asset_id) REFERENCES assets(id) ON DELETE SET NULL,
 INDEX(campaign_id,is_deleted,active,name),
 CONSTRAINT chk_scenario_size CHECK(width BETWEEN 5 AND 60 AND height BETWEEN 5 AND 60)
) ENGINE=InnoDB;

CREATE TABLE dm_scenario_views (
 campaign_id BIGINT UNSIGNED NOT NULL,
 scenario_id BIGINT UNSIGNED NOT NULL,
 center_x DECIMAL(10,4) NOT NULL DEFAULT 0,
 center_y DECIMAL(10,4) NOT NULL DEFAULT 0,
 zoom DECIMAL(6,4) NOT NULL DEFAULT 1,
 viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(campaign_id,scenario_id),
 FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
 FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
 INDEX(campaign_id,viewed_at)
) ENGINE=InnoDB;

CREATE TABLE blocked_cells (
 scenario_id BIGINT UNSIGNED NOT NULL,
 x TINYINT UNSIGNED NOT NULL,
 y TINYINT UNSIGNED NOT NULL,
 PRIMARY KEY(scenario_id,x,y),
 FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE scenario_map_focus (
 scenario_id BIGINT UNSIGNED PRIMARY KEY,
 x INT UNSIGNED NOT NULL,
 y INT UNSIGNED NOT NULL,
 width_cells INT UNSIGNED NOT NULL,
 height_cells INT UNSIGNED NOT NULL,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE cell_notes (
 scenario_id BIGINT UNSIGNED NOT NULL,
 x TINYINT UNSIGNED NOT NULL,
 y TINYINT UNSIGNED NOT NULL,
 notes MEDIUMTEXT NOT NULL,
 PRIMARY KEY(scenario_id,x,y),
 FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE map_objects (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 scenario_id BIGINT UNSIGNED NOT NULL,
 name VARCHAR(100) NOT NULL DEFAULT 'Objeto',
 x TINYINT UNSIGNED NOT NULL,
 y TINYINT UNSIGNED NOT NULL,
 width_cells TINYINT UNSIGNED NOT NULL DEFAULT 1,
 height_cells TINYINT UNSIGNED NOT NULL DEFAULT 1,
 offset_x DECIMAL(5,4) NOT NULL DEFAULT .5,
 offset_y DECIMAL(5,4) NOT NULL DEFAULT .5,
 notes MEDIUMTEXT NULL,
 image_asset_id BIGINT UNSIGNED NULL,
 visible BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
 FOREIGN KEY (image_asset_id) REFERENCES assets(id) ON DELETE SET NULL,
 INDEX(scenario_id,x,y)
) ENGINE=InnoDB;

-- The Codex tables are declared later in this consolidated schema.
-- Disable checks temporarily to allow the forward reference to creatures.
SET FOREIGN_KEY_CHECKS=0;
CREATE TABLE npc_characters (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 scenario_id BIGINT UNSIGNED NOT NULL,
 name VARCHAR(100) NOT NULL,
 x TINYINT UNSIGNED NOT NULL,
 y TINYINT UNSIGNED NOT NULL,
 notes MEDIUMTEXT NULL,
 image_asset_id BIGINT UNSIGNED NULL,
 codex_creature_id BIGINT UNSIGNED NULL,
 health INT NOT NULL DEFAULT 1,
 max_health INT NULL,
 armor_class INT NULL,
 rotation_degrees SMALLINT UNSIGNED NOT NULL DEFAULT 0,
 initiative INT NULL,
 visible BOOLEAN NOT NULL DEFAULT TRUE,
 dead_hidden BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
 FOREIGN KEY (image_asset_id) REFERENCES assets(id) ON DELETE SET NULL,
 FOREIGN KEY (codex_creature_id) REFERENCES creatures(id) ON DELETE SET NULL,
 INDEX(codex_creature_id),
 INDEX(scenario_id,x,y)
) ENGINE=InnoDB;
SET FOREIGN_KEY_CHECKS=1;

CREATE TABLE scenario_players (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 scenario_id BIGINT UNSIGNED NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL,
 character_id BIGINT UNSIGNED NOT NULL,
 x TINYINT UNSIGNED NOT NULL,
 y TINYINT UNSIGNED NOT NULL,
 health INT NOT NULL,
 token_color VARCHAR(20) NULL,
 rotation_degrees SMALLINT UNSIGNED NOT NULL DEFAULT 0,
 initiative INT NULL,
 last_path JSON NULL,
 placed BOOLEAN NOT NULL DEFAULT TRUE,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_scenario_character(scenario_id,character_id),
 INDEX(user_id,placed),
 FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY (character_id) REFERENCES player_characters(id) ON DELETE CASCADE,
 INDEX(scenario_id,x,y)
) ENGINE=InnoDB;

CREATE TABLE encounters (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 scenario_id BIGINT UNSIGNED NOT NULL UNIQUE,
 state ENUM('OFF','PREPARING','RUNNING','PAUSED','FINISHED') NOT NULL DEFAULT 'OFF',
 round_no INT UNSIGNED NOT NULL DEFAULT 0,
 current_participant_id BIGINT UNSIGNED NULL,
 turn_cursor_id BIGINT UNSIGNED NULL,
 turn_sequence INT UNSIGNED NOT NULL DEFAULT 0,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE encounter_participants (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 encounter_id BIGINT UNSIGNED NOT NULL,
 actor_type ENUM('PLAYER','NPC') NOT NULL,
 actor_id BIGINT UNSIGNED NOT NULL,
 initiative INT NULL,
 tie_order INT NOT NULL DEFAULT 0,
 last_turn_round INT UNSIGNED NOT NULL DEFAULT 0,
 state ENUM('ACTIVE','WAITING','DEAD','REMOVED') NOT NULL DEFAULT 'ACTIVE',
 UNIQUE(encounter_id,actor_type,actor_id),
 FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE,
 INDEX(encounter_id,initiative,tie_order)
) ENGINE=InnoDB;

ALTER TABLE encounters ADD CONSTRAINT fk_encounter_current FOREIGN KEY (current_participant_id) REFERENCES encounter_participants(id) ON DELETE SET NULL;
ALTER TABLE encounters ADD CONSTRAINT fk_encounter_cursor FOREIGN KEY (turn_cursor_id) REFERENCES encounter_participants(id) ON DELETE SET NULL;

CREATE TABLE encounter_turn_history (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 encounter_id BIGINT UNSIGNED NOT NULL,
 previous_participant_id BIGINT UNSIGNED NULL,
 previous_round_no INT UNSIGNED NOT NULL,
 previous_turn_sequence INT UNSIGNED NOT NULL,
 scheduling_snapshot JSON NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE,
 FOREIGN KEY (previous_participant_id) REFERENCES encounter_participants(id) ON DELETE SET NULL,
 INDEX(encounter_id,id)
) ENGINE=InnoDB;

CREATE TABLE turn_delays (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 encounter_id BIGINT UNSIGNED NOT NULL,
 waiting_participant_id BIGINT UNSIGNED NOT NULL,
 target_participant_id BIGINT UNSIGNED NOT NULL,
 round_no INT UNSIGNED NOT NULL,
 sort_order INT NOT NULL DEFAULT 0,
 triggered BOOLEAN NOT NULL DEFAULT FALSE,
 ready BOOLEAN NOT NULL DEFAULT FALSE,
 FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE,
 FOREIGN KEY (waiting_participant_id) REFERENCES encounter_participants(id) ON DELETE CASCADE,
 FOREIGN KEY (target_participant_id) REFERENCES encounter_participants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE encounter_health_log (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 encounter_id BIGINT UNSIGNED NOT NULL,
 round_no INT UNSIGNED NOT NULL DEFAULT 0,
 actor_type ENUM('PLAYER','NPC') NOT NULL,
 actor_id BIGINT UNSIGNED NOT NULL,
 actor_name VARCHAR(120) NOT NULL,
 action_type ENUM('DAMAGE','HEAL') NOT NULL,
 amount INT NOT NULL,
 health_before INT NOT NULL,
 health_after INT NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE,
 INDEX(encounter_id,id),
 INDEX(encounter_id,actor_type,actor_id)
) ENGINE=InnoDB;

CREATE TABLE movement_requests (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 scenario_id BIGINT UNSIGNED NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL,
 scenario_player_id BIGINT UNSIGNED NULL,
 path JSON NOT NULL,
 status ENUM('PENDING','APPROVED','REJECTED','APPLIED') NOT NULL,
 reason VARCHAR(255) NULL,
 reviewed_by BIGINT UNSIGNED NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY (scenario_player_id) REFERENCES scenario_players(id) ON DELETE SET NULL,
 FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
 INDEX(scenario_player_id)
) ENGINE=InnoDB;

CREATE TABLE scenario_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 scenario_id BIGINT UNSIGNED NOT NULL,
 version BIGINT UNSIGNED NOT NULL,
 event_type VARCHAR(80) NOT NULL,
 actor_id BIGINT UNSIGNED NULL,
 payload JSON NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(scenario_id,version),
 FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
 FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE dm_player_chats (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 campaign_id BIGINT UNSIGNED NOT NULL,
 player_id BIGINT UNSIGNED NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE(campaign_id,player_id),
 FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
 FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE,
 INDEX(campaign_id,updated_at)
) ENGINE=InnoDB;

CREATE TABLE dm_player_chat_messages (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 chat_id BIGINT UNSIGNED NOT NULL,
 sender_id BIGINT UNSIGNED NOT NULL,
 message TEXT NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 read_by_dm BOOLEAN NOT NULL DEFAULT FALSE,
 read_by_player BOOLEAN NOT NULL DEFAULT FALSE,
 FOREIGN KEY (chat_id) REFERENCES dm_player_chats(id) ON DELETE CASCADE,
 FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
 INDEX(chat_id,id),
 INDEX(sender_id,created_at)
) ENGINE=InnoDB;

CREATE TABLE command_receipts (
 request_id VARCHAR(64) PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 response JSON NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 INDEX(created_at)
) ENGINE=InnoDB;

CREATE TABLE dm_lease (
 lease_key TINYINT PRIMARY KEY DEFAULT 1,
 user_id BIGINT UNSIGNED NOT NULL,
 connection_id VARCHAR(80) NOT NULL,
 expires_at DATETIME NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO campaigns(name,description) VALUES ('Campaña principal','Campaña inicial del grupo');

-- Codex schema and baseline lookup data.

-- Consolidated from 004_codex_abilities.sql
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
 custom_identifier VARCHAR(120) NULL,
 custom_tag VARCHAR(80) NULL,
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
 INDEX idx_actions_custom_identifier (custom_identifier),
 INDEX idx_actions_custom_tag (custom_tag),
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

-- Consolidated from 005_codex_creatures.sql
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

-- Consolidated from 006_codex_items.sql
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

-- Consolidated from 007_character_options.sql
CREATE TABLE IF NOT EXISTS species (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 system_id BIGINT UNSIGNED NOT NULL,
 visibility_level_id BIGINT UNSIGNED NOT NULL,
 source_species_id BIGINT UNSIGNED NULL,
 created_by_user_id BIGINT UNSIGNED NULL,
 name VARCHAR(160) NOT NULL,
 short_description VARCHAR(500) NULL,
 description MEDIUMTEXT NOT NULL,
 size_text VARCHAR(255) NULL,
 speed_text VARCHAR(255) NULL,
 languages_text VARCHAR(500) NULL,
 ability_score_text VARCHAR(500) NULL,
 traits_text MEDIUMTEXT NULL,
 is_custom BOOLEAN NOT NULL DEFAULT FALSE,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_species_search (system_id, name),
 INDEX idx_species_visibility (visibility_level_id),
 FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE RESTRICT,
 FOREIGN KEY (visibility_level_id) REFERENCES visibility_levels(id) ON DELETE RESTRICT,
 FOREIGN KEY (source_species_id) REFERENCES species(id) ON DELETE SET NULL,
 FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS classes (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 system_id BIGINT UNSIGNED NOT NULL,
 visibility_level_id BIGINT UNSIGNED NOT NULL,
 source_class_id BIGINT UNSIGNED NULL,
 created_by_user_id BIGINT UNSIGNED NULL,
 name VARCHAR(160) NOT NULL,
 short_description VARCHAR(500) NULL,
 description MEDIUMTEXT NOT NULL,
 hit_die_text VARCHAR(255) NULL,
 primary_ability_text VARCHAR(255) NULL,
 saving_throw_proficiencies_text VARCHAR(500) NULL,
 armor_proficiencies_text VARCHAR(500) NULL,
 weapon_proficiencies_text VARCHAR(500) NULL,
 tool_proficiencies_text VARCHAR(500) NULL,
 skill_proficiencies_text VARCHAR(500) NULL,
 equipment_text TEXT NULL,
 is_custom BOOLEAN NOT NULL DEFAULT FALSE,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_classes_search (system_id, name),
 INDEX idx_classes_visibility (visibility_level_id),
 FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE RESTRICT,
 FOREIGN KEY (visibility_level_id) REFERENCES visibility_levels(id) ON DELETE RESTRICT,
 FOREIGN KEY (source_class_id) REFERENCES classes(id) ON DELETE SET NULL,
 FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS backgrounds (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 system_id BIGINT UNSIGNED NOT NULL,
 visibility_level_id BIGINT UNSIGNED NOT NULL,
 source_background_id BIGINT UNSIGNED NULL,
 created_by_user_id BIGINT UNSIGNED NULL,
 name VARCHAR(160) NOT NULL,
 short_description VARCHAR(500) NULL,
 description MEDIUMTEXT NOT NULL,
 skill_proficiencies_text VARCHAR(500) NULL,
 tool_proficiencies_text VARCHAR(500) NULL,
 languages_text VARCHAR(500) NULL,
 equipment_text TEXT NULL,
 feature_text MEDIUMTEXT NULL,
 suggested_characteristics_text MEDIUMTEXT NULL,
 is_custom BOOLEAN NOT NULL DEFAULT FALSE,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_backgrounds_search (system_id, name),
 INDEX idx_backgrounds_visibility (visibility_level_id),
 FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE RESTRICT,
 FOREIGN KEY (visibility_level_id) REFERENCES visibility_levels(id) ON DELETE RESTRICT,
 FOREIGN KEY (source_background_id) REFERENCES backgrounds(id) ON DELETE SET NULL,
 FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Consolidated from 008_sources_feats_subclasses.sql
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

-- Consolidated from 009_action_class_availability.sql
CREATE TABLE IF NOT EXISTS action_class_availability (
 action_id BIGINT UNSIGNED NOT NULL,
 class_id BIGINT UNSIGNED NOT NULL,
 notes TEXT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(action_id, class_id),
 FOREIGN KEY (action_id) REFERENCES actions(id) ON DELETE CASCADE,
 FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO classes (system_id, visibility_level_id, source_material_id, name, short_description, description, is_custom, is_active)
SELECT sys.id, vis.id, src.id, x.name, x.short_description, x.description, FALSE, TRUE
FROM systems sys
JOIN visibility_levels vis ON vis.code = 'public'
LEFT JOIN sources src ON src.system_id = sys.id AND src.code = 'phb'
JOIN (
 SELECT 'Artificer' name, 'Magical inventor and maker.' short_description, 'D&D 5e class placeholder for spell/action availability.' description UNION ALL
 SELECT 'Barbarian', 'Primal warrior.', 'D&D 5e class placeholder for spell/action availability.' UNION ALL
 SELECT 'Bard', 'Magical performer and skill expert.', 'D&D 5e class placeholder for spell/action availability.' UNION ALL
 SELECT 'Cleric', 'Divine spellcaster.', 'D&D 5e class placeholder for spell/action availability.' UNION ALL
 SELECT 'Druid', 'Nature spellcaster and shapeshifter.', 'D&D 5e class placeholder for spell/action availability.' UNION ALL
 SELECT 'Fighter', 'Martial combat expert.', 'D&D 5e class placeholder for spell/action availability.' UNION ALL
 SELECT 'Monk', 'Martial artist using discipline and ki.', 'D&D 5e class placeholder for spell/action availability.' UNION ALL
 SELECT 'Paladin', 'Divine warrior.', 'D&D 5e class placeholder for spell/action availability.' UNION ALL
 SELECT 'Ranger', 'Wilderness warrior and spellcaster.', 'D&D 5e class placeholder for spell/action availability.' UNION ALL
 SELECT 'Rogue', 'Skillful expert and precise attacker.', 'D&D 5e class placeholder for spell/action availability.' UNION ALL
 SELECT 'Sorcerer', 'Innate arcane spellcaster.', 'D&D 5e class placeholder for spell/action availability.' UNION ALL
 SELECT 'Warlock', 'Pact-based arcane spellcaster.', 'D&D 5e class placeholder for spell/action availability.' UNION ALL
 SELECT 'Wizard', 'Scholarly arcane spellcaster.', 'D&D 5e class placeholder for spell/action availability.'
) x
WHERE sys.code = 'dnd_5e'
AND NOT EXISTS (
 SELECT 1 FROM classes c
 WHERE c.system_id = sys.id AND c.name = x.name
);

-- Consolidated from 010_weapon_properties.sql
CREATE TABLE IF NOT EXISTS weapon_properties (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 system_id BIGINT UNSIGNED NOT NULL,
 code VARCHAR(80) NOT NULL,
 name VARCHAR(120) NOT NULL,
 description MEDIUMTEXT NOT NULL,
 source_url VARCHAR(500) NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_weapon_properties_system_code (system_id, code),
 FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS item_weapon_properties (
 item_id BIGINT UNSIGNED NOT NULL,
 weapon_property_id BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY (item_id, weapon_property_id),
 FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
 FOREIGN KEY (weapon_property_id) REFERENCES weapon_properties(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Consolidated from 011_explosive_item_type.sql
INSERT INTO item_types (system_id, code, name, description)
SELECT s.id, 'explosive', 'Explosive', 'Explosive items such as bombs, gunpowder, dynamite, and grenades.'
FROM systems s
WHERE s.code = 'dnd_5e'
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

-- Consolidated from 012_currency_coins.sql
CREATE TABLE IF NOT EXISTS currency_coins (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 system_id BIGINT UNSIGNED NOT NULL,
 code VARCHAR(20) NOT NULL,
 name VARCHAR(80) NOT NULL,
 value_in_cp DECIMAL(18,6) NOT NULL,
 coins_per_lb DECIMAL(10,2) NULL,
 source_url VARCHAR(500) NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_currency_coins_system_code (system_id, code),
 FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS currency_coin_conversions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 system_id BIGINT UNSIGNED NOT NULL,
 from_coin_id BIGINT UNSIGNED NOT NULL,
 to_coin_id BIGINT UNSIGNED NOT NULL,
 conversion_rate DECIMAL(18,6) NOT NULL COMMENT 'Amount of to_coin equal to 1 from_coin.',
 source_url VARCHAR(500) NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_currency_coin_conversions (system_id, from_coin_id, to_coin_id),
 FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE CASCADE,
 FOREIGN KEY (from_coin_id) REFERENCES currency_coins(id) ON DELETE CASCADE,
 FOREIGN KEY (to_coin_id) REFERENCES currency_coins(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Consolidated from 013_poison_types.sql
CREATE TABLE IF NOT EXISTS poison_types (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 system_id BIGINT UNSIGNED NOT NULL,
 code VARCHAR(80) NOT NULL,
 name VARCHAR(120) NOT NULL,
 description MEDIUMTEXT NOT NULL,
 source_url VARCHAR(500) NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_poison_types_system_code (system_id, code),
 FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS item_poison_types (
 item_id BIGINT UNSIGNED NOT NULL,
 poison_type_id BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY (item_id, poison_type_id),
 FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
 FOREIGN KEY (poison_type_id) REFERENCES poison_types(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO item_types (system_id, code, name, description)
SELECT s.id, 'poison', 'Poison', 'Poison items such as contact, ingested, inhaled, and injury poisons.'
FROM systems s
WHERE s.code = 'dnd_5e'
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

-- Consolidated from 014_srd_creatures_and_monster_actions.sql
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

-- Consolidated from 015_codex_media_assets.sql
-- Reusable media layer for codex art, item/object images, creature portraits, VTT tokens, printable minis, etc.
-- Files are not stored in MariaDB; this stores local paths, external URLs, or object-storage keys plus metadata.

CREATE TABLE IF NOT EXISTS media_storage_drivers (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 code VARCHAR(40) NOT NULL UNIQUE,
 name VARCHAR(100) NOT NULL,
 description TEXT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS media_purposes (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 code VARCHAR(60) NOT NULL UNIQUE,
 name VARCHAR(100) NOT NULL,
 description TEXT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS media_collections (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 owner_user_id BIGINT UNSIGNED NULL,
 name VARCHAR(180) NOT NULL,
 description TEXT NULL,
 source_name VARCHAR(180) NULL,
 source_url VARCHAR(500) NULL,
 credit_text TEXT NULL,
 license_text TEXT NULL,
 is_private BOOLEAN NOT NULL DEFAULT TRUE,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_media_collections_owner (owner_user_id),
 FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS media_assets (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 storage_driver_id BIGINT UNSIGNED NOT NULL,
 owner_user_id BIGINT UNSIGNED NULL,
 original_filename VARCHAR(255) NULL,
 title VARCHAR(180) NULL,
 alt_text VARCHAR(255) NULL,
 storage_path VARCHAR(500) NULL,
 external_url VARCHAR(1000) NULL,
 bucket_name VARCHAR(180) NULL,
 object_key VARCHAR(700) NULL,
 mime_type VARCHAR(120) NULL,
 width_px INT UNSIGNED NULL,
 height_px INT UNSIGNED NULL,
 size_bytes BIGINT UNSIGNED NULL,
 sha256 CHAR(64) NULL,
 credit_text TEXT NULL,
 license_text TEXT NULL,
 attribution_url VARCHAR(1000) NULL,
 notes TEXT NULL,
 is_private BOOLEAN NOT NULL DEFAULT TRUE,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_media_assets_driver (storage_driver_id),
 INDEX idx_media_assets_owner (owner_user_id),
 INDEX idx_media_assets_sha256 (sha256),
 INDEX idx_media_assets_title (title),
 FOREIGN KEY (storage_driver_id) REFERENCES media_storage_drivers(id) ON DELETE RESTRICT,
 FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS media_asset_collections (
 media_asset_id BIGINT UNSIGNED NOT NULL,
 media_collection_id BIGINT UNSIGNED NOT NULL,
 sort_order INT UNSIGNED NOT NULL DEFAULT 0,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (media_asset_id, media_collection_id),
 INDEX idx_media_asset_collections_collection (media_collection_id, sort_order),
 FOREIGN KEY (media_asset_id) REFERENCES media_assets(id) ON DELETE CASCADE,
 FOREIGN KEY (media_collection_id) REFERENCES media_collections(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS codex_media_links (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 media_asset_id BIGINT UNSIGNED NOT NULL,
 entity_type VARCHAR(60) NOT NULL,
 entity_id BIGINT UNSIGNED NOT NULL,
 media_purpose_id BIGINT UNSIGNED NOT NULL,
 visibility_level_id BIGINT UNSIGNED NULL,
 title VARCHAR(180) NULL,
 caption TEXT NULL,
 sort_order INT UNSIGNED NOT NULL DEFAULT 0,
 is_primary BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_codex_media_link (media_asset_id, entity_type, entity_id, media_purpose_id),
 INDEX idx_codex_media_links_entity (entity_type, entity_id, media_purpose_id, sort_order),
 INDEX idx_codex_media_links_primary (entity_type, entity_id, is_primary),
 FOREIGN KEY (media_asset_id) REFERENCES media_assets(id) ON DELETE CASCADE,
 FOREIGN KEY (media_purpose_id) REFERENCES media_purposes(id) ON DELETE RESTRICT,
 FOREIGN KEY (visibility_level_id) REFERENCES visibility_levels(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO media_storage_drivers (code, name, description) VALUES
 ('local', 'Local File', 'File stored under the application storage directory.'),
 ('s3', 'S3-Compatible Object Storage', 'File stored in S3 or an S3-compatible bucket.'),
 ('external_url', 'External URL', 'Externally hosted image referenced by URL only.')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

INSERT INTO media_purposes (code, name, description) VALUES
 ('portrait', 'Portrait', 'Creature, NPC, character, or item portrait/illustration.'),
 ('token', 'VTT Token', 'Top-down or circular token intended for a virtual tabletop map.'),
 ('miniature', 'Miniature', 'Printable or physical miniature reference.'),
 ('miniature_front', 'Miniature Front', 'Front side of a printable miniature.'),
 ('miniature_back', 'Miniature Back', 'Back side of a printable miniature.'),
 ('icon', 'Icon', 'Small inventory/UI icon.'),
 ('handout', 'Handout', 'Player-facing handout image.'),
 ('reference', 'Reference', 'General reference image.'),
 ('map_marker', 'Map Marker', 'Marker or object image for scenario maps.'),
 ('other', 'Other', 'Other media purpose.')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

-- Consolidated from 016_feat_types.sql
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

-- Consolidated from 017_species_lineage_fields.sql
-- Wikidot lineage/species support. Base lineages go into `species`; child lineages/variants
-- such as Hill Dwarf, High Elf, Draconblood, etc. go into `subspecies`.

ALTER TABLE species
 ADD COLUMN IF NOT EXISTS lineage_type_code VARCHAR(60) NULL AFTER source_page_text,
 ADD COLUMN IF NOT EXISTS wikidot_slug VARCHAR(120) NULL AFTER lineage_type_code,
 ADD COLUMN IF NOT EXISTS source_url VARCHAR(500) NULL AFTER wikidot_slug,
 ADD COLUMN IF NOT EXISTS is_ua BOOLEAN NOT NULL DEFAULT FALSE AFTER source_url,
 ADD COLUMN IF NOT EXISTS is_setting_specific BOOLEAN NOT NULL DEFAULT FALSE AFTER is_ua,
 ADD COLUMN IF NOT EXISTS creature_type_text VARCHAR(255) NULL AFTER ability_score_text,
 ADD COLUMN IF NOT EXISTS age_text VARCHAR(500) NULL AFTER creature_type_text,
 ADD COLUMN IF NOT EXISTS alignment_text VARCHAR(500) NULL AFTER age_text,
 ADD COLUMN IF NOT EXISTS raw_data_json LONGTEXT NULL AFTER traits_text,
 ADD UNIQUE KEY IF NOT EXISTS uq_species_wikidot_source (system_id, wikidot_slug, source_material_id),
 ADD INDEX IF NOT EXISTS idx_species_lineage_type (lineage_type_code);

CREATE TABLE IF NOT EXISTS subspecies (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 system_id BIGINT UNSIGNED NOT NULL,
 species_id BIGINT UNSIGNED NOT NULL,
 visibility_level_id BIGINT UNSIGNED NOT NULL,
 source_subspecies_id BIGINT UNSIGNED NULL,
 created_by_user_id BIGINT UNSIGNED NULL,
 source_material_id BIGINT UNSIGNED NULL,
 source_page_text VARCHAR(80) NULL,
 lineage_type_code VARCHAR(60) NULL,
 wikidot_slug VARCHAR(120) NULL,
 source_url VARCHAR(500) NULL,
 is_ua BOOLEAN NOT NULL DEFAULT FALSE,
 is_setting_specific BOOLEAN NOT NULL DEFAULT FALSE,
 name VARCHAR(160) NOT NULL,
 short_description VARCHAR(500) NULL,
 description MEDIUMTEXT NOT NULL,
 size_text VARCHAR(255) NULL,
 speed_text VARCHAR(255) NULL,
 languages_text VARCHAR(500) NULL,
 ability_score_text VARCHAR(500) NULL,
 creature_type_text VARCHAR(255) NULL,
 age_text VARCHAR(500) NULL,
 alignment_text VARCHAR(500) NULL,
 traits_text MEDIUMTEXT NULL,
 raw_data_json LONGTEXT NULL,
 is_custom BOOLEAN NOT NULL DEFAULT FALSE,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_subspecies_wikidot_source (system_id, species_id, wikidot_slug, name, source_material_id),
 INDEX idx_subspecies_search (system_id, name),
 INDEX idx_subspecies_species (species_id),
 INDEX idx_subspecies_visibility (visibility_level_id),
 INDEX idx_subspecies_source_material (source_material_id),
 INDEX idx_subspecies_lineage_type (lineage_type_code),
 FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE RESTRICT,
 FOREIGN KEY (species_id) REFERENCES species(id) ON DELETE CASCADE,
 FOREIGN KEY (visibility_level_id) REFERENCES visibility_levels(id) ON DELETE RESTRICT,
 FOREIGN KEY (source_subspecies_id) REFERENCES subspecies(id) ON DELETE SET NULL,
 FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
 FOREIGN KEY (source_material_id) REFERENCES sources(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Consolidated from 018_background_variants.sql
ALTER TABLE backgrounds
 ADD COLUMN IF NOT EXISTS background_type_code VARCHAR(60) NULL AFTER source_page_text,
 ADD COLUMN IF NOT EXISTS setting_name VARCHAR(160) NULL AFTER background_type_code,
 ADD COLUMN IF NOT EXISTS wikidot_slug VARCHAR(120) NULL AFTER setting_name,
 ADD COLUMN IF NOT EXISTS source_url VARCHAR(500) NULL AFTER wikidot_slug,
 ADD COLUMN IF NOT EXISTS prerequisites_text TEXT NULL AFTER source_url,
 ADD COLUMN IF NOT EXISTS is_setting_specific BOOLEAN NOT NULL DEFAULT FALSE AFTER prerequisites_text,
 ADD COLUMN IF NOT EXISTS is_homebrew BOOLEAN NOT NULL DEFAULT FALSE AFTER is_setting_specific,
 ADD COLUMN IF NOT EXISTS is_adventurers_league BOOLEAN NOT NULL DEFAULT FALSE AFTER is_homebrew,
 ADD COLUMN IF NOT EXISTS raw_data_json LONGTEXT NULL AFTER suggested_characteristics_text,
 ADD UNIQUE KEY IF NOT EXISTS uq_backgrounds_wikidot_source (system_id, wikidot_slug, source_material_id),
 ADD INDEX IF NOT EXISTS idx_backgrounds_type (background_type_code),
 ADD INDEX IF NOT EXISTS idx_backgrounds_setting (setting_name);

CREATE TABLE IF NOT EXISTS background_variants (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 system_id BIGINT UNSIGNED NOT NULL,
 background_id BIGINT UNSIGNED NOT NULL,
 visibility_level_id BIGINT UNSIGNED NOT NULL,
 source_background_variant_id BIGINT UNSIGNED NULL,
 created_by_user_id BIGINT UNSIGNED NULL,
 source_material_id BIGINT UNSIGNED NULL,
 source_page_text VARCHAR(80) NULL,
 background_type_code VARCHAR(60) NULL,
 setting_name VARCHAR(160) NULL,
 wikidot_slug VARCHAR(120) NULL,
 source_url VARCHAR(500) NULL,
 prerequisites_text TEXT NULL,
 name VARCHAR(160) NOT NULL,
 short_description VARCHAR(500) NULL,
 description MEDIUMTEXT NOT NULL,
 skill_proficiencies_text VARCHAR(500) NULL,
 tool_proficiencies_text VARCHAR(500) NULL,
 languages_text VARCHAR(500) NULL,
 equipment_text TEXT NULL,
 feature_text MEDIUMTEXT NULL,
 suggested_characteristics_text MEDIUMTEXT NULL,
 is_setting_specific BOOLEAN NOT NULL DEFAULT FALSE,
 is_homebrew BOOLEAN NOT NULL DEFAULT FALSE,
 is_adventurers_league BOOLEAN NOT NULL DEFAULT FALSE,
 raw_data_json LONGTEXT NULL,
 is_custom BOOLEAN NOT NULL DEFAULT FALSE,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_background_variants_wikidot_source (system_id, background_id, wikidot_slug, name, source_material_id),
 INDEX idx_background_variants_search (system_id, name),
 INDEX idx_background_variants_background (background_id),
 INDEX idx_background_variants_visibility (visibility_level_id),
 INDEX idx_background_variants_source_material (source_material_id),
 FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE RESTRICT,
 FOREIGN KEY (background_id) REFERENCES backgrounds(id) ON DELETE CASCADE,
 FOREIGN KEY (visibility_level_id) REFERENCES visibility_levels(id) ON DELETE RESTRICT,
 FOREIGN KEY (source_background_variant_id) REFERENCES background_variants(id) ON DELETE SET NULL,
 FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
 FOREIGN KEY (source_material_id) REFERENCES sources(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Consolidated from 019_custom_codex_metadata.sql
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

-- Consolidated from 020_action_text_lengths.sql
ALTER TABLE actions
 MODIFY COLUMN short_description TEXT NULL,
 MODIFY COLUMN range_text TEXT NULL,
 MODIFY COLUMN duration_text TEXT NULL,
 MODIFY COLUMN damage_text TEXT NULL,
 MODIFY COLUMN difficulty_class_text TEXT NULL,
 MODIFY COLUMN healing_text TEXT NULL,
 MODIFY COLUMN components_text TEXT NULL,
 MODIFY COLUMN resource_cost_text TEXT NULL,
 MODIFY COLUMN usage_text TEXT NULL;

-- Consolidated from 021_character_option_text_lengths.sql
ALTER TABLE feats
 MODIFY COLUMN short_description TEXT NULL;

ALTER TABLE species
 MODIFY COLUMN short_description TEXT NULL;

ALTER TABLE subspecies
 MODIFY COLUMN short_description TEXT NULL;

ALTER TABLE backgrounds
 MODIFY COLUMN short_description TEXT NULL;

ALTER TABLE background_variants
 MODIFY COLUMN short_description TEXT NULL;

-- Consolidated from 022_character_option_more_text_lengths.sql
ALTER TABLE species
 MODIFY COLUMN size_text TEXT NULL,
 MODIFY COLUMN speed_text TEXT NULL,
 MODIFY COLUMN languages_text TEXT NULL,
 MODIFY COLUMN ability_score_text TEXT NULL,
 MODIFY COLUMN creature_type_text TEXT NULL,
 MODIFY COLUMN age_text TEXT NULL,
 MODIFY COLUMN alignment_text TEXT NULL;

ALTER TABLE subspecies
 MODIFY COLUMN size_text TEXT NULL,
 MODIFY COLUMN speed_text TEXT NULL,
 MODIFY COLUMN languages_text TEXT NULL,
 MODIFY COLUMN ability_score_text TEXT NULL,
 MODIFY COLUMN creature_type_text TEXT NULL,
 MODIFY COLUMN age_text TEXT NULL,
 MODIFY COLUMN alignment_text TEXT NULL;

ALTER TABLE backgrounds
 MODIFY COLUMN skill_proficiencies_text TEXT NULL,
 MODIFY COLUMN tool_proficiencies_text TEXT NULL,
 MODIFY COLUMN languages_text TEXT NULL;

ALTER TABLE background_variants
 MODIFY COLUMN skill_proficiencies_text TEXT NULL,
 MODIFY COLUMN tool_proficiencies_text TEXT NULL,
 MODIFY COLUMN languages_text TEXT NULL;

-- Consolidated from 023_spanish_codex_lookup_labels.sql
UPDATE action_categories SET name = CASE code
 WHEN 'spell' THEN 'Hechizo'
 WHEN 'class_feature' THEN 'Rasgo de clase'
 WHEN 'racial_trait' THEN 'Rasgo de especie'
 WHEN 'monster_ability' THEN 'Habilidad de monstruo'
 WHEN 'item_ability' THEN 'Habilidad de objeto'
 WHEN 'general_ability' THEN 'Habilidad general'
 ELSE name END
WHERE code IN ('spell','class_feature','racial_trait','monster_ability','item_ability','general_ability');

UPDATE activation_types SET name = CASE code
 WHEN 'action' THEN 'Acción'
 WHEN 'bonus_action' THEN 'Acción adicional'
 WHEN 'reaction' THEN 'Reacción'
 WHEN 'free_action' THEN 'Acción libre'
 WHEN 'passive' THEN 'Pasiva'
 WHEN 'special' THEN 'Especial'
 WHEN 'short_rest' THEN 'Descanso corto'
 WHEN 'long_rest' THEN 'Descanso largo'
 ELSE name END
WHERE code IN ('action','bonus_action','reaction','free_action','passive','special','short_rest','long_rest');

UPDATE creature_sizes SET name = CASE code
 WHEN 'tiny' THEN 'Diminuto'
 WHEN 'small' THEN 'Pequeño'
 WHEN 'medium' THEN 'Mediano'
 WHEN 'large' THEN 'Grande'
 WHEN 'huge' THEN 'Enorme'
 WHEN 'gargantuan' THEN 'Gargantuesco'
 ELSE name END
WHERE code IN ('tiny','small','medium','large','huge','gargantuan');

UPDATE creature_types SET name = CASE code
 WHEN 'aberration' THEN 'Aberración'
 WHEN 'beast' THEN 'Bestia'
 WHEN 'celestial' THEN 'Celestial'
 WHEN 'construct' THEN 'Constructo'
 WHEN 'dragon' THEN 'Dragón'
 WHEN 'elemental' THEN 'Elemental'
 WHEN 'fey' THEN 'Feérico'
 WHEN 'fiend' THEN 'Infernal'
 WHEN 'giant' THEN 'Gigante'
 WHEN 'humanoid' THEN 'Humanoide'
 WHEN 'monstrosity' THEN 'Monstruosidad'
 WHEN 'ooze' THEN 'Cieno'
 WHEN 'plant' THEN 'Planta'
 WHEN 'swarm_of_tiny_beasts' THEN 'Enjambre de bestias diminutas'
 WHEN 'undead' THEN 'No muerto'
 ELSE name END
WHERE code IN ('aberration','beast','celestial','construct','dragon','elemental','fey','fiend','giant','humanoid','monstrosity','ooze','plant','swarm_of_tiny_beasts','undead');

-- Consolidated from 026_class_subclass_text_lengths.sql
ALTER TABLE classes
 MODIFY COLUMN short_description TEXT NULL,
 MODIFY COLUMN hit_die_text TEXT NULL,
 MODIFY COLUMN primary_ability_text TEXT NULL,
 MODIFY COLUMN saving_throw_proficiencies_text TEXT NULL,
 MODIFY COLUMN armor_proficiencies_text TEXT NULL,
 MODIFY COLUMN weapon_proficiencies_text TEXT NULL,
 MODIFY COLUMN tool_proficiencies_text TEXT NULL,
 MODIFY COLUMN skill_proficiencies_text TEXT NULL;

ALTER TABLE subclasses
 MODIFY COLUMN short_description TEXT NULL,
 MODIFY COLUMN subclass_type_text TEXT NULL;

-- Consolidated from 034_action_custom_metadata.sql
ALTER TABLE actions
  ADD COLUMN IF NOT EXISTS custom_identifier VARCHAR(120) NULL AFTER created_by_user_id,
  ADD COLUMN IF NOT EXISTS custom_tag VARCHAR(80) NULL AFTER custom_identifier,
  ADD INDEX IF NOT EXISTS idx_actions_custom_identifier (custom_identifier),
  ADD INDEX IF NOT EXISTS idx_actions_custom_tag (custom_tag);

-- Consolidated lookup labels from 025_spanish_item_lookup_and_magic_item_links.sql
UPDATE item_types SET name = CASE code
 WHEN 'adventuring_gear' THEN 'Equipo de aventura'
 WHEN 'ammunition' THEN 'Munición'
 WHEN 'armor' THEN 'Armadura'
 WHEN 'explosive' THEN 'Explosivo'
 WHEN 'poison' THEN 'Veneno'
 WHEN 'potion' THEN 'Poción'
 WHEN 'quest_item' THEN 'Objeto de misión'
 WHEN 'ring' THEN 'Anillo'
 WHEN 'rod' THEN 'Vara'
 WHEN 'scroll' THEN 'Pergamino'
 WHEN 'shield' THEN 'Escudo'
 WHEN 'staff' THEN 'Bastón'
 WHEN 'tool' THEN 'Herramienta'
 WHEN 'treasure' THEN 'Tesoro'
 WHEN 'wand' THEN 'Varita'
 WHEN 'weapon' THEN 'Arma'
 WHEN 'wondrous_item' THEN 'Objeto maravilloso'
 ELSE name END
WHERE code IN ('adventuring_gear','ammunition','armor','explosive','poison','potion','quest_item','ring','rod','scroll','shield','staff','tool','treasure','wand','weapon','wondrous_item');

UPDATE item_rarities SET name = CASE code
 WHEN 'common' THEN 'Común'
 WHEN 'uncommon' THEN 'Poco común'
 WHEN 'rare' THEN 'Raro'
 WHEN 'very_rare' THEN 'Muy raro'
 WHEN 'legendary' THEN 'Legendario'
 WHEN 'artifact' THEN 'Artefacto'
 WHEN 'unknown' THEN 'Desconocido'
 ELSE name END
WHERE code IN ('common','uncommon','rare','very_rare','legendary','artifact','unknown');
