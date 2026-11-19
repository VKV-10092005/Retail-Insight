import {randomUUID} from 'node:crypto';
import {isVerifiedDisposablePool} from './disposable.js';
import {transactionAttempt} from './writer.js';
import {createPostingRepository} from '../repository.js';
import {fail,utcInstant,assertPolicy} from '../domain.js';

// Unmounted administration services; no permissions are added to existing API roles.
export function createP14Administration({pool,activation={enabled:false},repositoryFactory=createPostingRepository}={}){
 const guarded=async(ctx,branch,fn)=>{
  if(!activation.enabled||!(activation.mode==='ISOLATED_MOCK'&&pool?.p14Kind==='isolated-mock'||
   activation.mode==='A2_DISPOSABLE'&&isVerifiedDisposablePool(pool)))
   fail(503,'P14_NOT_ACTIVATED');
  return transactionAttempt(pool,async c=>{
   const r=repositoryFactory(c),auth=await r.lockIdentity(ctx);
   if(auth.user.role!=='OWNER')fail(403,'OWNER_REQUIRED');
   const guard=await r.lockBranch(ctx,branch,auth.user,'SALE');
   return fn(c,r,guard,async()=>{
    const stamp=await r.now();
    if(utcInstant(auth.session.expires_at).epochNanoseconds<=utcInstant(stamp).epochNanoseconds)fail(401,'SESSION_EXPIRED');
    return stamp;
   });
  });
 };
 const audit=async(c,ctx,branch,action,target,policyId,stamp)=>{
  await c.execute(`INSERT INTO business_audit_events
   (organization_id,branch_id,actor_kind,actor_user_id,actor_service_ref,action,
    target_kind,target_ref,correlation_id,occurred_at_utc,policy_id,data_revision,reason,metadata)
   VALUES (?,?,'USER',?,NULL,?,'BUSINESS_CONTROL',?,?,?, ?,NULL,NULL,?)`,
   [ctx.org,branch,ctx.userId,action,String(target),randomUUID(),stamp,policyId,'{}']);
 };
 return {
  closePeriod({context:ctx,branch,dateStart,expectedVersion}){
   return guarded(ctx,branch,async(c,r,g,getStamp)=>{
    const policy=await r.lockPolicy(ctx,branch,g.active_policy_id);
    const p=await r.lockPeriod(ctx,branch,dateStart);
    if(!p||String(p.version)!==String(expectedVersion))fail(409,'PERIOD_VERSION_STALE');
    const stamp=await getStamp();
    const [changed]=await c.execute(`UPDATE business_periods SET live_state='CLOSED',version=version+1,
     changed_by=?,changed_at_utc=? WHERE organization_id=? AND branch_id=? AND id=? AND version=?`,
     [ctx.userId,stamp,ctx.org,branch,p.id,expectedVersion]);
    if(changed.affectedRows!==1)fail(409,'PERIOD_VERSION_STALE');
    await audit(c,ctx,branch,'LIVE_PERIOD_CLOSED',p.id,policy.id,stamp);
    return {id:p.id,live_state:'CLOSED'};
   });
  },
  activatePolicy({context:ctx,branch,policyId,expectedPolicyId}){
   return guarded(ctx,branch,async(c,r,g,getStamp)=>{
    if(String(g.active_policy_id)!==String(expectedPolicyId))fail(409,'POLICY_VERSION_STALE');
    const p=await r.lockPolicy(ctx,branch,policyId);assertPolicy(p,branch,ctx.org);
    const stamp=await getStamp();
    if(utcInstant(p.effective_from_utc).epochNanoseconds>utcInstant(stamp).epochNanoseconds)fail(409,'POLICY_NOT_EFFECTIVE');
    // A-only: archive/combined activation is intentionally excluded.
    if(Number(p.archive_enabled)||Number(p.combined_enabled))fail(403,'ARCHIVE_NOT_IMPLEMENTED');
    const [changed]=await c.execute(`UPDATE branch_posting_guards SET active_policy_id=?
     WHERE organization_id=? AND branch_id=? AND active_policy_id=?`,
     [policyId,ctx.org,branch,expectedPolicyId]);
    if(changed.affectedRows!==1)fail(409,'POLICY_VERSION_STALE');
    await audit(c,ctx,branch,'POLICY_ACTIVATED',p.id,p.id,stamp);
    return {active_policy_id:p.id};
   });
  }
 };
}
// Staff update rank helper for future API integration. All user IDs acquired sorted before session/branches.
// The current PATCH /staff is unchanged; adoption is a mandatory activation gate.
export async function lockUserSet(c,org,actorId,targetId){
 const users=new Map();
 for(const id of [...new Set([actorId,targetId])].sort((a,b)=>a-b)){
  const [rows]=await c.execute('SELECT id,role,status FROM users WHERE organization_id=? AND id=? '+(id===targetId?'FOR UPDATE':'FOR SHARE'),[org,id]);
  if(!rows.length)fail(404,'USER_NOT_FOUND');users.set(id,rows[0]);
 }
 return users;
}

