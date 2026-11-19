ALTER TABLE support_threads
 DROP FOREIGN KEY fk_support_threads_user,
 DROP INDEX uq_support_thread_user,
 ADD COLUMN thread_type ENUM('ADMIN_SUPPORT','INTERNAL_CHAT') NOT NULL DEFAULT 'ADMIN_SUPPORT' AFTER organization_id,
 ADD COLUMN recipient_user_id INT UNSIGNED NULL AFTER user_id,
 ADD COLUMN category ENUM('GENERAL','WEB_DESIGN') NOT NULL DEFAULT 'GENERAL' AFTER subject,
 ADD COLUMN recipient_user_key INT UNSIGNED NOT NULL DEFAULT 0,
 MODIFY COLUMN status ENUM('OPEN','IN_PROGRESS','RESOLVED','CLOSED') NOT NULL DEFAULT 'OPEN',
 ADD UNIQUE KEY uq_support_thread_conversation (organization_id,thread_type,user_id,recipient_user_key),
 ADD KEY idx_support_thread_user (user_id),
 ADD KEY idx_support_threads_recipient (recipient_user_id,last_message_at),
 ADD CONSTRAINT fk_support_threads_user_v2 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE support_threads
 ADD CONSTRAINT fk_support_threads_recipient FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE support_tickets
 ADD COLUMN support_thread_id BIGINT UNSIGNED NULL AFTER admin_note,
 ADD KEY idx_support_ticket_thread (support_thread_id),
 ADD CONSTRAINT fk_support_ticket_thread FOREIGN KEY (support_thread_id) REFERENCES support_threads(id) ON DELETE SET NULL;
