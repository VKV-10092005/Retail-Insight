import '../no-network.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateKeyPairSync,sign} from 'node:crypto';
import {digest,canonical,bindingOf,verifyAttestation} from '../../../src/p14/rc2/contracts.js';
import {sealRelease,validateRelease,runPhase} from '../../../src/p14/rc2/migration.js';
import {FileJournal,MemoryJournal,journalNamespace} from '../../../src/p14/rc2/journal.js';
import {schemaFingerprint} from '../../../src/p14/rc2/fingerprints.js';
import {UUID,OTHER} from './fixtures.js';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
async function setup(type='DDL'){
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const publicPem=publicKey.export({format:'pem',type:'spki'});
 const before=digest('before'),after=digest('after');
 const pred=value=>({kind:type==='TX'?'SCHEMA_DATA':'SCHEMA',tables:['fixture'],queries:type==='TX'?[{sql:'SELECT id FROM fixture ORDER BY id',params:[]}]:[],sha256:value});
 const sql=type==='DDL'?'CREATE TABLE fixture(id INT);':'UPDATE fixture SET id=2 WHERE id=1;';
 const step={id:type==='TX'?'CT_SCHEMA_VERSION':'STEP',type,sourceStepIds:[type==='TX'?'CT_SCHEMA_VERSION':'MOCK'],
  dependsOn:[],before:pred(before),after:pred(after),
  statements:type==='BARRIER'||type==='VERIFY'?[]:[{sql,sha256:digest(sql),parameterCount:0,parameterContract:[],params:[],expectedAffectedRows:type==='TX'?1:null}]};
 const source='backend/src/p14/rc2/contracts.js';
 let release=sealRelease({protocol:'p14-typed-v2',releaseId:'mock-rc2',state:'A2_1_BOUND',
  mysqlExact:'8.4.0',sqlMode:'STRICT_TRANS_TABLES',baselineFingerprint:digest('baseline'),operatorPublicKey:publicPem,
  sources:[{path:source,sha256:digest(await readFile(path.join(root,source),'utf8'))}],
  phases:[{id:'PHASE',dependsOn:[],steps:[step],finalPredicate:pred(after)}]});
 const permit={stage:'A2_1_DISPOSABLE',approvalRef:'MOCK-ONLY',runId:'run1',allowNativeWrites:true,
  actions:['MIGRATE'],schemas:['retail_p14_test_rc2_mock'],serverUuid:UUID,forbiddenServerUuids:[OTHER],
  operatorPublicKey:publicPem,releaseDigest:release.digest};
 const target={database:permit.schemas[0],server_uuid:UUID,host:'127.0.0.1',port:13316,
  version:release.mysqlExact,sql_mode:release.sqlMode};
 let state=before,executeCount=0,failAfter=false;
 const receipts=new Map(),adapter={
  async verify(){return target;},async baseline(){return digest('baseline');},
  async lock(){},async assertLock(){},async unlock(){},
  async observe(){return state;},
  async executeDDL(){executeCount++;state=after;if(failAfter){failAfter=false;throw Error('ACK lost');}},
  async executeAtomic(s,r){executeCount++;state=after;receipts.set(r.key,{...r});if(failAfter){failAfter=false;throw Error('ACK lost');}},
  async readReceipt(key){return receipts.get(key)??null;}
 };
 const journal=new MemoryJournal({target:{host:target.host,port:target.port,serverUuid:UUID},
  schema:target.database,releaseDigest:release.digest,runId:permit.runId});
 const context={release,permit,adapter,journal,phaseId:'PHASE',sourceRoot:root,attestations:{}};
 return {context,receipts,get state(){return state;},set state(v){state=v;},
  failAfter(){failAfter=true;},count:()=>executeCount,
  sign(purpose,id=release.phases[0].steps[0].id){
   const payload={purpose,binding:bindingOf(release,target,permit.runId),stepId:id,phaseId:'PHASE',
    afterFingerprint:after,evidenceDigest:digest('mock evidence'),operator:'mock-operator',nonce:'mock-nonce',
    issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()};
   return {payload,signature:sign(null,Buffer.from(canonical(payload)),privateKey).toString('base64')};
  }};
}
test('unbound RC2 refuses before any adapter/database call',async()=>{
 const f=await setup();f.context.release.state='CANDIDATE_NOT_EXECUTABLE';
 let called=0;f.context.adapter.verify=async()=>{called++;throw Error('never');};
 await assert.rejects(runPhase(f.context),e=>e.code==='EXECUTION_DISABLED');assert.equal(called,0);
});
test('verified step skip still checks phase-final schema drift',async()=>{
 const f=await setup();await runPhase(f.context);await runPhase(f.context);assert.equal(f.count(),1);
 f.state=digest('unapproved FK action');
 await assert.rejects(runPhase(f.context),e=>e.code==='PHASE_FINAL_DRIFT');assert.equal(f.count(),1);
});
test('DDL ACK loss recovered from exact postcondition without rerunning',async()=>{
 const f=await setup();f.failAfter();
 await assert.rejects(runPhase(f.context),e=>e.code==='MIGRATION_UNKNOWN');
 await runPhase(f.context);assert.equal(f.count(),1);assert.equal(f.context.journal.rows.get('STEP').recovered,true);
});
test('TX including CT_SCHEMA_VERSION executes atomically then recovers using durable receipt',async()=>{
 const f=await setup('TX');f.failAfter();
 await assert.rejects(runPhase(f.context),e=>e.code==='MIGRATION_UNKNOWN');
 await runPhase(f.context);assert.equal(f.count(),1);
 assert.equal(f.context.journal.rows.get('CT_SCHEMA_VERSION').status,'VERIFIED');
});
test('poststate without TX receipt is UNKNOWN, never self-VERIFIED',async()=>{
 const f=await setup('TX');f.state=f.context.release.phases[0].steps[0].after.sha256;
 await assert.rejects(runPhase(f.context),e=>e.code==='UNKNOWN_OR_DRIFT');assert.equal(f.count(),0);
 assert.equal(f.context.journal.rows.get('CT_SCHEMA_VERSION'),undefined);
});
test('BARRIER needs signature plus independent after-observation',async()=>{
 const f=await setup('BARRIER');
 await assert.rejects(runPhase(f.context),e=>e.code==='ATTESTATION_INVALID');
 f.context.attestations.STEP=f.sign('BARRIER');
 await assert.rejects(runPhase(f.context),e=>e.code==='BARRIER_OBSERVATION');
 f.state=f.context.release.phases[0].steps[0].after.sha256;
 await runPhase(f.context);assert.equal(f.count(),0);assert.equal(f.context.journal.rows.get('STEP').status,'VERIFIED');
});
test('external TX manual attestation requires a matching database receipt and signed scope',async()=>{
 const f=await setup('TX'),step=f.context.release.phases[0].steps[0];
 const binding=bindingOf(f.context.release,await f.context.adapter.verify(),f.context.permit.runId);
 const key=digest({binding,step:step.id,checksum:step.checksum});
 f.state=step.after.sha256;f.receipts.set(key,{binding,checksum:step.checksum,afterFingerprint:step.after.sha256});
 await assert.rejects(runPhase(f.context),e=>e.code==='ATTESTATION_INVALID');
 f.context.attestations.CT_SCHEMA_VERSION=f.sign('TX_APPLIED');
 await runPhase(f.context);assert.equal(f.count(),0);
});
test('tampered, wrong-purpose, expired or wrong-target signatures rejected',async()=>{
 const f=await setup('BARRIER'),valid=f.sign('BARRIER');
 for(const p of [
  {...valid,payload:{...valid.payload,stepId:'other'}},
  {...valid,payload:{...valid.payload,purpose:'TX_APPLIED'}},
  {...valid,payload:{...valid.payload,expiresAt:'2000-01-01T00:00:00Z'}},
  {...valid,signature:Buffer.alloc(64).toString('base64')}
 ])assert.throws(()=>verifyAttestation(p,{publicKey:f.context.permit.operatorPublicKey,
  expected:{purpose:'BARRIER',binding:valid.payload.binding,stepId:'STEP'}}));
});
test('source digest mismatch rejects before adapter verification',async()=>{
 const f=await setup();f.context.release.sources[0].sha256='0'.repeat(64);
 f.context.release=sealRelease(f.context.release);f.context.permit.releaseDigest=f.context.release.digest;
 let called=0;f.context.adapter.verify=async()=>{called++;};
 await assert.rejects(runPhase(f.context),e=>e.code==='SOURCE_DIGEST_MISMATCH');assert.equal(called,0);
});
test('invalid/self/cyclic dependency and changed statement hashes rejected',async()=>{
 const f=await setup();
 for(const mutate of [
  r=>r.phases[0].steps[0].dependsOn=['STEP'],
  r=>r.phases[0].dependsOn=['PHASE'],
  r=>r.phases[0].steps[0].statements[0].sha256='0'.repeat(64),
  r=>r.phases[0].steps[0].manual=true
 ]){
  const r=structuredClone(f.context.release);mutate(r);
  const resealed=sealRelease(r);assert.throws(()=>validateRelease(resealed,{bound:true}));
 }
});
test('cleanup failure preserves UNKNOWN primary cause',async()=>{
 const f=await setup();f.context.adapter.executeDDL=async()=>{throw Object.assign(Error('primary'),{code:'MOCK_PRIMARY'});};
 f.context.adapter.unlock=async()=>{throw Object.assign(Error('cleanup'),{code:'MOCK_UNLOCK'});};
 await assert.rejects(runPhase(f.context),e=>e.code==='MIGRATION_UNKNOWN'&&e.cause.code==='MOCK_PRIMARY'&&e.cleanupErrors.includes('MOCK_UNLOCK'));
});
test('FK actions, index visibility, trigger definer and phase source affect fingerprints',async()=>{
 let part='base',sqlSeen=[];
 const connection={execute:async sql=>{
  sqlSeen.push(sql);const tag=/rc2:([a-z_]+)/.exec(sql)[1];
  const rows={
   table:[{ENGINE:'InnoDB',TABLE_COLLATION:'utf8mb4_0900_ai_ci',ROW_FORMAT:'Dynamic'}],
   columns:[],indexes:[{INDEX_NAME:'i',IS_VISIBLE:part==='index'?'NO':'YES'}],keys:[],
   fk_actions:[{CONSTRAINT_NAME:'fk',UPDATE_RULE:'RESTRICT',DELETE_RULE:part==='fk'?'CASCADE':'RESTRICT'}],
   checks:[],triggers:[{TRIGGER_NAME:'t',DEFINER:part==='trigger'?'other@host':'approved@host',ACTION_ORDER:1}]
  };return [rows[tag]];
 }};
 const original=await schemaFingerprint(connection,['fixture']);
 for(const p of ['fk','index','trigger']){part=p;assert.notEqual(await schemaFingerprint(connection,['fixture']),original);}
 assert.ok(sqlSeen.some(s=>s.includes('UPDATE_RULE,DELETE_RULE')));
 assert.ok(sqlSeen.some(s=>s.includes('IS_VISIBLE')));
 assert.ok(sqlSeen.some(s=>s.includes('DEFINER')));
});
async function withDirectory(fn){
 const dir=await mkdtemp(path.join(tmpdir(),'p14-rc2-journal-'));
 try{await fn(dir);}finally{
  const target=path.resolve(dir);assert.equal(path.dirname(target),path.resolve(tmpdir()));
  assert.ok(path.basename(target).startsWith('p14-rc2-journal-'));await rm(target,{recursive:true,force:true});
 }
}
const jb=(patch={})=>({target:{host:'127.0.0.1',port:13316,serverUuid:UUID},
 schema:'retail_p14_test_mock',releaseDigest:'a'.repeat(64),runId:'test',...patch});
