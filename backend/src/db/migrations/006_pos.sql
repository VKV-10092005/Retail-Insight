ALTER TABLE branches
 ADD COLUMN pos_layout_mode ENUM('OWNER_MODE','CASHIER_MODE') NOT NULL DEFAULT 'OWNER_MODE',
 ADD COLUMN manager_can_change_pos_mode TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS customers (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 organization_id INT UNSIGNED NOT NULL,
 name VARCHAR(160) NOT NULL,
 phone VARCHAR(30) NULL,
 email VARCHAR(254) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY customer_tenant (organization_id,id),
 INDEX customer_search (organization_id,phone,name),
 FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

ALTER TABLE stock_documents
 ADD COLUMN customer_id BIGINT UNSIGNED NULL,
 ADD COLUMN subtotal DECIMAL(16,2) NOT NULL DEFAULT 0,
 ADD COLUMN item_discount_total DECIMAL(16,2) NOT NULL DEFAULT 0,
 ADD COLUMN order_discount DECIMAL(16,2) NOT NULL DEFAULT 0,
 ADD COLUMN payment_method ENUM('CASH','BANK_TRANSFER') NULL,
 ADD COLUMN payment_status ENUM('PAID','PENDING') NULL,
 ADD COLUMN cash_received DECIMAL(16,2) NULL,
 ADD COLUMN change_due DECIMAL(16,2) NULL,
 ADD CONSTRAINT fk_document_customer FOREIGN KEY (organization_id,customer_id) REFERENCES customers(organization_id,id);

ALTER TABLE stock_document_items
 ADD COLUMN discount_type ENUM('PERCENT','FIXED') NULL,
 ADD COLUMN discount_value DECIMAL(16,2) NOT NULL DEFAULT 0,
 ADD COLUMN discount_amount DECIMAL(16,2) NOT NULL DEFAULT 0,
 ADD COLUMN line_total DECIMAL(16,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS sale_payments (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 organization_id INT UNSIGNED NOT NULL,
 document_id BIGINT UNSIGNED NOT NULL,
 method ENUM('CASH','BANK_TRANSFER') NOT NULL,
 status ENUM('PAID','PENDING') NOT NULL,
 amount DECIMAL(16,2) NOT NULL,
 received_amount DECIMAL(16,2) NULL,
 change_amount DECIMAL(16,2) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY payment_document (organization_id,document_id),
 FOREIGN KEY (organization_id,document_id) REFERENCES stock_documents(organization_id,id),
 CHECK (amount>=0),
 CHECK (received_amount IS NULL OR received_amount>=0),
 CHECK (change_amount IS NULL OR change_amount>=0)
);
