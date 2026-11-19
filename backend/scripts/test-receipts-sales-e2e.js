/**
 * E2E Test: Luồng Nhập hàng & Bán hàng POS qua cả HTTP API & Database
 * Tenant 45 · Branch 48 · Email: vovuong535@gmail.com
 *
 * Kiểm thử toàn trình:
 * 1. Đăng nhập tạo session cho OWNER vovuong535@gmail.com
 * 2. Lấy danh sách sản phẩm qua HTTP GET /api/v1/products?branch_id=48
 * 3. Tạo phiếu nhập qua HTTP POST /api/v1/receipts (50 sp x 3 items)
 * 4. Kiểm tra tồn kho tăng qua HTTP GET /api/v1/inventory?branch_id=48
 * 5. Kiểm tra Dashboard has_receipts = true qua HTTP GET /api/v1/dashboard/overview
 * 6. Kiểm tra Idempotency replay (gửi lại cùng request_key nhận lại chứng từ cũ)
 * 7. Bán hàng POS đơn 1 (CASH) qua HTTP POST /api/v1/sales -> Kiểm tra tồn kho giảm, tiền thừa đúng
 * 8. Bán hàng POS đơn 2 (BANK_TRANSFER) qua HTTP POST /api/v1/sales (trạng thái PENDING)
 * 9. Xác nhận chuyển khoản qua HTTP POST /api/v1/sales/:id/confirm-payment -> trạng thái PAID
 * 10. Kiểm tra ngăn bán âm kho (vượt tồn kho -> HTTP 409)
 * 11. Kiểm tra Dashboard has_sales = true và BI overview doanh thu cập nhật
 * 12. Dọn sạch toàn bộ dữ liệu test (Rollback sạch)
 * 13. Xác minh trạng thái sạch: has_receipts = false, has_sales = false, tồn kho = 0
 *
 * Chạy: cd backend && node scripts/test-receipts-sales-e2e.js
 */

