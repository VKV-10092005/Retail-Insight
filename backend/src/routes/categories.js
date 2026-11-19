import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { asyncRoute, HttpError } from '../utils/http.js';
import { positiveId } from '../business/common.js';
import { getBranchCatalogMode, resolveProductWriteTarget } from '../business/product-catalog.js';

const router = Router();

// GET /api/v1/categories
router.get('/', asyncRoute(async (req, res) => {
  const query = z.object({ branch_id: positiveId.optional() }).parse(req.query);
  let branchId = query.branch_id;
  let branchMode = null;

  if (!branchId && req.user.role !== 'OWNER') {
    const [assignments] = await pool.execute(
      'SELECT branch_id FROM user_branch_roles WHERE organization_id = ? AND user_id = ? ORDER BY branch_id',
      [req.organizationId, req.user.id]
    );
    if (assignments.length === 1) {
      branchId = Number(assignments[0].branch_id);
    } else if (assignments.length > 1) {
      throw new HttpError(400, 'Chọn chi nhánh để xem danh mục');
    }
  }

  let sql = 'SELECT id, name, organization_id, branch_id FROM categories WHERE organization_id = ?';
  const values = [req.organizationId];

  if (branchId) {
    const branch = await getBranchCatalogMode(req.user, branchId);
    branchMode = branch.catalog_mode;
    if (branchMode === 'INDEPENDENT') {
      sql += ' AND branch_id = ?';
      values.push(branch.id);
    } else {
      sql += ' AND (branch_id IS NULL OR branch_id = ?)';
      values.push(branch.id);
    }
  }

  let productScope = '';
  if (branchId) {
    if (branchMode === 'INDEPENDENT') {
      productScope = ' AND (p.branch_id = ? OR EXISTS(SELECT 1 FROM inventory_balances i WHERE i.organization_id = p.organization_id AND i.product_id = p.id AND i.branch_id = ?))';
      values.push(branchId, branchId);
    } else {
      productScope = ' AND (p.branch_id IS NULL OR p.branch_id = ?)';
      values.push(branchId);
    }
  }

  const [rows] = await pool.execute(
    `SELECT c.id, c.name, COUNT(p.id) AS product_count FROM (${sql}) c LEFT JOIN products p ON p.organization_id = c.organization_id AND p.category_id = c.id${productScope} GROUP BY c.id, c.name, c.organization_id, c.branch_id ORDER BY c.name ASC`,
    values
  );

  res.json({ items: rows });
}));

// POST /api/v1/categories
router.post('/', asyncRoute(async (req, res) => {
  const rawName = req.body?.name;
  if (rawName == null || typeof rawName !== 'string' || !rawName.trim()) {
    throw new HttpError(400, 'Vui lòng nhập tên danh mục.');
  }

  const name = rawName.trim();
  if (name.length > 120) {
    throw new HttpError(400, 'Tên danh mục không được vượt quá 120 ký tự.');
  }

  if (!['OWNER', 'MANAGER', 'INVENTORY'].includes(req.user?.role)) {
    throw new HttpError(403, 'Không có quyền tạo danh mục');
  }

  // Chống trùng tên trong cùng cửa hàng (organization_id) không phân biệt hoa thường
  const [existing] = await pool.execute(
    'SELECT id, name FROM categories WHERE organization_id = ? AND LOWER(TRIM(name)) = LOWER(?) LIMIT 1',
    [req.organizationId, name]
  );
  if (existing.length > 0) {
    throw new HttpError(409, 'Danh mục này đã tồn tại trong cửa hàng.');
  }

  let branchId = null;
  try {
    branchId = await resolveProductWriteTarget(req, req.body?.branch_id);
  } catch {
    branchId = req.body?.branch_id ? Number(req.body.branch_id) : null;
  }

  const [r] = await pool.execute(
    'INSERT INTO categories (organization_id, branch_id, name) VALUES (?, ?, ?)',
    [req.organizationId, branchId, name]
  );

  res.status(201).json({
    id: r.insertId,
    name,
    branch_id: branchId
  });
}));

export default router;
