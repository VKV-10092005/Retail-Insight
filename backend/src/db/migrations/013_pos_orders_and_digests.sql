-- Expand operational sales lifecycle without rewriting existing documents.
ALTER TABLE stock_documents
 ADD COLUMN order_status ENUM('OPEN','COMPLETED','CANCELLED') NOT NULL DEFAULT 'COMPLETED',
 ADD COLUMN client_created_at DATETIME(3) NULL,
 ADD COLUMN completed_at TIMESTAMP NULL DEFAULT NULL,
 ADD INDEX idx_sale_open (organization_id,branch_id,type,order_status,created_at);

CREATE TABLE IF NOT EXISTS notification_digests (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 organization_id INT UNSIGNED NOT NULL,
 user_id INT UNSIGNED NOT NULL,
 branch_id INT UNSIGNED NULL,
 digest_type ENUM('DAILY','MONTHLY') NOT NULL,
 period_key VARCHAR(10) NOT NULL,
 title VARCHAR(180) NOT NULL,
 body JSON NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY digest_user_period (organization_id,user_id,digest_type,period_key,branch_id),
 INDEX idx_digest_user (organization_id,user_id,created_at),
 FOREIGN KEY (organization_id,user_id) REFERENCES users(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY (organization_id,branch_id) REFERENCES branches(organization_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
