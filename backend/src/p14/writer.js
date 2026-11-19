import {randomUUID} from 'node:crypto';
import {P14Error,fail,EPOCH,parseDocument,replay,envelope,hash,acceptance,monthRange,
 assertPeriod,nextRevision,prepareLines,utcInstant} from './domain.js';
import {createPostingRepository} from './repository.js';
import {isVerifiedDisposablePool} from './disposable.js';

const transport=new Set(['PROTOCOL_CONNECTION_LOST','ECONNRESET','ETIMEDOUT','P14_DEADLINE']);
const transient=new Set(['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT','P14_MONTH_CHANGED']);
const unknown=()=>new P14Error(503,'COMMIT_OUTCOME_UNKNOWN','Tra cứu bằng cùng request_key trên Primary; không tạo key mới');
export function requestIdentityConflict(e){
 if(e.code!=='ER_DUP_ENTRY')return false;
 return ['document_request','p14_receipt_request'].includes(e.constraint)||
  /for key ['\x60](?:[a-zA-Z0-9_]+\.)?(document_request|p14_receipt_request)['\x60]/.test(e.sqlMessage??'');
}
async function acquire(pool,remaining){
 let timer,expired=false;
 const promise=pool.getConnection();
 const late=promise.then(c=>{if(expired){c.destroy();throw new P14Error(503,'P14_DEADLINE');}return c;});
 try{return await Promise.race([late,new Promise((_,reject)=>{
  timer=setTimeout(()=>{expired=true;reject(new P14Error(503,'P14_DEADLINE'));},remaining);
 })]);}finally{clearTimeout(timer);}
}
export async function transactionAttempt(pool,work,{deadline=Date.now()+5000,now=Date.now}={}){
 const remaining=deadline-now();
 if(remaining<=0)fail(503,'P14_DEADLINE');
 const raw=await acquire(pool,remaining);
 let dead=false,commitStarted=false,active=false,timer,rejectTimeout;
 const timeout=new Promise((_,reject)=>{rejectTimeout=reject;});
 const die=()=>{if(!dead){dead=true;raw.destroy();}};
 timer=setTimeout(()=>{die();rejectTimeout(new P14Error(503,'P14_DEADLINE'));},Math.max(1,deadline-now()));
 const call=async(method,...args)=>{
  if(dead)fail(503,'P14_DEADLINE');
  return Promise.race([raw[method](...args),timeout]);
 };
 const c={execute:(...a)=>call('execute',...a),query:(...a)=>call('query',...a)};
 try{
  await c.query("SET time_zone='+00:00'");
  await c.query('SET SESSION innodb_lock_wait_timeout=2');
  await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
  await call('beginTransaction');active=true;
  const result=await work(c);
  commitStarted=true;
  await call('commit');active=false;
  return result;
 }catch(e){
  if(commitStarted||dead||transport.has(e.code)){die();throw unknown();}
  if(active){
   try{await call('rollback');active=false;}
   catch{die();throw new P14Error(503,'ROLLBACK_UNCONFIRMED');}
  }
  throw e;
 }finally{
  clearTimeout(timer);
  if(!dead)raw.release();
 }
}
export function createDocumentWriter({pool,activation={enabled:false},repositoryFactory=createPostingRepository,
 hook=async()=>{},sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now,uuid=randomUUID}={}){
 function gate(){
  // No production mode in A1; no env var can enable this module.
  if(!activation.enabled||!(activation.mode==='ISOLATED_MOCK'&&pool?.p14Kind==='isolated-mock'||
   activation.mode==='A2_DISPOSABLE'&&isVerifiedDisposablePool(pool)))
   fail(503,'P14_NOT_ACTIVATED');
 }
 return async function post({context:ctx,type,body}){
  gate(); // Before parse, connection acquisition or any DB access.
  if(!ctx||![ctx.org,ctx.userId].every(v=>Number.isInteger(v)&&v>0&&v<=4294967295)||
   typeof ctx.sessionId!=='string'||!ctx.sessionId)fail(401,'AUTH_CONTEXT');
  const d=parseDocument(body,type),eh=hash(envelope(d,type)),deadline=now()+5000;
  const correlationId=uuid(); // Stable across transient retries; server-owned.
  for(let attempt=0;;attempt++){
   try{
    return await transactionAttempt(pool,async c=>{
     const repo=repositoryFactory(c);
     const auth=await repo.lockIdentity(ctx);
     await hook('after-auth-lock',{attempt});
     const guard=await repo.lockBranch(ctx,d.branch_id,auth.user,type);
     await hook('after-guard',{attempt});
     const old=await repo.lookup(ctx.org,type,d.request_key);
     // Check expiration even on replay, using authoritative DB clock under session lock.
     const provisional=await repo.now();
     if(utcInstant(auth.session.expires_at).epochNanoseconds<=utcInstant(provisional).epochNanoseconds)
      fail(401,'SESSION_EXPIRED');
     const prior=replay(old,d,type,body);
     if(prior)return prior;
     const policy=await repo.lockPolicy(ctx,d.branch_id,guard.active_policy_id);
     const guessed=acceptance(provisional);
     const period=await repo.lockPeriod(ctx,d.branch_id,monthRange(guessed.business_date).date_start);
     const products=await repo.lockProducts(ctx,d.items);
     const balances=await repo.lockBalances(ctx,d.branch_id,d.items);
     await hook('after-product-balance-lock',{attempt});
     const meta=acceptance(await repo.now());
     if(monthRange(meta.business_date).date_start!==monthRange(guessed.business_date).date_start)
      throw new P14Error(503,'P14_MONTH_CHANGED');
     assertPeriod(period,meta.business_date);
     if(utcInstant(policy.effective_from_utc).epochNanoseconds>utcInstant(meta.accepted_at_utc).epochNanoseconds)
      fail(503,'POLICY_NOT_EFFECTIVE');
     if(utcInstant(auth.session.expires_at).epochNanoseconds<=utcInstant(meta.accepted_at_utc).epochNanoseconds)
      fail(401,'SESSION_EXPIRED');
     if(d.business_date!==undefined&&d.business_date!==meta.business_date)fail(400,'TODAY_ONLY');
     meta.revision=nextRevision(guard.live_revision);
     const plan=prepareLines(d,type,products,balances);
     const rh=hash({version:'document-resolved-v2',envelope_hash:eh,
      business_date:meta.business_date,timezone:'Asia/Ho_Chi_Minh',
      policy_id:String(policy.id),policy_version:String(policy.policy_version),writer_epoch:EPOCH,
      lines:plan.lines,total:plan.total});
     const result=await repo.persist(ctx,d,type,meta,plan,guard,policy,period,eh,rh,correlationId);
     await hook('before-commit',{attempt});
     return result;
    },{deadline,now});
   }catch(e){
    const retry=transient.has(e.code)||requestIdentityConflict(e);
    if(!retry||attempt>=2||now()>=deadline)throw e;
    await sleep(50+Math.floor(Math.random()*151));
   }
  }
 };
}

