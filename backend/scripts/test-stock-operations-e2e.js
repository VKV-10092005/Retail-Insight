/**
 * E2E Test: Nghiệp vụ Kiểm kê kho (Stocktake / Adjustment) & Điều chuyển kho (Stock Transfer)
 * Tenant 45 · Branch 48 · Email: vovuong535@gmail.com
 *
 * Kiểm thử toàn diện 100% qua HTTP REST API và Database.
 * Tự động rollback dọn dẹp sạch sẽ toàn bộ sau khi test.
 *
 * Chạy: cd backend && node scripts/test-stock-operations-e2e.js
 */

import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { pool } from '../src/db/pool.js';
import { config } from '../src/config/env.js';

const ORG_ID = 45;
const BRANCH_ID = 48;
const OWNER_EMAIL = 'vovuong535@gmail.com';
const API_BASE = 'http://localhost:3000/api/v1';

const cleanup = {
  documentIds: [],
  sessionIds: [],
  temporaryBranchIds: []
};

function pass(msg) { console.log(`  ✅ PASS: ${msg}`); }
function fail(msg) { console.error(`  ❌ FAIL: ${msg}`); }
function info(msg) { console.log(`  ℹ️  ${msg}`); }
function section(msg) { console.log(`\n━━━ ${msg} ━━━`); }

