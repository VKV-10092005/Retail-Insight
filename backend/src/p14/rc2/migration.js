import {immutable,digest,canonical,reject,isHash,assertTarget,bindingOf,verifyAttestation} from './contracts.js';
import {validateSql} from '../sql-parser.js';
import {verifySources,schemaFingerprint,baselineFingerprint} from './fingerprints.js';

export const releaseDigest=r=>{const {digest:ignored,...body}=r;return digest(body);};
export const stepChecksum=s=>{const {checksum:ignored,...body}=s;return digest(body);};
export function sealRelease(r){
 const copy=structuredClone(r);
 for(const p of copy.phases)for(const s of p.steps)s.checksum=stepChecksum(s);
 copy.digest=releaseDigest(copy);return copy;
}
export function validateRelease(release,{bound=false}={}){
 if(release.protocol!=='p14-typed-v2'||release.digest!==releaseDigest(release)||
  !Array.isArray(release.phases)||!release.phases.length)reject('RELEASE_DIGEST_OR_PROTOCOL');
 const phaseIds=new Set(),stepIds=new Set(),allSteps=new Map();
 for(const phase of release.phases){
  if(phaseIds.has(phase.id)||!phase.dependsOn.every(d=>phaseIds.has(d)))reject('PHASE_DAG');
  phaseIds.add(phase.id);
  if(!phase.finalPredicate)reject('PHASE_FINAL_CONTRACT');
  for(const step of phase.steps){
   if(stepIds.has(step.id)||!['DDL','TX','BACKFILL_CHUNK','BARRIER','VERIFY'].includes(step.type)||
    step.checksum!==stepChecksum(step)||!step.before||!step.after)reject('STEP_CONTRACT');
   for(const dep of step.dependsOn)if(!stepIds.has(dep))reject('STEP_DAG');
   stepIds.add(step.id);allSteps.set(step.id,step);
   if(step.manual||step.status==='VERIFIED')reject('MANUAL_VERIFIED_BYPASS');
   if(['DDL','TX','BACKFILL_CHUNK'].includes(step.type)&&!step.statements.length)reject('SQL_STEP_EMPTY');
   if(bound&&['TX','BACKFILL_CHUNK'].includes(step.type)){
    for(const p of [step.before,step.after])if(!['DATA','SCHEMA_DATA'].includes(p.kind)||!p.queries?.length)reject('ATOMIC_DATA_PROOF_REQUIRED');
   }
   for(const q of step.statements){
    const v=validateSql(q.sql,{allowParameters:true,allowTokens:!bound,
     noBackslashEscapes:release.sqlMode?.split(',').includes('NO_BACKSLASH_ESCAPES')});
    if(q.sha256!==digest(q.sql)||q.parameterCount!==v.parameters)reject('STATEMENT_CHECKSUM');
    if(step.type==='DDL'&&(step.statements.length!==1||!['CREATE','ALTER','TRIGGER'].includes(v.kind)))reject('DDL_UNIT');
    if(bound&&(v.parameters!==q.params?.length||!Array.isArray(q.params)))reject('PARAMETER_BINDING');
    if(bound&&['INSERT','UPDATE'].includes(v.kind)&&!Number.isInteger(q.expectedAffectedRows))reject('AFFECTED_ROW_CONTRACT');
   }
   if(bound&&(!isHash(step.before.sha256)||!isHash(step.after.sha256)||
    (step.type!=='VERIFY'&&step.before.sha256===step.after.sha256)))reject('UNBOUND_STEP_PREDICATES');
  }
  if(bound&&!isHash(phase.finalPredicate.sha256))reject('UNBOUND_PHASE_FINAL');
 }
 // CT_SCHEMA_VERSION is a real transaction in its own phase, not omitted or auto-attested.
 if(release.releaseId==='p14-a20h-rc2'){
  const ct=[...allSteps.values()].find(s=>s.sourceStepIds?.includes('CT_SCHEMA_VERSION'));
  const contract=release.phases.find(p=>p.id==='P06'),control=release.phases.find(p=>p.id==='P07');
  const fences=release.phases.find(p=>p.id==='P08');
  if(!ct||ct.type!=='TX'||!control?.steps.includes(ct)||!control.dependsOn.includes(contract?.id)||
   !fences?.dependsOn.includes(control.id))reject('SCHEMA_CONTROL_DEPENDENCY');
 }
 return {phases:phaseIds.size,steps:stepIds.size};
}
function assertRow(row,checksum,binding){
 if(row&&(row.checksum!==checksum||row.binding!==binding))reject('CHECKPOINT_BINDING');
}
async function observe(adapter,predicate){
 const actual=await adapter.observe(predicate);
 if(!isHash(actual))reject('OBSERVATION_FORMAT');
 return actual;
}
function signed(proofs,id,purpose,expected,permit,now){
 return verifyAttestation(proofs[id],{publicKey:permit.operatorPublicKey,
  expected:{purpose,...expected},now});
}
export async function runPhase({release:input,phaseId,adapter,journal,permit:authority,
 attestations={},sourceRoot,now=Date.now}){
 const release=immutable(input),permit=immutable(authority),proofs=immutable(attestations);
 if(release.state!=='A2_1_BOUND'||permit?.releaseDigest!==release.digest||
  !permit.operatorPublicKey||!permit.actions?.includes('MIGRATE')||
  !release.mysqlExact||!release.sqlMode||!isHash(release.baselineFingerprint)||
  release.operatorPublicKey!==permit.operatorPublicKey)reject('EXECUTION_DISABLED');
 validateRelease(release,{bound:true});
 await verifySources(sourceRoot,release.sources);
 const phase=release.phases.find(p=>p.id===phaseId);if(!phase)reject('UNKNOWN_PHASE');
 const target=immutable(await adapter.verify());assertTarget(permit,target,'MIGRATE');
 if(target.version!==release.mysqlExact||target.sql_mode!==release.sqlMode)reject('RELEASE_COMPATIBILITY');
 const binding=bindingOf(release,target,permit.runId),phaseHash=digest(phase);
 const expectedJournal={target:{host:target.host,port:target.port,serverUuid:target.server_uuid},
  schema:target.database,releaseDigest:release.digest,runId:permit.runId};
 if(canonical(journal.binding)!==canonical(expectedJournal))reject('JOURNAL_TARGET_NAMESPACE');
 const lockName='p14:'+digest({serverUuid:target.server_uuid,schema:target.database}).slice(0,48);
 let dbLocked=false,localLocked=false,primary;
 try{
  await journal.acquire();localLocked=true;
  await adapter.lock(lockName);dbLocked=true;
  const entryId='entry:'+phase.id,entry=await journal.get(entryId);
  assertRow(entry,phaseHash,binding);
  if(!entry){
   if(await adapter.baseline(phase.baselineTables??[],release.sources)!==(phase.entryBaselineFingerprint??release.baselineFingerprint))reject('BASELINE_DRIFT');
   await journal.put(entryId,{binding,checksum:phaseHash,status:'RUNNING'});
  }
  for(const dep of phase.dependsOn){
   const p=release.phases.find(p=>p.id===dep),row=await journal.get('phase:'+dep);
   assertRow(row,digest(p),binding);if(row?.status!=='VERIFIED')reject('PHASE_DEPENDENCY');
  }
  // An already advanced run must not replay an earlier phase against a later schema.
  for(const later of release.phases.slice(release.phases.indexOf(phase)+1))
   if(await journal.get('phase:'+later.id))reject('PHASE_SUPERSEDED');
  const phaseOld=await journal.get('phase:'+phase.id);assertRow(phaseOld,phaseHash,binding);
  for(const step of phase.steps){
   await journal.assertOwned();await adapter.assertLock(lockName);
   assertTarget(permit,await adapter.verify(),'MIGRATE');
   const old=await journal.get(step.id);assertRow(old,step.checksum,binding);
   for(const dep of step.dependsOn)if((await journal.get(dep))?.status!=='VERIFIED')reject('STEP_DEPENDENCY');
   if(old?.status==='VERIFIED')continue; // Phase-final check below still detects drift.
   const key=digest({binding,step:step.id,checksum:step.checksum});
   const expected={binding,stepId:step.id,phaseId:phase.id,afterFingerprint:step.after.sha256};
   let recovered=false;
   if(step.type==='BARRIER'){
    signed(proofs,step.id,'BARRIER',expected,permit,now());
    if(await observe(adapter,step.after)!==step.after.sha256)reject('BARRIER_OBSERVATION');
   }else{
    const current=await observe(adapter,step.after);
    if(['TX','BACKFILL_CHUNK'].includes(step.type)){
     const receipt=await adapter.readReceipt(key);
     if(receipt){
      if(receipt.binding!==binding||receipt.checksum!==step.checksum||
       receipt.afterFingerprint!==step.after.sha256||current!==step.after.sha256)reject('TX_RECEIPT_CONFLICT');
      // External TX completion always needs a signed attestation; crash recovery uses existing RUNNING/UNKNOWN.
      if(!old)signed(proofs,step.id,'TX_APPLIED',expected,permit,now());
      recovered=true;
     }
    }else if(old&&current===step.after.sha256)recovered=true;
    if(step.type==='VERIFY'){
     if(current!==step.after.sha256)reject('VERIFY_PREDICATE');
    }else if(!recovered){
     if(await observe(adapter,step.before)!==step.before.sha256)reject('UNKNOWN_OR_DRIFT');
     if(old)signed(proofs,step.id+':retry','RETRY_PRESTATE',expected,permit,now());
     await journal.put(step.id,{binding,checksum:step.checksum,status:'RUNNING',executionKey:key});
     try{
      if(step.type==='DDL')await adapter.executeDDL(step.statements[0]);
      else await adapter.executeAtomic(step,{key,binding,checksum:step.checksum,afterFingerprint:step.after.sha256});
      if(await observe(adapter,step.after)!==step.after.sha256)reject('POSTCONDITION');
     }catch(e){
      await journal.put(step.id,{binding,checksum:step.checksum,status:'UNKNOWN',executionKey:key});
      throw Object.assign(Error('P14 RC2 migration outcome UNKNOWN'),{code:'MIGRATION_UNKNOWN',cause:e});
     }
    }
   }
   await adapter.assertLock(lockName);
   await journal.put(step.id,{binding,checksum:step.checksum,status:'VERIFIED',executionKey:key,recovered});
  }
  if(await observe(adapter,phase.finalPredicate)!==phase.finalPredicate.sha256){
   await journal.put('incident:'+digest({phase:phase.id,time:now()}),{binding,checksum:phaseHash,status:'UNKNOWN',code:'PHASE_FINAL_DRIFT'});
   reject('PHASE_FINAL_DRIFT');
  }
  if(!phaseOld)await journal.put('phase:'+phase.id,{binding,checksum:phaseHash,status:'VERIFIED'});
 }catch(e){primary=e;throw e;}
 finally{
  const errors=[];
  if(dbLocked)try{await adapter.unlock(lockName);}catch(e){errors.push(e.code??'DB_UNLOCK');}
  if(localLocked)try{await journal.release();}catch(e){errors.push(e.code??'JOURNAL_UNLOCK');}
  if(errors.length){if(primary)primary.cleanupErrors=errors;else reject('CLEANUP_UNCONFIRMED');}
 }
}
export function createMigrationAdapter(connection,{barrierProbe}={}){
 const observePredicate=async p=>{
  if(p.kind==='SCHEMA')return schemaFingerprint(connection,p.tables);
  if(p.kind==='BARRIER'){
   if(typeof barrierProbe!=='function')reject('BARRIER_PROBE_REQUIRED');
   return digest(await barrierProbe(p.probe));
  }
  if(p.kind==='DATA'||p.kind==='SCHEMA_DATA'){
   const rows=[];
   for(const q of p.queries){
    if(validateSql(q.sql,{allowParameters:true}).kind!=='SELECT')reject('READ_ONLY_PREDICATE');
    const [result]=await connection.execute(q.sql,q.params);rows.push(result);
   }
   return digest({schema:p.kind==='SCHEMA_DATA'?await schemaFingerprint(connection,p.tables):null,rows});
  }
  reject('PREDICATE_KIND');
 };
 return {
  verify:()=>connection.verify(),
  baseline:(tables,sources)=>baselineFingerprint(connection,tables,sources),
  async lock(name){const [[r]]=await connection.query('SELECT GET_LOCK(?,0) AS acquired',[name]);if(r.acquired!==1)reject('DB_LOCK_BUSY');},
  async assertLock(name){const [[r]]=await connection.query('SELECT IS_USED_LOCK(?)=CONNECTION_ID() AS owned',[name]);if(r.owned!==1)reject('DB_LOCK_LOST');},
  async unlock(name){const [[r]]=await connection.query('SELECT RELEASE_LOCK(?) AS released',[name]);if(r.released!==1)reject('DB_UNLOCK');},
  observe:observePredicate,
  executeDDL:q=>connection.query(q.sql,q.params),
  async readReceipt(key){
   const [[r]]=await connection.execute('SELECT binding_hash AS binding,statement_checksum AS checksum,after_fingerprint AS afterFingerprint FROM migration_tx_receipts WHERE execution_key=?',[key]);return r??null;
  },
  async executeAtomic(step,receipt){
   let committed=false;
   await connection.beginReadCommitted();
   try{
    if(await observePredicate(step.before)!==step.before.sha256)reject('ATOMIC_PRECONDITION');
    for(const q of step.statements){
     const [r]=await connection.execute(q.sql,q.params);
     if(q.expectedAffectedRows!==null&&r.affectedRows!==q.expectedAffectedRows)reject('ATOMIC_ROW_COUNT');
    }
    if(await observePredicate(step.after)!==step.after.sha256)reject('ATOMIC_POSTCONDITION');
    await connection.execute(`INSERT INTO migration_tx_receipts
     (execution_key,binding_hash,step_id,statement_checksum,after_fingerprint,committed_at_utc)
     VALUES (?,?,?,?,?,UTC_TIMESTAMP(6))`,
     [receipt.key,receipt.binding,step.id,receipt.checksum,receipt.afterFingerprint]);
    committed=true;await connection.commit();
   }catch(e){
    if(committed){connection.destroy();throw Object.assign(Error('Atomic COMMIT outcome UNKNOWN'),{code:'COMMIT_OUTCOME_UNKNOWN',cause:e});}
    try{await connection.rollback();}catch{connection.destroy();}
    throw e;
   }
  }
 };
}

