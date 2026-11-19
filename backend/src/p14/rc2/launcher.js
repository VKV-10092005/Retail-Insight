import express from 'express';
import jwt from 'jsonwebtoken';
import {fileURLToPath} from 'node:url';
import {immutable,reject,assertTarget,verifyAttestation,digest} from './contracts.js';
import {createP14LedgerRouter} from './router.js';
import {createDisposableWriterPool} from './disposable.js';
import {createP14Lifecycle} from '../lifecycle.js';

export function createTestAuthenticator({secret,allowedOrganizations,now=()=>Math.floor(Date.now()/1000)}={}){
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32||!allowedOrganizations?.length)reject('TEST_AUTH_CONFIG');
 const orgs=Object.freeze([...allowedOrganizations]);
 return (req,res,next)=>{
  try{
   const token=/^Bearer (\S+)$/.exec(req.headers.authorization??'')?.[1];
   if(!token)throw Error('missing');
   const claims=jwt.verify(token,secret,{algorithms:['HS256'],issuer:'p14-disposable-test',
    audience:'p14-disposable-backend',maxAge:'15m',clockTimestamp:now()});
   const userId=Number(claims.sub),org=Number(claims.org);
   if(!Number.isSafeInteger(userId)||userId<1||userId>4294967295||
    !Number.isSafeInteger(org)||!orgs.includes(org)||typeof claims.sid!=='string'||!claims.sid||
    claims.sid.length>36)throw Error('claims');
   // A role claim is ignored. Writer rechecks DB user/session/assignment under locks.
   req.user={id:userId,organization_id:org};req.organizationId=org;req.sessionId=claims.sid;next();
  }catch{return res.status(401).json({code:'TEST_AUTH_REJECTED'});}
 };
}
export function createTestApp({pool,activation={enabled:false},auth,instance='mock',readinessProbe,hook}){
 const app=express();
 app.disable('x-powered-by');app.use(express.json({limit:'100kb'}));
 const authenticate=createTestAuthenticator(auth);
 const tenantScope=(req,res,next)=>{
  const supplied=[req.headers['x-organization-id'],req.query.organization_id,req.body?.organization_id].filter(x=>x!==undefined);
  if(supplied.some(v=>String(v)!==String(req.organizationId)))return res.status(403).json({code:'TENANT_FORBIDDEN'});
  next();
 };
 const lifecycle=createP14Lifecycle({enabled:activation.enabled===true&&typeof readinessProbe==='function',probe:readinessProbe});
 app.p14Lifecycle=lifecycle;
 app.use('/api/v1',(req,res,next)=>{
  try{const done=lifecycle.enter();res.once('finish',done);res.once('close',done);next();}
  catch{return res.status(503).json({code:'TEST_ADMISSION_CLOSED'});}
 });
 app.use('/api/v1',createP14LedgerRouter({pool,activation,authenticate,tenantScope,hook}));
 app.get('/health/live',(req,res)=>res.json({instance,status:'alive'}));
 app.get('/health/ready',async(req,res)=>{const r=await lifecycle.readiness();res.status(r.ready?200:503).json(r);});
 app.use((e,req,res,next)=>res.status(e.status??(e.name==='ZodError'?400:500)).json({code:e.code??'TEST_REQUEST_REJECTED'}));
 return app; // No listen, pool acquisition, dotenv, runtime app, health SQL or startup.
}
function workerBinding(w,permit){
 if(!w||w.host!=='127.0.0.1'||!Number.isInteger(w.port)||w.port<1024||w.port>65535||
  w.config?.host!==permit.host||w.config?.port!==permit.port||w.config?.database!==permit.schemas?.[0]||
  w.permit?.principal?.role!=='backend'||w.permit.serverUuid!==permit.serverUuid||
  w.permit.principal.account.split('@')[0]!==w.config.user)reject('WORKER_BINDING');
 assertTarget(w.permit,{database:w.config.database,server_uuid:permit.serverUuid},'LAUNCH_BACKEND');
}
export function launchPlan({permit,workers,auth}={}){
 if(!permit||permit.stage!=='A2_1_DISPOSABLE'||!permit.actions?.includes('LAUNCH_BACKEND')||
  !permit.approvalRef||!Array.isArray(workers)||workers.length!==2)reject('LAUNCH_NOT_AUTHORIZED');
 const captured=immutable({permit,workers,auth});
 if(new Set(workers.map(w=>w.port)).size!==2||new Set(workers.map(w=>w.instance)).size!==2)reject('WORKERS_NOT_INDEPENDENT');
 for(const w of captured.workers)workerBinding(w,permit);
 createTestAuthenticator(auth);
 if(new Set(captured.workers.map(w=>w.config.user)).size!==2)reject('WORKER_ACCOUNTS_NOT_DISTINCT');
 return captured;
}
export async function launchPair(input,{spawn}={}){
 const plan=launchPlan(input); // Authorization before spawn callback/child creation.
 if(typeof spawn!=='function')reject('EXPLICIT_PROCESS_CONTROLLER_REQUIRED');
 const children=[];
 try{
  for(const worker of plan.workers){
   const child=await spawn({
    entry:fileURLToPath(new URL('./worker.js',import.meta.url)),
    args:['--rc2-disposable-worker'],
    env:{NODE_ENV:'test',P14_RC2_WORKER:'1'},
    // Password/JWT secret only in explicit IPC payload, never argv/env/log.
    message:{kind:'RC2_START',worker,auth:plan.auth}
   });
   if(!Number.isSafeInteger(child.pid)||children.some(c=>c.pid===child.pid)){await child.stop?.();reject('WORKER_PID_COLLISION');}
   children.push(child);
  }
  return {children,pids:children.map(c=>c.pid)};
 }catch(e){for(const c of children)await c.stop?.();throw e;}
}
export async function startWorker({worker,auth},{createPool,listen}={}){
 // Exported for future A2.1; not called during A2.0-H or mock/static launcher tests.
 workerBinding(worker,worker.permit);
 createTestAuthenticator(auth);
 if(typeof listen!=='function'||typeof createPool!=='function')reject('WORKER_ADAPTERS_REQUIRED');
 const pool=createDisposableWriterPool({config:worker.config,permit:worker.permit,createPool});
 let server;
 try{
  const connection=await pool.getConnection();
  const identity=await connection.verify();connection.release();
  const app=createTestApp({pool,activation:{enabled:true,mode:'A2_DISPOSABLE'},auth,instance:worker.instance,
   readinessProbe:async()=>{const c=await pool.getConnection();try{const [[row]]=await c.execute('SELECT mode,schema_version,required_writer_epoch,reader_basis FROM business_schema_control WHERE singleton_id=1');return row;}finally{c.release();}}});
  server=await listen(app,worker.port,worker.host);
  return {server,pool,identity,async stop(){await app.p14Lifecycle.drain();await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await pool.end();}};
 }catch(e){await pool.end();throw e;}
}

