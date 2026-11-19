import { pool } from '../src/db/pool.js';

async function migrate() {
  console.log('--- RUNNING MIGRATION 010: STOCK OPERATIONS ---');

  console.log('1. Modifying stock_documents type enum to include ADJUSTMENT and TRANSFER...');
  await pool.execute("ALTER TABLE stock_documents MODIFY COLUMN type ENUM('RECEIPT','SALE','ADJUSTMENT','TRANSFER') NOT NULL");

  console.log('2. Checking and adding destination_branch_id...');
  const [cols] = await pool.execute("SHOW COLUMNS FROM stock_documents LIKE 'destination_branch_id'");
  if (!cols.length) {
    await pool.execute("ALTER TABLE stock_documents ADD COLUMN destination_branch_id INT UNSIGNED NULL AFTER branch_id");
    await pool.execute("ALTER TABLE stock_documents ADD CONSTRAINT fk_stock_docs_dest_branch FOREIGN KEY (organization_id, destination_branch_id) REFERENCES branches(organization_id, id)");
    console.log('   -> destination_branch_id added with foreign key.');
  } else {
    console.log('   -> destination_branch_id already exists.');
  }

  console.log('3. Updating stock_document_items check constraint (quantity >= 0)...');
  try {
    await pool.execute("ALTER TABLE stock_document_items DROP CHECK stock_document_items_chk_1");
  } catch(e) {
    console.log('   -> Drop check constraint notice:', e.message);
  }
  try {
    await pool.execute("ALTER TABLE stock_document_items ADD CONSTRAINT stock_document_items_chk_1 CHECK (quantity >= 0)");
    console.log('   -> Constraint stock_document_items_chk_1 updated.');
  } catch(e) {
    console.log('   -> Add constraint notice:', e.message);
  }

  console.log('4. Checking and adding stocktake adjustment columns to stock_document_items...');
  const [itemCols] = await pool.execute("SHOW COLUMNS FROM stock_document_items LIKE 'system_quantity'");
  if (!itemCols.length) {
    await pool.execute("ALTER TABLE stock_document_items ADD COLUMN system_quantity INT NULL AFTER quantity, ADD COLUMN actual_quantity INT NULL AFTER system_quantity, ADD COLUMN variance INT NULL AFTER actual_quantity");
    console.log('   -> system_quantity, actual_quantity, variance added.');
  } else {
    console.log('   -> system_quantity already exists.');
  }

  console.log('--- MIGRATION 010 COMPLETED SUCCESSFULLY ---');
  await pool.end();
}

migrate().catch(async err => {
  console.error('Migration failed:', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
