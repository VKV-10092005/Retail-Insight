import '../no-network.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,OTHER,delay} from './fixtures.js';
import {openDisposable,createDisposableWriterPool,isVerifiedDisposablePool} from '../../../src/p14/rc2/disposable.js';
import {principalPolicy,parseGrants,assertEffectiveGrants} from '../../../src/p14/rc2/grants.js';
import {transactionAttempt} from '../../../src/p14/rc2/writer.js';

const open=f=>openDisposable({...f,connect:async()=>f.raw});
test('default authorization refuses before connector/factory',async()=>{
 let called=0;await assert.rejects(openDisposable({config:{},permit:{},connect(){called++;}}));assert.equal(called,0);
 const f=fixture();f.permit.allowNativeWrites=false;
 assert.throws(()=>createDisposableWriterPool({...f,createPool(){called++;}}));assert.equal(called,0);
});
test('raw trace: verification precedes SET SESSION RC, SET is immediately followed by BEGIN',async()=>{
 const f=fixture(),c=await open(f);f.raw.events=[];
 await c.beginReadCommitted();
 const at=f.raw.events.indexOf('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
 assert.ok(at>0);assert.equal(f.raw.events[at+1],'BEGIN');
 assert.equal(f.raw.isolation,'READ-COMMITTED'); // Simulated state only, not native observation.
 await c.rollback();c.release();
});
test('transactionAttempt integrates verified wrapper without SET TRANSACTION next-value queries',async()=>{
 const f=fixture(),c=await open(f);
 const pool={getConnection:async()=>c};
 assert.equal(await transactionAttempt(pool,async q=>{await q.execute('MOCK BUSINESS');return 42;}),42);
 assert.ok(!f.raw.events.includes('SET TRANSACTION ISOLATION LEVEL READ COMMITTED'));
 const at=f.raw.events.indexOf('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
 assert.equal(f.raw.events[at+1],'BEGIN');
});
test('permit/config deep snapshot cannot be changed by caller after opening',async()=>{
 const f=fixture(),c=await open(f);
 f.permit.schemas[0]='retail_app';f.config.database='retail_app';f.permit.principal.account='root@localhost';
 await c.verify();c.release();assert.ok(!f.raw.events.some(s=>s.includes('USE retail_app')));
});
for(const field of ['current_user','connection_user','server_uuid','version','version_comment','collation_database',
 'collation_connection','character_set_server','lower_case_table_names','sql_mode','current_role']){
 test('observed mismatch '+field+' stops before business SQL',async()=>{
  const f=fixture(),c=await open(f);f.raw.observed[field]=field==='server_uuid'?OTHER:'unapproved';
  await assert.rejects(c.execute('MUST_NOT_RUN'));assert.equal(f.raw.dead,true);assert.ok(!f.raw.events.includes('MUST_NOT_RUN'));
 });
}
test('same username with wrong CURRENT_USER host is rejected',async()=>{
 const f=fixture();f.raw.observed.current_user=f.config.user+'@%';await assert.rejects(open(f));
});
test('table engine, inventory, ENUM order and column collation drift denied',async()=>{
 for(const mutate of [f=>f.raw.tables[0].ENGINE='MyISAM',f=>f.raw.tables=[],
  f=>f.raw.columns[0].COLLATION_NAME='utf8mb4_bin',f=>f.raw.columns[1].COLUMN_TYPE="enum('SALE','RECEIPT')"]){
  const f=fixture();mutate(f);await assert.rejects(open(f));assert.equal(f.raw.dead,true);
 }
});
test('least privilege table/column policies cover five distinct principals',()=>{
 const schema='retail_p14_test_rc2_mock';
 for(const role of ['backend','migrator','control','seed','observer']){
  const f=fixture(role);
  assert.doesNotThrow(()=>assertEffectiveGrants(f.raw.grants,f.permit.principal,schema));
  assert.throws(()=>assertEffectiveGrants(f.raw.grants.slice(1),f.permit.principal,schema));
 }
 const f=fixture();
 for(const extra of [
  "GRANT SELECT ON `retail_app`.* TO `p14_test_backend`@`127.0.0.1`",
  "GRANT UPDATE ON `retail_p14_test_rc2_mock`.`stock_documents` TO `p14_test_backend`@`127.0.0.1`",
  "GRANT CREATE ON `retail_p14_test_rc2_mock`.* TO `p14_test_backend`@`127.0.0.1`",
  "GRANT `admin`@`%` TO `p14_test_backend`@`127.0.0.1`",
  f.raw.grants[0]+' WITH GRANT OPTION'])
  assert.throws(()=>assertEffectiveGrants([...f.raw.grants,extra],f.permit.principal,schema));
});
test('column sets with commas parse without splitting privilege clauses',()=>{
 const f=fixture('control'),parsed=parseGrants(f.raw.grants,f.permit.principal.account);
 assert.deepEqual(parsed.find(r=>r.table==='business_periods'&&r.privilege==='UPDATE').columns,
  ['changed_at_utc','changed_by','live_state','version']);
});
test('timeout during verify prevents late raw continuation even if fake driver resolves after destroy',async()=>{
 const f=fixture(),c=await open(f);let resolve,entered;
 const started=new Promise(r=>entered=r);const wait=new Promise(r=>resolve=r);
 f.raw.events=[];f.raw.hold=async s=>{if(s.startsWith('SELECT DATABASE')){entered();await wait;}};
 c.setDeadline(Date.now()+20);
 const operation=c.execute('MUST_NOT_RUN_AFTER_TIMEOUT');
 await started;await assert.rejects(operation);const count=f.raw.events.length;
 resolve();await delay(5);
 assert.equal(f.raw.events.length,count);assert.equal(f.raw.dead,true);
});
test('concurrent use destroys connection, no dirty release',async()=>{
 const f=fixture(),c=await open(f);let resolve,entered;
 const started=new Promise(r=>entered=r);const wait=new Promise(r=>resolve=r);
 f.raw.hold=async s=>{if(s.startsWith('SELECT DATABASE')){entered();await wait;}};
 const first=c.verify();await started;
 await assert.rejects(c.execute('NOT_RUN'),e=>e.code==='CONCURRENT_CONNECTION_USE');
 resolve();await assert.rejects(first);c.release();
 assert.ok(!f.raw.events.includes('RELEASE'));assert.ok(!f.raw.events.includes('NOT_RUN'));
});
test('active transaction release destroys rather than returning to pool',async()=>{
 const f=fixture(),c=await open(f);await c.beginReadCommitted();c.release();
 assert.equal(f.raw.dead,true);assert.ok(!f.raw.events.includes('RELEASE'));
});
test('pool snapshots configuration before any connection, cannot be forged',async()=>{
 const f=fixture();let options;
 const pool=createDisposableWriterPool({...f,createPool:o=>(options=o,{getConnection:async()=>f.raw,end:async()=>{}})});
 f.config.host='1.2.3.4';f.permit.serverUuid=OTHER;
 const c=await pool.getConnection();c.release();
 assert.equal(options.host,'127.0.0.1');assert.ok(isVerifiedDisposablePool(pool));
 await pool.end();assert.equal(isVerifiedDisposablePool(pool),false);
 assert.equal(isVerifiedDisposablePool({p14Kind:'a2-disposable'}),false);
});

test('backend grants include missing-balance INSERT but forbid economic UPDATE/DELETE',()=>{
 const {config,permit}=fixture();
 const rules=principalPolicy('backend',config.database);
 assert.ok(rules.some(r=>r.table==='inventory_balances'&&r.privilege==='INSERT'));
 assert.ok(!rules.some(r=>['stock_documents','stock_document_items','inventory_movements'].includes(r.table)&&['UPDATE','DELETE'].includes(r.privilege)));
});

