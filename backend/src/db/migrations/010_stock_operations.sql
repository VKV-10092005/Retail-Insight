-- Migration 010: Stock Operations (Stocktake / Adjustment & Stock Transfer)
-- Multi-tenant compliant with organization_id foreign keys

-- 1. Mở rộng ENUM type trong stock_documents
ALTER TABLE stock_documents 
  MODIFY COLUMN type ENUM('RECEIPT','SALE','ADJUSTMENT','TRANSFER') NOT NULL;

-- 2. Thêm cột destination_branch_id cho các phiếu điều chuyển kho (TRANSFER)
ALTER TABLE stock_documents 
  ADD COLUMN destination_branch_id INT UNSIGNED NULL AFTER branch_id;

-- 3. Khóa ngoại đảm bảo chi nhánh đích cùng organization_id
ALTER TABLE stock_documents 
  ADD CONSTRAINT fk_stock_docs_dest_branch 
  FOREIGN KEY (organization_id, destination_branch_id) 
  REFERENCES branches(organization_id, id);

-- 4. Điều chỉnh CHECK constraint của quantity trong stock_document_items (cho phép >= 0 khi kiểm kê khớp 0 hoặc hết sạch hàng)
ALTER TABLE stock_document_items 
  DROP CHECK stock_document_items_chk_1;

ALTER TABLE stock_document_items 
  ADD CONSTRAINT stock_document_items_chk_1 CHECK (quantity >= 0);

-- 5. Thêm các cột phục vụ kiểm kê: tồn sổ sách, tồn thực tế và độ lệch
ALTER TABLE stock_document_items 
  ADD COLUMN system_quantity INT NULL AFTER quantity,
  ADD COLUMN actual_quantity INT NULL AFTER system_quantity,
  ADD COLUMN variance INT NULL AFTER actual_quantity;
