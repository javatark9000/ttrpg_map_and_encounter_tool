USE dnd_manager;

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