export function createForkController({permit,plan,attestation}){
 if(!permit?.operatorPublicKey||!permit.actions?.includes('LAUNCH_BACKEND')||
  permit.allowProcessLaunch!==true)reject('NATIVE_LAUNCH_NOT_APPROVED');
 const captured=launchPlan(plan);const planDigest=digest(captured);
 if(digest(permit)!==digest(captured.permit))reject('CONTROLLER_PERMIT_BINDING');
 // Caller must bind the operator-signed plan, not a test metadata flag.
 verifyAttestation(attestation,{publicKey:permit.operatorPublicKey,
  expected:{purpose:'LAUNCH_NATIVE_PAIR',planDigest,releaseDigest:permit.releaseDigest,runId:permit.runId}});
 return async descriptor=>{
  if(descriptor.entry!==fileURLToPath(new URL('./worker.js',import.meta.url))||
   descriptor.args.join(' ')!=='--rc2-disposable-worker'||
   !captured.workers.some(worker=>digest({kind:'RC2_START',worker,auth:captured.auth})===digest(descriptor.message))||
   digest(descriptor.env)!==digest({NODE_ENV:'test',P14_RC2_WORKER:'1'}))reject('WORKER_ENTRY');
  const {fork}=await import('node:child_process');
  const child=fork(descriptor.entry,descriptor.args,{execArgv:[],
   env:{...descriptor.env,...(process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{})},
   stdio:['ignore','ignore','ignore','ipc']});
  return new Promise((resolve,rejectPromise)=>{
   const timer=setTimeout(()=>{child.kill();rejectPromise(Error('RC2 child readiness timeout'));},10000);
   child.once('error',()=>{clearTimeout(timer);child.kill();rejectPromise(Error('RC2 child process failure'));});
   child.once('exit',()=>{clearTimeout(timer);rejectPromise(Error('RC2 child exited before ready'));});
   child.once('message',m=>{
    clearTimeout(timer);
    if(m?.kind!=='READY'||m.pid!==child.pid){child.kill();rejectPromise(Error('RC2 child rejected'));return;}
    resolve({pid:child.pid,stop:()=>child.kill('SIGTERM')});
   });
   child.send(descriptor.message);
  });
 };
}

