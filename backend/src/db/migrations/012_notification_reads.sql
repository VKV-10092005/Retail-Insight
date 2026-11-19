CREATE TABLE IF NOT EXISTS notification_reads (
 organization_id INT UNSIGNED NOT NULL,
 user_id INT UNSIGNED NOT NULL,
 notification_id VARCHAR(160) NOT NULL,
 read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (organization_id,user_id,notification_id),
 INDEX idx_notification_reads_user (organization_id,user_id,read_at),
 CONSTRAINT fk_notification_reads_user FOREIGN KEY (organization_id,user_id)
  REFERENCES users(organization_id,id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
