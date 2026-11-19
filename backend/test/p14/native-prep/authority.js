import {immutable,digest,assertTarget,verifyAttestation,reject} from '../../../src/p14/rc2/contracts.js';
const capabilities=new WeakMap();
export function authorizeExecution({permit,attestation,target,releaseDigest,actions,planDigest=null}={}){
 assertTarget(permit,target,'DB_CONNECT');
 if(!Array.isArray(actions)||!actions.length||!actions.every(a=>permit.actions.includes(a))||
  permit.releaseDigest!==releaseDigest||!Number.isFinite(Date.parse(permit.expiresAt))||Date.parse(permit.expiresAt)<=Date.now())reject('PREP_AUTHORITY');
 verifyAttestation(attestation,{publicKey:permit.operatorPublicKey,
  expected:{purpose:'PREP_NATIVE_EXECUTION',targetDigest:digest(target),releaseDigest,runId:permit.runId,actions,planDigest}});
 const cap=Object.freeze({});capabilities.set(cap,immutable({permit,target,releaseDigest,actions,planDigest}));return cap;
}
export function requireAction(cap,action){
 const a=capabilities.get(cap);
 if(!a||!a.actions.includes(action)||Date.parse(a.permit.expiresAt)<=Date.now())reject('PREP_EXECUTION_DISABLED');
 assertTarget(a.permit,a.target,'DB_CONNECT');return a;
}
export async function withConnection(cap,action,{connect,config,permit},work){
 const a=requireAction(cap,action);
 if(permit.runId!==a.permit.runId||permit.releaseDigest!==a.releaseDigest||permit.serverUuid!==a.target.server_uuid||
  config.database!==a.target.database||config.host!==a.target.host||config.port!==a.target.port)reject('PREP_CHANNEL_BINDING');
 const {openDisposable}=await import('../../../src/p14/rc2/disposable.js');
 const c=await openDisposable({config,permit,connect});
 c.setDeadline(Date.now()+10000);
 try{return await work(c);}finally{c.release();}
}
// No connector, env reader, CLI, automatic authorization or native execution on import.
