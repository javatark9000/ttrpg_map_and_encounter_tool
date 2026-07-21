USE dnd_manager;

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
