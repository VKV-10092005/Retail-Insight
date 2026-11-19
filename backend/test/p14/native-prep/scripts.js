import assert from 'node:assert/strict';
import {requireAction,withConnection} from './authority.js';
import {observeTransactions,observerQueries} from './observer.js';
import {runPhase,validateRelease} from '../../../src/p14/rc2/migration.js';
export const nativeMatrix=Object.freeze([
 ['DDL','bound phase executor / semantic fingerprint'],['TRIGGER','immutable UPDATE rejected'],
 ['FK','cross-tenant INSERT rejected'],['CHECK','negative stock rejected'],['COLLATION','actual request-key collation comparison'],
 ['RC','active RC on default RR'],['LOCK','real lock-wait edge'],['DEADLOCK','one1213 victim and full rollback'],
 ['ROLLBACK','balance unchanged'],['IDEMPOTENCY','same key / lost response'],['STOCK','one201/one409'],
 ['TENANT','scope denied'],['REVOKE','S/X ordering'],['PERIOD','guard ordering'],['LEGACY','hash/timestamp/replay parity']
].map(([id,proof])=>Object.freeze({id,proof,status:'NOT_RUN'})));
export async function seedFixture({cap,channel,fixture}){
 requireAction(cap,'SEED');
 return withConnection(cap,'SEED',channel,async c=>{
  await c.beginReadCommitted();let commitStarted=false;
  try{
   for(const q of fixture.statements){const [r]=await c.execute(q.sql,q.params);assert.equal(r.affectedRows,q.expectedAffectedRows);}
   commitStarted=true;await c.commit();return {status:'EXECUTED_ONLY_NOT_VERIFIED',fixtureDigest:fixture.digest};
  }catch(e){if(commitStarted){c.destroy();throw Object.assign(Error('Seed COMMIT outcome UNKNOWN; reconcile fixture digest, never blind reseed'),{code:'SEED_OUTCOME_UNKNOWN',cause:e});}try{await c.rollback();}catch{c.destroy();}throw e;}
 });
}
export async function executeReleasePhase({cap,channel,...input}){
 requireAction(cap,'MIGRATE');
 if(input.release?.state!=='A2_1_BOUND')throw Error('BOUND_RELEASE_REQUIRED');validateRelease(input.release,{bound:true});
 return withConnection(cap,'MIGRATE',channel,c=>runPhase({...input,adapter:input.makeAdapter(c)}));
}
export async function negativeSql({cap,channel,sql,params,expectedCodes}){
 requireAction(cap,'NATIVE_CASES');
 return withConnection(cap,'NATIVE_CASES',channel,async c=>{
  await c.beginReadCommitted();
  try{await assert.rejects(c.execute(sql,params),e=>expectedCodes.includes(e.code));}
  finally{try{await c.rollback();}catch{c.destroy();}}
 });
}
export function constraintCases(fixture){
 const d=fixture.rows.stock_documents?.[0];
 return [
 {id:'CHECK',sql:'UPDATE inventory_balances SET quantity=-1 WHERE organization_id=? AND branch_id=? AND product_id=?',params:[11,1101,110001],expectedCodes:['ER_CHECK_CONSTRAINT_VIOLATED']},
 {id:'FK',sql:'INSERT INTO inventory_balances(organization_id,branch_id,product_id,quantity) VALUES (?,?,?,1)',params:[11,1101,120001],expectedCodes:['ER_NO_REFERENCED_ROW_2']},
 ...(d?[{id:'TRIGGER',sql:'UPDATE stock_documents SET total=total+1 WHERE organization_id=? AND id=?',params:[11,d.id],expectedCodes:['ER_SIGNAL_EXCEPTION']}]:[])
 ];
}
const rollback=async c=>{try{await c.rollback();}catch{c.destroy();}};
export async function proveIsolation({cap,A,B,observer,schema}){
 requireAction(cap,'NATIVE_CASES');
 const [[a]]=await A.query('SELECT CONNECTION_ID() AS id,@@session.transaction_isolation AS isolation');
 const [[b]]=await B.query('SELECT CONNECTION_ID() AS id,@@session.transaction_isolation AS isolation');
 assert.equal(a.isolation,'REPEATABLE-READ');assert.equal(b.isolation,'REPEATABLE-READ');
 try{
  await A.beginReadCommitted();await B.beginReadCommitted();
  await A.query('SELECT id FROM products ORDER BY id LIMIT 1');await B.query('SELECT id FROM products ORDER BY id LIMIT 1');
  const state=await observeTransactions(observer,{schema,connectionIds:[Number(a.id),Number(b.id)]});
  assert.equal(state.transactions.length,2);
  for(const t of state.transactions)assert.equal(t.ISOLATION_LEVEL,'READ COMMITTED');
  return state;
 }finally{await rollback(A);await rollback(B);}
}
export async function waitForLock(observer,schema,{timeoutMs=1000,requestingConnection,blockingConnection}={}){
 const end=Date.now()+timeoutMs;
 do{
  const [rows]=await observer.execute(observerQueries.waits,[schema]);const exact=rows.filter(r=>Number(r.requesting_connection)===requestingConnection&&Number(r.blocking_connection)===blockingConnection);if(exact.length)return exact;
  await new Promise(r=>setTimeout(r,5)); // Evidence is actual lock metadata, not this interval.
 }while(Date.now()<end);
 throw Error('NATIVE_LOCK_EDGE_NOT_OBSERVED');
}
export async function proveRowLock({cap,A,B,observer,schema}){
 requireAction(cap,'NATIVE_CASES');const sql='SELECT id FROM products WHERE organization_id=? AND id=? FOR UPDATE';
 const [[aa]]=await A.query('SELECT CONNECTION_ID() AS id'),[[bb]]=await B.query('SELECT CONNECTION_ID() AS id');
 let blocked;
 try{
  await A.beginReadCommitted();await B.beginReadCommitted();await A.execute(sql,[11,110001]);
  blocked=B.execute(sql,[11,110001]);blocked.catch(()=>{});
  const edges=await waitForLock(observer,schema,{requestingConnection:Number(bb.id),blockingConnection:Number(aa.id)});await A.rollback();await blocked;await B.rollback();return edges;
 }finally{await rollback(A);await rollback(B);if(blocked)await Promise.allSettled([blocked]);}
}
export async function proveDeadlock({cap,A,B,observer,schema}){
 requireAction(cap,'NATIVE_CASES');const sql='SELECT id FROM products WHERE organization_id=? AND id=? FOR UPDATE';
 const [[aa]]=await A.query('SELECT CONNECTION_ID() AS id'),[[bb]]=await B.query('SELECT CONNECTION_ID() AS id');
 try{
  await A.beginReadCommitted();await B.beginReadCommitted();
  await A.execute(sql,[11,110001]);await B.execute(sql,[11,110002]);
  const pending=B.execute(sql,[11,110001]);pending.catch(()=>{});
  await waitForLock(observer,schema,{requestingConnection:Number(bb.id),blockingConnection:Number(aa.id)});
  const last=A.execute(sql,[11,110002]);last.catch(()=>{});
  const settle=async(p,c)=>{try{await p;await rollback(c);return {ok:true};}catch(e){await rollback(c);return {ok:false,code:e.code};}};
  const outcomes=await Promise.all([settle(pending,B),settle(last,A)]);
  assert.equal(outcomes.filter(x=>!x.ok&&x.code==='ER_LOCK_DEADLOCK').length,1);return outcomes;
 }finally{await rollback(A);await rollback(B);}
}
export async function proveRollback({cap,A,observer}){
 requireAction(cap,'NATIVE_CASES');const params=[11,1101,110002],sql='SELECT quantity FROM inventory_balances WHERE organization_id=? AND branch_id=? AND product_id=?';
 const [[before]]=await observer.execute(sql,params);await A.beginReadCommitted();
 try{await A.execute('UPDATE inventory_balances SET quantity=quantity+1 WHERE organization_id=? AND branch_id=? AND product_id=?',params);}
 finally{await rollback(A);}
 const [[after]]=await observer.execute(sql,params);assert.equal(String(after.quantity),String(before.quantity));
}
export async function proveCollation({cap,connection,collation,expected}){
 requireAction(cap,'NATIVE_CASES');if(!/^[a-z0-9_]+$/.test(collation))throw Error('COLLATION_IDENTIFIER');
 const [[r]]=await connection.query("SELECT 'Request-key-A' COLLATE "+collation+" = 'request-key-a' COLLATE "+collation+" AS same_case");
 assert.equal(Number(r.same_case),expected);return r;
}
export async function orderedHttpRace({cap,pair,first,second,holdStage='after-guard',request,observeBlocked}){
 requireAction(cap,'NATIVE_CASES');const c=pair.coordinator;
 const winner=request(first);winner.catch(()=>{});
 const key=await c.waitFor(first,holdStage),loser=request(second);loser.catch(()=>{});
 try{await observeBlocked();c.release(key);
  const secondKey=await c.waitFor(second,holdStage);c.release(secondKey);
  return await Promise.all([winner,loser]);}
 catch(e){c.abort();throw e;}
}
export function assertHttpCase(id,responses){
 const codes=responses.map(r=>r.status);
 if(id==='STOCK')assert.deepEqual([...codes].sort(),[201,409]);
 else if(id==='IDEMPOTENCY'){assert.deepEqual([...codes].sort(),[200,201]);assert.equal(String(responses[0].body.id),String(responses[1].body.id));}
 else if(id==='TENANT')assert.ok(codes.every(c=>[401,403,404].includes(c)));
 else throw Error('Explicit oracle required for '+id);
}
