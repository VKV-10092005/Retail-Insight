-- Migration 009: AI Security Enhancements (User Locking, Audit Severity & Admin Notifications)

-- 1. Bổ sung trường khóa tài khoản tạm thời vào bảng users
ALTER TABLE users 
  ADD COLUMN locked_until DATETIME NULL AFTER status,
  ADD COLUMN lock_reason VARCHAR(255) NULL AFTER locked_until,
  ADD INDEX idx_users_locked (locked_until);

-- 2. Bổ sung các trường chi tiết vào bảng audit_logs
ALTER TABLE audit_logs
  ADD COLUMN username VARCHAR(120) NULL AFTER user_id,
  ADD COLUMN role VARCHAR(32) NULL AFTER username,
  ADD COLUMN branch_id INT UNSIGNED NULL AFTER organization_id,
  ADD COLUMN severity ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM' AFTER event_type,
  ADD COLUMN request_snippet VARCHAR(500) NULL AFTER details,
  ADD COLUMN unlocked_by INT UNSIGNED NULL AFTER user_agent,
  ADD COLUMN unlocked_at DATETIME NULL AFTER unlocked_by,
  ADD COLUMN unlock_reason VARCHAR(255) NULL AFTER unlocked_at,
  MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'BLOCKED',
  ADD INDEX idx_audit_severity (severity),
  ADD INDEX idx_audit_status (status);

-- 3. Tạo bảng thông báo an ninh cho Platform Admin
CREATE TABLE IF NOT EXISTS security_notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  username VARCHAR(120) NULL,
  organization_id INT UNSIGNED NULL,
  audit_log_id BIGINT NULL,
  event_type VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  severity ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'HIGH',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sec_notif_unread (is_read, created_at),
  INDEX idx_sec_notif_severity (severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
