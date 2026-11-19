import '../no-network.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {generateKeyPairSync,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Coordinator,ipcHook,attachParticipant} from './coordinator.js';
import {fixturePlan} from './fixtures.js';
import {authorizeExecution,requireAction} from './authority.js';
import {launchNativePair,nativeSpawner,serveNativeWorker} from './harness.js';
import {fixture} from '../rc2/fixtures.js';
import {digest,canonical} from '../../../src/p14/rc2/contracts.js';
import {launchPlan} from '../../../src/p14/rc2/launcher.js';
import {dataPredicates,bootstrapPlan,reviewBinding} from './binding.js';
import {assertOracle,observeTransactions} from './observer.js';
import {controlMutation} from './control.js';
import {scenarioIntents,httpClient,workload,summarize,runControlRace} from './scenarios.js';
import {legacyBackfillPlan,recoveryCases} from './recipes.js';
import {proposedGrants} from './privileges.js';
import {nativeMatrix,negativeSql,seedFixture,executeReleasePhase,assertHttpCase,proveIsolation,waitForLock} from './scripts.js';
function authority(actions=['NATIVE_CASES'],planDigest=null){
 const f=fixture(),keys=generateKeyPairSync('ed25519'),releaseDigest='a'.repeat(64);
 const permit={...f.permit,releaseDigest,actions:[...new Set([...f.permit.actions,...actions])],
  operatorPublicKey:keys.publicKey.export({type:'spki',format:'pem'})};
 const target={host:f.config.host,port:f.config.port,database:f.config.database,server_uuid:permit.serverUuid};
 const plan=typeof planDigest==='function'?planDigest(permit):null;
 if(plan)planDigest=digest(launchPlan(plan));
 const payload={purpose:'PREP_NATIVE_EXECUTION',targetDigest:digest(target),releaseDigest,runId:permit.runId,actions,planDigest,
  evidenceDigest:'b'.repeat(64),nonce:'mock-only',operator:'mock-operator',
  issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()};
 const input={permit,target,releaseDigest,actions,planDigest,attestation:{payload,
  signature:sign(null,Buffer.from(canonical(payload)),keys.privateKey).toString('base64')}};
 return {input,plan,cap:authorizeExecution(input)};
}
test('default authority denies before connection/spawn, no fake capability tags',async()=>{
 assert.throws(()=>authorizeExecution({}));
 assert.throws(()=>requireAction({kind:'approved'},'NATIVE_CASES'));
 let calls=0;await assert.rejects(negativeSql({cap:{},channel:{connect(){calls++;}}}));
 assert.equal(calls,0);assert.throws(()=>nativeSpawner({cap:{}}));
});
test('signed capability is scoped, frozen, expiring and cannot authorize another action',()=>{
 const a=authority();a.input.permit.schemas[0]='retail_app';
 assert.equal(requireAction(a.cap,'NATIVE_CASES').target.database,'retail_p14_test_rc2_mock');
 assert.throws(()=>requireAction(a.cap,'SEED'));
 a.input.attestation.payload.actions=['SEED'];assert.throws(()=>authorizeExecution(a.input));
});
test('coordinator release order, duplicate/out-of-scope reject and exact traces',async()=>{
 const c=new Coordinator({runId:'r',caseId:'limited'});
 const p=c.hit({participant:'A',stage:'after-guard',sequence:1});
 const key=await c.waitFor('A','after-guard');let settled=false;p.then(()=>settled=true);
 await Promise.resolve();assert.equal(settled,false);c.release(key);await p;
 assert.deepEqual(c.trace.map(x=>x.event),['hit','release']);
 assert.throws(()=>c.hit({participant:'A',stage:'after-guard',sequence:1}));
 assert.throws(()=>c.hit({participant:'C',stage:'after-guard',sequence:2}));c.abort();
});
test('coordinator deadlines and abort reject held work, never silently release',async()=>{
 const c=new Coordinator({runId:'r',caseId:'timeout',timeoutMs:10});
 await assert.rejects(c.hit({participant:'A',stage:'after-header',sequence:1}),/DEADLINE/);
 const d=new Coordinator({runId:'r',caseId:'abort'}),p=d.hit({participant:'B',stage:'before-commit',sequence:1});
 d.abort();await assert.rejects(p,/ABORTED/);assert.equal(d.waiting.size,0);
});
test('IPC hook + coordinator interleave across fake child channel without sockets',async()=>{
 const c=new Coordinator({runId:'r',caseId:'ipc'}),toChild=new EventEmitter(),child=new EventEmitter();
 child.send=m=>queueMicrotask(()=>toChild.emit('message',m));
 const detach=attachParticipant(c,child,'A');
 const hook=ipcHook({runId:'r',caseId:'ipc',participant:'A',heldStages:['after-guard'],
  send:m=>queueMicrotask(()=>child.emit('message',m)),subscribe:fn=>{toChild.on('message',fn);return ()=>toChild.off('message',fn);}});
 const p=hook('after-guard',{attempt:0});c.release(await c.waitFor('A','after-guard'));await p;
 assert.equal(toChild.listenerCount('message'),0);detach();c.abort();
});
test('fixture is deterministic, two tenants, bounded and reconciles legacy balances',()=>{
 const args={seed:'seed1',utc:'2026-11-06T01:00:00Z'},a=fixturePlan(args),b=fixturePlan(args);
 assert.equal(a.digest,b.digest);assert.equal(a.rows.organizations.length,2);assert.equal(a.rows.users.length,8);
 assert.equal(a.controlPlans.length,4);assert.equal(a.legacyRequests.length,3);
 assert.equal(a.rows.inventory_balances.find(b=>b.branch_id===1101&&b.product_id===110002).quantity,13);
 assert.ok(a.statements.every(s=>s.expectedAffectedRows===1&&s.params.length===(s.sql.match(/\?/g)??[]).length));
 assert.ok(!a.statements.some(s=>/receipt|policy|finalization/.test(s.table)));
 assert.ok(a.rows.users.every(u=>u.password_hash==='!DISABLED_FIXTURE_LOGIN!'));
 assert.throws(()=>fixturePlan({...args,products:1001}));assert.throws(()=>fixturePlan({...args,seed:'bad;'}));
});
test('bootstrap expands every branch deterministically without archive flags',()=>{
 const f=fixturePlan({utc:'2026-11-06T01:00:00Z'}),p=bootstrapPlan(f);
 assert.equal(p.length,13);assert.ok(p.every(s=>s.expectedAffectedRows===1));
 assert.equal(p.filter(s=>s.sql.includes('business_periods')).length,4);
});
test('DATA predicates order full rows by PK, exclude self-referential TX receipts',()=>{
 const columns=['id','total','created_at'].map((COLUMN_NAME,i)=>({TABLE_NAME:'stock_documents',COLUMN_NAME,ORDINAL_POSITION:i+1}));
 const queries=dataPredicates({columns,indexes:[{TABLE_NAME:'stock_documents',COLUMN_NAME:'id',SEQ_IN_INDEX:1}],tables:['stock_documents','migration_tx_receipts']});
 assert.equal(queries.length,1);assert.ok(queries[0].sql.includes('ORDER BY `id`'));assert.ok(queries[0].sql.includes('`total`'));
 assert.throws(()=>dataPredicates({columns,indexes:[],tables:['stock_documents']}));
 assert.throws(()=>dataPredicates({columns:[{TABLE_NAME:'bad;DROP',COLUMN_NAME:'x',ORDINAL_POSITION:1}],
  indexes:[{TABLE_NAME:'bad;DROP',COLUMN_NAME:'x',SEQ_IN_INDEX:1}],tables:['bad;DROP']}));
});
test('binding without native captures stays blocked and never activates candidate',async()=>{
 const source=JSON.parse(await readFile(new URL('../../../releases/p14-a20h-rc2/candidate.json',import.meta.url),'utf8'));
 const bound=reviewBinding({candidate:source,captures:{},bindings:{}});
 assert.equal(bound.state,'REVIEW_BOUND_NOT_EXECUTABLE');assert.equal(bound.nativeVerified,false);
 assert.equal(bound.prepBinding.blockers.length,12);assert.equal(source.state,'CANDIDATE_NOT_EXECUTABLE');
});
test('least privilege renders only scoped grants for each of five roles',()=>{
 for(const role of ['migrator','backend','control','seed','observer']){
  const g=proposedGrants({role,schema:'retail_p14_test_plan',account:'p14_test_'+role+'@127.0.0.1'});
  assert.ok(g.length);assert.ok(!g.some(x=>/ALL PRIVILEGES|GRANT OPTION|ON \*\.\*|CREATE USER/.test(x)));
 }
 assert.throws(()=>proposedGrants({role:'backend',schema:'retail_app',account:'root@localhost'}));
});
test('HTTP response oracle distinguishes replay, stock and tenant failure',()=>{
 assertHttpCase('STOCK',[{status:201},{status:409}]);
 assertHttpCase('IDEMPOTENCY',[{status:201,body:{id:'9007199254740993'}},{status:200,body:{id:'9007199254740993'}}]);
 assertHttpCase('TENANT',[{status:403}]);
 assert.throws(()=>assertHttpCase('STOCK',[{status:201},{status:201}]));
 assert.throws(()=>assertHttpCase('IDEMPOTENCY',[{status:201,body:{id:1}},{status:200,body:{id:2}}]));
});
test('active isolation script refuses session-only evidence or RR transactions',async()=>{
 const {cap}=authority();let rolled=0;
 const c=id=>({query:async()=>[[{id,isolation:'REPEATABLE-READ'}]],beginReadCommitted:async()=>{},rollback:async()=>rolled++,destroy(){}});
 const observer={execute:async sql=>sql.includes('events_transactions_current')?[[{ISOLATION_LEVEL:'REPEATABLE READ'},{ISOLATION_LEVEL:'READ COMMITTED'}]]:sql.includes('data_lock_waits')?[[]]:[[{PROCESSLIST_ID:1},{PROCESSLIST_ID:2}]]};
 await assert.rejects(proveIsolation({cap,A:c(1),B:c(2),observer,schema:'retail_p14_test_plan'}));
 assert.equal(rolled,2);
});
test('lock-wait oracle requires exact requesting and blocking connection IDs',async()=>{
 const edges=await waitForLock({execute:async()=>[[{requesting_connection:2,blocking_connection:1}]]},'retail_p14_test_plan',
  {requestingConnection:2,blockingConnection:1});
 assert.equal(edges.length,1);
 await assert.rejects(waitForLock({execute:async()=>[[{requesting_connection:9,blocking_connection:8}]]},'retail_p14_test_plan',
  {requestingConnection:2,blockingConnection:1,timeoutMs:10}),/NOT_OBSERVED/);
});
test('economic oracle catches negative stock and partial commit',()=>{
 const before={balances:[{organization_id:11,branch_id:1101,product_id:110001,quantity:1}]};
 const after={balances:[{...before.balances[0],quantity:0}],documents:[],items:[],movements:[],receipts:[],markers:[],audits:[]};
 assert.throws(()=>assertOracle({before,after}),/BALANCE/);
 after.balances[0].quantity=1;assert.equal(assertOracle({before,after}).status,'ASSERTIONS_ONLY');
 after.items.push({organization_id:11,document_id:99});assert.throws(()=>assertOracle({before,after}),/ORPHAN/);
});
test('native case catalog remains NOT_RUN and worker import is inert',async()=>{
 assert.equal(nativeMatrix.length,15);assert.ok(nativeMatrix.every(c=>c.status==='NOT_RUN'));
 await import('./worker.mjs');
});