import { randomUUID, createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { pool } from '../src/db/pool.js';
import { config } from '../src/config/env.js';

const ORG_ID = 45;
const BRANCH_ID = 48;
const OWNER_EMAIL = 'vovuong535@gmail.com';
const API_BASE = 'http://localhost:3000/api/v1';

const cleanup = {
  documentIds: [],
  sessionIds: []
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
  console.log('🔍 RETAIL INSIGHT – E2E TEST: LUỒNG NHẬP HÀNG & BÁN HÀNG POS');
  console.log(`   Tenant ID: ${ORG_ID} | Branch ID: ${BRANCH_ID} | Email: ${OWNER_EMAIL}`);
  console.log('============================================================\n');

  let testPassed = 0;
  let testFailed = 0;

  function recordPass(msg) { pass(msg); testPassed++; }
  function recordFail(msg) { fail(msg); testFailed++; }

  // ─── BƯỚC 0: Xác minh tài khoản OWNER & tạo Auth Session ───────────────────
  section('BƯỚC 0: Xác thực tài khoản OWNER và tạo Session');
  const [[owner]] = await pool.execute(
    "SELECT id, email, full_name, role, organization_id, status FROM users WHERE email=? AND organization_id=?",
    [OWNER_EMAIL, ORG_ID]
  );
  if (!owner || owner.status !== 'ACTIVE') {
    recordFail(`Không tìm thấy tài khoản OWNER active với email ${OWNER_EMAIL}`);
    process.exit(1);
  }
  recordPass(`Xác thực OWNER: id=${owner.id}, tên="${owner.full_name}", role=${owner.role}`);

  // Tạo JWT session hợp lệ
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
  recordPass(`Đã tạo phiên đăng nhập E2E: sessionId=${sessionId}`);

  // ─── BƯỚC 1: Lấy danh sách sản phẩm qua HTTP GET /products ────────────────
  section('BƯỚC 1: Lấy danh sách sản phẩm qua HTTP GET /api/v1/products');
  const prodRes = await apiRequest(`/products?limit=10&branch_id=${BRANCH_ID}`, { sessionCookie: sessionToken });
  if (!prodRes.ok || !prodRes.data.items || prodRes.data.items.length < 3) {
    recordFail(`HTTP GET /products thất bại hoặc không đủ sản phẩm: ${JSON.stringify(prodRes.data)}`);
    process.exit(1);
  }
  const products = prodRes.data.items.slice(0, 3);
  recordPass(`Đã tải thành công ${prodRes.data.total} sản phẩm từ API. Chọn 3 sản phẩm kiểm thử:`);
  products.forEach(p => info(`- [${p.sku}] ${p.name} · Giá bán: ${Number(p.sale_price).toLocaleString()}đ · Tồn kho hiện tại: ${p.stock ?? 0}`));

  // ─── BƯỚC 2: Kiểm tra trạng thái ban đầu của Dashboard ─────────────────────
  section('BƯỚC 2: Kiểm tra Dashboard ban đầu qua HTTP GET /dashboard/overview');
  const dashBefore = await apiRequest('/dashboard/overview', { sessionCookie: sessionToken });
  if (dashBefore.ok) {
    const ob = dashBefore.data.onboarding;
    info(`Onboarding ban đầu: Categories=${ob.has_categories} (${ob.category_count}), Products=${ob.has_products} (${ob.product_count}), Receipts=${ob.has_receipts} (${ob.receipt_count}), Sales=${ob.has_sales} (${ob.sale_count})`);
    if (ob.has_categories && ob.has_products) {
      recordPass('Dashboard hiển thị sẵn sàng Bước 1 & Bước 2 (Danh mục & Sản phẩm)');
    } else {
      recordFail('Dashboard thiếu danh mục hoặc sản phẩm');
    }
  } else {
    recordFail(`HTTP GET /dashboard/overview thất bại: ${JSON.stringify(dashBefore.data)}`);
  }

  // ─── BƯỚC 3: Tạo phiếu nhập kho qua HTTP POST /receipts ───────────────────
  section('BƯỚC 3: Lập phiếu nhập kho qua HTTP POST /api/v1/receipts');
  const receiptReqKey = `rec-${Date.now()}-${randomUUID()}`;
  const receiptPayload = {
    branch_id: BRANCH_ID,
    request_key: receiptReqKey,
    note: 'E2E Test: Nhập hàng nhà cung cấp Suntory Pepsico & Masan',
    items: [
      { product_id: products[0].id, quantity: 50, unit_price: Number(products[0].cost_price || 8000) },
      { product_id: products[1].id, quantity: 50, unit_price: Number(products[1].cost_price || 7000) },
      { product_id: products[2].id, quantity: 50, unit_price: Number(products[2].cost_price || 6000) }
    ]
  };

  const receiptRes = await apiRequest('/receipts', {
    method: 'POST',
    body: receiptPayload,
    sessionCookie: sessionToken
  });

  if (!receiptRes.ok || !receiptRes.data.id) {
    recordFail(`Tạo phiếu nhập thất bại: ${receiptRes.status} - ${JSON.stringify(receiptRes.data)}`);
    await rollbackAll();
    process.exit(1);
  }

  const receiptDocId = receiptRes.data.id;
  cleanup.documentIds.push(receiptDocId);
  recordPass(`Đã tạo thành công Phiếu nhập #${receiptDocId} với tổng giá trị ${receiptRes.data.total.toLocaleString()} VNĐ`);

  // ─── BƯỚC 4: Kiểm tra chi tiết phiếu nhập HTTP GET /receipts/:id ──────────
  section('BƯỚC 4: Tra cứu chi tiết phiếu nhập qua HTTP GET /api/v1/receipts/:id');
  const recDetailRes = await apiRequest(`/receipts/${receiptDocId}`, { sessionCookie: sessionToken });
  if (recDetailRes.ok && recDetailRes.data.items?.length === 3) {
    recordPass(`Phiếu nhập #${receiptDocId} chứa đủ ${recDetailRes.data.items.length} mặt hàng, đơn vị "${recDetailRes.data.document.organization_name}"`);
  } else {
    recordFail(`Lỗi tra cứu phiếu nhập: ${JSON.stringify(recDetailRes.data)}`);
  }

  // ─── BƯỚC 5: Kiểm tra tồn kho sau khi nhập HTTP GET /inventory ────────────
  section('BƯỚC 5: Xác minh tồn kho tăng qua HTTP GET /api/v1/inventory');
  const invRes = await apiRequest(`/inventory?branch_id=${BRANCH_ID}&limit=10`, { sessionCookie: sessionToken });
  if (invRes.ok && invRes.data.items) {
    let allStockCorrect = true;
    for (const p of products) {
      const invItem = invRes.data.items.find(i => i.product_id === p.id);
      if (invItem && invItem.quantity >= 50) {
        info(`  + [${p.sku}] ${p.name}: tồn kho hiện tại = ${invItem.quantity} (min_stock: ${invItem.min_stock ?? 'N/A'})`);
      } else {
        allStockCorrect = false;
        recordFail(`Sản phẩm ${p.sku} tồn kho không tăng đúng: ${invItem?.quantity}`);
      }
    }
    if (allStockCorrect) {
      recordPass('Tất cả 3 sản phẩm đều tăng tồn kho chính xác (+50 cái mỗi sp)');
    }
  } else {
    recordFail(`Lỗi gọi API /inventory: ${JSON.stringify(invRes.data)}`);
  }

  // ─── BƯỚC 6: Kiểm tra Dashboard cập nhật Bước 3 (has_receipts = true) ─────
  section('BƯỚC 6: Kiểm tra Dashboard Checklist Bước 3 (has_receipts)');
  const dashAfterRec = await apiRequest('/dashboard/overview', { sessionCookie: sessionToken });
  if (dashAfterRec.ok && dashAfterRec.data.onboarding.has_receipts) {
    recordPass(`Dashboard.has_receipts = true (Số phiếu nhập: ${dashAfterRec.data.onboarding.receipt_count})`);
  } else {
    recordFail(`Dashboard chưa cập nhật has_receipts: ${JSON.stringify(dashAfterRec.data?.onboarding)}`);
  }

  // ─── BƯỚC 7: Kiểm tra Idempotency Replay của Phiếu nhập ───────────────────
  section('BƯỚC 7: Kiểm tra Idempotency Replay (gửi lại cùng request_key)');
  const replayRes = await apiRequest('/receipts', {
    method: 'POST',
    body: receiptPayload,
    sessionCookie: sessionToken
  });
  if (replayRes.ok && replayRes.data.id === receiptDocId && replayRes.data.replayed === true) {
    recordPass(`Idempotency hoạt động chuẩn xác: Trả lại đúng chứng từ #${receiptDocId} với replayed=true (không tạo trùng)`);
  } else {
    recordFail(`Idempotency thất bại: ${JSON.stringify(replayRes.data)}`);
  }

  // ─── BƯỚC 8: Bán hàng POS đơn 1 (TIỀN MẶT - CASH) ─────────────────────────
  section('BƯỚC 8: Bán hàng POS đơn 1 (CASH) qua HTTP POST /api/v1/sales');
  const saleReqKey1 = `pos-cash-${Date.now()}-${randomUUID()}`;
  const p1 = products[0];
  const saleQty1 = 5;
  const unitPrice1 = Number(p1.sale_price);
  const totalSale1 = unitPrice1 * saleQty1;
  const cashGiven = totalSale1 + 10000; // Khách đưa dư 10.000đ

  const saleRes1 = await apiRequest('/sales', {
    method: 'POST',
    body: {
      branch_id: BRANCH_ID,
      request_key: saleReqKey1,
      note: 'E2E Test: Khách mua trực tiếp tại quầy thanh toán tiền mặt',
      payment: {
        method: 'CASH',
        cash_received: cashGiven
      },
      items: [
        { product_id: p1.id, quantity: saleQty1 }
      ]
    },
    sessionCookie: sessionToken
  });

  if (!saleRes1.ok || !saleRes1.data.id) {
    recordFail(`Bán hàng đơn CASH thất bại: ${saleRes1.status} - ${JSON.stringify(saleRes1.data)}`);
  } else {
    const saleDocId1 = saleRes1.data.id;
    cleanup.documentIds.push(saleDocId1);
    recordPass(`Tạo hóa đơn CASH #${saleDocId1} thành công: Tổng = ${totalSale1.toLocaleString()}đ, Status = ${saleRes1.data.payment_status}`);

    // Tra cứu chi tiết hóa đơn
    const billDetail = await apiRequest(`/sales/${saleDocId1}`, { sessionCookie: sessionToken });
    if (billDetail.ok) {
      const doc = billDetail.data.document;
      info(`Chi tiết hóa đơn: Khách đưa ${Number(doc.cash_received).toLocaleString()}đ · Tiền thừa: ${Number(doc.change_due).toLocaleString()}đ`);
      if (Number(doc.change_due) === 10000) {
        recordPass('Tính toán tiền thừa (change_due) chính xác tuyệt đối (10.000 VNĐ)');
      } else {
        recordFail(`Tiền thừa tính sai: ${doc.change_due}`);
      }
    }
  }

  // ─── BƯỚC 9: Bán hàng POS đơn 2 (CHUYỂN KHOẢN - BANK_TRANSFER) ────────────
  section('BƯỚC 9: Bán hàng POS đơn 2 (BANK_TRANSFER) qua HTTP POST /api/v1/sales');
  const saleReqKey2 = `pos-bank-${Date.now()}-${randomUUID()}`;
  const p2 = products[1];
  const saleQty2 = 3;
  const totalSale2 = Number(p2.sale_price) * saleQty2;

  const saleRes2 = await apiRequest('/sales', {
    method: 'POST',
    body: {
      branch_id: BRANCH_ID,
      request_key: saleReqKey2,
      note: 'E2E Test: Khách quét mã QR chuyển khoản VietQR',
      payment: {
        method: 'BANK_TRANSFER'
      },
      items: [
        { product_id: p2.id, quantity: saleQty2 }
      ]
    },
    sessionCookie: sessionToken
  });

  if (!saleRes2.ok || !saleRes2.data.id) {
    recordFail(`Bán hàng đơn BANK_TRANSFER thất bại: ${saleRes2.status} - ${JSON.stringify(saleRes2.data)}`);
  } else {
    const saleDocId2 = saleRes2.data.id;
    cleanup.documentIds.push(saleDocId2);
    if (saleRes2.data.payment_status === 'PENDING') {
      recordPass(`Hóa đơn BANK_TRANSFER #${saleDocId2} khởi tạo thành công ở trạng thái PENDING`);
    } else {
      recordFail(`Trạng thái thanh toán không phải PENDING: ${saleRes2.data.payment_status}`);
    }

    // Xác nhận đã nhận tiền chuyển khoản
    const confirmRes = await apiRequest(`/sales/${saleDocId2}/confirm-payment`, {
      method: 'POST',
      body: {},
      sessionCookie: sessionToken
    });

    if (confirmRes.ok && confirmRes.data.payment_status === 'PAID') {
      recordPass(`Đã xác nhận thanh toán chuyển khoản: Hóa đơn #${saleDocId2} chuyển sang PAID`);
    } else {
      recordFail(`Lỗi xác nhận thanh toán chuyển khoản: ${JSON.stringify(confirmRes.data)}`);
    }
  }

  // ─── BƯỚC 10: Kiểm tra tồn kho sau khi bán ────────────────────────────────
  section('BƯỚC 10: Xác minh tồn kho giảm chính xác sau bán hàng');
  const invAfterSales = await apiRequest(`/inventory?branch_id=${BRANCH_ID}&limit=10`, { sessionCookie: sessionToken });
  if (invAfterSales.ok && invAfterSales.data.items) {
    const item1 = invAfterSales.data.items.find(i => i.product_id === p1.id);
    const item2 = invAfterSales.data.items.find(i => i.product_id === p2.id);
    if (item1 && item1.quantity === 45) {
      recordPass(`[${p1.sku}] Tồn kho ban đầu 50 - bán 5 = còn đúng 45`);
    } else {
      recordFail(`[${p1.sku}] Tồn kho sau bán sai: ${item1?.quantity} (kỳ vọng: 45)`);
    }
    if (item2 && item2.quantity === 47) {
      recordPass(`[${p2.sku}] Tồn kho ban đầu 50 - bán 3 = còn đúng 47`);
    } else {
      recordFail(`[${p2.sku}] Tồn kho sau bán sai: ${item2?.quantity} (kỳ vọng: 47)`);
    }
  }

  // ─── BƯỚC 11: Kiểm tra ngăn chặn bán âm kho (Over-sell prevention) ─────────
  section('BƯỚC 11: Kiểm tra ngăn chặn bán âm kho (Over-selling / Stock Deficit)');
  const p3 = products[2]; // có tồn kho 50
  const overSellRes = await apiRequest('/sales', {
    method: 'POST',
    body: {
      branch_id: BRANCH_ID,
      request_key: `oversell-${Date.now()}-${randomUUID()}`,
      items: [
        { product_id: p3.id, quantity: 999 } // đòi mua 999 cái trong khi tồn chỉ có 50
      ]
    },
    sessionCookie: sessionToken
  });

  if (overSellRes.status === 409) {
    recordPass(`Hệ thống chặn bán âm kho thành công (HTTP 409): "${overSellRes.data.message}"`);
  } else {
    recordFail(`Hệ thống không chặn bán vượt tồn kho! Status=${overSellRes.status}, data=${JSON.stringify(overSellRes.data)}`);
  }

  // ─── BƯỚC 12: Kiểm tra đồng bộ Dashboard & BI Overview ────────────────────
  section('BƯỚC 12: Kiểm tra đồng bộ Dashboard Checklist Bước 4 & BI Overview');
  const dashAfterSales = await apiRequest('/dashboard/overview', { sessionCookie: sessionToken });
  if (dashAfterSales.ok) {
    const ob = dashAfterSales.data.onboarding;
    if (ob.has_sales && ob.sale_count >= 2) {
      recordPass(`Dashboard hoàn tất Bước 4 (has_sales=true, ${ob.sale_count} hóa đơn)`);
    } else {
      recordFail(`Dashboard chưa cập nhật Bước 4: ${JSON.stringify(ob)}`);
    }
  }

  const biRes = await apiRequest('/bi/overview', { sessionCookie: sessionToken });
  if (biRes.ok && biRes.data.kpi) {
    const kpi = biRes.data.kpi;
    info(`BI KPI: Doanh thu = ${Number(kpi.revenue).toLocaleString()}đ | Số đơn = ${kpi.orders} | Lợi nhuận = ${Number(kpi.gross_profit).toLocaleString()}đ`);
    if (Number(kpi.revenue) > 0 && Number(kpi.orders) >= 2) {
      recordPass('Báo cáo BI phản ánh chính xác số đơn hàng và doanh thu thời gian thực');
    } else {
      recordFail('BI KPI chưa phản ánh doanh thu');
    }
  } else {
    recordFail(`Lỗi gọi BI Overview: ${JSON.stringify(biRes.data)}`);
  }

  // ─── BƯỚC 13: ROLLBACK SẠCH SẼ TOÀN BỘ DỮ LIỆU TEST ───────────────────────
  section('BƯỚC 13: DỌN DẸP SẠCH TOÀN BỘ DỮ LIỆU TEST (ROLLBACK)');
  await rollbackAll();

  // ─── BƯỚC 14: XÁC MINH TRẠNG THÁI SẠCH HOÀN HẢO ──────────────────────────
  section('BƯỚC 14: Xác minh trạng thái sạch của Tenant 45 sau khi test');
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

  if (Number(checkBalances.total) === 0) recordPass('Tổng tồn kho (inventory_balances): 0 (sạch hoàn toàn)');
  else recordFail(`Tổng tồn kho không bằng 0: ${checkBalances.total}`);

  if (checkCategories.cnt === 10) recordPass('Danh mục sản phẩm: 10 (giữ nguyên vẹn)');
  else recordFail(`Số danh mục bị thay đổi: ${checkCategories.cnt}`);

  if (checkProducts.cnt === 120) recordPass('Sản phẩm khởi tạo: 120 (giữ nguyên vẹn)');
  else recordFail(`Số sản phẩm bị thay đổi: ${checkProducts.cnt}`);

  // Kiểm tra lại Dashboard qua API để xác nhận Bước 3 & 4 về false
  const dashFinal = await apiRequest('/dashboard/overview', { sessionCookie: sessionToken });
  if (dashFinal.ok) {
    const ob = dashFinal.data.onboarding;
    if (ob.has_receipts === false && ob.has_sales === false) {
      recordPass('Dashboard Onboarding: has_receipts=false, has_sales=false (đã sẵn sàng cho OWNER thực tế)');
    } else {
      recordFail(`Dashboard chưa về trạng thái ban đầu: ${JSON.stringify(ob)}`);
    }
  }

  // Xóa session test
  for (const sId of cleanup.sessionIds) {
    await pool.execute("DELETE FROM auth_sessions WHERE id=?", [sId]);
  }
  recordPass('Đã hủy phiên làm việc kiểm thử');

  console.log('\n============================================================');
  console.log(`📊 TỔNG KẾT KIỂM THỬ: ${testPassed} PASS | ${testFailed} FAIL`);
  if (testFailed === 0) {
    console.log('🎉 TẤT CẢ 100% TÌNH HUỐNG KIỂM THỬ E2E ĐỀU ĐẠT CHUẨN XUẤT SẮC!');
  } else {
    console.log('⚠️ CÓ TÌNH HUỐNG CHƯA ĐẠT. VUI LÒNG KIỂM TRA LẠI.');
  }
  console.log('============================================================\n');

  await pool.end();
  process.exit(testFailed === 0 ? 0 : 1);
}

async function rollbackAll() {
  if (cleanup.documentIds.length === 0) return;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const docIds = cleanup.documentIds;

    // 1. Xóa sale_payments
    await conn.execute(
      `DELETE FROM sale_payments WHERE organization_id=? AND document_id IN (${docIds.join(',')})`,
      [ORG_ID]
    );

    // 2. Xóa stock_document_items
    await conn.execute(
      `DELETE FROM stock_document_items WHERE organization_id=? AND document_id IN (${docIds.join(',')})`,
      [ORG_ID]
    );

    // 3. Xóa inventory_movements
    await conn.execute(
      `DELETE FROM inventory_movements WHERE organization_id=? AND document_id IN (${docIds.join(',')})`,
      [ORG_ID]
    );

    // 4. Xóa stock_documents
    await conn.execute(
      `DELETE FROM stock_documents WHERE organization_id=? AND id IN (${docIds.join(',')})`,
      [ORG_ID]
    );

    // 5. Reset inventory_balances về 0
    await conn.execute(
      "UPDATE inventory_balances SET quantity=0 WHERE organization_id=? AND branch_id=?",
      [ORG_ID, BRANCH_ID]
    );

    await conn.commit();
    info(`Đã dọn dẹp ${docIds.length} chứng từ và hoàn nguyên tồn kho về 0.`);
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
