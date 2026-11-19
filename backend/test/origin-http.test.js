import test from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV='development';
const {default:app}=await import('../src/app.js');
const {pool}=await import('../src/db/pool.js');
test('CORS and CSRF use the same development allowlist without database writes',async t=>{
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port+'/api/v1/auth';
 const send=(origin,path='/login',csrf=true)=>fetch(base+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(csrf?{'X-Requested-With':'retail-web'}:{})},body:'{}'});
 try {
  for(const origin of ['http://localhost:5173','http://127.0.0.1:5173'])await t.test(origin,async()=>{
   const r=await send(origin);assert.equal(r.status,400);assert.equal(r.headers.get('access-control-allow-origin'),origin);assert.equal(r.headers.get('access-control-allow-credentials'),'true');
   assert.equal((await send(origin,'/login',false)).status,403);
   assert.equal((await send(origin,'/logout')).status,401);
   assert.equal((await fetch(base+'/me',{headers:{Origin:origin}})).status,401);
   const pre=await fetch(base+'/login',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'x-requested-with,content-type'}});
   assert.equal(pre.status,204);assert.equal(pre.headers.get('access-control-allow-origin'),origin);assert.equal(pre.headers.get('access-control-allow-credentials'),'true');
  });
  for(const origin of ['http://evil.invalid','http://localhost:5173.evil.invalid','null'])await t.test('denies '+origin,async()=>{
   const r=await send(origin);assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),null);
  });
 } finally {await new Promise(resolve=>server.close(resolve));await pool.end();}
});
