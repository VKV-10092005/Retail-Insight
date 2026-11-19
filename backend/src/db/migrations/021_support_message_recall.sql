ALTER TABLE support_messages
 ADD COLUMN is_recalled TINYINT(1) NOT NULL DEFAULT 0 AFTER content;
