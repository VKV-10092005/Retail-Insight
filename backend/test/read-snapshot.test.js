import test from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{MYSQL_DATABASE:'retail_app',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'1',MYSQL_USER:'isolated-test',MYSQL_PASSWORD:'isolated-test',JWT_SECRET:'isolated-test-secret-at-least-32-bytes',NODE_ENV:'test'});
const {pool}=await import('../src/db/pool.js');
const {readSnapshot}=await import('../src/business/common.js');
pool.query=pool.execute=async()=>{throw Error('MySQL access forbidden');};
test.after(()=>pool.end());
for(const mode of ['success','callback failure','begin failure','commit failure'])test('read-only snapshot: '+mode,async()=>{
 const events=[];const error=Error(mode);
 const connection={
  query:async sql=>{events.push(sql);if(mode==='begin failure'&&sql==='START TRANSACTION READ ONLY')throw error;},
  execute:async sql=>{assert.match(sql,/^SELECT/);events.push('SELECT');return [[{total:1}]];},
  commit:async()=>{events.push('COMMIT');if(mode==='commit failure')throw error;},
  rollback:async()=>events.push('ROLLBACK'),release:()=>events.push('RELEASE')
 };
 pool.getConnection=async()=>connection;
 const operation=()=>readSnapshot(async c=>{if(mode==='callback failure')throw error;return (await c.execute('SELECT COUNT(*) total FROM fixture'))[0][0].total;});
 if(mode==='success')assert.equal(await operation(),1);else await assert.rejects(operation,error);
 assert.deepEqual(events.slice(0,2),['SET TRANSACTION ISOLATION LEVEL REPEATABLE READ','START TRANSACTION READ ONLY']);
 assert.equal(events.at(-1),'RELEASE');
 assert.equal(events.includes('ROLLBACK'),['callback failure','commit failure'].includes(mode));
});
