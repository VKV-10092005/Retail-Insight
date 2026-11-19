import {EventEmitter} from 'node:events';
import {digest,reject} from '../../../src/p14/rc2/contracts.js';
const stages=new Set(['after-auth-lock','after-guard','after-product-balance-lock','after-header','before-commit','after-commit-before-response',
 'before-begin','after-begin','before-product','after-product','before-balance','after-balance','before-statement','after-statement']);
export class Coordinator extends EventEmitter{
 constructor({runId,caseId,timeoutMs=1500}){
  super();if(!runId||!caseId||timeoutMs<1||timeoutMs>2000)reject('BARRIER_CONFIG');
  this.runId=runId;this.caseId=caseId;this.timeoutMs=timeoutMs;this.waiting=new Map();this.seen=new Set();this.trace=[];this.closed=false;
 }
 hit({participant,stage,attempt=0,sequence}){
  if(this.closed||!['A','B','control'].includes(participant)||!stages.has(stage)||!Number.isInteger(sequence)||!Number.isInteger(attempt)||attempt<0)reject('BARRIER_MESSAGE');
  const key=digest({run:this.runId,case:this.caseId,participant,stage,attempt,sequence});
  if(this.seen.has(key))reject('BARRIER_DUPLICATE');
  this.seen.add(key);
  return new Promise((resolve,rejectPromise)=>{
   const timer=setTimeout(()=>{this.waiting.delete(key);this.trace.push({event:'deadline',key});rejectPromise(Error('BARRIER_DEADLINE'));},this.timeoutMs);
   this.waiting.set(key,{participant,stage,attempt,sequence,resolve,reject:rejectPromise,timer});
   this.trace.push({event:'hit',participant,stage,attempt,sequence,key});this.emit('hit',key);
  });
 }
 async waitFor(participant,stage){
  const find=()=>[...this.waiting].find(([,v])=>v.participant===participant&&v.stage===stage)?.[0];
  if(find())return find();if(this.closed)reject('BARRIER_CLOSED');
  return new Promise((resolve,rejectPromise)=>{
   const cleanup=()=>{clearTimeout(timer);this.off('hit',check);this.off('closed',cancel);};
   const check=()=>{const key=find();if(key){cleanup();resolve(key);}};
   const cancel=()=>{cleanup();rejectPromise(Error('BARRIER_CLOSED'));};
   const timer=setTimeout(()=>{cleanup();rejectPromise(Error('BARRIER_WAIT_DEADLINE'));},this.timeoutMs);
   this.on('hit',check);this.once('closed',cancel);check();
  });
 }
 release(key){
  const p=this.waiting.get(key);if(!p)reject('BARRIER_NOT_WAITING');
  clearTimeout(p.timer);this.waiting.delete(key);this.trace.push({event:'release',key});p.resolve();
 }
 abort(){
  this.closed=true;for(const [key,p] of this.waiting){clearTimeout(p.timer);p.reject(Error('BARRIER_ABORTED'));this.trace.push({event:'abort',key});}
  this.waiting.clear();this.emit('closed');
 }
}
export function ipcHook({send,subscribe,runId,caseId,participant,heldStages,timeoutMs=1800}){
 let sequence=0;
 return async(stage,{attempt=0}={})=>{
  if(!heldStages.includes(stage))return;
  const seq=++sequence;
  await new Promise((resolve,rejectPromise)=>{
   const unsubscribe=subscribe(m=>{if(m.kind==='PREP_RELEASE'&&m.runId===runId&&m.caseId===caseId&&m.sequence===seq){
    clearTimeout(timer);unsubscribe();m.ok?resolve():rejectPromise(Error('IPC_BARRIER_ABORTED'));
   }});
   const timer=setTimeout(()=>{unsubscribe();rejectPromise(Error('IPC_BARRIER_DEADLINE'));},timeoutMs);
   send({kind:'PREP_HIT',runId,caseId,participant,stage,attempt,sequence:seq});
  });
 };
}
export function attachParticipant(coordinator,child,participant){
 const onMessage=m=>{
  if(m.kind!=='PREP_HIT')return;
  if(m.runId!==coordinator.runId||m.caseId!==coordinator.caseId||m.participant!==participant){coordinator.abort();return;}
  let p;try{p=coordinator.hit(m);}catch{coordinator.abort();return;}
  p.then(()=>child.send({kind:'PREP_RELEASE',runId:m.runId,caseId:m.caseId,sequence:m.sequence,ok:true}),
   ()=>child.send({kind:'PREP_RELEASE',runId:m.runId,caseId:m.caseId,sequence:m.sequence,ok:false}));
 };
 child.on('message',onMessage);return ()=>child.off('message',onMessage);
}