test('journal namespace isolates target/schema/release/run and requires local ownership',async()=>{
 assert.notEqual(journalNamespace(jb()),journalNamespace(jb({schema:'retail_p14_test_other'})));
 assert.notEqual(journalNamespace(jb()),journalNamespace(jb({releaseDigest:'b'.repeat(64)})));
 await withDirectory(async root=>{
  const one=new FileJournal(root,jb()),other=new FileJournal(root,jb());
  await one.acquire();await assert.rejects(other.acquire(),e=>e.code==='EEXIST');
  await one.put('S',{status:'RUNNING',checksum:'a'.repeat(64)});
  await one.release();await other.acquire();assert.equal((await other.get('S')).status,'RUNNING');await other.release();
 });
});
test('journal temp-write/rename crash windows preserve inspectable state, not a false VERIFIED',async()=>{
 for(const point of ['after-file-sync','after-rename'])await withDirectory(async root=>{
  const j=new FileJournal(root,jb(),{fault:async at=>{if(at===point)throw Error('mock crash');}});
  await j.acquire();await assert.rejects(j.put('S',{status:'RUNNING',checksum:'a'.repeat(64)}));await j.release();
  const reopened=new FileJournal(root,jb());await reopened.acquire();
  assert.equal((await reopened.get('S'))?.status,point==='after-rename'?'RUNNING':undefined);await reopened.release();
 });
});
test('corrupt journal and edits to VERIFIED step fail closed',async()=>{
 await withDirectory(async root=>{
  const j=new FileJournal(root,jb());await j.acquire();
  await j.put('S',{status:'VERIFIED',checksum:'a'.repeat(64)});
  await assert.rejects(j.put('S',{status:'VERIFIED',checksum:'b'.repeat(64)}));
  await writeFile(j.file,'{"truncated":','utf8');await assert.rejects(j.load());await j.release();
 });
});

test('migration exclusion lock is target/schema wide across different releases and run IDs',async()=>{
 const f=await setup(),g=await setup();g.context.permit.runId='other-run';
 const b=structuredClone(g.context.journal.binding);b.runId='other-run';g.context.journal=new MemoryJournal(b);
 let first,second;f.context.adapter.lock=async n=>{first=n;};g.context.adapter.lock=async n=>{second=n;};
 await runPhase(f.context);await runPhase(g.context);
 assert.equal(first,second);assert.notDeepEqual(f.context.journal.binding,g.context.journal.binding);
});
test('bound atomic migration cannot substitute schema-only evidence for data postconditions',async()=>{
 const f=await setup('TX'),r=structuredClone(f.context.release);
 r.phases[0].steps[0].after={kind:'SCHEMA',tables:['fixture'],sha256:digest('after')};
 assert.throws(()=>validateRelease(sealRelease(r),{bound:true}),e=>e.code==='ATOMIC_DATA_PROOF_REQUIRED');
});

