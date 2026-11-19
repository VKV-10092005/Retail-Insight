import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import dotenv from '../../backend/node_modules/dotenv/lib/main.js';
dotenv.config({path:new URL('../../backend/.env',import.meta.url)});
test('real store: register -> product -> receipt -> sale -> BI -> AI readiness',async({page,context})=>{
 const {connectionOptions,verifyDatabase}=await import('../../backend/src/db/pool.js');const {createRequire}=await import('node:module');const mysql=createRequire(new URL('../../backend/package.json',import.meta.url))('mysql2/promise');const pool=mysql.createPool(connectionOptions);await verifyDatabase(pool);
 const email=`operational-browser-${randomUUID()}@example.test`,password='Browser-operational-test-2026',store=`Operational Browser ${randomUUID().slice(0,8)}`,sku=`SKU-${randomUUID().slice(0,8)}`;let org;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('/register');await page.getByLabel('Họ tên').fill('Operational Browser');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Tên cửa hàng').fill(store);await page.getByLabel('Mật khẩu').fill(password);await page.getByRole('button',{name:'Đăng ký',exact:true}).click();await expect(page.getByRole('status')).toContainText('Đã tạo tài khoản');
  await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Mật khẩu',{exact:true}).fill(password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page.getByRole('heading',{name:store,exact:true})).toBeVisible();
  const me=await (await context.request.get('/api/v1/auth/me')).json();org=me.user.organization_id;const branch=me.user.stores[0];
  await page.goto('/products');await page.getByLabel('Tên danh mục',{exact:true}).fill('Test category');await page.getByRole('button',{name:'Lưu danh mục',exact:true}).click();
  
  await page.getByLabel('Mã SKU',{exact:true}).fill(sku);await page.getByLabel('Tên sản phẩm',{exact:true}).fill('Real test product');await page.getByLabel('Giá bán',{exact:true}).fill('12500');await page.getByLabel('Giá vốn tham khảo',{exact:true}).fill('9000');await page.getByRole('combobox',{name:'Danh mục',exact:true}).selectOption({label:'Test category'});await page.getByRole('button',{name:'Lưu sản phẩm',exact:true}).click();await expect(page.getByRole('cell',{name:sku,exact:true})).toBeVisible();
  const importPrefix=`CSV-${randomUUID().slice(0,8)}`;
  await page.getByLabel('Chọn tệp CSV sản phẩm',{exact:true}).setInputFiles({name:'products.csv',mimeType:'text/csv',buffer:Buffer.from(`sku,name,sale_price\n${importPrefix}-1,"Sản phẩm, CSV",15000\n${importPrefix}-2,Sản phẩm thứ hai,20000\n`,'utf8')});
  await page.getByRole('button',{name:'Kiểm tra và xem trước CSV',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Có thể xác nhận ghi'})).toBeVisible();
  expect((await (await context.request.get('/api/v1/products?q='+importPrefix)).json()).items).toHaveLength(0);
  await page.getByRole('button',{name:'Xác nhận nhập 2 sản phẩm',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Đã nhập 2 sản phẩm'})).toBeVisible();
  expect((await (await context.request.get('/api/v1/products?q='+importPrefix)).json()).items).toHaveLength(2);
  const product=(await (await context.request.get('/api/v1/products?q='+sku)).json()).items[0];
  await page.goto('/inventory');await page.getByRole('combobox',{name:'Chi nhánh giao dịch',exact:true}).selectOption(branch);await page.getByRole('combobox',{name:'Sản phẩm 1',exact:true}).selectOption(String(product.id));await page.getByLabel('Số lượng 1',{exact:true}).fill('10');await page.getByLabel('Đơn giá nhập 1',{exact:true}).fill('9000');await page.getByRole('button',{name:'Ghi nhận nhập kho',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Đã nhập kho'})).toContainText('Đã nhập kho');
  await page.goto('/sales');await page.getByRole('combobox',{name:'Chi nhánh giao dịch',exact:true}).selectOption(branch);await page.getByRole('combobox',{name:'Sản phẩm 1',exact:true}).selectOption(String(product.id));await page.getByLabel('Số lượng 1',{exact:true}).fill('3');await page.getByRole('button',{name:'Thanh toán và tạo hóa đơn',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Đã bán hàng'})).toContainText('Đã bán hàng');await expect(page.locator('.op-invoice')).toContainText('37.500');
  const inventory=await (await context.request.get('/api/v1/inventory')).json();expect(inventory.items[0].quantity).toBe(7);
  await page.goto('/');await expect(page.locator('.stat').first()).toContainText('37.500');await expect(page.locator('.stat').nth(1)).toContainText('1');
  await page.screenshot({path:'../docs/sprint2-operational-dashboard-test.png',fullPage:true});
  await page.goto('/research-demo');await expect(page).toHaveURL(/\/research$/);await expect(page.getByText('Organization chưa được cấp quyền dataset nghiên cứu. Các chức năng vận hành vẫn sử dụng bình thường.',{exact:true})).toBeVisible();
  const summaryResponse=await context.request.get('/api/v1/ai/summary');expect(summaryResponse.status()).toBe(200);const summary=await summaryResponse.json();expect(summary.source).toBe('OPERATIONAL');expect(summary.forecast_total).toBeNull();expect(summary.metrics).toBeNull();
  for(const task of ['sku','total','replenishment','stockout','multi']){const response=await context.request.get('/api/v1/ai/forecast?task='+task);expect(response.status()).toBe(200);const result=await response.json();expect(result.source).toBe('OPERATIONAL');expect(result.metrics).toBeNull();}
  await page.goto('/forecast/multi');await expect(page.getByText('Chưa đủ lịch sử quan sát',{exact:true})).toBeVisible();
  await page.goto('/forecast');await expect(page.locator('.op-status')).toBeVisible();
  for(const endpoint of ['runs','mysql-runs','mysql-forecasts?run_id=1','inventory','products'])expect((await context.request.get('/api/v1/research/nckh-2022-2023/'+endpoint)).status()).toBe(403);
  await page.goto('/branches');await page.getByLabel('Tên chi nhánh',{exact:true}).fill('Secondary test branch');await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await expect(page.getByRole('heading',{name:'Secondary test branch',exact:true})).toBeVisible();
  const staffEmail=`staff-browser-${randomUUID()}@example.test`;
  await page.goto('/users');await page.getByLabel('Họ tên',{exact:true}).fill('Browser Cashier');await page.getByLabel('Email nhân viên',{exact:true}).fill(staffEmail);await page.getByLabel('Mật khẩu khởi tạo',{exact:true}).fill(password);await page.getByRole('combobox',{name:'Vai trò',exact:true}).selectOption('CASHIER');await page.getByRole('checkbox',{name:store,exact:true}).check();await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await expect(page.getByRole('cell',{name:staffEmail,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();await expect(page).toHaveURL(/\/login$/);await page.getByLabel('Email',{exact:true}).fill(staffEmail);await page.getByLabel('Mật khẩu',{exact:true}).fill(password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page.getByRole('heading',{name:'Xin chào, Browser Cashier',exact:true})).toBeVisible();
  await page.goto('/users');await expect(page.getByRole('heading',{name:'Không có quyền truy cập',exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});await page.goto('/sales');await expect(page.getByRole('heading',{name:'Bán hàng và hóa đơn',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
 }finally{
  if(!org){const [rows]=await pool.execute('SELECT organization_id FROM users WHERE email=?',[email]);org=rows[0]?.organization_id;}
  if(org){for(const table of ['inventory_movements','stock_document_items','stock_documents','inventory_balances','products','categories','organization_dataset_access','auth_sessions','user_branch_roles','branches','users'])await pool.execute(`DELETE FROM ${table} WHERE organization_id=?`,[org]);await pool.execute('DELETE FROM organizations WHERE id=?',[org]);}
  await pool.end();
 }
});
