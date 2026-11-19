import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

function collectTests(directory) {
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const target=path.join(directory,entry.name);
    if(entry.isDirectory())return collectTests(target);
    return entry.isFile()&&entry.name.endsWith('.test.js')?[target]:[];
  });
}

function run(label,args,env=process.env) {
  console.log(`\n=== ${label} ===`);
  const result=spawnSync(process.execPath,args,{cwd:process.cwd(),env,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}

const databaseTestEnv={...process.env,RUN_DB_TESTS:'1'};
run('Node test suites (sequential)',[
  '--test','--test-concurrency=1',...collectTests(path.resolve('test'))
],databaseTestEnv);

for(const script of [
  'scripts/test-ai-security.js',
  'scripts/test-advanced-security.js'
])run(path.basename(script),[script],databaseTestEnv);

console.log('\nAll backend test groups passed sequentially.');
