ALTER TABLE branches
  ADD COLUMN catalog_mode ENUM('SHARED','INDEPENDENT') NOT NULL DEFAULT 'SHARED' AFTER name;

ALTER TABLE categories
  ADD COLUMN branch_id INT UNSIGNED NULL AFTER organization_id,
  ADD COLUMN branch_id_scope INT UNSIGNED GENERATED ALWAYS AS (COALESCE(branch_id,0)) STORED,
  DROP INDEX category_name,
  ADD UNIQUE KEY category_name_scope (organization_id,branch_id_scope,name),
  ADD KEY category_branch (organization_id,branch_id),
  ADD CONSTRAINT fk_categories_branch FOREIGN KEY (organization_id,branch_id) REFERENCES branches(organization_id,id);

ALTER TABLE products
  ADD COLUMN branch_id INT UNSIGNED NULL AFTER organization_id,
  ADD COLUMN branch_id_scope INT UNSIGNED GENERATED ALWAYS AS (COALESCE(branch_id,0)) STORED,
  DROP INDEX product_sku,
  ADD UNIQUE KEY product_sku_scope (organization_id,branch_id_scope,sku),
  ADD KEY product_branch (organization_id,branch_id),
  ADD CONSTRAINT fk_products_branch FOREIGN KEY (organization_id,branch_id) REFERENCES branches(organization_id,id);
