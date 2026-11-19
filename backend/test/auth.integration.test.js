import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
process.env.NODE_ENV='development';
process.env.ALLOW_DEV_OTP='1';
process.env.SMTP_USER='';
process.env.SMTP_PASS='';
// Opt in: this test creates and cleans up only its own fixtures in retail_app.
test('real HTTP + MySQL authentication, RBAC and tenant isolation',{skip:process.env.RUN_DB_TESTS!=='1'},async t=>{
 const {pool,verifyDatabase}=await import('../src/db/pool.js');
 const {default:app}=await import('../src/app.js');
 await verifyDatabase();
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base=`http://127.0.0.1:${server.address().port}/api/v1`;
 const ids=[]; const emails=[]; const password='Sprint1-test-password-2026';
 async function request(path,{body,cookie,method=body?'POST':'GET',headers={}}={}){
  return fetch(base+path,{method,headers:{'Content-Type':'application/json','X-Requested-With':'retail-web',...(cookie?{Cookie:cookie}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
 }
 async function create(label){
  const email=`sprint1-${randomUUID()}@example.test`;emails.push(email);
  const sent=await request('/auth/send-register-otp',{body:{email}});assert.equal(sent.status,200);const {dev_otp}=await sent.json();assert.match(dev_otp,/^\d{6}$/);
  const verified=await request('/auth/verify-register-otp',{body:{email,otp:dev_otp}});assert.equal(verified.status,200);const {verification_token}=await verified.json();
  const res=await request('/auth/register',{body:{name:'Sprint Test',storeName:label,email,password,confirm_password:password,verification_token}});assert.equal(res.status,201);
  const [rows]=await pool.execute('SELECT id,organization_id,password_hash FROM users WHERE email=?',[email]);
  ids.push(rows[0].organization_id);assert.notEqual(rows[0].password_hash,password);
  return {...rows[0],email};
 }
 async function login(email,pw=password){return request('/auth/login',{body:{email,password:pw}});}
 try {
  await t.test('unauthenticated, CSRF and validation',async()=>{
   assert.equal((await request('/users')).status,401);
   assert.equal((await request('/auth/register',{body:{}})).status,400);
   assert.equal((await request('/auth/login',{body:{email:'x@example.test',password},headers:{Origin:'https://foreign.invalid'}})).status,403);
  });
  const a=await create('Sprint organization A'),b=await create('Sprint organization B');
  const [branchesA]=await pool.execute('SELECT id FROM branches WHERE organization_id=?',[a.organization_id]);
  const [branchesB]=await pool.execute('SELECT id FROM branches WHERE organization_id=?',[b.organization_id]);
  const branchA=branchesA[0].id,branchB=branchesB[0].id;
  await t.test('duplicate email and invalid password',async()=>{
   assert.equal((await request('/auth/send-register-otp',{body:{email:a.email}})).status,409);
   assert.equal((await login(a.email,'incorrect')).status,401);
   assert.equal((await login(`missing-${randomUUID()}@example.test`)).status,401);
  });
  const logged=await login(a.email);assert.equal(logged.status,200);
  const setCookie=logged.headers.get('set-cookie');assert.match(setCookie,/HttpOnly/i);assert.match(setCookie,/SameSite=Lax/i);
  const cookie=setCookie.split(';')[0];
  await t.test('JWT tampering, expiry and wrong audience rejected',async()=>{
   const {default:jwt}=await import('jsonwebtoken');
   const {config}=await import('../src/config/env.js');
   const raw=cookie.slice('session='.length);const claims=jwt.verify(raw,config.secret);
   const parts=raw.split('.');parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
   assert.equal((await request('/auth/me',{cookie:'session='+parts.join('.')})).status,401);
   for(const options of [{expiresIn:-1,audience:'retail-web'},{expiresIn:'1h',audience:'different-client'}]){
    const invalid=jwt.sign({},config.secret,{algorithm:'HS256',subject:claims.sub,jwtid:claims.jti,issuer:'retail-app',...options});
    assert.equal((await request('/auth/me',{cookie:'session='+invalid})).status,401);
   }
  });
  await t.test('me and organization isolation',async()=>{
   const me=await request('/auth/me',{cookie});assert.equal(me.status,200);const data=await me.json();assert.equal(data.user.organization_id,a.organization_id);assert.ok(!('password_hash' in data.user));
   const dash=await (await request('/dashboard/overview',{cookie})).json();assert.equal(dash.organization.id,a.organization_id);
   assert.equal((await request(`/branches/${branchB}`,{cookie})).status,404);
   assert.equal((await request(`/branches/${branchA}`,{cookie})).status,200);
   assert.equal((await request('/users?organization_id='+b.organization_id,{cookie})).status,403);
   assert.equal((await request('/users',{cookie,headers:{'X-Organization-Id':String(b.organization_id)}})).status,403);
   const users=await (await request('/users',{cookie})).json();assert.equal(users.users.length,1);assert.equal(users.users[0].email,a.email);
  });
  await t.test('composite foreign keys reject cross-tenant role assignment',async()=>{
   await assert.rejects(pool.execute("INSERT INTO user_branch_roles(organization_id,user_id,branch_id,role) VALUES (?,?,?,'CASHIER')",[a.organization_id,a.id,branchB]),e=>e.code==='ER_NO_REFERENCED_ROW_2');
  });
  await t.test('roles read from database and branch permissions enforced',async()=>{
   await pool.execute("UPDATE users SET role='CASHIER' WHERE id=? AND organization_id=?",[a.id,a.organization_id]);
   await pool.execute("UPDATE user_branch_roles SET role='CASHIER' WHERE user_id=? AND organization_id=?",[a.id,a.organization_id]);
   assert.equal((await request('/users',{cookie})).status,403);
   assert.equal((await request(`/branches/${branchA}/management`,{cookie})).status,403);
   assert.equal((await request(`/branches/${branchA}`,{cookie})).status,200);
   await pool.execute('DELETE FROM user_branch_roles WHERE user_id=? AND organization_id=?',[a.id,a.organization_id]);
   assert.equal((await request(`/branches/${branchA}`,{cookie})).status,403);
  });
  await t.test('logout revokes captured JWT',async()=>{
   assert.equal((await request('/auth/logout',{cookie,method:'POST'})).status,204);
   assert.equal((await request('/auth/me',{cookie})).status,401);
  });
  await t.test('disabled accounts cannot use existing session',async()=>{
   const res=await login(b.email);const other=res.headers.get('set-cookie').split(';')[0];
   await pool.execute("UPDATE users SET status='DISABLED' WHERE id=? AND organization_id=?",[b.id,b.organization_id]);
   assert.equal((await request('/auth/me',{cookie:other})).status,401);
  });
 } finally {
  for(const email of emails)await pool.execute('DELETE FROM registration_otps WHERE email=?',[email]);
  for(const email of emails){const [rows]=await pool.execute('SELECT organization_id FROM users WHERE email=?',[email]);for(const row of rows)if(!ids.includes(row.organization_id))ids.push(row.organization_id);}
  for(const id of ids){
   for(const table of ['auth_sessions','user_branch_roles','branches','users']) await pool.execute(`DELETE FROM ${table} WHERE organization_id=?`,[id]);
   await pool.execute('DELETE FROM organizations WHERE id=?',[id]);
  }
  await new Promise(resolve=>server.close(resolve));await pool.end();
 }
});

