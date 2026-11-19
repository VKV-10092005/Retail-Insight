SET @bio_column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'bio'
);
SET @bio_column_sql = IF(
  @bio_column_exists = 0,
  'ALTER TABLE users ADD COLUMN bio VARCHAR(500) NULL',
  'SELECT 1'
);
PREPARE bio_column_stmt FROM @bio_column_sql;
EXECUTE bio_column_stmt;
DEALLOCATE PREPARE bio_column_stmt;
