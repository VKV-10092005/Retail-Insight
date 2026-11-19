ALTER TABLE stock_documents
 ADD COLUMN return_status ENUM('NONE','PARTIAL_RETURNED','FULL_RETURNED') NOT NULL DEFAULT 'NONE',
 ADD COLUMN returned_amount DECIMAL(16,2) NOT NULL DEFAULT 0,
 ADD COLUMN returned_cost DECIMAL(16,2) NOT NULL DEFAULT 0,
 ADD COLUMN return_reason VARCHAR(255) NULL,
 ADD COLUMN returned_at DATETIME NULL;

ALTER TABLE stock_document_items
 ADD COLUMN returned_quantity DECIMAL(16,3) NOT NULL DEFAULT 0;

ALTER TABLE inventory_movements
 ADD COLUMN movement_type ENUM('RECEIPT','SALE','ADJUSTMENT','TRANSFER','RETURN') NULL;

UPDATE inventory_movements m
 JOIN stock_documents d ON d.organization_id=m.organization_id AND d.id=m.document_id
 SET m.movement_type=CASE d.type WHEN 'RECEIPT' THEN 'RECEIPT' WHEN 'SALE' THEN 'SALE' WHEN 'ADJUSTMENT' THEN 'ADJUSTMENT' WHEN 'TRANSFER' THEN 'TRANSFER' ELSE NULL END;

ALTER TABLE sale_payments
 DROP INDEX payment_document,
 DROP CHECK sale_payments_chk_1,
 MODIFY COLUMN status ENUM('PAID','PENDING','WAITING_PAYMENT','FAILED','REFUNDED') NOT NULL,
 ADD COLUMN payment_type ENUM('SALE','REFUND') NOT NULL DEFAULT 'SALE' AFTER method,
 ADD INDEX payment_document_type (organization_id,document_id,payment_type);
