SET @has_lock_reason = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='retail_app' AND TABLE_NAME='users' AND COLUMN_NAME='lock_reason');
SET @ddl = IF(@has_lock_reason=1,'ALTER TABLE users MODIFY COLUMN lock_reason VARCHAR(500) NULL','SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