async function apiRequest(endpoint, { method = 'GET', body, sessionCookie } = {}) {
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-Requested-With': 'retail-web'
  };
  if (sessionCookie) {
    headers['Cookie'] = `session=${sessionCookie}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return { status: res.status, ok: res.ok, data: json };
}

async function run() {
  console.log('\n============================================================');
  console.log('🔍 RETAIL INSIGHT – E2E TEST: KIỂM KÊ & ĐIỀU CHUYỂN KHO');
  console.log(`   Tenant ID: ${ORG_ID} | Branch ID: ${BRANCH_ID} | Email: ${OWNER_EMAIL}`);
  console.log('============================================================\n');

  let testPassed = 0;
  let testFailed = 0;

  function recordPass(msg) { pass(msg); testPassed++; }
  function recordFail(msg) { fail(msg); testFailed++; }

  // ─── BƯỚC 0: Xác thực và tạo Auth Session ──────────────────────────────────
  section('BƯỚC 0: Xác thực OWNER và tạo Auth Session');
  const [[owner]] = await pool.execute(
    "SELECT id, email, full_name, role, organization_id, status FROM users WHERE email=? AND organization_id=?",
    [OWNER_EMAIL, ORG_ID]
  );
  if (!owner || owner.status !== 'ACTIVE') {
    recordFail(`Không tìm thấy OWNER active ${OWNER_EMAIL}`);
    process.exit(1);
  }
  recordPass(`Xác thực OWNER: id=${owner.id}, role=${owner.role}, name="${owner.full_name}"`);

  const sessionId = randomUUID();
  await pool.execute(
    'INSERT INTO auth_sessions(id,organization_id,user_id,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 HOUR))',
    [sessionId, ORG_ID, owner.id]
  );
  cleanup.sessionIds.push(sessionId);

  const sessionToken = jwt.sign(
    {},
    config.secret,
    { algorithm: 'HS256', subject: String(owner.id), jwtid: sessionId, issuer: 'retail-app', audience: 'retail-web', expiresIn: '2h' }
  );
  recordPass(`Đã tạo phiên E2E: sessionId=${sessionId}`);

  // ─── BƯỚC 1: Lấy 3 sản phẩm kiểm thử ───────────────────────────────────────
  section('BƯỚC 1: Chọn sản phẩm để kiểm thử');
  const prodRes = await apiRequest(`/products?limit=5&branch_id=${BRANCH_ID}`, { sessionCookie: sessionToken });
  if (!prodRes.ok || !prodRes.data.items || prodRes.data.items.length < 3) {
    recordFail('Không tải được danh sách sản phẩm');
    process.exit(1);
  }
  const products = prodRes.data.items.slice(0, 3);
  recordPass(`Đã chọn 3 sản phẩm kiểm thử: ${products.map(p => p.sku).join(', ')}`);

  // Tạo số dư ban đầu: Nhập kho 10 cái cho sp1 để kiểm tra chênh lệch
  const initReceiptReqKey = `init-${Date.now()}-${randomUUID()}`;
  const initReceiptRes = await apiRequest('/receipts', {
    method: 'POST',
    body: {
      branch_id: BRANCH_ID,
      request_key: initReceiptReqKey,
      note: 'Dữ liệu tồn kho ban đầu để test kiểm kê',
      items: [
        { product_id: products[0].id, quantity: 10, unit_price: Number(products[0].cost_price || 10000) }
      ]
    },
    sessionCookie: sessionToken
  });
  if (!initReceiptRes.ok) {
    recordFail(`Lỗi tạo tồn kho ban đầu: ${JSON.stringify(initReceiptRes.data)}`);
    process.exit(1);
  }
  cleanup.documentIds.push(initReceiptRes.data.id);
  info(`Đã chuẩn bị tồn ban đầu: sp#${products[0].id} = 10 cái`);

  // ─── BƯỚC 2: Kiểm kê TĂNG & KHỚP tồn kho (Actual > System & Actual === System) ─
  section('BƯỚC 2: Kiểm kê điều chỉnh TĂNG & KHỚP tồn kho');
  // Sp1: System=10 -> Actual=12 (Variance = +2: thừa 2 sp)
  // Sp2: System=0  -> Actual=5  (Variance = +5: thừa 5 sp)
  // Sp3: System=0  -> Actual=0  (Variance = 0: khớp số lượng)
  const adjReqKey1 = `adj-${Date.now()}-${randomUUID()}`;
  const adjRes1 = await apiRequest('/adjustments', {
    method: 'POST',
    body: {
      branch_id: BRANCH_ID,
      request_key: adjReqKey1,
      note: 'Phiếu kiểm kê định kỳ đợt 1',
      items: [
        { product_id: products[0].id, actual_quantity: 12, reason: 'Kiểm đếm thực tế phát hiện thừa 2 chai' },
        { product_id: products[1].id, actual_quantity: 5, reason: 'Hàng quà tặng kèm chưa nhập sổ' },
        { product_id: products[2].id, actual_quantity: 0, reason: 'Đã kiểm đếm, tồn kho khớp 0' }
      ]
    },
    sessionCookie: sessionToken
  });

  if (!adjRes1.ok || !adjRes1.data.id) {
    recordFail(`Tạo phiếu kiểm kê 1 thất bại: ${adjRes1.status} - ${JSON.stringify(adjRes1.data)}`);
    await rollbackAll();
    process.exit(1);
  }

  const adjDocId1 = adjRes1.data.id;
  cleanup.documentIds.push(adjDocId1);
  recordPass(`Đã tạo thành công Phiếu kiểm kê #${adjDocId1} (Loại: ${adjRes1.data.type})`);

  // Kiểm tra chi tiết phiếu kiểm kê qua API
  const adjDetailRes1 = await apiRequest(`/stock-operations/${adjDocId1}`, { sessionCookie: sessionToken });
  if (adjDetailRes1.ok && adjDetailRes1.data.items?.length === 3) {
    const item1 = adjDetailRes1.data.items.find(i => i.product_id === products[0].id);
    const item2 = adjDetailRes1.data.items.find(i => i.product_id === products[1].id);
    const item3 = adjDetailRes1.data.items.find(i => i.product_id === products[2].id);

    if (item1.system_quantity === 10 && item1.actual_quantity === 12 && item1.variance === 2) {
      recordPass(`Sp 1 ghi nhận đúng: Sổ sách=10, Thực tế=12, Chênh lệch=+2`);
    } else {
      recordFail(`Sp 1 ghi nhận sai số liệu kiểm kê: ${JSON.stringify(item1)}`);
    }

    if (item2.system_quantity === 0 && item2.actual_quantity === 5 && item2.variance === 5) {
      recordPass(`Sp 2 ghi nhận đúng: Sổ sách=0, Thực tế=5, Chênh lệch=+5`);
    } else {
      recordFail(`Sp 2 ghi nhận sai số liệu kiểm kê: ${JSON.stringify(item2)}`);
    }

    if (item3.system_quantity === 0 && item3.actual_quantity === 0 && item3.variance === 0) {
      recordPass(`Sp 3 ghi nhận đúng trường hợp khớp (Variance=0)`);
    } else {
      recordFail(`Sp 3 ghi nhận sai trường hợp khớp: ${JSON.stringify(item3)}`);
    }
  } else {
    recordFail(`Lỗi tra cứu chi tiết phiếu kiểm kê: ${JSON.stringify(adjDetailRes1.data)}`);
  }

  // Xác minh tồn kho sau kiểm kê đợt 1
  const invRes1 = await apiRequest(`/inventory?branch_id=${BRANCH_ID}&limit=10`, { sessionCookie: sessionToken });
  if (invRes1.ok && invRes1.data.items) {
    const inv1 = invRes1.data.items.find(i => i.product_id === products[0].id);
    const inv2 = invRes1.data.items.find(i => i.product_id === products[1].id);
    if (inv1?.quantity === 12 && inv2?.quantity === 5) {
      recordPass(`Tồn kho thực tế cập nhật chính xác tuyệt đối: Sp1 = 12, Sp2 = 5`);
    } else {
      recordFail(`Tồn kho sau kiểm kê sai: Sp1=${inv1?.quantity}, Sp2=${inv2?.quantity}`);
    }
  }

  // ─── BƯỚC 3: Kiểm kê GIẢM tồn kho (Actual < System / Thiếu hụt hàng) ─────────
  section('BƯỚC 3: Kiểm kê điều chỉnh GIẢM tồn kho (Hao hụt / Thiếu hàng)');
  // Sp1 đang có 12 cái -> Đếm lại thực tế chỉ còn 9 cái (Variance = -3: mất hoặc hỏng 3 chai)
  const adjReqKey2 = `adj-sub-${Date.now()}-${randomUUID()}`;
  const adjPayload2 = {
    branch_id: BRANCH_ID,
    request_key: adjReqKey2,
    note: 'Kiểm kê phát hiện hư hỏng bể vỡ',
    items: [
      { product_id: products[0].id, actual_quantity: 9, reason: 'Bể vỡ trong quá trình sắp xếp quầy kệ' }
    ]
  };
  const adjRes2 = await apiRequest('/adjustments', {
    method: 'POST',
    body: adjPayload2,
    sessionCookie: sessionToken
  });

  if (!adjRes2.ok || !adjRes2.data.id) {
    recordFail(`Kiểm kê giảm thất bại: ${adjRes2.status} - ${JSON.stringify(adjRes2.data)}`);
  } else {
    const adjDocId2 = adjRes2.data.id;
    cleanup.documentIds.push(adjDocId2);
    recordPass(`Đã tạo Phiếu kiểm kê giảm #${adjDocId2}`);

    const adjDetailRes2 = await apiRequest(`/stock-operations/${adjDocId2}`, { sessionCookie: sessionToken });
    const itm = adjDetailRes2.data.items?.[0];
    if (itm?.system_quantity === 12 && itm?.actual_quantity === 9 && itm?.variance === -3) {
      recordPass(`Ghi nhận chính xác hao hụt: Sổ sách=12, Thực tế=9, Chênh lệch=-3`);
    } else {
      recordFail(`Chi tiết hao hụt ghi nhận sai: ${JSON.stringify(itm)}`);
    }

    // Kiểm tra biến động kho (inventory_movements)
    const [[movRow]] = await pool.execute(
      "SELECT quantity_delta, balance_after FROM inventory_movements WHERE document_id=? AND product_id=?",
      [adjDocId2, products[0].id]
    );
    if (movRow?.quantity_delta === -3 && movRow?.balance_after === 9) {
      recordPass(`inventory_movements ghi nhận chính xác: delta = -3, balance_after = 9`);
    } else {
      recordFail(`inventory_movements sai: delta=${movRow?.quantity_delta}, after=${movRow?.balance_after}`);
    }
  }

  // ─── BƯỚC 4: Idempotency Replay cho Phiếu kiểm kê ──────────────────────────
  section('BƯỚC 4: Kiểm tra Idempotency Replay của Phiếu kiểm kê');
  const replayAdjRes = await apiRequest('/adjustments', {
    method: 'POST',
    body: adjPayload2,
    sessionCookie: sessionToken
  });
  if (replayAdjRes.ok && replayAdjRes.data.replayed === true) {
    recordPass(`Idempotency OK: Trả lại phiếu kiểm kê cũ với replayed=true`);
  } else {
    recordFail(`Idempotency kiểm kê thất bại: ${JSON.stringify(replayAdjRes.data)}`);
  }

  // ─── BƯỚC 5: Thiết lập Chi nhánh thứ 2 để kiểm thử Điều chuyển kho ─────────
  section('BƯỚC 5: Chuẩn bị Chi nhánh nhận để test Điều chuyển kho');
  const [branchesList] = await pool.execute(
    "SELECT id, name FROM branches WHERE organization_id=? AND status='ACTIVE'",
    [ORG_ID]
  );
  let destBranchId;
  if (branchesList.length >= 2) {
    const other = branchesList.find(b => b.id !== BRANCH_ID);
    destBranchId = other.id;
    info(`Sử dụng chi nhánh sẵn có: [${destBranchId}] "${other.name}"`);
  } else {
    const [newBranchRes] = await pool.execute(
      "INSERT INTO branches(organization_id, name, address, phone, status) VALUES (?, 'Kho trung tâm phụ E2E', '123 Đường Test, Q1', '0988776655', 'ACTIVE')",
      [ORG_ID]
    );
    destBranchId = newBranchRes.insertId;
    cleanup.temporaryBranchIds.push(destBranchId);
    info(`Đã tạo tạm chi nhánh đích: [${destBranchId}] "Kho trung tâm phụ E2E"`);
  }
  recordPass(`Đã có 2 chi nhánh độc lập để kiểm thử: Nguồn=${BRANCH_ID}, Đích=${destBranchId}`);

  // ─── BƯỚC 6: Điều chuyển kho hợp lệ (Stock Transfer) ───────────────────────
  section('BƯỚC 6: Thực hiện Điều chuyển kho (Stock Transfer)');
  // Hiện tại Sp1 tại Branch 48 đang có 9 cái. Điều chuyển 4 cái sang destBranchId.
  const transferReqKey = `trf-${Date.now()}-${randomUUID()}`;
  const transferRes = await apiRequest('/transfers', {
    method: 'POST',
    body: {
      source_branch_id: BRANCH_ID,
      destination_branch_id: destBranchId,
      request_key: transferReqKey,
      note: 'Điều chuyển hàng bổ sung tồn cho kho phụ',
      items: [
        { product_id: products[0].id, quantity: 4 }
      ]
    },
    sessionCookie: sessionToken
  });

  if (!transferRes.ok || !transferRes.data.id) {
    recordFail(`Điều chuyển kho thất bại: ${transferRes.status} - ${JSON.stringify(transferRes.data)}`);
  } else {
    const transferDocId = transferRes.data.id;
    cleanup.documentIds.push(transferDocId);
    recordPass(`Đã tạo thành công Phiếu điều chuyển #${transferDocId} (Loại: ${transferRes.data.type})`);

    // Kiểm tra chi tiết phiếu điều chuyển
    const trfDetailRes = await apiRequest(`/stock-operations/${transferDocId}`, { sessionCookie: sessionToken });
    if (trfDetailRes.ok && trfDetailRes.data.document) {
      const doc = trfDetailRes.data.document;
      info(`Phiếu chuyển: Từ "${doc.branch_name}" -> Đến "${doc.destination_branch_name}"`);
      if (doc.destination_branch_id === destBranchId) {
        recordPass('Chi nhánh xuất và chi nhánh nhận liên kết chính xác');
      } else {
        recordFail(`Sai chi nhánh nhận: ${doc.destination_branch_id}`);
      }
    }

    // Xác minh số dư kho tại 2 chi nhánh
    const [[sourceBal]] = await pool.execute(
      "SELECT quantity FROM inventory_balances WHERE organization_id=? AND branch_id=? AND product_id=?",
      [ORG_ID, BRANCH_ID, products[0].id]
    );
    const [[destBal]] = await pool.execute(
      "SELECT quantity FROM inventory_balances WHERE organization_id=? AND branch_id=? AND product_id=?",
      [ORG_ID, destBranchId, products[0].id]
    );

    if (sourceBal?.quantity === 5) {
      recordPass(`Kho xuất (48) đã bị trừ đúng 4 cái: 9 - 4 = 5 cái`);
    } else {
      recordFail(`Kho xuất bị trừ sai: còn ${sourceBal?.quantity} (kỳ vọng: 5)`);
    }

    if (destBal?.quantity === 4) {
      recordPass(`Kho nhận (${destBranchId}) đã được cộng đúng 4 cái: 0 + 4 = 4 cái`);
    } else {
      recordFail(`Kho nhận được cộng sai: có ${destBal?.quantity} (kỳ vọng: 4)`);
    }

    // Xác minh 2 dòng biến động đối ứng trong inventory_movements
    const [movements] = await pool.execute(
      "SELECT branch_id, quantity_delta, balance_after FROM inventory_movements WHERE document_id=? AND product_id=? ORDER BY id ASC",
      [transferDocId, products[0].id]
    );

    if (movements.length === 2) {
      const sourceMov = movements.find(m => m.branch_id === BRANCH_ID);
      const destMov = movements.find(m => m.branch_id === destBranchId);

      if (sourceMov?.quantity_delta === -4 && destMov?.quantity_delta === 4) {
        recordPass(`Ghi nhận đầy đủ 2 dòng biến động kho đối ứng: Xuất (-4) và Nhập (+4)`);
      } else {
        recordFail(`Giá trị biến động sai: source=${sourceMov?.quantity_delta}, dest=${destMov?.quantity_delta}`);
      }
    } else {
      recordFail(`Số lượng dòng biến động kho không đúng 2: có ${movements.length} dòng`);
    }
  }

  // ─── BƯỚC 7: Chặn điều chuyển vượt tồn khả dụng (Over-transfer) ─────────────
  section('BƯỚC 7: Kiểm tra ngăn chặn điều chuyển vượt tồn kho (HTTP 409)');
  // Sp1 tại kho 48 hiện chỉ còn 5 cái, thử chuyển 50 cái
  const overTransferRes = await apiRequest('/transfers', {
    method: 'POST',
    body: {
      source_branch_id: BRANCH_ID,
      destination_branch_id: destBranchId,
      request_key: `over-trf-${Date.now()}-${randomUUID()}`,
      items: [
        { product_id: products[0].id, quantity: 50 }
      ]
    },
    sessionCookie: sessionToken
  });

  if (overTransferRes.status === 409) {
    recordPass(`Chặn điều chuyển vượt tồn thành công (HTTP 409): "${overTransferRes.data.message}"`);
  } else {
    recordFail(`Hệ thống không chặn điều chuyển vượt tồn kho! Status=${overTransferRes.status}`);
  }

  // ─── BƯỚC 8: Chặn điều chuyển cùng chi nhánh & chi nhánh ngoài Tenant ───────
  section('BƯỚC 8: Kiểm tra ràng buộc bảo mật chi nhánh và Multi-tenant');
  // Chuyển cùng chi nhánh (source === dest)
  const sameBranchRes = await apiRequest('/transfers', {
    method: 'POST',
    body: {
      source_branch_id: BRANCH_ID,
      destination_branch_id: BRANCH_ID,
      request_key: `same-branch-${Date.now()}-${randomUUID()}`,
      items: [{ product_id: products[0].id, quantity: 1 }]
    },
    sessionCookie: sessionToken
  });
  if (sameBranchRes.status === 400) {
    recordPass(`Chặn điều chuyển cùng 1 chi nhánh (HTTP 400): "${sameBranchRes.data.message}"`);
  } else {
    recordFail(`Không chặn điều chuyển cùng chi nhánh: status=${sameBranchRes.status}`);
  }

  // Chuyển sang chi nhánh của Tenant khác (ví dụ: branch 49 thuộc org 46)
  const [[otherOrgBranch]] = await pool.execute(
    "SELECT id FROM branches WHERE organization_id != ? LIMIT 1",
    [ORG_ID]
  );
  if (otherOrgBranch) {
    const crossTenantRes = await apiRequest('/transfers', {
      method: 'POST',
      body: {
        source_branch_id: BRANCH_ID,
        destination_branch_id: otherOrgBranch.id,
        request_key: `cross-tenant-${Date.now()}-${randomUUID()}`,
        items: [{ product_id: products[0].id, quantity: 1 }]
      },
      sessionCookie: sessionToken
    });
    if (crossTenantRes.status === 404 || crossTenantRes.status === 403) {
      recordPass(`Bảo mật Multi-tenant OK: Chặn chuyển hàng sang chi nhánh của Tenant khác (HTTP ${crossTenantRes.status})`);
    } else {
      recordFail(`Vi phạm bảo mật Multi-tenant: status=${crossTenantRes.status}`);
    }
  }

  // ─── BƯỚC 9: Tra cứu danh sách lịch sử nghiệp vụ kho ──────────────────────
  section('BƯỚC 9: Tra cứu lịch sử nghiệp vụ kho qua HTTP GET /stock-operations');
  const listRes = await apiRequest('/stock-operations?limit=10', { sessionCookie: sessionToken });
  if (listRes.ok && listRes.data.items?.length >= 2) {
    recordPass(`Danh sách nghiệp vụ kho trả về đầy đủ ${listRes.data.items.length} chứng từ`);
    listRes.data.items.forEach(doc => {
      info(`- [${doc.type}] Chứng từ #${doc.id}: ${doc.branch_name} ${doc.destination_branch_name ? '-> ' + doc.destination_branch_name : ''} · Giá trị: ${Number(doc.total).toLocaleString()}đ`);
    });
  } else {
    recordFail(`Lỗi gọi API /stock-operations: ${JSON.stringify(listRes.data)}`);
  }

  // ─── BƯỚC 10: ROLLBACK DỌN SẠCH DỮ LIỆU TEST ──────────────────────────────
  section('BƯỚC 10: DỌN DẸP SẠCH TOÀN BỘ DỮ LIỆU TEST (ROLLBACK)');
  await rollbackAll();

  // ─── BƯỚC 11: XÁC MINH TRẠNG THÁI SẠCH HOÀN HẢO ──────────────────────────
  section('BƯỚC 11: Xác minh trạng thái sạch của Tenant 45 sau khi test');
  const [[checkDocs]] = await pool.execute(
    "SELECT COUNT(*) cnt FROM stock_documents WHERE organization_id=?",
    [ORG_ID]
  );
  const [[checkMovements]] = await pool.execute(
    "SELECT COUNT(*) cnt FROM inventory_movements WHERE organization_id=?",
    [ORG_ID]
  );
  const [[checkBalances]] = await pool.execute(
    "SELECT COALESCE(SUM(quantity), 0) total FROM inventory_balances WHERE organization_id=?",
    [ORG_ID]
  );
  const [[checkCategories]] = await pool.execute(
    "SELECT COUNT(*) cnt FROM categories WHERE organization_id=?",
    [ORG_ID]
  );
  const [[checkProducts]] = await pool.execute(
    "SELECT COUNT(*) cnt FROM products WHERE organization_id=? AND status='ACTIVE'",
    [ORG_ID]
  );

  if (checkDocs.cnt === 0) recordPass('Chứng từ (stock_documents): 0 (sạch hoàn toàn)');
  else recordFail(`Còn sót ${checkDocs.cnt} chứng từ`);

  if (checkMovements.cnt === 0) recordPass('Biến động kho (inventory_movements): 0 (sạch hoàn toàn)');
  else recordFail(`Còn sót ${checkMovements.cnt} biến động kho`);

  if (Number(checkBalances.total) === 0) recordPass('Tổng tồn kho: 0 (sạch hoàn toàn)');
  else recordFail(`Tổng tồn kho không bằng 0: ${checkBalances.total}`);

  if (checkCategories.cnt === 10) recordPass('Danh mục sản phẩm: 10 (giữ nguyên vẹn)');
  else recordFail(`Số danh mục bị thay đổi: ${checkCategories.cnt}`);

  if (checkProducts.cnt === 120) recordPass('Sản phẩm khởi tạo: 120 (giữ nguyên vẹn)');
  else recordFail(`Số sản phẩm bị thay đổi: ${checkProducts.cnt}`);

  console.log('\n============================================================');
  console.log(`📊 TỔNG KẾT KIỂM THỬ: ${testPassed} PASS | ${testFailed} FAIL`);
  if (testFailed === 0) {
    console.log('🎉 TẤT CẢ 100% TÌNH HUỐNG KIỂM KÊ & ĐIỀU CHUYỂN KHO ĐỀU PASS XUẤT SẮC!');
  } else {
    console.log('⚠️ CÓ TÌNH HUỐNG CHƯA ĐẠT. VUI LÒNG KIỂM TRA LẠI.');
  }
  console.log('============================================================\n');

  await pool.end();
  process.exit(testFailed === 0 ? 0 : 1);
}

