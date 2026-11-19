import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
for(const database of ['retail_management','retail_datawarehouse','retail_app_other','']) {
 test(`refuses database ${database||'(missing)'}`,()=>{
  const result=spawnSync(process.execPath,['--input-type=module','-e',"import './src/config/env.js'"],{env:{...process.env,MYSQL_DATABASE:database,JWT_SECRET:'test-only-secret-with-at-least-32-bytes'},encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/Only retail_app/);
 });
}
test('refuses short JWT secret',()=>{
 const result=spawnSync(process.execPath,['--input-type=module','-e',"import './src/config/env.js'"],{env:{...process.env,MYSQL_DATABASE:'retail_app',JWT_SECRET:'short'},encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/JWT_SECRET/);
});
