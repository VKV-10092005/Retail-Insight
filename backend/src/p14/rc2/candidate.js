import {readFile,readdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest,reject} from './contracts.js';
import {lexSql,validateSql} from '../sql-parser.js';
import {sealRelease,validateRelease} from './migration.js';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const tableFor=s=>{
 const t=lexSql(s).tokens.map(t=>t.value);
 const tableIndex=t.indexOf('TABLE');
 if(tableIndex>=0)return [t[tableIndex+1]==='IF'?t[tableIndex+4].toLowerCase():t[tableIndex+1].toLowerCase()];
 const at=t.indexOf('ON');return at>=0?[t[at+1].toLowerCase()]:[];
};
function sqlUnit(q){
 const v=validateSql(q.sql,{allowTokens:true,allowParameters:true});
 return {sql:q.sql,sha256:digest(q.sql),parameterCount:v.parameters,
  parameterContract:Array.from({length:v.parameters},(_,i)=>({position:i+1,type:'UNBOUND_APPROVED_VALUE',nullable:false})),
  params:v.parameters?null:[],expectedAffectedRows:['INSERT','UPDATE'].includes(v.kind)?1:null};
}
function predicate(kind,tables,requirements,queries=[]){
 return {kind,tables:[...new Set(tables)].sort(),queries,requirements,sha256:null};
}
export async function buildCandidate(){
 const rc1=JSON.parse((await readFile(path.join(root,'backend/releases/p14-a1-rc1/candidate.json'),'utf8')).replace(/^\uFEFF/,''));
 const plan=JSON.parse((await readFile(path.join(root,'docs/p1_4_a20/release-plan.review.json'),'utf8')).replace(/^\uFEFF/,''));
 const lookup=new Map([...rc1.steps,...rc1.manualTemplates].map(q=>[q.id,q]));
 const phases=[];let previous=null;
 function step(phase,id,type,ids,requirements=[],extraStatements=[]){
  const units=ids.map(id=>{if(!lookup.has(id))reject('UNKNOWN_SOURCE_STEP');return sqlUnit(lookup.get(id));}).concat(extraStatements.map(sql=>sqlUnit({sql})));
  const tables=units.flatMap(q=>tableFor(q.sql));
  const s={id,type,sourceStepIds:ids,dependsOn:previous?[previous]:[],statements:units,
   before:predicate(type==='BARRIER'?'BARRIER':'SCHEMA_DATA',tables,['Identity + phase predecessor',...requirements]),
   after:predicate(type==='BARRIER'?'BARRIER':'SCHEMA_DATA',tables,['Exact postconditions + immutable economics',...requirements])};
  if(type==='BARRIER'){s.before.probe=id;s.after.probe=id;}
  phase.steps.push(s);previous=id;return s;
 }
 for(const p of plan.phases){
  const phase={id:p.id,dependsOn:p.dependsOn,description:p.kind,entryBaselineFingerprint:null,steps:[],
   finalPredicate:predicate('SCHEMA_DATA',[],p.postconditions)};
  if(p.id==='P00')step(phase,'INSTANCE_IDENTITY_ATTESTATION','BARRIER',[],p.postconditions);
  else if(p.id==='P01'){
   for(const file of ['001_auth.sql','002_operations.sql']){
    const raw=await readFile(path.join(root,'backend/src/db/migrations',file),'utf8');
    const {source,tokens}=lexSql(raw);let at=0,n=0;
    for(const token of tokens)if(token.value===';'){
     const sql=source.slice(at,token.end).trim();at=token.end;
     step(phase,'BASE_'+file.slice(0,3)+'_'+(++n),'DDL',[],['Fresh baseline schema'],[sql]);
    }
    if(lexSql(source.slice(at)).tokens.length)reject('BASELINE_UNTERMINATED');
   }
   step(phase,'BASE_LEDGER','DDL',[],[],[
    'CREATE TABLE schema_migrations (version VARCHAR(100) PRIMARY KEY,applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;']);
   step(phase,'BASE_TX_RECEIPTS','DDL',[],[],[
    `CREATE TABLE migration_tx_receipts (
      execution_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      binding_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      step_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      statement_checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      after_fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      committed_at_utc DATETIME(6) NOT NULL
     ) ENGINE=InnoDB;`]);
   step(phase,'BASE_VERSIONS','TX',[],['Baseline versions001/002 exactly once'],[
    "INSERT INTO schema_migrations(version) VALUES ('001_auth'),('002_operations');"]);
   phase.steps.at(-1).statements[0].expectedAffectedRows=2;
  }else if(['P02','P06','P08'].includes(p.id)){
   for(const id of p.sourceSteps)step(phase,id,'DDL',[id],p.preconditions);
  }else if(p.id==='P03'){
   step(phase,'BOOTSTRAP_TRANSACTION','TX',['BF_CONTROL_SEED','BF_POLICY_SEED','BF_GUARD_SEED','BF_PERIOD_SEED'],p.postconditions);
   step(phase,'ONLINE_BACKFILL_CHUNK','BACKFILL_CHUNK',['BF_LOCK_DOCUMENT','BF_DERIVE_LEGACY'],['Approved finite chunk/input manifest','IANA-derived DATE, originals checksum unchanged']);
  }else if(p.id==='P04'){
   step(phase,'INGRESS_DRAIN_ATTESTATION','BARRIER',[],['Test-only PIDs/ingress closed']);
   step(phase,'ENTER_MAINTENANCE_TX','TX',['CO_LOCK_CONTROL','CO_ENTER_MAINTENANCE'],['Expected version CAS + control MAINTENANCE']);
   step(phase,'LEGACY_FENCE_ATTESTATION','BARRIER',[],['Old writer principals fenced and inflight drained']);
  }else if(p.id==='P05'){
   step(phase,'FINAL_TAIL_CHUNK','BACKFILL_CHUNK',['BF_LOCK_DOCUMENT','BF_DERIVE_LEGACY','BF_LEGACY_FINALIZATION'],p.postconditions);
   const s=step(phase,'RECONCILIATION_VERIFY','VERIFY',[],p.postconditions);
   s.after.queries=['BF_MISSING_METADATA','BF_MISSING_FINALIZATIONS','BF_MISSING_GUARD',
    'PF_MOVEMENT_DUPLICATES','PF_MOVEMENT_BRANCH','PF_DOCUMENT_TOTAL','PF_ITEM_MOVEMENT','PF_EXTRA_MOVEMENT']
    .map(id=>({sql:lookup.get(id).sql,params:[]}));
  }else if(p.id==='P07'){
   step(phase,'SCHEMA_CONTROL_TRANSACTION','TX',['CO_LOCK_CONTROL','CT_SCHEMA_VERSION'],p.postconditions);
  }else if(p.id==='P09')step(phase,'PRE_CUTOVER_EVIDENCE','BARRIER',[],p.postconditions);
  else if(p.id==='P10')step(phase,'DISPOSABLE_CUTOVER_TRANSACTION','TX',['CO_LOCK_CONTROL','CO_ACTIVATE'],p.postconditions);
  else step(phase,'NATIVE_TEST_EVIDENCE','BARRIER',[],p.postconditions);
  phase.finalPredicate.tables=[...new Set(phase.steps.flatMap(s=>[...s.before.tables,...s.after.tables]))].sort();
  phase.finalPredicate.requirements.push('Complete phase schema/data fingerprint, including prior affected objects');
  phases.push(phase);
 }
 const allTables=[...new Set(phases.flatMap(p=>p.steps.flatMap(s=>[...s.before.tables,...s.after.tables])))].sort();
 for(const p of phases){
  p.baselineTables=allTables;
  for(const s of p.steps)if(s.type!=='BARRIER'){s.before.tables=allTables;s.after.tables=allTables;}
  p.finalPredicate.tables=allTables;
 }
 const paths=[
  'backend/releases/p14-a1-rc1/candidate.json','docs/p1_4_a20/release-plan.review.json',
  'backend/src/db/migrations/001_auth.sql','backend/src/db/migrations/002_operations.sql',
  'backend/src/p14/domain.js','backend/src/p14/repository.js','backend/src/p14/sql-parser.js','backend/src/p14/lifecycle.js',
  'backend/package.json','backend/package-lock.json',
  ...(await readdir(path.join(root,'backend/src/p14/rc2'))).filter(f=>f.endsWith('.js')).map(f=>'backend/src/p14/rc2/'+f),
  ...(await readdir(path.join(root,'docs/p1_4_a0_sql'))).filter(f=>f.endsWith('.sql')).map(f=>'docs/p1_4_a0_sql/'+f)
 ].sort();
 const sources=[];
 for(const p of paths)sources.push({path:p,sha256:digest(await readFile(path.join(root,p),'utf8'))});
 const release=sealRelease({protocol:'p14-typed-v2',releaseId:'p14-a20h-rc2',sourceReleaseId:rc1.releaseId,
  sourceReleaseDigest:rc1.digest,state:'CANDIDATE_NOT_EXECUTABLE',nativeVerified:false,
  nativeRequired:['active isolation','DDL/constraints/driver','privilege semantics','crash/durability','two native processes','environment R10'],
  mysqlExact:null,sqlMode:null,baselineFingerprint:null,operatorPublicKey:null,sourceRootBinding:null,
  sources,phases,parameterBindingPolicy:'Exact action-approved inputs; no production data or secrets',
  recoveryPolicy:'Signed retry/manual evidence + independent schema/data/DB receipt; no blind replay'});
 validateRelease(release);return release;
}

