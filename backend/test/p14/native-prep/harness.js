import {EventEmitter} from 'node:events';
import {fileURLToPath} from 'node:url';
import {immutable,digest,reject} from '../../../src/p14/rc2/contracts.js';
import {launchPlan,createTestApp} from '../../../src/p14/rc2/launcher.js';
import {createDisposableWriterPool} from '../../../src/p14/rc2/disposable.js';
import {requireAction,authorizeExecution} from './authority.js';
import {Coordinator,attachParticipant,ipcHook} from './coordinator.js';
export async function launchNativePair({cap,plan,spawn,caseId,heldStages=[]}){
 const authority=requireAction(cap,'LAUNCH_BACKEND'),captured=launchPlan(plan);
 if(authority.planDigest!==digest(captured)||captured.permit.runId!==authority.permit.runId||
  captured.permit.releaseDigest!==authority.releaseDigest||typeof spawn!=='function')reject('PREP_PLAN_BINDING');
 const coordinator=new Coordinator({runId:authority.permit.runId,caseId}),children=[],detach=[];
 try{
  for(const [i,worker] of captured.workers.entries()){
   const child=await spawn({worker,auth:captured.auth,caseId,participant:i===0?'A':'B',heldStages});
   if(!Number.isSafeInteger(child.pid)||children.some(c=>c.pid===child.pid)){await child.stop();reject('PREP_PID');}
   children.push(child);detach.push(attachParticipant(coordinator,child,i===0?'A':'B'));
  }
  return {children,coordinator,async stop(){coordinator.abort();detach.forEach(f=>f());const results=await Promise.allSettled(children.map(c=>c.stop()));if(results.some(r=>r.status==='rejected'))throw Error('PREP_STOP_UNCONFIRMED');}};
 }catch(e){coordinator.abort();detach.forEach(f=>f());const results=await Promise.allSettled(children.map(c=>c.stop()));if(results.some(r=>r.status==='rejected'))e.cleanupErrors=['PREP_STOP_UNCONFIRMED'];throw e;}
}
export function nativeSpawner({cap,authority,plan}){
 const a=requireAction(cap,'LAUNCH_BACKEND'),snapshot=launchPlan(plan);
 if(a.planDigest!==digest(snapshot))reject('PREP_PLAN_BINDING');
 return async message=>{
  if(!snapshot.workers.some(w=>digest(w)===digest(message.worker))||digest(message.auth)!==digest(snapshot.auth))reject('PREP_DESCRIPTOR');
  const {fork}=await import('node:child_process');
  const child=fork(fileURLToPath(new URL('./worker.mjs',import.meta.url)),['--prep-native-worker'],{
   execArgv:[],env:{NODE_ENV:'test',P14_PREP_CHILD:'1',...(process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{})},
   stdio:['ignore','ignore','ignore','ipc']});
  return new Promise((resolve,rejectPromise)=>{
   const timer=setTimeout(()=>{child.kill();rejectPromise(Error('PREP_READY_TIMEOUT'));},10000);
   const failed=()=>{clearTimeout(timer);child.kill();rejectPromise(Error('PREP_CHILD_FAILED'));};
   child.once('error',failed);child.once('exit',failed);
   child.once('message',m=>{
    clearTimeout(timer);if(m.kind!=='PREP_READY'||m.pid!==child.pid){failed();return;}
    child.off('error',failed);child.off('exit',failed);
    resolve({pid:child.pid,connectionId:m.connectionId,on:child.on.bind(child),off:child.off.bind(child),send:child.send.bind(child),
     stop:()=>new Promise((resolveStop,rejectStop)=>{
      if(child.exitCode!==null){resolveStop();return;}
      const t=setTimeout(()=>{child.kill();rejectStop(Error('PREP_STOP_TIMEOUT'));},6000);
      child.once('exit',()=>{clearTimeout(t);resolveStop();});child.send({kind:'PREP_STOP'});
     })});
   });
   child.send({kind:'PREP_START',authority,plan:snapshot,...message});
  });
 };
}
export async function serveNativeWorker(message,{createPool,listen,send,subscribe}){
 const cap=authorizeExecution(message.authority);requireAction(cap,'LAUNCH_BACKEND');
 const approved=message.authority,worker=message.worker;
 if(approved.planDigest!==digest(launchPlan(message.plan??message.authority.plan)))reject('PREP_CHILD_PLAN');
 const plan=launchPlan(message.plan??message.authority.plan);
 if(!plan.workers.some(w=>digest(w)===digest(worker))||digest(message.auth)!==digest(plan.auth)||
  message.participant!==(digest(worker)===digest(plan.workers[0])?'A':'B'))reject('PREP_CHILD_DESCRIPTOR');
 const hook=ipcHook({send,subscribe,runId:approved.permit.runId,caseId:message.caseId,
  participant:message.participant,heldStages:message.heldStages});
 const pool=createDisposableWriterPool({config:worker.config,permit:worker.permit,createPool});
 let server;
 try{
  const c=await pool.getConnection();let connectionId;
  try{const [[r]]=await c.query('SELECT CONNECTION_ID() AS id');connectionId=Number(r.id);}finally{c.release();}
  const app=createTestApp({pool,auth:message.auth,instance:worker.instance,activation:{enabled:true,mode:'A2_DISPOSABLE'},hook,
   readinessProbe:async()=>{const c=await pool.getConnection();try{const [[r]]=await c.query('SELECT * FROM business_schema_control WHERE singleton_id=1');return r;}finally{c.release();}}});
  server=await listen(app,worker.port,worker.host);
  return {connectionId,async stop(){await app.p14Lifecycle.drain({timeoutMs:3000});await new Promise((r,j)=>server.close(e=>e?j(e):r()));await pool.end();}};
 }catch(e){await pool.end();throw e;}
}
