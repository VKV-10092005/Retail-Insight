import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { bootstrapOwner } from '../src/bootstrap-owner.js';
function connection({database='retail_app',busy=false,owner=false,failAt=0}={}) {
 const events=[];let inserts=0;
 return {events,query:async()=>[[{name:database}]],
 execute:async(sql,params)=>{
  if(sql.includes('GET_LOCK')){events.push('lock');return [[{acquired:busy?0:1}]];}
  if(sql.includes('RELEASE_LOCK')){events.push('release');return [[{}]];}
  if(sql.startsWith('SELECT id'))return [owner?[{id:1}]:[]];
  events.push({sql,params});inserts++;
  if(inserts===failAt)throw Object.assign(Error('injected'),{code:'ER_DUP_ENTRY'});
  return [{insertId:inserts}];
 },beginTransaction:async()=>events.push('begin'),commit:async()=>events.push('commit'),rollback:async()=>events.push('rollback')};
}
const input=()=>({email:randomUUID()+'@example.invalid',password:randomUUID(),name:'Operator',storeName:'Store'});
for(const options of [{database:'wrong'},{busy:true},{owner:true}])test('refuses before collecting credentials '+JSON.stringify(options),async()=>{
 const c=connection(options);let collected=false;
 await assert.rejects(bootstrapOwner(c,async()=>{collected=true;return input();}));
 assert.equal(collected,false);assert.ok(!c.events.includes('begin'));
 if(options.owner)assert.equal(c.events.at(-1),'release');
});
test('atomic creation and bcrypt password',async()=>{
 const c=connection(),data=input();const result=await bootstrapOwner(c,async()=>data);
 const writes=c.events.filter(v=>typeof v==='object');assert.equal(writes.length,4);
 assert.equal(writes[1].params[4],'OWNER');
 assert.ok(await bcrypt.compare(data.password,writes[1].params[2]));
 assert.notEqual(writes[1].params[2],data.password);
 assert.equal(result.branchId,3);assert.deepEqual(c.events.slice(-2),['commit','release']);
});
for(const failAt of [1,2,3,4])test('rollback on insert failure '+failAt,async()=>{
 const c=connection({failAt});await assert.rejects(bootstrapOwner(c,async()=>input()));
 assert.ok(!c.events.includes('commit'));assert.deepEqual(c.events.slice(-2),['rollback','release']);
});
test('invalid password releases lock without writes',async()=>{
 const c=connection();await assert.rejects(bootstrapOwner(c,async()=>({...input(),password:''})));
 assert.ok(!c.events.includes('begin'));assert.equal(c.events.at(-1),'release');
});
