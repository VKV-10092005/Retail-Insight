import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
process.env.NODE_ENV='development';

test('owner can safely switch into same-tenant staff sessions and return',{skip:process.env.RUN_DB_TESTS!=='1'},async()=>{
 const {pool,verifyDatabase}=await import('../src/db/pool.js');
 const {config}=await import('../src/config/env.js');
 const {default:app}=await import('../src/app.js');
 await verifyDatabase();
 const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
 const base=`http://127.0.0.1:${server.address().port}/api/v1`;
 const organizations=[];
 async function request(path,{method='GET',cookie,body}={}){
  return fetch(base+path,{method,headers:{Accept:'application/json','Content-Type':'application/json','X-Requested-With':'retail-web',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
 }
 function cookieFrom(response,name){
  const headers=response.headers.getSetCookie?.()||[response.headers.get('set-cookie')||''];
  const value=headers.find(header=>header.startsWith(name+'='));
  assert.ok(value,`missing ${name} cookie`);return value.split(';')[0];
 }
 async function makeOrg(label){
  const [org]=await pool.execute('INSERT INTO organizations(name,slug) VALUES (?,?)',[label,randomUUID()]);organizations.push(org.insertId);
  const orgId=org.insertId;
  const [branch]=await pool.execute('INSERT INTO branches(organization_id,name) VALUES (?,?)',[orgId,'Main']);
  async function makeUser(role){
   const email=`impersonation-${role.toLowerCase()}-${randomUUID()}@example.test`;
   const [result]=await pool.execute('INSERT INTO users(organization_id,email,password_hash,full_name,role) VALUES (?,?,?,?,?)',[orgId,email,'test-placeholder-hash-not-a-login-secret',`Fixture ${role}`,role]);
   await pool.execute('INSERT INTO user_branch_roles(organization_id,user_id,branch_id,role) VALUES (?,?,?,?)',[orgId,result.insertId,branch.insertId,role]);
   return {id:result.insertId,organization_id:orgId,email,full_name:`Fixture ${role}`,phone:null,role,branch_id:branch.insertId};
  }
  return {id:orgId,branch_id:branch.insertId,owner:await makeUser('OWNER'),manager:await makeUser('MANAGER'),cashier:await makeUser('CASHIER'),inventory:await makeUser('INVENTORY')};
 }
 async function sessionFor(user){
  const id=randomUUID();await pool.execute('INSERT INTO auth_sessions(id,organization_id,user_id,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE))',[id,user.organization_id,user.id]);
  const token=jwt.sign({},config.secret,{algorithm:'HS256',subject:String(user.id),jwtid:id,issuer:'retail-app',audience:'retail-web',expiresIn:'30m'});
  return `session=${token}`;
 }
 try{
  const org=await makeOrg('Impersonation integration fixture');
  const foreign=await makeOrg('Foreign impersonation fixture');
  const foreignStaff=foreign.manager;
  const ownerCookie=await sessionFor(org.owner);
  const cashierCookie=await sessionFor(org.cashier);
  const managerCookie=await sessionFor(org.manager);
  for(const staff of [org.cashier,org.manager,org.inventory]){
   const response=await request(`/staff/${staff.id}/impersonate`,{method:'POST',cookie:ownerCookie,body:{}});
   assert.equal(response.status,200,await response.clone().text());
   const switchedCookie=`${cookieFrom(response,'session')}; ${cookieFrom(response,'owner_session')}`;
   const switched=await response.json();assert.equal(switched.user.id,staff.id);assert.equal(switched.user.role,staff.role);assert.equal(switched.user.impersonating,true);
   const me=await request('/auth/me',{cookie:switchedCookie});assert.equal(me.status,200);const current=(await me.json()).user;assert.equal(current.id,staff.id);assert.equal(current.impersonating,true);
   const returned=await request('/staff/impersonate/return',{method:'POST',cookie:switchedCookie,body:{}});
   assert.equal(returned.status,200,await returned.clone().text());assert.equal((await returned.json()).user.role,'OWNER');
   const restored=await request('/auth/me',{cookie:cookieFrom(returned,'session')});assert.equal((await restored.json()).user.role,'OWNER');
   assert.equal((await request('/auth/me',{cookie:switchedCookie})).status,401);
  }
  assert.equal((await request(`/staff/${foreignStaff.id}/impersonate`,{method:'POST',cookie:ownerCookie,body:{}})).status,404);
  assert.equal((await request(`/staff/${org.cashier.id}/impersonate`,{method:'POST',cookie:cashierCookie,body:{}})).status,403);
  assert.equal((await request(`/staff/${org.cashier.id}/impersonate`,{method:'POST',cookie:managerCookie,body:{}})).status,403);
  await pool.execute("UPDATE users SET status='DISABLED' WHERE id=? AND organization_id=?",[org.cashier.id,org.id]);
  assert.equal((await request(`/staff/${org.cashier.id}/impersonate`,{method:'POST',cookie:ownerCookie,body:{}})).status,400);
  const [logs]=await pool.execute("SELECT user_id,details FROM audit_logs WHERE organization_id=? AND event_type='IMPERSONATE_STAFF' ORDER BY id",[org.id]);
  assert.ok(logs.length>=6);const started=typeof logs[0].details==='string'?JSON.parse(logs[0].details):logs[0].details;assert.equal(Number(logs[0].user_id),org.owner.id);assert.equal(Number(started.actor_user_id),org.owner.id);assert.equal(Number(started.target_user_id),org.cashier.id);
 }finally{
  for(const organizationId of organizations){
   for(const table of ['auth_sessions','user_branch_roles','users','branches'])await pool.execute(`DELETE FROM ${table} WHERE organization_id=?`,[organizationId]);
   await pool.execute('DELETE FROM audit_logs WHERE organization_id=? AND event_type=\'IMPERSONATE_STAFF\'',[organizationId]);
   await pool.execute('DELETE FROM organizations WHERE id=?',[organizationId]);
  }
  await new Promise(resolve=>server.close(resolve));await pool.end();
 }
});
