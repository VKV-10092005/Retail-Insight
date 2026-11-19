import {immutable,digest,verifyAttestation,reject} from '../../../src/p14/rc2/contracts.js';
import {validateRelease,sealRelease} from '../../../src/p14/rc2/migration.js';
import {validateSql} from '../../../src/p14/sql-parser.js';
const name=n=>{if(!/^[a-z_][a-z0-9_]*$/.test(n))reject('INVENTORY_IDENTIFIER');return '`'+n+'`';};
export const inventoryQueries={
 identity:"SELECT DATABASE() AS db,@@server_uuid AS server_uuid,@@port AS port,VERSION() AS version,CURRENT_USER() AS account,USER() AS origin,@@sql_mode AS sql_mode,@@character_set_server AS charset_server,@@collation_server AS collation_server,@@collation_database AS collation_database,@@collation_connection AS collation_connection,@@lower_case_table_names AS lower_case_table_names,@@session.time_zone AS session_timezone,@@session.transaction_isolation AS default_isolation",
 grants:'SHOW GRANTS',
 columns:'SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,CHARACTER_SET_NAME,COLLATION_NAME,ORDINAL_POSITION FROM information_schema.columns WHERE table_schema=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION',
 indexes:"SELECT TABLE_NAME,COLUMN_NAME,SEQ_IN_INDEX FROM information_schema.statistics WHERE table_schema=DATABASE() AND INDEX_NAME='PRIMARY' ORDER BY TABLE_NAME,SEQ_IN_INDEX",
 engines:'SELECT TABLE_NAME,ENGINE,TABLE_COLLATION FROM information_schema.tables WHERE table_schema=DATABASE() ORDER BY TABLE_NAME'
};
export async function inventory(connection){
 const out={kind:'UNATTESTED_CAPTURE',queries:{}};
 for(const [id,sql] of Object.entries(inventoryQueries)){const [rows]=await connection.query(sql);out.queries[id]=rows;}
 return out; // Caller must authorize connection; this function does not connect or claim provenance.
}
export function dataPredicates({columns,indexes,tables}){
 return tables.filter(t=>t!=='migration_tx_receipts').sort().map(table=>{
  const cols=columns.filter(c=>c.TABLE_NAME===table).sort((a,b)=>a.ORDINAL_POSITION-b.ORDINAL_POSITION).map(c=>c.COLUMN_NAME);
  const keys=indexes.filter(i=>i.TABLE_NAME===table).sort((a,b)=>a.SEQ_IN_INDEX-b.SEQ_IN_INDEX).map(c=>c.COLUMN_NAME);
  if(!cols.length||!keys.length)reject('PREDICATE_NO_PRIMARY_KEY');
  const selected=table==='schema_migrations'?['version']:cols;
  return {sql:'SELECT '+selected.map(name).join(',')+' FROM '+name(table)+' ORDER BY '+keys.map(name).join(','),params:[]};
 });
}
export function bootstrapPlan(fixture){
 const statement=(table,row)=>({sql:'INSERT INTO '+table+' ('+Object.keys(row).join(',')+') VALUES ('+Object.keys(row).map(()=>'?').join(',')+')',
  params:Object.values(row),expectedAffectedRows:1});
 return [
 statement('business_schema_control',{singleton_id:1,mode:'EXPAND',required_writer_epoch:1,schema_version:1,reader_basis:'RECORDED_TIME',version:1,changed_at_utc:fixture.controlPlans[0].utc}),
 ...fixture.controlPlans.flatMap(p=>[
 statement('business_posting_policies',{id:p.policyId,organization_id:p.org,branch_id:p.branch,policy_version:1,
  business_timezone:'Asia/Ho_Chi_Minh',date_algorithm_version:'business-date-v2',live_date_mode:'TODAY_ONLY',
  archive_enabled:0,combined_enabled:0,effective_from_utc:p.utc,created_by:p.actor,created_at_utc:p.utc}),
 statement('branch_posting_guards',{organization_id:p.org,branch_id:p.branch,active_policy_id:p.policyId,live_revision:0,archive_revision:0}),
 statement('business_periods',{id:p.periodId,organization_id:p.org,branch_id:p.branch,...p.month,live_state:'OPEN',archive_state:'CLOSED',
  version:1,policy_id:p.policyId,changed_by:p.actor,changed_at_utc:p.utc})
 ])];
}
export function reviewBinding({candidate,captures,bindings,operatorPublicKey}){
 validateRelease(candidate);const result=structuredClone(candidate),blockers=[];
 for(const phase of result.phases){
  const evidence=captures[phase.id];
  if(!evidence){blockers.push(phase.id+':NATIVE_CAPTURE_REQUIRED');continue;}
  verifyAttestation(evidence.attestation,{publicKey:operatorPublicKey,
   expected:{purpose:'RC2_PHASE_CAPTURE',candidateDigest:candidate.digest,phaseId:phase.id,captureDigest:digest(evidence.capture)}});
  if(evidence.capture.provenance!=='NATIVE_CAPTURE'||!evidence.capture.targetUuid)reject('CAPTURE_PROVENANCE');
  phase.entryBaselineFingerprint=evidence.capture.entry;phase.finalPredicate=evidence.capture.final;
  for(const step of phase.steps){
   const b=bindings[step.id];if(!b){blockers.push(step.id+':BINDING_REQUIRED');continue;}
   step.before=b.before;step.after=b.after;if(b.statements)step.statements=b.statements;
   for(const q of step.statements){
    const v=validateSql(q.sql,{allowParameters:true});q.sha256=digest(q.sql);q.parameterCount=v.parameters;
    if(v.parameters!==q.params?.length)reject('BINDING_PARAMETERS');
    if(['INSERT','UPDATE'].includes(v.kind)&&!Number.isSafeInteger(q.expectedAffectedRows))reject('BINDING_ROW_COUNT');
   }
  }
 }
 result.state='REVIEW_BOUND_NOT_EXECUTABLE';result.nativeVerified=false;
 result.prepBinding={candidateDigest:candidate.digest,blockers,activationAllowed:false};
 return immutable(sealRelease(result));
}
