import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
process.env.NODE_ENV='development';

test('tenant notifications are scoped and read state persists per user',{skip:process.env.RUN_DB_TESTS!=='1'},async()=>{
 const {pool,verifyDatabase}=await import('../src/db/pool.js');
 const {config}=await import('../src/config/env.js');
 const {default:app}=await import('../src/app.js');
 await verifyDatabase();
 const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
 const base=`http://127.0.0.1:${server.address().port}/api/v1`;
 let organizationId,userId,branchId,productId,sessionId;
 async function request(path,{method='GET',cookie,body}={}){
  return fetch(base+path,{method,headers:{Accept:'application/json','Content-Type':'application/json','X-Requested-With':'retail-web',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
 }
 try{
  const [org]=await pool.execute('INSERT INTO organizations(name,slug) VALUES (?,?)',['Notification fixture',randomUUID()]);organizationId=org.insertId;
  const [user]=await pool.execute("INSERT INTO users(organization_id,email,password_hash,full_name,role) VALUES (?,?,?,'Notification Fixture','OWNER')",[organizationId,`notifications-${randomUUID()}@example.test`,'test-placeholder-hash-not-a-login-secret']);userId=user.insertId;
  const [branch]=await pool.execute('INSERT INTO branches(organization_id,name) VALUES (?,?)',[organizationId,'Notification Branch']);branchId=branch.insertId;
  const [product]=await pool.execute("INSERT INTO products(organization_id,sku,name,sale_price,attributes) VALUES (?,?,?,?,?)",[organizationId,'NOTIFY-LOW','Low stock fixture',100,JSON.stringify({min_stock:5})]);productId=product.insertId;
  await pool.execute('INSERT INTO inventory_balances(organization_id,branch_id,product_id,quantity) VALUES (?,?,?,?)',[organizationId,branchId,productId,3]);
  sessionId=randomUUID();await pool.execute('INSERT INTO auth_sessions(id,organization_id,user_id,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE))',[sessionId,organizationId,userId]);
  const token=jwt.sign({},config.secret,{algorithm:'HS256',subject:String(userId),jwtid:sessionId,issuer:'retail-app',audience:'retail-web',expiresIn:'10m'}),cookie=`session=${token}`;
  const response=await request('/notifications',{cookie});assert.equal(response.status,200,await response.clone().text());
  const initial=await response.json();const alert=initial.items.find(item=>item.id===`stock:${branchId}:${productId}`);assert.ok(alert);assert.equal(alert.kind,'LOW_STOCK');assert.equal(alert.read,false);assert.equal(initial.unread_count,1);
  const marked=await request('/notifications/read',{method:'PATCH',cookie,body:{ids:[alert.id]}});assert.equal(marked.status,200);assert.equal((await marked.json()).marked_read,1);
  const after=await request('/notifications',{cookie});const updated=await after.json();assert.equal(updated.items.find(item=>item.id===alert.id).read,true);assert.equal(updated.unread_count,0);
 }finally{
  if(organizationId){
   await pool.execute('DELETE FROM auth_sessions WHERE organization_id=?',[organizationId]);
   await pool.execute('DELETE FROM inventory_balances WHERE organization_id=?',[organizationId]);
   await pool.execute('DELETE FROM products WHERE organization_id=?',[organizationId]);
   await pool.execute('DELETE FROM branches WHERE organization_id=?',[organizationId]);
   await pool.execute('DELETE FROM users WHERE organization_id=?',[organizationId]);
   await pool.execute('DELETE FROM organizations WHERE id=?',[organizationId]);
  }
  await new Promise(resolve=>server.close(resolve));await pool.end();
 }
});
