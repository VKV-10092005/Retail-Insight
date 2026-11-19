import './no-network.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {parseMarkedSql,validateSql,sha256} from '../../src/p14/sql-parser.js';
import {buildCandidate,renderCandidate,releaseDigest,runMigration,MemoryCheckpoints,FileCheckpoints} from '../../src/p14/migration.js';
test('strings/comments containing semicolons and fake markers are not split',()=>{
 const src="-- @statement ONE\nSELECT 'a;''b', \"-- @statement FAKE\", 1 /* ; */;\n-- @statement TWO\nSELECT 2;";
 assert.equal(parseMarkedSql(src).length,2);
 const multiline="-- @statement ONE\nSELECT 'line1\n-- @statement FAKE\nline2';";
 assert.equal(parseMarkedSql(multiline).length,1);
});
test('compound trigger keeps BEGIN/IF/CASE bodies as one statement',()=>{
 const sql="CREATE TRIGGER t BEFORE INSERT ON x FOR EACH ROW BEGIN IF NEW.a>0 THEN SET NEW.a=CASE WHEN NEW.a>2 THEN 2 ELSE 1 END; END IF; END;";
 assert.equal(validateSql(sql).kind,'TRIGGER');
});
for(const sql of ["SELECT 1; SELECT 2;","SELECT 'unterminated;","SELECT 1 /* nope;",
 "SELECT 1 /*!50000 UNION SELECT 2 */;","DELIMITER $$","USE retail_app;","DROP TABLE x;",
 "CREATE TRIGGER t BEFORE INSERT ON x FOR EACH ROW BEGIN IF 1 THEN SET NEW.a=1; END;"]){
 test('reject unsafe/unsupported SQL '+sql.slice(0,45),()=>assert.throws(()=>validateSql(sql)));
}
test('review sentinel is allowed only in draft parser and never execution validation',()=>{
 const src='-- @statement REVIEW_ONLY_1\nA0_REVIEW_ONLY_DO_NOT_EXECUTE;\n-- @statement X\nSELECT 1;';
 assert.equal(parseMarkedSql(src,{draft:true})[0].reviewOnly,true);
 assert.throws(()=>parseMarkedSql(src));
});
test('duplicate markers, raw SQL prefix and unbound parameters rejected',()=>{
 assert.throws(()=>parseMarkedSql('-- @statement X\nSELECT 1;\n-- @statement X\nSELECT 2;'));
 assert.throws(()=>parseMarkedSql('SELECT 0;\n-- @statement X\nSELECT 1;'));
 assert.throws(()=>validateSql('UPDATE x SET a=?;'));
});
test('all A0 drafts parse conservatively, candidate stays non-executable and leaves source intact',async()=>{
 const dir=new URL('../../../docs/p1_4_a0_sql/',import.meta.url);
 const names=['00_preflight','10_expand','20_backfill_bootstrap','30_contract','40_write_fences','41_immutability','50_cutover'];
 for(const n of names){
  const raw=await readFile(new URL(n+'.draft.sql',dir),'utf8');
  const parsed=parseMarkedSql(raw,{draft:true,allowTokens:true,allowParameters:true});
  assert.equal(parsed[0].reviewOnly,true);
 }
 const r=await buildCandidate(fileURLToPath(dir)); // fileURLToPath below used on Windows.
 assert.equal(r.state,'CANDIDATE_NOT_EXECUTABLE');assert.equal(r.nativeVerified,false);
 const b={TYPE_CHARSET:'utf8mb4',TYPE_COLLATION:'utf8mb4_0900_ai_ci',KEY_CHARSET:'utf8mb4',KEY_COLLATION:'utf8mb4_0900_ai_ci'};
 const rendered=renderCandidate(r,b);assert.equal(rendered.state,r.state);assert.ok(rendered.steps.every(s=>!s.sql.includes('{{')));
 assert.throws(()=>renderCandidate(r,{...b,KEY_COLLATION:'x; DROP TABLE y'}));
});
function fixture(){
 const step={id:'ONE',phase:'expand',sql:'CREATE TABLE fixture(id INT);',manual:false,dependsOn:[],
  beforeFingerprint:'before',afterFingerprint:'after',tables:['fixture']};
 step.sha256=sha256(step.sql);
 const release={state:'A2_APPROVED',mysqlExact:'8.4.0',sqlMode:'STRICT_TRANS_TABLES',
  baselineFingerprint:'baseline',rendering:{approved:true},steps:[step]};
 release.digest=releaseDigest(release);
 const permit={stage:'A2_DISPOSABLE',allowNativeWrites:true,approvalRef:'MOCK-A2',
  schemas:['retail_p14_test_mock'],serverUuid:'mock-uuid',releaseDigest:release.digest};
 let current='before',exec=0,unlock=0,locked=false;
 const adapter={
  async verify(){return {database:'retail_p14_test_mock',server_uuid:'mock-uuid',version:'8.4.0',sql_mode:'STRICT_TRANS_TABLES'};},
  async baseline(){return 'baseline';},
  async lock(){locked=true;},async assertLock(){assert.ok(locked);},
  async unlock(){unlock++;locked=false;},async inspect(){return current;},
  async execute(){exec++;current='after';}
 };
 return {release,permit,adapter,checkpoints:new MemoryCheckpoints(),phase:'expand',
  current:s=>current=s,count:()=>({exec,unlock})};
}
test('unapproved candidate refuses before adapter/DB access',async()=>{
 const f=fixture();f.release.state='CANDIDATE_NOT_EXECUTABLE';
 f.adapter.verify=async()=>{throw Error('Must not connect');};
 await assert.rejects(runMigration(f),/disabled/);assert.equal(f.count().exec,0);
});
test('one verified step, resume skips without rerunning SQL',async()=>{
 const f=fixture();await runMigration(f);await runMigration(f);
 assert.equal(f.count().exec,1);assert.equal((await f.checkpoints.get('ONE')).status,'VERIFIED');
});
test('crash after DDL before checkpoint recovers from exact postcondition',async()=>{
 const f=fixture();let once=true;
 const put=f.checkpoints.put.bind(f.checkpoints);
 f.checkpoints.put=async(id,row)=>{if(row.status==='VERIFIED'&&once){once=false;throw Error('checkpoint crash');}return put(id,row);};
 await assert.rejects(runMigration(f),/UNKNOWN/);
 await runMigration(f);assert.equal(f.count().exec,1);assert.equal((await f.checkpoints.get('ONE')).recovered,true);
});
test('schema drift goes UNKNOWN and never executes',async()=>{
 const f=fixture();f.current('unrecognized');await assert.rejects(runMigration(f),/Schema drift/);
 assert.equal(f.count().exec,0);assert.equal((await f.checkpoints.get('ONE')).status,'UNKNOWN');
});
test('edited SQL after manifest digest or verified checkpoint is rejected',async()=>{
 const f=fixture();f.release.steps[0].sql='SELECT 1;';await assert.rejects(runMigration(f),/disabled/);
 const g=fixture();await runMigration(g);
 await g.checkpoints.put('ONE',{status:'VERIFIED',binding:'foreign-target',sha256:g.release.steps[0].sha256});
 await assert.rejects(runMigration(g),/Checkpoint checksum/);
});
test('lock loss and foreign database identity fail closed',async()=>{
 const f=fixture();f.adapter.assertLock=async()=>{throw Error('lock lost');};
 await assert.rejects(runMigration(f),/lock lost/);assert.equal(f.count().exec,0);
 const g=fixture();g.adapter.verify=async()=>({database:'retail_app',server_uuid:'mock-uuid'});
 await assert.rejects(runMigration(g));assert.equal(g.count().exec,0);
});
test('durable local checkpoint survives a new instance without accessing MySQL',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'p14-a1-checkpoint-'));
 try{
  const first=new FileCheckpoints(dir,'run-1');await first.put('ONE',{status:'RUNNING',sha256:'fixed'});
  assert.equal((await new FileCheckpoints(dir,'run-1').get('ONE')).status,'RUNNING');
  await first.put('ONE',{status:'VERIFIED',sha256:'fixed'});
  assert.equal((await new FileCheckpoints(dir,'run-1').get('ONE')).status,'VERIFIED');
 }finally{
  const target=path.resolve(dir);
  assert.equal(path.dirname(target),path.resolve(tmpdir()));
  assert.ok(path.basename(target).startsWith('p14-a1-checkpoint-'));
  await rm(target,{recursive:true,force:true});
 }
});

test('runner independently rejects retail_app even if a mistaken allowlist contains it',async()=>{
 const f=fixture();f.permit.schemas=['retail_app'];
 f.adapter.verify=async()=>({database:'retail_app',server_uuid:'mock-uuid',version:'8.4.0',sql_mode:'STRICT_TRANS_TABLES'});
 await assert.rejects(runMigration(f));assert.equal(f.count().exec,0);
});
test('runner verifies baseline versions before any DDL',async()=>{
 const f=fixture();f.adapter.baseline=async()=> 'foreign-baseline';
 await assert.rejects(runMigration(f),/Baseline/);assert.equal(f.count().exec,0);
});

