import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
process.env.NODE_ENV='development';
process.env.ALLOW_DEV_OTP='1';
process.env.SMTP_USER='';
process.env.SMTP_PASS='';
test('operational retail transaction flow and tenant/branch isolation',{skip:process.env.RUN_DB_TESTS!=='1'},async t=>{
 const {pool,verifyDatabase}=await import('../src/db/pool.js');const {default:app}=await import('../src/app.js');await verifyDatabase();
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base=`http://127.0.0.1:${server.address().port}/api/v1`;const orgs=[],emails=[];const password='Operational-test-password-2026';
 async function req(path,{body,cookie,method=body?'POST':'GET'}={}){return fetch(base+path,{method,headers:{'Content-Type':'application/json','X-Requested-With':'retail-web',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});}
 async function json(res,status=200){assert.equal(res.status,status,await res.clone().text());return res.json();}
 async function register(){const email=`operation-${randomUUID()}@example.test`;emails.push(email);const sent=await json(await req('/auth/send-register-otp',{body:{email}}));assert.match(sent.dev_otp,/^\d{6}$/);const verified=await json(await req('/auth/verify-register-otp',{body:{email,otp:sent.dev_otp}}));await json(await req('/auth/register',{body:{name:'Retail Test',storeName:'Operational fixture',email,password,confirm_password:password,verification_token:verified.verification_token}}),201);const res=await req('/auth/login',{body:{email,password}});assert.equal(res.status,200);const cookie=res.headers.get('set-cookie').split(';')[0];const {user}=await json(await req('/auth/me',{cookie}));orgs.push(user.organization_id);return {cookie,user,branch_id:Number(user.stores[0])};}
 try{
  const a=await register(),b=await register();let category,product,branch2,staffCookie;
  await t.test('empty operational dashboard has no sales',async()=>{const data=await json(await req('/bi/overview',{cookie:a.cookie}));assert.equal(data.has_sales,false);assert.equal(Number(data.kpi.revenue),0);assert.equal(data.inventory.valuation,null);});
  await t.test('category/product CRUD and tenant ownership',async()=>{
   category=await json(await req('/categories',{cookie:a.cookie,body:{name:'Test category'}}),201);
   product=await json(await req('/products',{cookie:a.cookie,body:{sku:'SKU-1',name:'Retail Product',category_id:category.id,sale_price:12500,cost_price:9000}}),201);
   assert.equal((await req('/products',{cookie:b.cookie,body:{sku:'FOREIGN',name:'Foreign',category_id:category.id,sale_price:1}})).status,404);
   await json(await req('/products/'+product.id,{cookie:a.cookie,method:'PUT',body:{sku:'SKU-1',name:'Retail Product Updated',category_id:category.id,sale_price:13000,cost_price:9000}}));
   const list=await json(await req('/products?q=Updated',{cookie:a.cookie}));assert.equal(list.total,1);
   assert.equal((await json(await req('/products',{cookie:b.cookie}))).total,0);
   assert.equal((await req('/products/'+product.id,{cookie:b.cookie,method:'PUT',body:{sku:'SKU-1',name:'Hack',sale_price:1}})).status,404);
  });
  const receipt={branch_id:a.branch_id,request_key:randomUUID(),items:[{product_id:product.id,quantity:10,unit_price:9000}]};
  await t.test('receive stock, replay idempotency and reject changed payload',async()=>{
   const r=await json(await req('/receipts',{cookie:a.cookie,body:receipt}),201);assert.equal(Number(r.total),90000);
   const replay=await json(await req('/receipts',{cookie:a.cookie,body:receipt}));assert.equal(replay.id,r.id);
   assert.equal((await req('/receipts',{cookie:a.cookie,body:{...receipt,items:[{...receipt.items[0],quantity:11}]}})).status,409);
   const stock=await json(await req('/inventory',{cookie:a.cookie}));assert.equal(stock.items[0].quantity,10);
  });
  await t.test('concurrent sales cannot oversell; rollback on insufficient stock',async()=>{
   const results=await Promise.all([1,2].map(()=>req('/sales',{cookie:a.cookie,body:{branch_id:a.branch_id,request_key:randomUUID(),items:[{product_id:product.id,quantity:7}]}})));
   assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);const sold=await results.find(r=>r.status===201).json();assert.equal(Number(sold.total),91000);
   const invoice=await json(await req('/sales/'+sold.id,{cookie:a.cookie}));assert.equal(invoice.items[0].quantity,7);assert.equal(invoice.items[0].product_name,'Retail Product Updated');
   assert.equal((await req('/sales/'+sold.id,{cookie:b.cookie})).status,404);
   const stock=await json(await req('/inventory',{cookie:a.cookie}));assert.equal(stock.items[0].quantity,3);
   const movements=await json(await req('/inventory/movements',{cookie:a.cookie}));assert.equal(movements.items.length,2);
  });
  await t.test('BI totals match real sales and filters',async()=>{
   const data=await json(await req('/bi/overview?category_id='+category.id,{cookie:a.cookie}));assert.equal(Number(data.kpi.revenue),91000);assert.equal(data.kpi.orders,1);assert.equal(Number(data.kpi.units),7);assert.equal(Number(data.inventory.quantity),3);assert.equal(data.trend.length,1);
   const other=await json(await req('/bi/overview',{cookie:b.cookie}));assert.equal(Number(other.kpi.revenue),0);
  });
  await t.test('staff branch assignments and role restrictions',async()=>{
   branch2=await json(await req('/branches',{cookie:a.cookie,body:{name:'Second branch',catalog_mode:'INDEPENDENT'}}),201);assert.equal(branch2.catalog_mode,'INDEPENDENT');const email=`cashier-${randomUUID()}@example.test`;
   const s=await json(await req('/staff',{cookie:a.cookie,body:{name:'Test Cashier',email,password,role:'CASHIER',branch_ids:[a.branch_id]}}),201);
   const login=await req('/auth/login',{body:{email,password}});staffCookie=login.headers.get('set-cookie').split(';')[0];
   assert.equal((await req('/products',{cookie:staffCookie,body:{sku:'DENIED',name:'Denied',sale_price:1}})).status,403);
   assert.equal((await req('/products/import',{cookie:staffCookie,body:{mode:'preview',csv:'sku,name,sale_price\nDENIED,Denied,1'}})).status,403);
   assert.equal((await req('/receipts',{cookie:staffCookie,body:{...receipt,request_key:randomUUID()}})).status,403);
   assert.equal((await req('/sales',{cookie:staffCookie,body:{branch_id:branch2.id,request_key:randomUUID(),items:[{product_id:product.id,quantity:1}]}})).status,403);
   assert.equal((await req('/bi/overview',{cookie:staffCookie})).status,403);
   await json(await req('/sales',{cookie:staffCookie,body:{branch_id:a.branch_id,request_key:randomUUID(),items:[{product_id:product.id,quantity:1}]}}),201);
   const managerEmail=`manager-${randomUUID()}@example.test`,managerPassword='Branch-manager-test-password-2026';
   const manager=await json(await req('/staff',{cookie:a.cookie,body:{name:'Second Branch Manager',email:managerEmail,password:managerPassword,role:'MANAGER',branch_ids:[branch2.id]}}),201);
   assert.deepEqual(manager.branch_ids,[branch2.id]);
   assert.equal((await req('/staff',{cookie:a.cookie,body:{name:'Ambiguous Manager',email:`ambiguous-${randomUUID()}@example.test`,password:managerPassword,role:'MANAGER',branch_ids:[a.branch_id,branch2.id]}})).status,400);
   const managerLogin=await req('/auth/login',{body:{email:managerEmail,password:managerPassword}});assert.equal(managerLogin.status,200);const managerCookie=managerLogin.headers.get('set-cookie').split(';')[0];
   const managerProfile=await json(await req('/auth/me',{cookie:managerCookie}));assert.equal(Number(managerProfile.user.branch_id),Number(branch2.id));assert.equal(managerProfile.user.branches.length,1);assert.equal(Number(managerProfile.user.branches[0].id),Number(branch2.id));
   const emptyBranchBI=await json(await req('/bi/overview',{cookie:managerCookie}));assert.equal(Number(emptyBranchBI.kpi.revenue),0);assert.equal(Number(emptyBranchBI.kpi.orders),0);assert.equal(Number(emptyBranchBI.kpi.units),0);assert.equal(Number(emptyBranchBI.inventory.quantity),0);assert.deepEqual(emptyBranchBI.by_branch.map(row=>Number(row.id)),[Number(branch2.id)]);
   const cleanIndependentCatalog=await json(await req(`/products?branch_id=${branch2.id}`,{cookie:managerCookie}));assert.equal(cleanIndependentCatalog.catalog_mode,'INDEPENDENT');assert.equal(cleanIndependentCatalog.total,0);
   assert.equal((await req(`/products?branch_id=${a.branch_id}`,{cookie:managerCookie})).status,403);
   const branchProduct=await json(await req('/products',{cookie:managerCookie,body:{sku:'BRANCH-2-ITEM',name:'Branch Two Item',sale_price:15000,cost_price:8000}}),201);assert.equal(Number(branchProduct.branch_id),Number(branch2.id));
   await json(await req('/receipts',{cookie:managerCookie,body:{branch_id:branch2.id,request_key:randomUUID(),items:[{product_id:branchProduct.id,quantity:5,unit_price:8000}]}}),201);
   const branchProductList=await json(await req(`/products?branch_id=${branch2.id}&q=BRANCH-2-ITEM`,{cookie:managerCookie}));assert.equal(Number(branchProductList.items[0].stock),5);
   const foreignProductList=await json(await req(`/products?branch_id=${a.branch_id}&q=BRANCH-2-ITEM`,{cookie:a.cookie}));assert.equal(foreignProductList.total,0);
   assert.equal((await req('/sales',{cookie:staffCookie,body:{branch_id:a.branch_id,request_key:randomUUID(),items:[{product_id:branchProduct.id,quantity:1}]}})).status,404);
   const independentCashierEmail=`independent-cashier-${randomUUID()}@example.test`;await json(await req('/staff',{cookie:a.cookie,body:{name:'Independent Cashier',email:independentCashierEmail,password,role:'CASHIER',branch_ids:[branch2.id]}}),201);
   const independentLogin=await req('/auth/login',{body:{email:independentCashierEmail,password}});assert.equal(independentLogin.status,200);const independentCookie=independentLogin.headers.get('set-cookie').split(';')[0];
   const sameSkuPrivate=await json(await req('/products',{cookie:independentCookie,body:{branch_id:branch2.id,sku:'SKU-1',name:'Same SKU private branch',sale_price:500}}),201);assert.equal(Number(sameSkuPrivate.branch_id),Number(branch2.id));
   const receiptCsv='sku,quantity,unit_cost\nSKU-1,1,100';const receiptPreview=await json(await req('/receipts/import',{cookie:managerCookie,body:{mode:'preview',branch_id:branch2.id,csv:receiptCsv}}));assert.equal(receiptPreview.rows[0].product_name,'Same SKU private branch');
   const receiptCsvNew=['Ma_san_pham,Ten_san_pham,Danh_muc,So_luong_nhap,Gia_nhap,Gia_ban',`RCV-${randomUUID()},N\u1ed3i c\u01a1m Sharp,\u0110\u1ed3 gia d\u1ee5ng,2,620000,850000`,`RCV-${randomUUID()},\u1ea4m si\u00eau t\u1ed1c,\u0110\u1ed3 gia d\u1ee5ng,3,175000,250000`].join('\n');
   const receiptPreviewNew=await json(await req('/receipts/import',{cookie:managerCookie,body:{mode:'preview',branch_id:branch2.id,csv:receiptCsvNew}}));assert.equal(receiptPreviewNew.can_commit,true);assert.equal(receiptPreviewNew.rows.length,2);
   const receiptCommitNew=await json(await req('/receipts/import',{cookie:managerCookie,body:{mode:'commit',branch_id:branch2.id,csv:receiptCsvNew,preview_hash:receiptPreviewNew.preview_hash,request_key:randomUUID()}}),201);assert.equal(receiptCommitNew.count,2);
   const receiptDetailNew=await json(await req(`/receipts/${receiptCommitNew.id}`,{cookie:managerCookie}));assert.equal(receiptDetailNew.items.length,2);assert.match(receiptDetailNew.document.note,/Hàng nhập từ Excel ngày/);
   const newImportedProducts=await json(await req(`/products?branch_id=${branch2.id}&q=RCV-`,{cookie:managerCookie}));assert.equal(newImportedProducts.total,2);assert.ok(newImportedProducts.items.every(item=>item.category_name==='Đồ gia dụng'));
   const revisedReceipt=await json(await req(`/documents/receipts/${receiptCommitNew.id}`,{cookie:managerCookie,method:'PUT',body:{items:receiptDetailNew.items.map(item=>({product_id:Number(item.product_id),quantity:Number(item.quantity)+1,unit_cost:Number(item.unit_cost),sale_price:Number(newImportedProducts.items.find(p=>Number(p.id)===Number(item.product_id)).sale_price)}))}}));assert.equal(Number(revisedReceipt.total),receiptDetailNew.items.reduce((sum,item)=>sum+(Number(item.quantity)+1)*Number(item.unit_cost),0));
   const revisedDetail=await json(await req(`/receipts/${receiptCommitNew.id}`,{cookie:managerCookie}));assert.ok(revisedDetail.items.every(item=>Number(item.quantity)===Number(receiptDetailNew.items.find(old=>old.product_id===item.product_id).quantity)+1));
   const privateCsv='sku,name,sale_price\nBRANCH-2-CSV,Household CSV Item,700';
   const privatePreview=await json(await req('/products/import',{cookie:independentCookie,body:{mode:'preview',branch_id:branch2.id,csv:privateCsv}}));assert.equal(privatePreview.can_commit,true);
   await json(await req('/products/import',{cookie:independentCookie,body:{mode:'commit',branch_id:branch2.id,csv:privateCsv,preview_hash:privatePreview.preview_hash}}),201);
   assert.equal((await json(await req(`/products?branch_id=${branch2.id}&q=BRANCH-2-CSV`,{cookie:independentCookie}))).total,1);
   assert.equal((await json(await req(`/products?branch_id=${a.branch_id}&q=BRANCH-2-CSV`,{cookie:a.cookie}))).total,0);
   const branchSale=await json(await req('/sales',{cookie:managerCookie,body:{branch_id:branch2.id,request_key:randomUUID(),items:[{product_id:branchProduct.id,quantity:1}]}}),201);assert.equal(Number(branchSale.total),15000);
   const ownerBI=await json(await req('/bi/overview',{cookie:a.cookie}));const branchOneRow=ownerBI.by_branch.find(row=>Number(row.id)===Number(a.branch_id)),branchTwoRow=ownerBI.by_branch.find(row=>Number(row.id)===Number(branch2.id));
   assert.ok(branchOneRow);assert.ok(branchTwoRow);assert.equal(Number(branchOneRow.orders),2);assert.equal(Number(branchTwoRow.orders),1);assert.equal(Number(branchTwoRow.net_revenue),15000);assert.equal(Number(branchTwoRow.total_cogs),8000);assert.equal(Number(branchTwoRow.gross_profit),7000);assert.equal(Number(branchTwoRow.inventory_quantity),11);assert.equal(branchTwoRow.manager_name,'Second Branch Manager');
   const resetPassword='Reset-staff-password-2026!';await json(await req('/staff/'+s.id,{cookie:a.cookie,method:'PATCH',body:{status:'ACTIVE',role:'CASHIER',branch_ids:[a.branch_id],password:resetPassword}}));
   assert.equal((await req('/auth/login',{body:{email,password}})).status,401);const resetLogin=await req('/auth/login',{body:{email,password:resetPassword}});assert.equal(resetLogin.status,200);staffCookie=resetLogin.headers.get('set-cookie').split(';')[0];
   await json(await req('/staff/'+s.id,{cookie:a.cookie,method:'PATCH',body:{status:'DISABLED',role:'CASHIER',branch_ids:[a.branch_id]}}));
   assert.equal((await req('/auth/me',{cookie:staffCookie})).status,401);
  });
  await t.test('CSV preview does not write; commit preserves quoted Unicode and does not touch stock',async()=>{
   const csv=`sku,name,sale_price,cost_price,category_id,status\nCSV-ONE,"Áo, ""đen""\nCotton",12000,8000,${category.id},ACTIVE\nCSV-TWO,Giày Việt,0,,,ACTIVE`;
   const preview=await json(await req('/products/import',{cookie:a.cookie,body:{mode:'preview',csv}}));assert.equal(preview.can_commit,true);assert.equal(preview.persisted,false);assert.equal(preview.rows[0].name,'Áo, "đen"\nCotton');
   assert.equal((await json(await req('/products?q=CSV-',{cookie:a.cookie}))).total,0);
   assert.equal((await req('/products/import',{cookie:a.cookie,body:{mode:'commit',csv,preview_hash:'0'.repeat(64)}})).status,409);
   const inventoryBefore=await json(await req('/inventory',{cookie:a.cookie}));
   const committed=await json(await req('/products/import',{cookie:a.cookie,body:{mode:'commit',csv,preview_hash:preview.preview_hash}}),201);assert.equal(committed.count,2);
   assert.equal((await json(await req('/products?q=CSV-',{cookie:a.cookie}))).total,2);
   const inventoryAfter=await json(await req('/inventory',{cookie:a.cookie}));assert.deepEqual(inventoryAfter.items,inventoryBefore.items);
   assert.equal((await req('/products/import',{cookie:a.cookie,body:{mode:'commit',csv,preview_hash:preview.preview_hash}})).status,422);
  });
  await t.test('CSV rejects duplicate SKU, invalid data, foreign category and forbidden headers atomically',async()=>{
   const foreign=await json(await req('/categories',{cookie:b.cookie,body:{name:'Foreign category'}}),201);
   for(const csv of ['sku,name,sale_price\nDUP,A,1\ndup,B,2','sku,name,sale_price\nVALID-ROW,A,1\nBAD-PRICE,B,1.234',`sku,name,sale_price,category_id\nFOREIGN-CAT,A,1,${foreign.id}`]){
    const preview=await json(await req('/products/import',{cookie:a.cookie,body:{mode:'preview',csv}}));assert.equal(preview.can_commit,false);assert.ok(preview.issues.length>0);
    assert.equal((await req('/products/import',{cookie:a.cookie,body:{mode:'commit',csv,preview_hash:preview.preview_hash}})).status,422);
   }
   assert.equal((await json(await req('/products?q=VALID-ROW',{cookie:a.cookie}))).total,0);
   assert.equal((await req('/products/import',{cookie:a.cookie,body:{mode:'preview',csv:'sku,name,sale_price,organization_id\nHACK,A,1,1'}})).status,400);
   assert.equal((await req('/products/import',{cookie:a.cookie,body:{mode:'preview',csv:'sku,name,sale_price\nBROKEN,"unclosed,1'}})).status,400);
  });
  await t.test('concurrent CSV commits create each SKU once without partial duplicate batches',async()=>{
   const csv='sku,name,sale_price\nRACE-ONE,A,1\nRACE-TWO,B,2';
   const preview=await json(await req('/products/import',{cookie:a.cookie,body:{mode:'preview',csv}}));
   const responses=await Promise.all([1,2].map(()=>req('/products/import',{cookie:a.cookie,body:{mode:'commit',csv,preview_hash:preview.preview_hash}})));
   assert.equal(responses.filter(r=>r.status===201).length,1);assert.ok(responses.every(r=>[201,409,422].includes(r.status)));
   assert.equal((await json(await req('/products?q=RACE-',{cookie:a.cookie}))).total,2);
  });
 }finally{
  for(const email of emails)await pool.execute('DELETE FROM registration_otps WHERE email=?',[email]);
  for(const id of orgs){for(const table of ['sale_payments','inventory_movements','stock_document_items','stock_documents','customers','inventory_balances','products','categories','organization_dataset_access','auth_sessions','user_branch_roles','branches','users'])await pool.execute(`DELETE FROM ${table} WHERE organization_id=?`,[id]);await pool.execute('DELETE FROM organizations WHERE id=?',[id]);}
  await new Promise(resolve=>server.close(resolve));await pool.end();
 }
});