function pairAuthority(){
 return authority(['LAUNCH_BACKEND'],permit=>{
  const fa=fixture(),fb=fixture();fb.config.user='p14_test_other';
  fb.permit.principal.account='p14_test_other@127.0.0.1';fb.permit.connectionOrigins=[fb.permit.principal.account];
  for(const f of [fa,fb]){f.permit.releaseDigest=permit.releaseDigest;f.permit.runId=permit.runId;}
  return {permit,workers:[fa,fb].map((f,i)=>({config:f.config,permit:f.permit,host:'127.0.0.1',port:13317+i,instance:'worker-'+i})),
   auth:{secret:'synthetic-prep-secret-at-least-32-bytes',allowedOrganizations:[11,12]}};
 });
}
test('two-process orchestration binds signed plan, separate mock PID/accounts and cleans up',async()=>{
 const a=pairAuthority();let started=0,stopped=0;
 const spawn=async()=>{
  const c=new EventEmitter();c.pid=800+(++started);c.stop=async()=>stopped++;c.send=()=>{};return c;
 };
 const pair=await launchNativePair({cap:a.cap,plan:a.plan,spawn,caseId:'mock-case'});
 assert.deepEqual(pair.children.map(c=>c.pid),[801,802]);
 await pair.stop();assert.equal(stopped,2);
 const changed=structuredClone(a.plan);changed.workers[1].port=13319;
 await assert.rejects(launchNativePair({cap:a.cap,plan:changed,spawn,caseId:'mock-case'}));
 assert.equal(started,2);
 let pid=1000;const bad=await launchNativePair({cap:a.cap,plan:a.plan,caseId:'stop-fails',spawn:async()=>{const c=new EventEmitter();c.pid=++pid;c.send=()=>{};c.stop=async()=>{throw Error('stop failed');};return c;}});
 await assert.rejects(bad.stop(),/STOP_UNCONFIRMED/);
});
test('PREP worker wires test-app hook and verified pool using only fake driver/listener',async()=>{
 const a=pairAuthority(),f=fixture(),query=f.raw.query.bind(f.raw);
 f.raw.query=async(sql,args)=>sql==='SELECT CONNECTION_ID() AS id'?[[{id:77}]]:query(sql,args);
 let listened=0,ended=0,closed=0;
 const worker=a.plan.workers[0];
 const running=await serveNativeWorker({authority:a.input,plan:a.plan,worker,auth:a.plan.auth,
  caseId:'mock',participant:'A',heldStages:['after-guard']},{
  createPool:()=>({getConnection:async()=>f.raw,end:async()=>ended++}),
  listen:async app=>{listened++;assert.equal(typeof app,'function');return {close(cb){closed++;cb();}};},
  send(){},subscribe(){return ()=>{};}
 });
 assert.equal(running.connectionId,77);assert.equal(listened,1);await running.stop();
 assert.equal(ended,1);assert.equal(closed,1);
 await assert.rejects(serveNativeWorker({authority:a.input,plan:a.plan,worker,auth:{...a.plan.auth,allowedOrganizations:[99]},
  caseId:'mock',participant:'A'},{}));assert.equal(listened,1);
});

