import 'dotenv/config';
import { pool, verifyDatabase } from '../src/db/pool.js';

const organizationId = 45;
const branchId = 48;
let connection;
try {
  await verifyDatabase();
  connection = await pool.getConnection();
  await connection.beginTransaction();
  const [unmatched] = await connection.execute(`
    SELECT COUNT(*) count
    FROM stock_document_items i
    JOIN stock_documents d ON d.organization_id=i.organization_id AND d.id=i.document_id
    WHERE d.organization_id=? AND d.branch_id=? AND d.type IN ('RECEIPT','SALE')
      AND (d.type='RECEIPT' OR d.type='SALE')
      AND i.quantity <= 0`, [organizationId, branchId]);
  if (Number(unmatched[0].count)) throw new Error('Invalid nonpositive document item quantity');

  const [negative] = await connection.execute(`
    SELECT i.product_id,
      SUM(CASE WHEN d.type='RECEIPT' THEN i.quantity ELSE -i.quantity END) quantity
    FROM stock_document_items i
    JOIN stock_documents d ON d.organization_id=i.organization_id AND d.id=i.document_id
    WHERE d.organization_id=? AND d.branch_id=? AND d.type IN ('RECEIPT','SALE')
    GROUP BY i.product_id HAVING quantity < 0`, [organizationId, branchId]);
  if (negative.length) throw new Error(`Negative derived stock for product(s): ${negative.map(row => row.product_id).join(',')}`);

  const [write] = await connection.execute(`
    INSERT INTO inventory_balances(organization_id,branch_id,product_id,quantity)
    SELECT ?,?,i.product_id,
      SUM(CASE WHEN d.type='RECEIPT' THEN i.quantity WHEN d.type='SALE' THEN -i.quantity ELSE 0 END)
    FROM stock_document_items i
    JOIN stock_documents d ON d.organization_id=i.organization_id AND d.id=i.document_id
    WHERE d.organization_id=? AND d.branch_id=? AND d.type IN ('RECEIPT','SALE')
    GROUP BY i.product_id
    ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)`,
    [organizationId, branchId, organizationId, branchId]);
  const [check] = await connection.execute(`
    SELECT COUNT(*) so_sp, COALESCE(SUM(quantity),0) tong_ton,
      SUM(quantity=0) so_sp_het_hang
    FROM inventory_balances WHERE organization_id=? AND branch_id=?`, [organizationId, branchId]);
  const [docs] = await connection.execute(`
    SELECT d.id,d.type,d.payment_status,d.created_at,COUNT(i.id) item_count,
      COALESCE(SUM(i.quantity),0) units
    FROM stock_documents d
    LEFT JOIN stock_document_items i ON i.organization_id=d.organization_id AND i.document_id=d.id
    WHERE d.organization_id=? AND d.branch_id=? AND d.type IN ('RECEIPT','SALE')
    GROUP BY d.id ORDER BY d.id`, [organizationId, branchId]);
  if (Number(check[0].so_sp) !== 120 || Number(check[0].tong_ton) <= 4000) {
    throw new Error(`Unexpected post-restore result: ${JSON.stringify(check[0])}`);
  }
  await connection.commit();
  console.log('RESTORE_COMMITTED', JSON.stringify({ rowsWritten: write.affectedRows, documents: docs }));
  console.log('VERIFICATION_SQL: SELECT COUNT(*) AS so_sp, SUM(quantity) AS tong_ton FROM inventory_balances WHERE organization_id = 45 AND branch_id = 48;');
  console.log('MYSQL_RESULT', JSON.stringify(check[0]));
} catch (error) {
  if (connection) await connection.rollback();
  console.error('RESTORE_ROLLED_BACK', error.message);
  process.exitCode = 1;
} finally {
  connection?.release();
  await pool.end();
}
