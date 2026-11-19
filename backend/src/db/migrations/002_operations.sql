CREATE TABLE IF NOT EXISTS categories (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, organization_id INT UNSIGNED NOT NULL, name VARCHAR(120) NOT NULL,
 UNIQUE KEY category_tenant(organization_id,id), UNIQUE KEY category_name(organization_id,name),
 FOREIGN KEY(organization_id) REFERENCES organizations(id)
);
CREATE TABLE IF NOT EXISTS products (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, organization_id INT UNSIGNED NOT NULL, category_id INT UNSIGNED NULL,
 sku VARCHAR(100) NOT NULL, name VARCHAR(180) NOT NULL, sale_price DECIMAL(16,2) NOT NULL,
 cost_price DECIMAL(16,2) NULL, attributes JSON NULL, status ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY product_tenant(organization_id,id), UNIQUE KEY product_sku(organization_id,sku),
 FOREIGN KEY(organization_id) REFERENCES organizations(id),
 FOREIGN KEY(organization_id,category_id) REFERENCES categories(organization_id,id),
 CHECK(sale_price>=0), CHECK(cost_price IS NULL OR cost_price>=0)
);
CREATE TABLE IF NOT EXISTS inventory_balances (
 organization_id INT UNSIGNED NOT NULL, branch_id INT UNSIGNED NOT NULL, product_id INT UNSIGNED NOT NULL,
 quantity INT NOT NULL DEFAULT 0, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,branch_id,product_id),
 FOREIGN KEY(organization_id,branch_id) REFERENCES branches(organization_id,id),
 FOREIGN KEY(organization_id,product_id) REFERENCES products(organization_id,id), CHECK(quantity>=0)
);
CREATE TABLE IF NOT EXISTS stock_documents (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, organization_id INT UNSIGNED NOT NULL, branch_id INT UNSIGNED NOT NULL,
 type ENUM('RECEIPT','SALE') NOT NULL, request_key VARCHAR(80) NOT NULL, payload_hash CHAR(64) NOT NULL,
 performed_by INT UNSIGNED NOT NULL, total DECIMAL(16,2) NOT NULL, note VARCHAR(500) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY document_tenant(organization_id,id), UNIQUE KEY document_request(organization_id,type,request_key),
 INDEX document_period(organization_id,created_at,branch_id),
 FOREIGN KEY(organization_id,branch_id) REFERENCES branches(organization_id,id),
 FOREIGN KEY(organization_id,performed_by) REFERENCES users(organization_id,id), CHECK(total>=0)
);
CREATE TABLE IF NOT EXISTS stock_document_items (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, organization_id INT UNSIGNED NOT NULL, document_id BIGINT UNSIGNED NOT NULL,
 product_id INT UNSIGNED NOT NULL, sku VARCHAR(100) NOT NULL, product_name VARCHAR(180) NOT NULL,
 quantity INT NOT NULL, unit_price DECIMAL(16,2) NOT NULL,
 UNIQUE KEY document_product(document_id,product_id),
 FOREIGN KEY(organization_id,document_id) REFERENCES stock_documents(organization_id,id),
 FOREIGN KEY(organization_id,product_id) REFERENCES products(organization_id,id), CHECK(quantity>0), CHECK(unit_price>=0)
);
CREATE TABLE IF NOT EXISTS inventory_movements (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, organization_id INT UNSIGNED NOT NULL, branch_id INT UNSIGNED NOT NULL,
 product_id INT UNSIGNED NOT NULL, document_id BIGINT UNSIGNED NOT NULL, quantity_delta INT NOT NULL,
 balance_after INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX movement_period(organization_id,branch_id,created_at),
 FOREIGN KEY(organization_id,branch_id) REFERENCES branches(organization_id,id),
 FOREIGN KEY(organization_id,product_id) REFERENCES products(organization_id,id),
 FOREIGN KEY(organization_id,document_id) REFERENCES stock_documents(organization_id,id), CHECK(balance_after>=0)
);
CREATE TABLE IF NOT EXISTS organization_dataset_access (
 organization_id INT UNSIGNED NOT NULL, dataset_id VARCHAR(80) NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(organization_id,dataset_id),
 FOREIGN KEY(organization_id) REFERENCES organizations(id)
);