test('seed plan traverses verified fake seed principal with exact row counts and rollback on mismatch',async()=>{
 const a=authority(['SEED']),f=fixture('seed'),plan=fixturePlan({utc:'2026-11-06T01:00:00Z'});
 f.permit.releaseDigest=a.input.releaseDigest;f.raw.execute=(()=>{const original=f.raw.execute.bind(f.raw);return async(sql,params)=>sql.startsWith('INSERT')?[{affectedRows:1}]:original(sql,params);})();
 const result=await seedFixture({cap:a.cap,channel:{...f,connect:async()=>f.raw},fixture:plan});
 assert.equal(result.fixtureDigest,plan.digest);assert.ok(f.raw.events.includes('COMMIT'));
 const bad=fixture('seed');bad.permit.releaseDigest=a.input.releaseDigest;const orig=bad.raw.execute.bind(bad.raw);
 bad.raw.execute=async(sql,params)=>sql.startsWith('INSERT')?[{affectedRows:0}]:orig(sql,params);
 await assert.rejects(seedFixture({cap:a.cap,channel:{...bad,connect:async()=>bad.raw},fixture:plan}));
 assert.ok(bad.raw.events.includes('ROLLBACK'));assert.ok(!bad.raw.events.includes('COMMIT'));
});
test('unbound release and invalid control authority reject without connector calls',async()=>{
 const a=authority(['MIGRATE']);let calls=0;
 await assert.rejects(executeReleasePhase({cap:a.cap,channel:{connect(){calls++;}},release:{state:'CANDIDATE_NOT_EXECUTABLE'}}));
 await assert.rejects(controlMutation({cap:{},channel:{connect(){calls++;}}}));assert.equal(calls,0);
});
test('hot/multi-branch workload is deterministic and metrics count business rejection honestly',()=>{
 const f=fixturePlan({utc:'2026-11-06T01:00:00Z'});
 const hot=workload(f,{users:100,mode:'HOT_BRANCH',count:20}),multi=workload(f,{users:1000,mode:'MULTI_BRANCH',count:20});
 assert.equal(new Set(hot.map(r=>r.body.branch_id)).size,1);assert.equal(new Set(multi.map(r=>r.body.branch_id)).size,4);
 assert.equal(new Set(multi.map(r=>r.body.request_key)).size,20);
 assert.deepEqual(multi,workload(f,{users:1000,mode:'MULTI_BRANCH',count:20}));
 assert.throws(()=>workload(f,{users:99}));
 const metrics=summarize([{status:201,latencyMs:1},{status:409,latencyMs:10},{status:503,latencyMs:20}],{offered:4,elapsedMs:1000});
 assert.equal(metrics.offeredRps,4);assert.equal(metrics.completedRps,3);assert.equal(metrics.acceptedNewRps,1);assert.equal(metrics.p99,20);
 const intents=scenarioIntents(f,{kind:'IDEMPOTENCY'});assert.deepEqual(intents[0].body,intents[1].body);
});
test('HTTP adapter only calls injected fake fetch at approved worker ports, signs scoped test JWT',async()=>{
 const a=pairAuthority(),f=fixturePlan({utc:'2026-11-06T01:00:00Z'});let calls=0;
 // Re-signing a real operator permit is forbidden here; build a fresh mock-only plan with both actions.
 const b=authority(['LAUNCH_BACKEND','NATIVE_CASES'],permit=>({...a.plan,permit}));
 const client=httpClient({cap:b.cap,plan:b.plan,fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'http://127.0.0.1:13318/api/v1/sales');
  assert.equal(options.redirect,'error');assert.ok(options.headers.authorization.startsWith('Bearer '));
  return {status:201,json:async()=>({id:'1'})};
 }});
 const r=await client('B',scenarioIntents(f,{kind:'STOCK'})[1]);assert.equal(r.status,201);assert.equal(calls,1);
 assert.throws(()=>httpClient({cap:{},plan:b.plan,fetchImpl(){calls++;}}));assert.equal(calls,1);
});

