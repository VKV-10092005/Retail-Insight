ALTER TABLE branches
 ADD COLUMN bank_bin VARCHAR(12) NULL,
 ADD COLUMN bank_code VARCHAR(20) NULL,
 ADD COLUMN bank_account_number VARCHAR(40) NULL,
 ADD COLUMN bank_account_name VARCHAR(120) NULL,
 ADD COLUMN static_qr_url VARCHAR(1000) NULL;

ALTER TABLE stock_documents MODIFY COLUMN payment_status ENUM('PAID','PENDING','WAITING_PAYMENT','FAILED') NULL;
ALTER TABLE sale_payments MODIFY COLUMN status ENUM('PAID','PENDING','WAITING_PAYMENT','FAILED') NOT NULL;
UPDATE stock_documents SET payment_status='WAITING_PAYMENT' WHERE payment_status='PENDING';
UPDATE sale_payments SET status='WAITING_PAYMENT' WHERE status='PENDING';
ALTER TABLE stock_documents MODIFY COLUMN payment_status ENUM('PAID','WAITING_PAYMENT','FAILED') NULL;
ALTER TABLE sale_payments MODIFY COLUMN status ENUM('PAID','WAITING_PAYMENT','FAILED') NOT NULL;
ALTER TABLE sale_payments ADD COLUMN confirmed_by INT UNSIGNED NULL,
 ADD COLUMN confirmed_at TIMESTAMP NULL DEFAULT NULL,
 ADD CONSTRAINT fk_sale_payment_confirmer FOREIGN KEY (organization_id,confirmed_by) REFERENCES users(organization_id,id);
