import {test,expect} from '@playwright/test';
const calendar={timezone:'Asia/Ho_Chi_Minh',policy_version:'business-calendar-v1',timestamp_basis:'UTC',timestamp_source:'stock_documents.created_at'};
const at='2026-11-05T17:00:00.000Z';
for(const timezoneId of ['UTC','Asia/Ho_Chi_Minh','America/Los_Angeles']){
 test.describe(timezoneId,()=>{
  test.use({timezoneId});
  test('Dashboard and receipt history use server calendar independently of browser',async({page})=>{
   const errors=[];const requests=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/**',async route=>{
    const request=route.request();if(request.method()!=='GET')throw Error('Calendar UI test must never write');
    const url=new URL(request.url()),path=url.pathname;requests.push(url.pathname+url.search);
    const document={id:900,branch_id:11,branch_name:'Fixture branch',organization_name:'Fixture store',total:200,type:'RECEIPT',created_at:at};
    let data;
    if(path.endsWith('/auth/me'))data={user:{id:1,organization_id:101,name:'Fixture owner',full_name:'Fixture owner',email:'fixture@example.invalid',role:'OWNER',stores:['11'],branches:[{id:11,name:'Fixture branch'}]}};
    else if(path.endsWith('/dashboard/overview'))data={organization:{id:101,name:'Fixture store'},branches:1,calendar};
    else if(path.endsWith('/bi/overview'))data={calendar,source:'OPERATIONAL',as_of:at,has_sales:true,kpi:{orders:1,units:2,revenue:200},trend:[{period:'2026-11-06',revenue:200,units:2,orders:1}],by_branch:[],by_category:[],top_products:[],slow_products:[],movements:[],inventory:{quantity:8,by_branch:[],highest:[],valuation:null}};
    else if(path.endsWith('/ai/summary'))data={forecast_total:null,recommended_sku_count:null,recommended_quantity:null,alert_count:null,statuses:{sku:'UNAVAILABLE'},multi:[]};
    else if(path.endsWith('/branches'))data={branches:[{id:11,name:'Fixture branch'}]};
    else if(path.endsWith('/categories'))data={items:[]};
    else if(path.endsWith('/products'))data={items:[],total:0};
    else if(path.endsWith('/receipts/900'))data={document,items:[{sku:'F1',product_name:'Fixture',quantity:2,unit_price:100,line_total:200}],calendar};
    else if(path.endsWith('/receipts'))data={items:[document],total:1,page:1,calendar};
    else if(path.endsWith('/inventory/movements'))data={items:[{id:1,sku:'F1',branch_name:'Fixture branch',type:'RECEIPT',quantity_delta:2,balance_after:8,document_created_at:at,created_at:'2026-11-05T17:00:01Z'}],calendar};
    else if(path.endsWith('/inventory'))data={items:[{id:1,sku:'F1',name:'Fixture',branch_name:'Fixture branch',quantity:8,updated_at:at}],total:1,page:1,calendar:{...calendar,timestamp_source:'inventory_balances.updated_at'},valuation:{reason:'Fixture: valuation not configured'}};
    else throw Error('Unmocked API: '+path);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
   });
   await page.goto('/');
   await expect(page.getByRole('heading',{name:'Tổng quan kinh doanh'})).toBeVisible();
   await expect(page.getByText(/AI giữ calendar hiện tại/)).toBeVisible();
   await expect(page.getByText(/Cập nhật.*00:00:00.*06\/11\/2026/)).toBeVisible();
   await expect(page.getByText(/Ngày kinh doanh · Asia\/Ho_Chi_Minh/).first()).toBeVisible();
   await page.locator('input[type=date]').nth(0).fill('2026-11-06');
   await page.locator('input[type=date]').nth(1).fill('2026-11-06');
   await expect.poll(()=>requests.some(r=>r.startsWith('/api/v1/bi/overview?')&&r.includes('start=2026-11-06')&&r.includes('end=2026-11-06'))).toBe(true);
   await page.goto('/inventory');
   await expect(page.locator('input[type=date]')).toHaveCount(2);
   await expect(page.getByText(/số tồn vẫn là tồn hiện tại/)).toBeVisible();
   await expect(page.getByRole('cell',{name:/00:00:00.*06\/11\/2026/}).first()).toBeVisible();
   await expect(page.getByRole('columnheader',{name:'Thời gian chứng từ'})).toBeVisible();
   await expect(page.getByRole('columnheader',{name:'Thời gian ghi movement (audit)'})).toBeVisible();
   await page.locator('input[type=date]').nth(0).fill('2026-11-06');
   await page.locator('input[type=date]').nth(1).fill('2026-11-06');
   await expect.poll(()=>requests.some(r=>r.startsWith('/api/v1/receipts?')&&r.includes('start=2026-11-06')&&r.includes('end=2026-11-06'))).toBe(true);
   await page.getByRole('button',{name:'Xem',exact:true}).click();
   await expect(page.locator('.op-invoice').getByText(/00:00:00.*06\/11\/2026/)).toBeVisible();
   expect(errors).toEqual([]);
  });
 });
}
