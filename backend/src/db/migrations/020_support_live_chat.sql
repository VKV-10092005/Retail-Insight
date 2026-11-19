CREATE TABLE IF NOT EXISTS support_threads (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 organization_id INT UNSIGNED NOT NULL,
 user_id INT UNSIGNED NOT NULL,
 subject VARCHAR(200) NOT NULL DEFAULT 'Hỗ trợ vận hành',
 status ENUM('OPEN','RESOLVED') NOT NULL DEFAULT 'OPEN',
 unread_admin_count INT UNSIGNED NOT NULL DEFAULT 0,
 unread_user_count INT UNSIGNED NOT NULL DEFAULT 0,
 last_message_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_support_thread_user (user_id),
 INDEX idx_support_threads_activity (last_message_at,id),
 INDEX idx_support_threads_org (organization_id,last_message_at),
 CONSTRAINT fk_support_threads_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 CONSTRAINT fk_support_threads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_messages (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 thread_id BIGINT UNSIGNED NOT NULL,
 sender_user_id INT UNSIGNED NOT NULL,
 sender_role ENUM('USER','ADMIN') NOT NULL,
 content TEXT NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX idx_support_messages_thread (thread_id,id),
 CONSTRAINT fk_support_messages_thread FOREIGN KEY (thread_id) REFERENCES support_threads(id) ON DELETE CASCADE,
 CONSTRAINT fk_support_messages_sender FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 recipient_user_id INT UNSIGNED NOT NULL,
 organization_id INT UNSIGNED NULL,
 type VARCHAR(40) NOT NULL,
 title VARCHAR(200) NOT NULL,
 content VARCHAR(1000) NOT NULL,
 metadata JSON NULL,
 read_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX idx_notifications_recipient (recipient_user_id,read_at,created_at),
 INDEX idx_notifications_type (type,created_at),
 CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT fk_notifications_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
