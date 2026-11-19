import '../no-network.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocumentWriter,requestIdentityConflict,transactionAttempt} from '../../../src/p14/rc2/writer.js';
import {modelDatabase} from '../model.js';
const request=(overrides={})=>({context:{org:1,userId:1,sessionId:'s1'},type:'SALE',
 body:{branch_id:11,request_key:'same-request-00001',items:[{product_id:31,quantity:1}]},...overrides});
const writer=(db,opts={})=>createDocumentWriter({pool:db.pool,activation:{enabled:true,mode:'ISOLATED_MOCK'},sleep:async()=>{},...opts});
test('default gate denies before pool acquisition; RUNTIME mode cannot enable A1',async()=>{
 const db=modelDatabase();
 await assert.rejects(createDocumentWriter({pool:db.pool})(request()),e=>e.code==='P14_NOT_ACTIVATED');
 await assert.rejects(createDocumentWriter({pool:db.pool,activation:{enabled:true,mode:'RUNTIME'}})(request()));
 assert.equal(db.connections,0);
});
test('SALE SQL repository/service integration atomically builds final header/receipt/audit/marker',async()=>{
 const db=modelDatabase(),r=await writer(db)(request());
 assert.equal(r.total,10.29);assert.equal(db.state.balances['1:11:31'],0);
 for(const table of ['headers','items','movements','receipts','audits','finalizations'])assert.equal(db.state[table].length,1,table);
 assert.equal(db.state.headers[0].total,'10.29');
 assert.equal(db.state.headers[0].created_at,'2026-11-06 01:00:00');
 const tags=db.events.map(e=>e.tag);
 for(const [a,b] of [['control','org'],['org','user'],['user','session'],['session','guard'],
  ['guard','branch'],['policy','product'],['product','balance'],['header','receipt'],['audit','finalization'],['finalization','COMMIT']])
  assert.ok(tags.indexOf(a)<tags.indexOf(b),a+' before '+b);
 assert.ok(tags.includes('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED'));
 assert.equal(db.state.revision['1:11'],'1');
});
test('two service instances same key produce one economic write (serialized mock, not native lock proof)',async()=>{
 const db=modelDatabase(),a=writer(db),b=writer(db);
 const results=await Promise.all([a(request()),b(request())]);
 assert.equal(results.filter(r=>r.replayed).length,1);
 assert.equal(db.state.headers.length,1);assert.equal(db.state.movements.length,1);assert.equal(db.state.audits.length,1);
});
test('two users intents for limited SKU: one commit, one stock rejection in oracle',async()=>{
 const db=modelDatabase();
 const other=request();other.body.request_key='second-request-00002';
 const results=await Promise.allSettled([writer(db)(request()),writer(db)(other)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.find(r=>r.status==='rejected').reason.code,'INSUFFICIENT_STOCK');
 assert.equal(db.state.balances['1:11:31'],0);assert.equal(db.state.headers.length,1);
});
test('mixed receipt/sale uses same primary repository, no lost delta in oracle',async()=>{
 const db=modelDatabase();db.role='OWNER';
 const receipt=request({type:'RECEIPT'});receipt.body={...receipt.body,request_key:'receipt-request-001',items:[{product_id:31,quantity:2,unit_price:8}]};
 await Promise.all([writer(db)(receipt),writer(db)(request())]);
 assert.equal(db.state.balances['1:11:31'],2);assert.equal(db.state.movements.length,2);
});
for(const tag of ['header','item','balance_update','movement','revision','receipt','audit','finalization']){
 test('rollback on '+tag+' failure leaves no partial posting',async()=>{
  const db=modelDatabase(),before=structuredClone(db.state);db.fault={tag};
  await assert.rejects(writer(db)(request()));
  assert.deepEqual(db.state,before);assert.equal(db.rollbacks,1);
 });
}
test('retry after committed ACK loss returns frozen receipt without another delta',async()=>{
 const db=modelDatabase();db.commitFault='after';
 await assert.rejects(writer(db)(request()),e=>e.code==='COMMIT_OUTCOME_UNKNOWN');
 assert.equal(db.destroyed,1);db.clock=['2026-11-07 01:00:00.000000'];
 const r=await writer(db)(request());assert.equal(r.replayed,true);assert.equal(db.state.headers.length,1);
});
test('pre-COMMIT connection loss rolls back/discards without blind retry',async()=>{
 const db=modelDatabase();db.fault={tag:'item',code:'ECONNRESET'};
 await assert.rejects(writer(db)(request()),e=>e.code==='COMMIT_OUTCOME_UNKNOWN');
 assert.equal(db.connections,1);assert.equal(db.destroyed,1);assert.equal(db.state.headers.length,0);
});
for(const code of ['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT']){
 test(code+' retries whole transaction within bound',async()=>{
  const db=modelDatabase();db.fault={tag:'header',code,once:true};
  await writer(db)(request());assert.equal(db.rollbacks,1);assert.equal(db.connections,2);assert.equal(db.state.headers.length,1);
 });
 test(code+' persistent failure stops after two retries',async()=>{
  const db=modelDatabase();db.fault={tag:'header',code};
  await assert.rejects(writer(db)(request()),e=>e.code===code);assert.equal(db.connections,3);assert.equal(db.rollbacks,3);
 });
}
test('duplicate-key handler only recognizes request identities',()=>{
 assert.equal(requestIdentityConflict({code:'ER_DUP_ENTRY',constraint:'other_unique'}),false);
 assert.equal(requestIdentityConflict({code:'ER_DUP_ENTRY',sqlMessage:"Duplicate entry 'x' for key 'stock_documents.document_request'"}),true);
});
test('different payload or branch with same key yields409',async()=>{
 const db=modelDatabase();await writer(db)(request());
 for(const patch of [{branch_id:12},{items:[{product_id:31,quantity:2}]}]){
  const r=request();r.body={...r.body,...patch};await assert.rejects(writer(db)(r),e=>e.code==='REQUEST_KEY_CONFLICT');
 }
});
test('recheck role, assignment, revoke and tenant before writing',async()=>{
 for(const mutate of [d=>d.role='INVENTORY',d=>d.assignment=null,d=>d.sessionRevoked='2026-01-01',d=>d.epoch=2]){
  const db=modelDatabase();mutate(db);await assert.rejects(writer(db)(request()));assert.equal(db.state.headers.length,0);
 }
 const db=modelDatabase();await assert.rejects(writer(db)(request({context:{org:2,userId:1,sessionId:'s1'}})),e=>e.code==='USER_INACTIVE');
});
test('closed period/missing policy or explicit past date reject new intent',async()=>{
 const db=modelDatabase();db.periodClosed=true;await assert.rejects(writer(db)(request()),e=>e.code==='PERIOD_CLOSED_OR_MISSING');
 db.periodClosed=false;
 const r=request();r.body.business_date='2026-11-05';await assert.rejects(writer(db)(r),e=>e.code==='TODAY_ONLY');
});
test('clock after locks, month rollover restarts same key with new period',async()=>{
 const db=modelDatabase();db.clock=['2026-11-30 16:59:59.000000','2026-11-30 17:00:00.000000'];
 await writer(db)(request());assert.equal(db.rollbacks,1);assert.equal(db.state.headers[0].business_date,'2026-12-01');
});
test('replay ignores closed period but still requires current authorization',async()=>{
 const db=modelDatabase();await writer(db)(request());db.periodClosed=true;
 assert.equal((await writer(db)(request())).replayed,true);
 db.assignment=null;await assert.rejects(writer(db)(request()),e=>e.code==='BRANCH_FORBIDDEN');
});
test('expired session after product lock rejects before header insert',async()=>{
 const db=modelDatabase();db.expiry='2026-11-06 01:00:01.000000';
 db.clock=['2026-11-06 01:00:00.000000','2026-11-06 01:00:02.000000'];
 await assert.rejects(writer(db)(request()),e=>e.code==='SESSION_EXPIRED');assert.equal(db.state.headers.length,0);
});
test('acquisition deadline destroys a late connection and never starts transaction',async()=>{
 let destroy=0;
 const pool={getConnection:()=>new Promise(r=>setTimeout(()=>r({destroy(){destroy++;}}),20))};
 await assert.rejects(transactionAttempt(pool,()=>{}, {deadline:Date.now()+5}),e=>e.code==='P14_DEADLINE');
 await new Promise(r=>setTimeout(r,30));assert.equal(destroy,1);
});

test('A2 mode rejects a tagged but unverified pool before connection acquisition',async()=>{
 let n=0;const pool={p14Kind:'a2-disposable',getConnection(){n++;throw Error('must not connect');}};
 await assert.rejects(createDocumentWriter({pool,activation:{enabled:true,mode:'A2_DISPOSABLE'}})(request()),e=>e.code==='P14_NOT_ACTIVATED');
 assert.equal(n,0);
});
