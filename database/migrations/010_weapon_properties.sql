USE dnd_manager;

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
