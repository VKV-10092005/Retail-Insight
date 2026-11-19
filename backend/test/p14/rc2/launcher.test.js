import '../no-network.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {generateKeyPairSync,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createTestAuthenticator,createTestApp,launchPlan,launchPair,startWorker,createForkController} from '../../../src/p14/rc2/launcher.js';
import {buildCandidate} from '../../../src/p14/rc2/candidate.js';
import {validateRelease,sealRelease,runPhase} from '../../../src/p14/rc2/migration.js';
import {digest,canonical} from '../../../src/p14/rc2/contracts.js';
import {fixture} from './fixtures.js';
const auth={secret:'synthetic-secret-32-bytes-minimum-for-tests',allowedOrganizations:[1]};
function input(){
 const a=fixture(),b=fixture();b.config.user='p14_test_backend2';
 b.permit.principal.account=b.config.user+'@127.0.0.1';b.permit.connectionOrigins=[b.permit.principal.account];
 const workers=[a,b].map((f,i)=>({host:'127.0.0.1',port:13317+i,instance:'test-'+i,config:f.config,permit:f.permit}));
 return {permit:a.permit,workers,auth};
}
function authenticate(claims,options={}){
 const token=jwt.sign(claims,auth.secret,{algorithm:'HS256',issuer:'p14-disposable-test',
  audience:'p14-disposable-backend',expiresIn:'5m',...options});
 const req={headers:{authorization:'Bearer '+token}};let status,next=false;
 createTestAuthenticator(auth)(req,{status(s){status=s;return this;},json(){}},()=>next=true);
 return {req,status,next};
}
test('isolated authenticator validates signature/scope; role claims never authorize',()=>{
 const r=authenticate({sub:'1',org:1,sid:'s1',role:'OWNER'});
 assert.equal(r.next,true);assert.equal(r.req.user.role,undefined);assert.equal(r.req.organizationId,1);
 for(const c of [{sub:'1',org:2,sid:'s1'},{sub:'-1',org:1,sid:'s1'},{sub:'1',org:1,sid:''}]){
  assert.equal(authenticate(c).status,401);
 }
 assert.equal(authenticate({sub:'1',org:1,sid:'s1'},{audience:'runtime'}).status,401);
 assert.throws(()=>createTestAuthenticator({secret:'short',allowedOrganizations:[1]}));
});
test('constructing isolated app never acquires pool or starts listener',async()=>{
 let calls=0;const app=createTestApp({pool:{getConnection(){calls++;throw Error('forbidden');}},auth});
 assert.equal(calls,0);assert.equal((await app.p14Lifecycle.readiness()).ready,false);
});
test('launch defaults denied before spawn, requires two identities/accounts/ports',async()=>{
 let calls=0;await assert.rejects(launchPair({}, {spawn(){calls++;}}));assert.equal(calls,0);
 for(const mutation of [p=>p.workers[1].port=p.workers[0].port,
  p=>p.workers[1].config.user=p.workers[0].config.user,
  p=>p.workers[1].permit.serverUuid='99999999-9999-4999-8999-999999999999',
  p=>p.workers[1].config.database='retail_app']){
  const p=input();mutation(p);assert.throws(()=>launchPlan(p));
 }
});
test('two process descriptors have separate ports/accounts/PIDs; no real fork',async()=>{
 const p=input(),descriptors=[],stops=[];
 const result=await launchPair(p,{spawn:async d=>{descriptors.push(d);return {pid:200+descriptors.length,stop:async()=>stops.push(d)};}});
 assert.deepEqual(result.pids,[201,202]);assert.equal(descriptors.length,2);
 for(const d of descriptors){assert.deepEqual(Object.keys(d.env).sort(),['NODE_ENV','P14_RC2_WORKER']);
  assert.ok(!d.args.join(' ').includes(auth.secret));assert.equal(d.message.kind,'RC2_START');}
 p.workers[0].config.database='retail_app';
 assert.notEqual(descriptors[0].message.worker.config.database,'retail_app');
 assert.ok(Object.isFrozen(descriptors[0].message.worker.config));assert.equal(stops.length,0);
});
test('failed second child and PID collision clean up launched children',async()=>{
 let calls=0,stopped=0;
 await assert.rejects(launchPair(input(),{spawn:async()=>{if(++calls===2)throw Error('second');return {pid:1,stop:async()=>stopped++};}}));
 assert.equal(stopped,1);stopped=0;
 await assert.rejects(launchPair(input(),{spawn:async()=>({pid:1,stop:async()=>stopped++})}));
 assert.equal(stopped,2);
});
test('worker rejects invalid identity before pool or listener adapters',async()=>{
 let calls=0;const p=input();p.workers[0].config.database='retail_app';
 await assert.rejects(startWorker({worker:p.workers[0],auth},{createPool(){calls++;},listen(){calls++;}}));
 assert.equal(calls,0);
});
test('native fork controller requires operator-signed exact plan and descriptor',async()=>{
 assert.throws(()=>createForkController({permit:input().permit,plan:input()}));
 const p=input(),keys=generateKeyPairSync('ed25519');
 p.permit.operatorPublicKey=keys.publicKey.export({format:'pem',type:'spki'});
 p.permit.allowProcessLaunch=true;p.permit.releaseDigest='a'.repeat(64);
 const plan=launchPlan(p),payload={purpose:'LAUNCH_NATIVE_PAIR',planDigest:digest(plan),
  releaseDigest:p.permit.releaseDigest,runId:p.permit.runId,operator:'mock-operator',nonce:'mock',
  evidenceDigest:'b'.repeat(64),issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()};
 const attestation={payload,signature:sign(null,Buffer.from(canonical(payload)),keys.privateKey).toString('base64')};
 const controller=createForkController({permit:p.permit,plan:p,attestation});
 await assert.rejects(controller({entry:'wrong',args:['--rc2-disposable-worker']}));
 const changed=structuredClone(p);changed.workers[0].port++;
 assert.throws(()=>createForkController({permit:p.permit,plan:changed,attestation}));
});
test('RC2 graph includes CT transaction before fences; all native predicates remain unbound',async()=>{
 const r=await buildCandidate();assert.equal(r.state,'CANDIDATE_NOT_EXECUTABLE');assert.equal(r.nativeVerified,false);
 assert.equal(r.phases.length,12);assert.equal(validateRelease(r).steps,57);
 const ct=r.phases.find(p=>p.id==='P07').steps.find(s=>s.sourceStepIds.includes('CT_SCHEMA_VERSION'));
 assert.equal(ct.type,'TX');
 const broken=structuredClone(r);broken.phases.find(p=>p.id==='P07').steps[0].sourceStepIds=[];
 assert.throws(()=>validateRelease(sealRelease(broken)),e=>e.code==='SCHEMA_CONTROL_DEPENDENCY');
 let calls=0;await assert.rejects(runPhase({release:r,permit:{},adapter:{verify(){calls++;}},phaseId:'P00'}));
 assert.equal(calls,0);
 for(const p of r.phases){assert.equal(p.finalPredicate.sha256,null);for(const s of p.steps){
  assert.equal(s.before.sha256,null);assert.equal(s.after.sha256,null);
  for(const q of s.statements)assert.equal(digest(q.sql),q.sha256);
 }}
 const r2=await buildCandidate();assert.equal(r.digest,r2.digest);
});
test('worker and launcher have no runtime/env pool dependency or automatic worker start on import',async()=>{
 const root=new URL('../../../src/p14/rc2/',import.meta.url);
 for(const name of ['launcher.js','worker.js']){
  const source=await readFile(new URL(name,root),'utf8');
  assert.ok(!/from ['"].*(app\.js|server\.js|db\/pool\.js|dotenv)/.test(source));
 }
 await import('../../../src/p14/rc2/worker.js'); // no IPC marker: inert, no MySQL import/call
});

