import {requireAction,withConnection} from './authority.js';
import {lockUserSet} from '../../../src/p14/rc2/administration.js';
import {randomUUID} from 'node:crypto';
export async function controlMutation({cap,channel,actor,target,branch,kind,periodId,expectedVersion,hook=async()=>{}}){
 requireAction(cap,'CONTROL');if(channel.permit.principal.role!=='control')throw Error('CONTROL_PRINCIPAL');
 return withConnection(cap,'CONTROL',channel,async c=>{
  const one=async(sql,args=[])=>{const [[r]]=await c.execute(sql,args);return r;};
  await c.beginReadCommitted();let commitStarted=false;
  try{
   const control=await one('SELECT * FROM business_schema_control WHERE singleton_id=1 FOR SHARE');
   if(control?.mode!=='ENFORCED')throw Error('CONTROL_NOT_ENFORCED');
   const org=await one('SELECT status FROM organizations WHERE id=? FOR SHARE',[actor.org]);
   if(org?.status!=='ACTIVE')throw Error('ORG_INACTIVE');
   const users=await lockUserSet(c,actor.org,actor.userId,(typeof target==='object'?target.userId:target)??actor.userId);
   if(users.get(actor.userId)?.role!=='OWNER'||users.get(actor.userId)?.status!=='ACTIVE')throw Error('OWNER_REQUIRED');
   const session=await one('SELECT * FROM auth_sessions WHERE organization_id=? AND user_id=? AND id=? FOR SHARE',
    [actor.org,actor.userId,actor.sessionId]);
   const clock=await one('SELECT UTC_TIMESTAMP(6) AS utc');
   if(!session||session.revoked_at!==null||String(session.expires_at)<=String(clock.utc))throw Error('SESSION_INVALID');
   await hook('after-auth-lock');let change;
   if(kind==='REVOKE')change={sql:'UPDATE auth_sessions SET revoked_at=? WHERE organization_id=? AND user_id=? AND id=? AND revoked_at IS NULL',
    params:[clock.utc,actor.org,target.userId,target.sessionId]};
   else if(kind==='DISABLE')change={sql:"UPDATE users SET status='DISABLED' WHERE organization_id=? AND id=? AND status='ACTIVE'",params:[actor.org,target]};
   else if(kind==='CLOSE'){
    const guard=await one('SELECT * FROM branch_posting_guards WHERE organization_id=? AND branch_id=? FOR UPDATE',[actor.org,branch]);
    await hook('after-guard');
    const b=await one('SELECT status FROM branches WHERE organization_id=? AND id=? FOR SHARE',[actor.org,branch]);
    if(!guard||b?.status!=='ACTIVE')throw Error('BRANCH_INVALID');
    await one('SELECT id FROM business_posting_policies WHERE organization_id=? AND branch_id=? AND id=? FOR SHARE',[actor.org,branch,guard.active_policy_id]);
    const p=await one('SELECT * FROM business_periods WHERE organization_id=? AND branch_id=? AND id=? FOR UPDATE',[actor.org,branch,periodId]);
    if(String(p?.version)!==String(expectedVersion))throw Error('PERIOD_STALE');
    change={sql:"UPDATE business_periods SET live_state='CLOSED',version=version+1,changed_by=?,changed_at_utc=? WHERE organization_id=? AND branch_id=? AND id=? AND version=?",
     params:[actor.userId,clock.utc,actor.org,branch,periodId,expectedVersion]};
   }else throw Error('CONTROL_KIND');
   const [r]=await c.execute(change.sql,change.params);if(r.affectedRows!==1)throw Error('CONTROL_ROW_COUNT');
   await c.execute("INSERT INTO business_audit_events(organization_id,branch_id,actor_kind,actor_user_id,actor_service_ref,action,target_kind,target_ref,correlation_id,occurred_at_utc,policy_id,data_revision,reason,metadata) VALUES (?,?,'USER',?,NULL,?,'TEST_CONTROL',?,?,?,NULL,NULL,NULL,'{}')",
    [actor.org,branch,actor.userId,'TEST_'+kind,String(periodId??target?.userId??target),randomUUID(),clock.utc]);
   commitStarted=true;await c.commit();
  }catch(e){if(commitStarted){c.destroy();throw Object.assign(Error('Control outcome UNKNOWN; reconcile CAS/audit before retry'),{code:'CONTROL_OUTCOME_UNKNOWN',cause:e});}try{await c.rollback();}catch{c.destroy();}throw e;}
 });
}
