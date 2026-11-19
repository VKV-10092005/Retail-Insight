import './no-network.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertDisposableConfig,assertObservedIdentity,assertNarrowGrants,openDisposable,createDisposableWriterPool,isVerifiedDisposablePool} from '../../src/p14/disposable.js';
const cfg=()=>({host:'127.0.0.1',port:13316,user:'p14_test_runner',password:'synthetic-only',
 database:'retail_p14_test_run1',credentialSource:'a2-disposable-secret'});
const permit=()=>({stage:'A2_DISPOSABLE',allowNativeWrites:true,approvalRef:'MOCK',runId:'run1',
 schemas:['retail_p14_test_run1'],users:['p14_test_runner'],endpoints:[{host:'127.0.0.1',port:13316}],
 forbiddenServerUuids:['production-server-uuid'],serverUuid:'synthetic-server-uuid',serverPort:3306,version:'8.4.0',sqlMode:'STRICT_TRANS_TABLES',
 isolatedLoopback:true,engines:['InnoDB']});
const observed=()=>({database:'retail_p14_test_run1',server_uuid:'synthetic-server-uuid',server_port:3306,
 version:'8.4.0',account_user:'p14_test_runner',read_only:0,session_timezone:'+00:00',sql_mode:'STRICT_TRANS_TABLES',current_role:'NONE'});
test('A1 has no default native authority and connector is never invoked',async()=>{
 let n=0;await assert.rejects(openDisposable({config:cfg(),connect:()=>{n++;}}));
 assert.equal(n,0);
});
for(const [label,mutate] of [
 ['production schema',c=>c.database='retail_app'],['research schema',c=>c.database='retail_management'],
 ['warehouse',c=>c.database='retail_datawarehouse'],['root',c=>c.user='root'],
 ['runtime credential source',c=>c.credentialSource='runtime-env'],
 ['hostname/DNS alias',c=>c.host='localhost'],['unapproved port',c=>c.port=3306],
 ['non-allowlisted schema',c=>c.database='retail_p14_test_other']]){
 test('config gate refuses '+label,()=>{const c=cfg();mutate(c);assert.throws(()=>assertDisposableConfig(c,permit()));});
}
test('driver options are dedicated: UTC/string DATE/BIGINT/no multipleStatements',()=>{
 const o=assertDisposableConfig(cfg(),permit());
 assert.equal(o.multipleStatements,false);assert.equal(o.bigNumberStrings,true);assert.equal(o.dateStrings,true);
 assert.equal(o.timezone,'Z');assert.equal(o.database,'retail_p14_test_run1');
});
for(const field of ['database','server_uuid','server_port','version','account_user','read_only','sql_mode','current_role']){
 test('observed identity mismatch '+field,()=>{
  const o=observed();o[field]='wrong';assert.throws(()=>assertObservedIdentity(cfg(),permit(),o));
 });
}
test('schema-only grants accepted, global/role/grant-option denied',()=>{
 const good="GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, TRIGGER, REFERENCES ON `retail_p14_test_run1`.* TO `p14_test_runner`@`localhost`";
 assert.doesNotThrow(()=>assertNarrowGrants([good],'retail_p14_test_run1','p14_test_runner'));
 for(const grant of [
  "GRANT ALL PRIVILEGES ON *.* TO `p14_test_runner`@`localhost`",
  "GRANT SELECT ON `retail_app`.* TO `p14_test_runner`@`localhost`",
  "GRANT `admin_role`@`%` TO `p14_test_runner`@`localhost`",
  good+' WITH GRANT OPTION'])
  assert.throws(()=>assertNarrowGrants([grant],'retail_p14_test_run1','p14_test_runner'));
});
test('injected metadata connector proves identity checked before SET/write and before every later operation',async()=>{
 const log=[];let wrong=false,destroyed=false;
 const raw={
  async query(sql){
   log.push(sql);
   if(sql.startsWith('SELECT DATABASE'))return [[wrong?{...observed(),server_uuid:'foreign'}:observed()]];
   if(sql==='SHOW GRANTS')return [[{grant:"GRANT SELECT ON `retail_p14_test_run1`.* TO `p14_test_runner`@`localhost`"}]];
   return [[]];
  },
  async execute(sql){log.push(sql);return [[]];},
  destroy(){destroyed=true;},async end(){}
 };
 const c=await openDisposable({config:cfg(),permit:permit(),connect:async()=>raw});
 assert.ok(log.findIndex(s=>s.startsWith('SELECT DATABASE'))<log.indexOf("SET time_zone='+00:00'"));
 wrong=true;
 await assert.rejects(c.execute('CREATE TABLE never_sent(id INT)'));
 assert.ok(!log.includes('CREATE TABLE never_sent(id INT)'));
 await c.close();assert.equal(destroyed,true);
});

test('writer pool cannot be forged by an ordinary tagged object; no A2 permit means no connector',()=>{
 assert.equal(isVerifiedDisposablePool({p14Kind:'a2-disposable'}),false);
 let called=0;
 assert.throws(()=>createDisposableWriterPool({config:cfg(),createPool(){called++;}}));
 assert.equal(called,0);
});

