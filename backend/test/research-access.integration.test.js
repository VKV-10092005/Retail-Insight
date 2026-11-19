import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
process.env.NODE_ENV='development';

test('research APIs allow only platform administrators',{skip:process.env.RUN_DB_TESTS!=='1'},async()=>{
 const {pool,verifyDatabase}=await import('../src/db/pool.js');
 const {config}=await import('../src/config/env.js');
 const {default:app}=await import('../src/app.js');
 await verifyDatabase();
 const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
 const base=`http://127.0.0.1:${server.address().port}/api/v1`,userIds=[],sessions=[];let organizationId;
 async function fixture(role,organizationIdValue){
  const [created]=await pool.execute('INSERT INTO users(organization_id,email,password_hash,full_name,role) VALUES (?,?,?,?,?)',[organizationIdValue,`research-${randomUUID()}@example.test`,'test-placeholder-hash',`Research ${role}`,role]);userIds.push(created.insertId);
  const session=randomUUID();sessions.push(session);await pool.execute('INSERT INTO auth_sessions(id,organization_id,user_id,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE))',[session,organizationIdValue,created.insertId]);
  const token=jwt.sign({},config.secret,{algorithm:'HS256',subject:String(created.insertId),jwtid:session,issuer:'retail-app',audience:'retail-web',expiresIn:'10m'});return `session=${token}`;
 }
 try{
  const [organization]=await pool.execute('INSERT INTO organizations(name,slug) VALUES (?,?)',['Research Access Test',randomUUID()]);organizationId=organization.insertId;
  for(const role of ['OWNER','MANAGER','CASHIER','INVENTORY']){
   const cookie=await fixture(role,organizationId),response=await fetch(`${base}/research/datasets`,{headers:{Cookie:cookie,Accept:'application/json'}});assert.equal(response.status,403,`${role} must not access research APIs`);
  }
  const adminCookie=await fixture('PLATFORM_ADMIN',null),adminResponse=await fetch(`${base}/research/datasets`,{headers:{Cookie:adminCookie,Accept:'application/json'}});assert.equal(adminResponse.status,200,await adminResponse.clone().text());assert.ok(Array.isArray((await adminResponse.json()).items));
 }finally{
  if(sessions.length)await pool.execute(`DELETE FROM auth_sessions WHERE id IN (${sessions.map(()=>'?').join(',')})`,sessions);
  if(userIds.length)await pool.execute(`DELETE FROM users WHERE id IN (${userIds.map(()=>'?').join(',')})`,userIds);
  if(organizationId)await pool.execute('DELETE FROM organizations WHERE id=?',[organizationId]);
  await new Promise(resolve=>server.close(resolve));await pool.end();
 }
});
