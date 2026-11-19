import {immutable,digest} from '../../../src/p14/rc2/contracts.js';
import {acceptance} from '../../../src/p14/domain.js';
export function legacyBackfillPlan({candidate,fixture,finalize=false}){
 const step=candidate.phases.find(p=>p.id==='P03').steps.find(s=>s.id==='ONLINE_BACKFILL_CHUNK');
 if(!step||step.statements.length!==2)throw Error('RC2_BACKFILL_SOURCE_DRIFT');
 return immutable(fixture.rows.stock_documents.map(d=>{
  const before={organization_id:d.organization_id,id:d.id,created_at:d.created_at,payload_hash:d.payload_hash,total:d.total};
  const derive=structuredClone(step.statements[1]);
  derive.params=[acceptance(d.created_at).business_date,d.organization_id,d.id,d.created_at];derive.expectedAffectedRows=finalize?0:1;
  const statements=[{...structuredClone(step.statements[0]),params:[d.organization_id,d.id],expectedAffectedRows:null},derive];
  if(finalize){
   const sql="INSERT INTO document_finalizations(organization_id,branch_id,document_id,kind,receipt_id,migration_manifest_sha256,finalized_at_utc) VALUES (?,?,?,'LEGACY',NULL,UNHEX(?),?)";
   statements.push({sql,sha256:digest(sql),parameterCount:5,params:[d.organization_id,d.branch_id,d.id,fixture.digest,fixture.controlPlans[0].utc],expectedAffectedRows:1});
  }
  return {type:'BACKFILL_CHUNK',documentId:String(d.id),original:before,expected:{
   ...before,business_date:acceptance(d.created_at).business_date,business_date_origin:'DERIVED_FROM_RECORDED_AT',writer_epoch:0,
   policy_id:null,period_id:null,accepted_at_utc:null,posting_revision:null},
   statements,executable:false,requiredBefore:finalize?'Already derived; no marker':'All lineage fields NULL',
   requiredAfter:finalize?'Exactly one LEGACY marker, no request receipt':'Derived metadata; originals unchanged'};
 }));
}
export const recoveryCases=Object.freeze([
 ['J01','after file fsync before rename','Reconcile old checkpoint / UNKNOWN'],
 ['J02','DDL committed before checkpoint / ACK lost','Exact poststate; no duplicate DDL'],
 ['J03','TX COMMIT ACK lost','Durable receipt plus exact poststate'],
 ['J04','connection dies before COMMIT','Rollback, lock release and zero delta'],
 ['J05','stale owner.lock','Blocked pending operator ownership recovery'],
 ['J06','schema/source drift after VERIFIED','Phase-final mismatch stops'],
 ['J07','two run IDs same target/schema','One advisory-lock owner'],
 ['J08','missing schema/control version','CT_SCHEMA_VERSION before fences']
].map(([id,fault,proof])=>Object.freeze({id,fault,proof,status:'NOT_RUN'})));