test('legacy recipes preserve lineage and exact0/1 affected row contracts',async()=>{
 const candidate=JSON.parse(await readFile(new URL('../../../releases/p14-a20h-rc2/candidate.json',import.meta.url),'utf8'));
 const fixture=fixturePlan({utc:'2026-11-06T01:00:00Z'});
 const online=legacyBackfillPlan({candidate,fixture}),final=legacyBackfillPlan({candidate,fixture,finalize:true});
 assert.equal(online.length,3);assert.equal(online[0].statements[1].expectedAffectedRows,1);
 assert.equal(final[0].statements[1].expectedAffectedRows,0);assert.equal(final[0].statements[2].expectedAffectedRows,1);
 assert.ok(final[0].statements[2].sql.includes('UNHEX(?)'));
 assert.equal(final[0].expected.policy_id,null);assert.equal(final[0].expected.accepted_at_utc,null);
 assert.ok(online.every(p=>p.executable===false));assert.ok(recoveryCases.every(c=>c.status==='NOT_RUN'));
});

for(const kind of ['REVOKE','CLOSE'])test('control '+kind+' uses owner recheck and ranked locks on fake control principal',async()=>{
 const auth=authority(['CONTROL']),f=fixture('control'),plan=fixturePlan({utc:'2026-11-06T01:00:00Z'});
 f.permit.releaseDigest=auth.input.releaseDigest;const trace=[];
 f.raw.delegate={query:async()=>[[]],beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},destroy(){},execute:async(sql,params)=>{
  trace.push({sql,params});
  if(sql.startsWith('SELECT')){
   if(sql.includes('business_schema_control'))return [[{mode:'ENFORCED'}]];
   if(sql.includes('organizations'))return [[{status:'ACTIVE'}]];
   if(sql.includes('FROM users'))return [[{id:params[1],role:params[1]===1101?'OWNER':'CASHIER',status:'ACTIVE'}]];
   if(sql.includes('auth_sessions'))return [[{expires_at:'2026-11-06 02:00:00',revoked_at:null}]];
   if(sql.includes('UTC_TIMESTAMP'))return [[{utc:'2026-11-06 01:00:00.000001'}]];
   if(sql.includes('branch_posting_guards'))return [[{active_policy_id:300}]];
   if(sql.includes('FROM branches'))return [[{status:'ACTIVE'}]];
   if(sql.includes('business_periods'))return [[{id:400,version:1}]];
   return [[{id:300}]];
  }return [{affectedRows:1}];
 }};
 const actor=plan.actors.find(a=>a.org===11&&a.role==='OWNER'),target=plan.actors.find(a=>a.org===11&&a.role==='CASHIER');
 await controlMutation({cap:auth.cap,channel:{...f,connect:async()=>f.raw},actor,target,branch:1101,kind,periodId:400,expectedVersion:1});
 assert.ok(f.raw.events.includes('COMMIT'));
 const userLocks=trace.filter(r=>r.sql.includes('FROM users')).map(r=>r.params[1]);
 assert.deepEqual(userLocks,[1101,1103]);
 assert.equal(trace.filter(r=>r.sql.startsWith('INSERT INTO business_audit_events')).length,1);
 if(kind==='CLOSE')assert.ok(trace.findIndex(r=>r.sql.includes('branch_posting_guards'))<trace.findIndex(r=>r.sql.includes('business_periods')));
});

