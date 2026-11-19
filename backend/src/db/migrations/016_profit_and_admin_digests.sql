ALTER TABLE inventory_balances
 ADD COLUMN average_cost DECIMAL(16,2) NOT NULL DEFAULT 0;

UPDATE inventory_balances i
 JOIN products p ON p.organization_id=i.organization_id AND p.id=i.product_id
 SET i.average_cost=COALESCE(p.cost_price,0);

ALTER TABLE stock_document_items
 ADD COLUMN unit_cost DECIMAL(16,2) NULL;

ALTER TABLE branches MODIFY COLUMN static_qr_url MEDIUMTEXT NULL;

CREATE TABLE IF NOT EXISTS platform_notification_digests (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id INT UNSIGNED NOT NULL,
 digest_type ENUM('DAILY','MONTHLY') NOT NULL,
 period_key VARCHAR(10) NOT NULL,
 title VARCHAR(180) NOT NULL,
 body JSON NOT NULL,
 read_at TIMESTAMP NULL DEFAULT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY platform_digest_user_period (user_id,digest_type,period_key),
 INDEX idx_platform_digest_user (user_id,created_at),
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
