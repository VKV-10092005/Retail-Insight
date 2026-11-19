import {readFile,rename,mkdir,lstat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {sha256,parseMarkedSql,validateSql} from './sql-parser.js';
import {assertPermitTarget} from './disposable.js';

export function releaseDigest(release){
 const {digest,...body}=release;return sha256(JSON.stringify(body));
}
export async function buildCandidate(draftDirectory){
 const definitions=[
  ['10_expand.draft.sql','expand'],['30_contract.draft.sql','contract'],
  ['40_write_fences.draft.sql','fences'],['41_immutability.draft.sql','fences']
 ];
 const steps=[],sources=[];let previous=null;
 for(const [name,phase] of definitions){
  const raw=await readFile(path.join(draftDirectory,name),'utf8');
  sources.push({name,sha256:sha256(raw)});
  for(const block of parseMarkedSql(raw,{draft:true,allowTokens:true,allowParameters:true})){
   if(block.reviewOnly)continue;
   // State transitions/prepared DML are operator choreography, not auto-DDL.
   const manual=block.kind==='UPDATE'||block.parameters>0;
   steps.push({...block,phase,manual,dependsOn:previous?[previous]:[],
    beforeFingerprint:null,afterFingerprint:null,tables:[]});
   previous=block.id;
  }
 }
 const manualTemplates=[];
 for(const name of ['00_preflight.draft.sql','20_backfill_bootstrap.draft.sql','50_cutover.draft.sql']){
  const raw=await readFile(path.join(draftDirectory,name),'utf8');
  sources.push({name,sha256:sha256(raw)});
  manualTemplates.push(...parseMarkedSql(raw,{draft:true,allowTokens:true,allowParameters:true}).filter(s=>!s.reviewOnly));
 }
 const baselineSources=[];
 for(const name of ['001_auth.sql','002_operations.sql']){
  const raw=await readFile(new URL('../db/migrations/'+name,import.meta.url),'utf8');
  baselineSources.push({name,sha256:sha256(raw)});
 }
 const release={releaseId:'p14-a1-rc1',state:'CANDIDATE_NOT_EXECUTABLE',writerEpoch:1,
  schemaVersion:2,engine:'InnoDB',mysqlMin:'8.0.16',mysqlExact:null,sqlMode:null,
  baselineFingerprint:null,baselineMigrations:['001_auth','002_operations'],
  rendering:null,nativeVerified:false,sources,baselineSources,steps,manualTemplates};
 release.digest=releaseDigest(release);
 return release;
}
export function renderCandidate(candidate,bindings){
 if(candidate.digest!==releaseDigest(candidate))throw Error('Release checksum mismatch');
 const allowed=new Set(['TYPE_CHARSET','TYPE_COLLATION','KEY_CHARSET','KEY_COLLATION']);
 if(Object.keys(bindings).length!==4||Object.keys(bindings).some(k=>!allowed.has(k))||
  Object.values(bindings).some(v=>typeof v!=='string'||!/^[_a-z0-9]+$/.test(v)))throw Error('Unapproved metadata bindings');
 const r=structuredClone(candidate);
 r.steps=r.steps.map(s=>{
  const sql=s.sql.replace(/\{\{([A-Z_]+)\}\}/g,(_,k)=>{
   if(!allowed.has(k))throw Error('Unknown render token');return bindings[k];
  });
  validateSql(sql,{allowParameters:true});return {...s,sql,sha256:sha256(sql)};
 });
 r.rendering={...bindings};
 r.digest=releaseDigest(r);return r; // Still candidate, never sets approval/nativeVerified.
}
export class MemoryCheckpoints {
 constructor(){this.rows=new Map();}
 async get(id){return this.rows.get(id)??null;}
 async put(id,row){this.rows.set(id,structuredClone(row));}
}
// Operator-local durable journal. One advisory lock on the DB connection serializes runners.
// Directory must be a dedicated operator-controlled directory, not shared by runtime.
export class FileCheckpoints {
 constructor(directory,runId){
  if(!/^[a-zA-Z0-9_-]+$/.test(runId))throw Error('Invalid run ID');
  this.directory=path.resolve(directory);this.file=path.join(this.directory,runId+'.json');
 }
 async load(){
  await mkdir(this.directory,{recursive:true});
  for(let p=this.directory;;p=path.dirname(p)){
   if((await lstat(p)).isSymbolicLink())throw Error('Journal directory symlink');
   if(path.dirname(p)===p)break;
  }
  try{return JSON.parse(await readFile(this.file,'utf8'));}
  catch(e){if(e.code==='ENOENT')return {};throw e;}
 }
 async get(id){return (await this.load())[id]??null;}
 async put(id,row){
  const all=await this.load();all[id]=row;
  const tmp=this.file+'.'+randomUUID()+'.tmp';
  // fsync before atomic rename; interrupted rename leaves old checkpoint recoverable.
  const {open}=await import('node:fs/promises');
  const h=await open(tmp,'wx',0o600);
  try{await h.writeFile(JSON.stringify(all,null,2));await h.sync();}finally{await h.close();}
  await rename(tmp,this.file);
 }
}
export async function runMigration({release,adapter,checkpoints,permit,phase}){
 if(!release||release.state!=='A2_APPROVED'||release.digest!==releaseDigest(release)||
  permit?.releaseDigest!==release.digest||!permit.approvalRef||
  !release.mysqlExact||!release.sqlMode||!release.baselineFingerprint||!release.rendering)
  throw Error('P14 migration execution disabled: unapproved/unbound candidate');
 if(!['expand','contract','fences'].includes(phase))throw Error('Explicit phase required');
 const identity=await adapter.verify();assertPermitTarget(permit,identity);
 if(identity.version!==release.mysqlExact||identity.sql_mode!==release.sqlMode)
  throw Error('Release compatibility mismatch');
 const binding=sha256(JSON.stringify({release:release.digest,target:identity.database,uuid:identity.server_uuid}));
 const lockName='p14:'+identity.database;let locked=false;
 try{
  await adapter.lock(lockName);locked=true;
  if(await adapter.baseline()!==release.baselineFingerprint)throw Error('Baseline migration versions mismatch');
  for(const step of release.steps.filter(s=>s.phase===phase)){
   if(step.manual)throw Error('Manual transaction/state-transition step requires separate approved choreography');
   if(!step.beforeFingerprint||!step.afterFingerprint||!step.tables.length||
    step.beforeFingerprint===step.afterFingerprint||step.sha256!==sha256(step.sql))
    throw Error('Step predicates/checksum incomplete');
   validateSql(step.sql,{noBackslashEscapes:release.sqlMode.split(',').includes('NO_BACKSLASH_ESCAPES')});
   for(const dep of step.dependsOn){
    const d=await checkpoints.get(dep);
    if(!d||d.status!=='VERIFIED'||d.binding!==binding)throw Error('Unverified dependency');
   }
   await adapter.assertLock(lockName);
   assertPermitTarget(permit,await adapter.verify());
   const old=await checkpoints.get(step.id);
   if(old&&(old.binding!==binding||old.sha256!==step.sha256))throw Error('Checkpoint checksum/identity mismatch');
   if(old?.status==='VERIFIED')continue; // Later steps may legitimately change same object.
   const current=await adapter.inspect(step);
   if(old&&current===step.afterFingerprint){
    await checkpoints.put(step.id,{...old,status:'VERIFIED',recovered:true});continue;
   }
   if(current!==step.beforeFingerprint){
    await checkpoints.put(step.id,{binding,sha256:step.sha256,status:'UNKNOWN'});
    throw Error('Schema drift: neither known precondition nor recoverable postcondition');
   }
   await checkpoints.put(step.id,{binding,sha256:step.sha256,status:'RUNNING',attempt:(old?.attempt??0)+1});
   try{
    await adapter.execute(step.sql);
    await adapter.assertLock(lockName);
    if(await adapter.inspect(step)!==step.afterFingerprint)throw Error('Postcondition mismatch');
    await checkpoints.put(step.id,{binding,sha256:step.sha256,status:'VERIFIED'});
   }catch{
    await checkpoints.put(step.id,{binding,sha256:step.sha256,status:'UNKNOWN'});
    throw Error('Migration outcome UNKNOWN; inspect and resume, never blindly replay');
   }
  }
 }finally{if(locked)await adapter.unlock(lockName);}
}
// Concrete SQL adapter has no connector/import/runtime config and never bootstraps itself.
export function createMigrationAdapter(connection){
 return {
  verify:()=>connection.verify(),
  async baseline(){const [rows]=await connection.query('SELECT version FROM schema_migrations ORDER BY version');return sha256(JSON.stringify(rows));},
  async lock(name){const [[r]]=await connection.query('SELECT GET_LOCK(?,0) AS acquired',[name]);if(r.acquired!==1)throw Error('Migration lock busy');},
  async assertLock(name){const [[r]]=await connection.query('SELECT IS_USED_LOCK(?)=CONNECTION_ID() AS owned',[name]);if(r.owned!==1)throw Error('Migration lock lost');},
  async unlock(name){await connection.query('SELECT RELEASE_LOCK(?) AS released',[name]);},
  execute:sql=>connection.query(sql),
  async inspect(step){
   const snapshot=[];
   for(const table of [...step.tables].sort()){
    if(!/^[_a-z0-9]+$/.test(table))throw Error('Unsafe table predicate');
    const [properties]=await connection.execute('SELECT ENGINE,TABLE_COLLATION FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?',[table]);
    const [columns]=await connection.execute(`SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,
     EXTRA,CHARACTER_SET_NAME,COLLATION_NAME FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name=? ORDER BY ORDINAL_POSITION`,[table]);
    const [indexes]=await connection.execute(`SELECT INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,SUB_PART
     FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=?
     ORDER BY INDEX_NAME,SEQ_IN_INDEX`,[table]);
    const [constraints]=await connection.execute(`SELECT CONSTRAINT_NAME,COLUMN_NAME,ORDINAL_POSITION,
     REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.key_column_usage
     WHERE table_schema=DATABASE() AND table_name=? ORDER BY CONSTRAINT_NAME,ORDINAL_POSITION`,[table]);
    const [checks]=await connection.execute(`SELECT t.CONSTRAINT_NAME,t.ENFORCED,c.CHECK_CLAUSE
     FROM information_schema.table_constraints t JOIN information_schema.check_constraints c
     ON c.CONSTRAINT_SCHEMA=t.CONSTRAINT_SCHEMA AND c.CONSTRAINT_NAME=t.CONSTRAINT_NAME
     WHERE t.CONSTRAINT_SCHEMA=DATABASE() AND t.TABLE_NAME=? AND t.CONSTRAINT_TYPE='CHECK'
     ORDER BY t.CONSTRAINT_NAME`,[table]);
    const [triggers]=await connection.execute(`SELECT TRIGGER_NAME,ACTION_TIMING,EVENT_MANIPULATION,
     ACTION_STATEMENT,SQL_MODE FROM information_schema.triggers
     WHERE trigger_schema=DATABASE() AND event_object_table=? ORDER BY TRIGGER_NAME`,[table]);
    snapshot.push({table,properties,columns,indexes,constraints,checks,triggers});
   }
   return sha256(JSON.stringify(snapshot));
  }
 };
}

