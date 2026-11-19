import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

test('production OTP API never returns dev_otp when SMTP is unavailable',{skip:process.env.RUN_DB_TESTS!=='1'},async()=>{
 process.env.NODE_ENV='production';
 process.env.ALLOW_DEV_OTP='1';
 process.env.SMTP_USER='';
 process.env.SMTP_PASS='';
 const {pool,verifyDatabase}=await import('../src/db/pool.js');
 const {default:app}=await import('../src/app.js');
 await verifyDatabase();
 const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
 const email=`otp-production-${randomUUID()}@example.test`;
 try{
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/auth/send-register-otp`,{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'retail-web'},body:JSON.stringify({email})});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(Object.hasOwn(body,'dev_otp'),false);
 }finally{
  await pool.execute('DELETE FROM registration_otps WHERE email=?',[email]);
  await new Promise(resolve=>server.close(resolve));
  await pool.end();
 }
});
