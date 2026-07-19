USE dnd_manager;

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
