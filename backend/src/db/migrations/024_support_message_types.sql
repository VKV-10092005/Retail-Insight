ALTER TABLE support_messages
 ADD COLUMN message_type VARCHAR(40) NOT NULL DEFAULT 'TEXT' AFTER sender_role,
 ADD INDEX idx_support_messages_type (thread_id,message_type,id);
