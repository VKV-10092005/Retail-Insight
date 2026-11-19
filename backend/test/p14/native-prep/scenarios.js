import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {performance} from 'node:perf_hooks';
import {requireAction} from './authority.js';
import {digest} from '../../../src/p14/rc2/contracts.js';
import {launchPlan} from '../../../src/p14/rc2/launcher.js';
import {orderedHttpRace,assertHttpCase} from './scripts.js';
export function scenarioIntents(fixture,{caseId='case',kind='STOCK',branch=1101,product=110001}={}){
 const cashier=fixture.actors.find(a=>a.org===11&&a.role==='CASHIER');
 const inventory=fixture.actors.find(a=>a.org===11&&a.role==='INVENTORY');
 const body=(suffix,type='SALE')=>({branch_id:branch,request_key:'prep-'+digest(caseId).slice(0,20)+'-'+suffix,
  items:[{product_id:product,quantity:1,...(type==='RECEIPT'?{unit_price:5}:{})}]});
 if(kind==='STOCK')return [{actor:cashier,type:'SALE',body:body('A')},{actor:cashier,type:'SALE',body:body('B')}];
 if(kind==='IDEMPOTENCY'){const b=body('same');return ['A','B'].map(()=>({actor:cashier,type:'SALE',body:structuredClone(b)}));}
 if(kind==='MIXED')return [{actor:cashier,type:'SALE',body:body('sale')},{actor:inventory,type:'RECEIPT',body:body('receipt','RECEIPT')}];
 if(kind==='TENANT')return ['A','B'].map(()=>({actor:cashier,type:'SALE',body:{...body('forbidden'),branch_id:1201}}));
 throw Error('SCENARIO_KIND');
}
export function httpClient({cap,plan,fetchImpl}){
 const a=requireAction(cap,'NATIVE_CASES'),p=launchPlan(plan);
 if(a.planDigest!==digest(p)||typeof fetchImpl!=='function')throw Error('HTTP_PLAN_NOT_APPROVED');
 return async(participant,intent)=>{
  requireAction(cap,'NATIVE_CASES');
  const w=p.workers[participant==='A'?0:participant==='B'?1:-1];if(!w)throw Error('HTTP_PARTICIPANT');
  if(!p.auth.allowedOrganizations.includes(intent.actor.org)||!['SALE','RECEIPT'].includes(intent.type))throw Error('HTTP_SCOPE');
  const token=jwt.sign({org:intent.actor.org,sid:intent.actor.sessionId},p.auth.secret,
   {algorithm:'HS256',subject:String(intent.actor.userId),issuer:'p14-disposable-test',audience:'p14-disposable-backend',expiresIn:'5m'});
  const start=performance.now();
  const response=await fetchImpl('http://'+w.host+':'+w.port+'/api/v1/'+(intent.type==='SALE'?'sales':'receipts'),{
   method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(intent.body),
   redirect:'error',signal:AbortSignal.timeout(6500)});
  return {status:response.status,body:await response.json(),latencyMs:performance.now()-start};
 };
}
export async function runHttpScenario({cap,pair,request,intents,kind,observeBlocked,first='A'}){
 requireAction(cap,'NATIVE_CASES');
 const second=first==='A'?'B':'A';
 if(kind==='TENANT'){const r=await Promise.all(['A','B'].map((p,i)=>request(p,intents[i])));assertHttpCase(kind,r);return r;}
 const r=await orderedHttpRace({cap,pair,first,second,request:p=>request(p,intents[p==='A'?0:1]),observeBlocked});
 if(kind!=='MIXED')assertHttpCase(kind,r);
 else assert.ok(r.every(x=>[200,201,409].includes(x.status)));
 return r; // Economic observer oracle is mandatory independently of HTTP outcomes.
}
export async function assertLegacyReplay({cap,request,fixture}){
 requireAction(cap,'NATIVE_CASES');
 const actor=fixture.actors.find(a=>a.org===11&&a.role==='INVENTORY');
 for(const [i,legacy] of fixture.legacyRequests.entries()){
  const response=await request(i%2?'B':'A',{actor,type:legacy.type,body:legacy.body});
  assert.equal(response.status,200);assert.equal(String(response.body.id),legacy.expectedId);
 }
}
export function summarize(outcomes,{offered,elapsedMs}){
 if(!Number.isFinite(elapsedMs)||elapsedMs<=0||offered<outcomes.length)throw Error('METRIC_BOUNDS');
 const lat=outcomes.map(o=>o.latencyMs).sort((a,b)=>a-b),p=q=>lat.length?lat[Math.min(lat.length-1,Math.ceil(q*lat.length)-1)]:null;
 const counts={};for(const o of outcomes)counts[o.status]=(counts[o.status]??0)+1;
 return {offered,completed:outcomes.length,acceptedNew:counts[201]??0,replayed:counts[200]??0,counts,
  offeredRps:offered*1000/elapsedMs,completedRps:outcomes.length*1000/elapsedMs,
  acceptedNewRps:(counts[201]??0)*1000/elapsedMs,p50:p(.5),p95:p(.95),p99:p(.99)};
}
export function workload(fixture,{users,mode='HOT_BRANCH',count=100}){
 if(![100,500,1000].includes(users)||!['HOT_BRANCH','MULTI_BRANCH'].includes(mode)||count<1||count>100000)throw Error('LOAD_PLAN');
 return Array.from({length:count},(_,i)=>{
  const scope=mode==='HOT_BRANCH'?fixture.scope[0]:fixture.scope[i%fixture.scope.length],type=i%3?'SALE':'RECEIPT';
  const actor=fixture.actors.find(a=>a.org===scope.org&&a.role===(type==='SALE'?'CASHIER':'INVENTORY'));
  return {user:i%users,participant:i%2?'B':'A',actor,type,body:{branch_id:scope.branch,
   request_key:'load-'+digest(fixture.seed+':'+mode+':'+users).slice(0,16)+'-'+i,
   items:[{product_id:scope.org*10000+1+(i%fixture.rows.products.filter(p=>p.organization_id===scope.org).length),
    quantity:1,...(type==='RECEIPT'?{unit_price:5}:{})}]}};
 });
}

export async function runControlRace({cap,coordinator,control,request,observeBlocked,controlWins,stage}){
 requireAction(cap,'NATIVE_CASES');
 const first=controlWins?control:request,second=controlWins?request:control;
 const winner=first();winner.catch(()=>{});
 const key=await coordinator.waitFor(controlWins?'control':'A',stage);
 const loser=second();loser.catch(()=>{});
 try{
  await observeBlocked();coordinator.release(key);
  const [a,b]=await Promise.all([winner,loser]);
  const response=controlWins?b:a;
  assert.ok(controlWins?[401,403,409].includes(response.status):[200,201].includes(response.status));
  return {controlResult:controlWins?a:b,response};
 }catch(e){coordinator.abort();throw e;}
}