test('control-first and post-first orchestration use explicit barrier plus observed wait callback',async()=>{
 const a=authority(['NATIVE_CASES']);
 for(const controlWins of [true,false]){
  const c=new Coordinator({runId:'r',caseId:String(controlWins)});let observed=false;
  const hold=async participant=>{await c.hit({participant,stage:'after-guard',sequence:1});};
  const control=async()=>{if(controlWins)await hold('control');return {changed:true};};
  const request=async()=>{if(!controlWins)await hold('A');return {status:controlWins?409:201};};
  const result=await runControlRace({cap:a.cap,coordinator:c,control,request,controlWins,stage:'after-guard',
   observeBlocked:async()=>{observed=true;}});
  assert.ok(observed);assert.equal(result.response.status,controlWins?409:201);c.abort();
 }
});

test('lost seed COMMIT acknowledgement is UNKNOWN rather than safe-to-reseed',async()=>{
 const a=authority(['SEED']),f=fixture('seed');f.permit.releaseDigest=a.input.releaseDigest;
 f.raw.commit=async()=>{f.raw.events.push('COMMIT');throw Object.assign(Error('lost ACK'),{code:'ECONNRESET'});};
 await assert.rejects(seedFixture({cap:a.cap,channel:{...f,connect:async()=>f.raw},
  fixture:fixturePlan({utc:'2026-11-06T01:00:00Z'})}),e=>e.code==='SEED_OUTCOME_UNKNOWN');
 assert.ok(f.raw.dead);
});
