import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
Object.assign(process.env,{MYSQL_DATABASE:'retail_app',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'1',MYSQL_USER:'isolated-test',MYSQL_PASSWORD:'isolated-test',JWT_SECRET:'isolated-test-secret-at-least-32-bytes',NODE_ENV:'test'});
const {pool}=await import('../src/db/pool.js');
const {config}=await import('../src/config/env.js');
const {default:jwt}=await import('jsonwebtoken');
const db=new DatabaseSync(':memory:');
db.function('UTC_TIMESTAMP',()=> '2026-01-01 00:00:00');
db.function('JSON_UNQUOTE',value=>value);
db.exec(`
 CREATE TABLE organizations(id INTEGER PRIMARY KEY,name TEXT,status TEXT);
 CREATE TABLE users(id INTEGER PRIMARY KEY,organization_id INTEGER,email TEXT,full_name TEXT,role TEXT,status TEXT,phone TEXT,locked_until TEXT);
 CREATE TABLE branches(id INTEGER PRIMARY KEY,organization_id INTEGER,name TEXT,status TEXT);
 CREATE TABLE user_branch_roles(organization_id INTEGER,user_id INTEGER,branch_id INTEGER,role TEXT);
 CREATE TABLE auth_sessions(id TEXT PRIMARY KEY,organization_id INTEGER,user_id INTEGER,expires_at TEXT,revoked_at TEXT);
 CREATE TABLE app_settings(scope_type TEXT,scope_id TEXT,settings TEXT);
 CREATE TABLE products(id INTEGER PRIMARY KEY,organization_id INTEGER,category_id INTEGER,sku TEXT DEFAULT 'SKU',name TEXT DEFAULT 'Fixture',status TEXT DEFAULT 'ACTIVE',attributes TEXT DEFAULT '{}');
 CREATE TABLE categories(id INTEGER PRIMARY KEY,organization_id INTEGER,name TEXT);
 INSERT INTO categories VALUES(7,101,'Fixture category one'),(8,101,'Fixture category two'),(70,202,'Other category');
 CREATE TABLE stock_documents(id INTEGER PRIMARY KEY,organization_id INTEGER,branch_id INTEGER,destination_branch_id INTEGER,type TEXT,total NUMERIC,subtotal NUMERIC DEFAULT 0,item_discount_total NUMERIC DEFAULT 0,order_discount NUMERIC DEFAULT 0,created_at TEXT,note TEXT,payment_status TEXT DEFAULT 'PAID',return_status TEXT DEFAULT 'NONE',order_status TEXT DEFAULT 'COMPLETED',returned_amount NUMERIC DEFAULT 0,returned_cost NUMERIC DEFAULT 0,return_reason TEXT,returned_at TEXT);
 CREATE TABLE stock_document_items(organization_id INTEGER,document_id INTEGER,product_id INTEGER,quantity INTEGER DEFAULT 1,unit_price NUMERIC DEFAULT 100,unit_cost NUMERIC DEFAULT 0,line_total NUMERIC DEFAULT 100,returned_quantity NUMERIC DEFAULT 0);
 CREATE TABLE inventory_balances(organization_id INTEGER,branch_id INTEGER,product_id INTEGER,quantity INTEGER,average_cost NUMERIC DEFAULT 0,updated_at TEXT);
 INSERT INTO inventory_balances VALUES(101,11,31,5,0,'2024-03-01 00:00:00'),(101,12,31,8,0,'2024-03-01 00:00:00');
 CREATE TABLE inventory_movements(id INTEGER PRIMARY KEY,organization_id INTEGER,branch_id INTEGER,product_id INTEGER,document_id INTEGER,quantity_delta INTEGER,balance_after INTEGER,created_at TEXT);
 INSERT INTO organizations VALUES(101,'Fixture One','ACTIVE'),(202,'Fixture Two','ACTIVE');
 INSERT INTO users(id,organization_id,email,full_name,role,status) VALUES(1,101,'owner-one@example.invalid','Fixture Owner','OWNER','ACTIVE'),(2,101,'cashier@example.invalid','Fixture Cashier','CASHIER','ACTIVE'),(3,101,'inventory@example.invalid','Fixture Inventory','INVENTORY','ACTIVE'),(4,202,'owner-two@example.invalid','Fixture Owner Two','OWNER','ACTIVE'),(5,101,'manager@example.invalid','Fixture Manager','MANAGER','ACTIVE');
 INSERT INTO branches VALUES(11,101,'Fixture Branch One','ACTIVE'),(12,101,'Fixture Branch Two','ACTIVE'),(21,202,'Other Tenant Branch','ACTIVE');
 INSERT INTO user_branch_roles VALUES(101,2,11,'CASHIER'),(101,3,12,'INVENTORY'),(101,5,12,'MANAGER');
 INSERT INTO products(id,organization_id,category_id) VALUES(31,101,7),(32,101,7),(33,101,8),(34,101,8),(41,202,70);
`);
const insertDoc=db.prepare('INSERT INTO stock_documents(id,organization_id,branch_id,type,total,created_at,note) VALUES(?,?,?,?,?,?,?)');
const insertItem=db.prepare('INSERT INTO stock_document_items(organization_id,document_id,product_id) VALUES(?,?,?)');
for(const [type,offset] of [['SALE',0],['RECEIPT',200]]){
 for(const [id,branch,date,products] of [
  [101,11,'2024-02-27 17:00:00',[31,32]],
  [102,11,'2024-02-29 16:59:59.999999',[32,33]],
  [103,12,'2024-02-29 17:00:00',[33]],
  [104,11,'2024-03-01 05:00:00',[34]],
  [105,12,'2024-02-29 03:00:00',[31]]
 ]){
  insertDoc.run(id+offset,101,branch,type,products.length*100,date,'synthetic fixture');
  for(const product of products)insertItem.run(101,id+offset,product);
 }
 insertDoc.run(201+offset,202,21,type,100,'2024-02-29 10:00:00','other tenant fixture');insertItem.run(202,201+offset,41);
}
let movementId=0;
for(const row of db.prepare('SELECT d.id,d.organization_id,d.branch_id,d.type,d.created_at,x.product_id FROM stock_documents d JOIN stock_document_items x ON x.document_id=d.id AND x.organization_id=d.organization_id').all()){
 db.prepare('INSERT INTO inventory_movements VALUES(?,?,?,?,?,?,?,?)').run(++movementId,row.organization_id,row.branch_id,row.product_id,row.id,row.type==='SALE'?-1:1,5,[102,302].includes(row.id)?'2024-02-29 17:00:01':row.created_at);
}
// SQLite fixture timestamps use one fixed width, matching typed temporal comparisons in MySQL.
for(const [table,column]of [['stock_documents','created_at'],['inventory_movements','created_at'],['inventory_balances','updated_at']]){
 db.exec("UPDATE "+table+" SET "+column+"=substr("+column+"||'.000000',1,26)");
}
const cookies={};
for(const user of [{id:1,org:101,role:'OWNER'},{id:2,org:101,role:'CASHIER'},{id:3,org:101,role:'INVENTORY'},{id:4,org:202,role:'OWNER'},{id:5,org:101,role:'MANAGER'}]){
 const sid=randomUUID();db.prepare('INSERT INTO auth_sessions VALUES(?,?,?,?,NULL)').run(sid,user.org,user.id,'2100-01-01 00:00:00');
 cookies[user.role==='OWNER'?(user.org===101?'owner':'other'):user.role.toLowerCase()]='session='+jwt.sign({},config.secret,{algorithm:'HS256',subject:String(user.id),jwtid:sid,issuer:'retail-app',audience:'retail-web',expiresIn:'1h'});
}
const statements=[];
const snapshotCommands=[];
pool.query=async()=>{throw Error('Unexpected MySQL access in isolated HTTP test');};
pool.getConnection=async()=>({
 query:async sql=>{assert.ok(['SET TRANSACTION ISOLATION LEVEL REPEATABLE READ','START TRANSACTION READ ONLY'].includes(sql));snapshotCommands.push(sql);},
 execute:(...args)=>pool.execute(...args),
 commit:async()=>snapshotCommands.push('COMMIT'),rollback:async()=>snapshotCommands.push('ROLLBACK'),release:()=>snapshotCommands.push('RELEASE')
});
pool.execute=async(sql,args=[])=>{
 if(!/^SELECT\b/i.test(sql))throw Error('Only SELECT is allowed through the mock pool');
 statements.push({sql,args:[...args]});
 // Legacy MySQL date arithmetic is translated only to reproduce the pre-fix behavior.
 const executable=sql.replace(/DATE_ADD\(\?,INTERVAL 1 DAY\)/g,"datetime(?, '+1 day')").replace(/s\.organization_id<=>u\.organization_id/g,'s.organization_id IS u.organization_id');
 const rows=db.prepare(executable.replace(/CAST\(\? AS DATETIME\(6\)\)/g,'?')).all(...args).map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,key.endsWith('_at')&&typeof value==='string'?value.replace(' ','T')+'Z':value])));
 return [rows,[]];
};
const {default:app}=await import('../src/app.js');
test('authenticated sales/receipts HTTP with isolated relational fixtures (no MySQL)',async t=>{
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port+'/api/v1';
 const request=async(path,cookie=cookies.owner)=>{
  const r=await fetch(base+path,{headers:cookie?{Cookie:cookie}:{}});
  return {status:r.status,body:await r.json()};
 };
 try{
  for(const [path,offset] of [['sales',0],['receipts',200]]){
   for(const [name,query,ids] of [
    ['unfiltered','',[105,104,103,102,101]],
    ['category','category_id=7',[105,102,101]],
    ['product','product_id=32',[102,101]],
    ['branch','branch_id=11',[104,102,101]],
    ['inclusive leap day','start=2024-02-29&end=2024-02-29',[105,102]],
    ['lower bound only','start=2024-03-01',[104,103]],
    ['upper bound only','end=2024-02-28',[101]],
    ['all filters','category_id=7&product_id=32&branch_id=11&start=2024-02-29&end=2024-02-29',[102]],
    ['same item must match both','category_id=7&product_id=33',[]],
    ['foreign category','category_id=70',[]],
    ['foreign product','product_id=41',[]],
    ['foreign branch','branch_id=21',[]],
    ['maximum end','end=9999-12-31',[105,104,103,102,101]],
    ['minimum start','start=0001-01-01',[105,104,103,102,101]],
    ['no matches','product_id=999',[]]
   ])await t.test(path+': '+name,async()=>{
    const r=await request('/'+path+(query?'?'+query:''));
    assert.equal(r.status,200,JSON.stringify(r.body));
    assert.equal(r.body.total,ids.length);
    assert.deepEqual(r.body.items.map(row=>row.id),ids.map(id=>id+offset));
   });
   await t.test(path+': distinct documents and consistent pagination',async()=>{
    for(const [page,ids]of [[1,[105]],[2,[102]],[3,[101]],[4,[]]]){
     const r=await request('/'+path+'?category_id=7&limit=1&page='+page);
     assert.equal(r.status,200);assert.equal(r.body.total,3);assert.equal(r.body.page,page);
     assert.deepEqual(r.body.items.map(row=>row.id),ids.map(id=>id+offset));
    }
   });
   await t.test(path+': count and list share exactly the same where and bindings',async()=>{
    statements.length=0;
    const r=await request('/'+path+'?category_id=7&product_id=32&branch_id=11&start=2024-02-29&end=2024-02-29');
    assert.equal(r.status,200);
    const count=statements.find(s=>s.sql.startsWith('SELECT COUNT(*)'));
    const list=statements.find(s=>s.sql.startsWith('SELECT d.id'));
    assert.ok(count&&list);assert.deepEqual(count.args,list.args);
    assert.equal(count.sql.slice(count.sql.indexOf(' WHERE ')+7),list.sql.slice(list.sql.indexOf(' WHERE ')+7).split(' ORDER BY ')[0]);
   });
   await t.test(path+': valid session in other tenant stays isolated',async()=>{
    const r=await request('/'+path,cookies.other);assert.equal(r.status,200);
    assert.deepEqual(r.body.items.map(row=>row.id),[201+offset]);assert.equal(r.body.total,1);
   });
   await t.test(path+': rejects tenant override',async()=>{
    assert.equal((await request('/'+path+'?organization_id=202')).status,403);
   });
   await t.test(path+': unauthenticated is rejected',async()=>{
    assert.equal((await request('/'+path,null)).status,401);
   });
   for(const query of ['start=2023-02-29','end=2024-04-31','start=2024-03-01&end=2024-02-29','start=0000-01-01','end=10000-01-01']){
    await t.test(path+': HTTP 400 before business SQL for '+query,async()=>{
     statements.length=0;const r=await request('/'+path+'?'+query);
     assert.equal(r.status,400);
     assert.ok(r.body.issues?.some(i=>['start','end'].includes(i.path[0])));
     assert.notEqual(r.body.message,'Dữ liệu không hợp lệ');
     assert.equal(statements.filter(s=>s.sql.includes('FROM stock_documents')).length,0);
    });
   }
  }
  await t.test('existing branch assignments are enforced with combined filters',async()=>{
   const sales=await request('/sales?category_id=7',cookies.cashier);
   assert.equal(sales.status,200);assert.deepEqual(sales.body.items.map(r=>r.id),[102,101]);assert.equal(sales.body.total,2);
   assert.equal((await request('/sales?branch_id=12&product_id=31',cookies.cashier)).body.total,0);
   const receipts=await request('/receipts?category_id=7',cookies.inventory);
   assert.equal(receipts.status,200);assert.deepEqual(receipts.body.items.map(r=>r.id),[305]);assert.equal(receipts.body.total,1);
  });
  await t.test('calendar metadata uses backend policy; client timezone cannot override it',async()=>{
   const r=await request('/sales?start=2024-02-29&end=2024-02-29&timezone=UTC');
   assert.equal(r.body.calendar.timezone,'Asia/Ho_Chi_Minh');assert.equal(r.body.calendar.policy_version,'business-calendar-v1');
   assert.equal(r.body.calendar.start_utc,'2024-02-28T17:00:00.000Z');assert.equal(r.body.calendar.end_utc_exclusive,'2024-02-29T17:00:00.000Z');
  });
  await t.test('empty TIMESTAMP domain returns scoped empty rather than overflowing',async()=>{
   for(const q of ['start=9999-12-31','end=0001-01-01']){
    const r=await request('/sales?'+q);assert.equal(r.status,200);assert.equal(r.body.total,0);assert.equal(r.body.calendar.empty,true);
   }
  });
  await t.test('BI KPI, local-day chart and sales list agree at midnight',async()=>{
   const q='?start=2024-02-29&end=2024-02-29';
   const bi=await request('/bi/overview'+q);assert.equal(bi.status,200,JSON.stringify(bi.body));
   const list=await request('/sales'+q);
   assert.equal(bi.body.kpi.orders,list.body.total);assert.equal(bi.body.kpi.orders,2);
   assert.equal(Number(bi.body.kpi.revenue),300);assert.equal(Number(bi.body.kpi.units),3);
   assert.deepEqual(bi.body.trend,[{period:'2024-02-29',revenue:300,net_revenue:300,total_cogs:0,gross_profit:300,profit_margin_pct:100,units:3,orders:2}]);
   assert.equal(Number(bi.body.kpi.gross_profit),Number(bi.body.kpi.revenue)-Number(bi.body.kpi.total_cogs));
   assert.equal(bi.body.trend.reduce((n,r)=>n+Number(r.revenue),0),Number(bi.body.kpi.revenue));
   assert.deepEqual(bi.body.calendar,list.body.calendar);
  });
  await t.test('monthly chart uses local month, not the UTC month of boundary sale',async()=>{
   const r=await request('/bi/overview?start=2024-03-01&end=2024-03-01&granularity=month');
   assert.equal(r.status,200,JSON.stringify(r.body));assert.deepEqual(r.body.trend,[{period:'2024-03',revenue:200,net_revenue:200,total_cogs:0,gross_profit:200,profit_margin_pct:100,units:2,orders:2}]);
  });
  await t.test('BI all-time totals remain unchanged and empty tenant scope has no invented buckets',async()=>{
   const all=await request('/bi/overview');assert.equal(all.status,200,JSON.stringify(all.body));
   assert.equal(all.body.kpi.orders,5);assert.equal(Number(all.body.kpi.revenue),700);
   assert.equal(all.body.trend.reduce((n,r)=>n+Number(r.revenue),0),700);
   const empty=await request('/bi/overview?product_id=999');assert.equal(empty.status,200);assert.deepEqual(empty.body.trend,[]);assert.equal(empty.body.kpi.orders,0);
  });
  await t.test('line-filtered BI preserves P1.2 semantics and tenant isolation',async()=>{
   const r=await request('/bi/overview?category_id=7&product_id=32&start=2024-02-29&end=2024-02-29');
   assert.equal(r.status,200);assert.equal(Number(r.body.kpi.revenue),100);assert.equal(r.body.kpi.orders,1);
   assert.equal((await request('/bi/overview?organization_id=202')).status,403);
   const other=await request('/bi/overview',cookies.other);assert.equal(other.body.kpi.orders,1);assert.equal(Number(other.body.kpi.revenue),100);
  });
  await t.test('MANAGER dashboard is isolated to assigned branch and fills requested daily buckets',async()=>{
   const manager=await request('/bi/overview?start=2024-02-27&end=2024-03-01',cookies.manager);
   assert.equal(manager.status,200);assert.equal(Number(manager.body.kpi.revenue),200);assert.equal(Number(manager.body.kpi.orders),2);assert.equal(Number(manager.body.inventory.quantity),8);
   assert.deepEqual(manager.body.trend.map(row=>row.period),['2024-02-27','2024-02-28','2024-02-29','2024-03-01']);
   assert.deepEqual(manager.body.trend.map(row=>Number(row.revenue)),[0,0,100,100]);
   assert.deepEqual(manager.body.by_branch.map(branch=>Number(branch.id)),[12]);
   const deniedScope=await request('/bi/overview?branch_id=11',cookies.manager);
   assert.equal(deniedScope.status,200);assert.equal(Number(deniedScope.body.kpi.revenue),0);assert.equal(Number(deniedScope.body.inventory.quantity),0);
  });
  await t.test('movement filters/grouping use parent document time and retain raw audit time',async()=>{
   const r=await request('/inventory/movements?start=2024-02-29&end=2024-02-29&product_id=32');
   assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.items.length,2);
   for(const item of r.body.items){
    assert.equal(item.created_at,'2024-02-29T17:00:01.000000Z');assert.equal(item.document_created_at,'2024-02-29T16:59:59.999999Z');
   }
   const bi=await request('/bi/overview?start=2024-02-29&end=2024-02-29');
   assert.deepEqual(bi.body.movements,[{period:'2024-02-29',incoming:3,outgoing:3}]);
   assert.equal(r.body.calendar.timestamp_source,'stock_documents.created_at');
  });
  await t.test('current inventory ignores report dates and exposes explicit update-time calendar',async()=>{
   const a=await request('/inventory?start=2024-02-28&end=2024-02-28');
   const b=await request('/inventory?start=2024-03-01&end=2024-03-01');
   assert.equal(a.status,200);assert.deepEqual(a.body.items,b.body.items);
   assert.equal(a.body.calendar.timestamp_source,'inventory_balances.updated_at');
  });
  await t.test('BI read snapshot is explicit, read-only and does not use SQL named timezones',async()=>{
   snapshotCommands.length=0;statements.length=0;
   assert.equal((await request('/bi/overview')).status,200);
   assert.deepEqual(snapshotCommands,['SET TRANSACTION ISOLATION LEVEL REPEATABLE READ','START TRANSACTION READ ONLY','COMMIT','RELEASE']);
   assert.ok(!statements.some(s=>/CONVERT_TZ|DATE_FORMAT/.test(s.sql)));
  });
  await t.test('existing role restrictions remain unchanged',async()=>{
   assert.equal((await request('/receipts',cookies.cashier)).status,403);
   assert.equal((await request('/sales',cookies.inventory)).status,403);
  });
 }finally{
  await new Promise(resolve=>server.close(resolve));
  await pool.end();db.close();
 }
});
