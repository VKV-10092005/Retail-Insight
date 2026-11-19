import '../no-network.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createP14Lifecycle} from '../../../src/p14/lifecycle.js';
import {createP14Administration,lockUserSet} from '../../../src/p14/rc2/administration.js';
import {createP14LedgerRouter} from '../../../src/p14/rc2/router.js';
import {modelDatabase} from '../model.js';

test('lifecycle default disabled does not probe any database',async()=>{
 let calls=0;const l=createP14Lifecycle({probe:async()=>{calls++;}});
 assert.equal((await l.readiness()).ready,false);assert.equal(calls,0);assert.throws(()=>l.enter());
});
test('readiness incompatible/maintenance fails closed and drain rejects new admission',async()=>{
 const l=createP14Lifecycle({enabled:true,probe:async()=>({mode:'MAINTENANCE'})});
 assert.equal((await l.readiness()).ready,false);
 await l.drain();assert.throws(()=>l.enter());
});
test('graceful drain waits for inflight and closes pools once work releases',async()=>{
 let closed=0;
 const l=createP14Lifecycle({enabled:true,probe:async()=>({mode:'ENFORCED',schema_version:2,required_writer_epoch:1,reader_basis:'RECORDED_TIME'}),close:async()=>{closed++;}});
 assert.equal((await l.readiness()).ready,true);
 const release=l.enter(),drain=l.drain();assert.equal(l.inflight,1);
 release();release();await drain;assert.equal(l.inflight,0);assert.equal(closed,1);
});
test('drain timeout surfaces cancellation requirement; never silently closes active work',async()=>{
 let closed=0;const l=createP14Lifecycle({enabled:true,close:async()=>closed++});
 const done=l.enter();await assert.rejects(l.drain({timeoutMs:5}),/deadline/);
 assert.equal(closed,0);done();
});
test('router factory requires explicit auth and tenant middleware',()=>{
 assert.throws(()=>createP14LedgerRouter({}));
 const router=createP14LedgerRouter({authenticate:(q,s,n)=>n(),tenantScope:(q,s,n)=>n()});
 assert.equal(router.stack.filter(l=>l.route).length,2);
});
test('admin services default to disabled without touching pool',async()=>{
 const db=modelDatabase(),admin=createP14Administration({pool:db.pool});
 await assert.rejects(admin.closePeriod({context:{org:1,userId:1,sessionId:'s1'},branch:11}),e=>e.code==='P14_NOT_ACTIVATED');
 assert.equal(db.connections,0);
});
test('close period authorizes current OWNER, locks guard before period and writes one audit',async()=>{
 const events=[],ctx={org:1,userId:1,sessionId:'s1'},db=modelDatabase();db.role='OWNER';
 const pool={...db.pool,getConnection:async()=>{
  const c=await db.pool.getConnection(),execute=c.execute.bind(c);
  c.execute=async(sql,args)=>{
   if(sql.startsWith('UPDATE business_periods')){events.push('close');assert.deepEqual(args.slice(2,4),[1,11]);return [{affectedRows:1}];}
   if(sql.startsWith('INSERT INTO business_audit_events')){events.push('audit');return [{affectedRows:1}];}
   return execute(sql,args);
  };return c;
 }};
 const admin=createP14Administration({pool,activation:{enabled:true,mode:'ISOLATED_MOCK'}});
 const r=await admin.closePeriod({context:ctx,branch:11,dateStart:'2026-11-01',expectedVersion:1});
 assert.equal(r.live_state,'CLOSED');assert.deepEqual(events,['close','audit']);
 const order=db.events.map(e=>e.tag);assert.ok(order.indexOf('guard')<order.indexOf('period'));
});
test('admin MANAGER cannot close/activate policy; no authority from stale req.user',async()=>{
 const db=modelDatabase();db.role='MANAGER';
 const admin=createP14Administration({pool:db.pool,activation:{enabled:true,mode:'ISOLATED_MOCK'}});
 await assert.rejects(admin.activatePolicy({context:{org:1,userId:1,sessionId:'s1'},branch:11,policyId:2,expectedPolicyId:1}),e=>e.code==='OWNER_REQUIRED');
});
test('staff target locks acquired in sorted user order and tenant-scoped',async()=>{
 const seen=[];
 const c={execute:async(sql,args)=>{seen.push({sql,args});return [[{id:args[1]}]];}};
 await lockUserSet(c,7,12,3);
 assert.deepEqual(seen.map(v=>v.args),[[7,3],[7,12]]);
 assert.match(seen[0].sql,/FOR UPDATE$/);assert.match(seen[1].sql,/FOR SHARE$/);
});
