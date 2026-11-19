import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
test('session checks do not consume credential rate limit; throttling returns JSON',{skip:process.env.RUN_DB_TESTS!=='1'},async()=>{
 const {default:app}=await import('../src/app.js');const {pool}=await import('../src/db/pool.js');const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base=`http://127.0.0.1:${server.address().port}/api/v1/auth`;
 try{
  for(let i=0;i<110;i++)assert.equal((await fetch(base+'/me')).status,401);
  for(let i=0;i<100;i++)assert.equal((await fetch(base+'/register',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'retail-web'},body:'{}'})).status,400);
  const response=await fetch(base+'/register',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'retail-web'},body:'{}'});assert.equal(response.status,429);assert.match((await response.json()).message,/Quá nhiều/);
  assert.equal((await fetch(base+'/me')).status,401);
 }finally{await new Promise(resolve=>server.close(resolve));await pool.end();}
});