async function rollbackAll() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (cleanup.documentIds.length > 0) {
      const docIds = cleanup.documentIds;
      await conn.execute(
        `DELETE FROM stock_document_items WHERE organization_id=? AND document_id IN (${docIds.join(',')})`,
        [ORG_ID]
      );
      await conn.execute(
        `DELETE FROM inventory_movements WHERE organization_id=? AND document_id IN (${docIds.join(',')})`,
        [ORG_ID]
      );
      await conn.execute(
        `DELETE FROM stock_documents WHERE organization_id=? AND id IN (${docIds.join(',')})`,
        [ORG_ID]
      );
      info(`Đã dọn dẹp ${docIds.length} chứng từ test`);
    }

    // Reset tồn kho về 0
    await conn.execute(
      "UPDATE inventory_balances SET quantity=0 WHERE organization_id=?",
      [ORG_ID]
    );
    info('Đã reset tồn kho về 0');

    // Xóa chi nhánh test tạm nếu có
    for (const bId of cleanup.temporaryBranchIds) {
      await conn.execute("DELETE FROM inventory_balances WHERE organization_id=? AND branch_id=?", [ORG_ID, bId]);
      await conn.execute("DELETE FROM branches WHERE organization_id=? AND id=?", [ORG_ID, bId]);
      info(`Đã xóa chi nhánh test tạm #${bId}`);
    }

    // Xóa session test
    for (const sId of cleanup.sessionIds) {
      await conn.execute("DELETE FROM auth_sessions WHERE id=?", [sId]);
    }

    await conn.commit();
    pass('Rollback hoàn tất – Dữ liệu Tenant 45 sạch hoàn toàn');
  } catch(e) {
    await conn.rollback();
    console.error('Lỗi khi rollback:', e.message);
  } finally {
    conn.release();
  }
}

run().catch(async err => {
  console.error('\n💥 LỖI KHÔNG MONG ĐỢI:', err);
  await rollbackAll().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
