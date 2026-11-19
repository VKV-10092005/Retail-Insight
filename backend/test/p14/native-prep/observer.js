import {digest,reject} from '../../../src/p14/rc2/contracts.js';
export const observerQueries={
 connections:'SELECT THREAD_ID,PROCESSLIST_ID,PROCESSLIST_USER FROM performance_schema.threads WHERE PROCESSLIST_ID IN (?,?) ORDER BY PROCESSLIST_ID',
 isolation:'SELECT t.PROCESSLIST_ID,e.STATE,e.ISOLATION_LEVEL,e.ACCESS_MODE FROM performance_schema.events_transactions_current e JOIN performance_schema.threads t ON t.THREAD_ID=e.THREAD_ID WHERE t.PROCESSLIST_ID IN (?,?) ORDER BY t.PROCESSLIST_ID',
 waits:'SELECT rt.PROCESSLIST_ID AS requesting_connection,bt.PROCESSLIST_ID AS blocking_connection,r.ENGINE_TRANSACTION_ID AS requesting_tx,b.ENGINE_TRANSACTION_ID AS blocking_tx,r.OBJECT_SCHEMA,r.OBJECT_NAME,r.INDEX_NAME,r.LOCK_TYPE,r.LOCK_MODE FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks r ON r.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID JOIN performance_schema.data_locks b ON b.ENGINE_LOCK_ID=w.BLOCKING_ENGINE_LOCK_ID JOIN performance_schema.threads rt ON rt.THREAD_ID=r.THREAD_ID JOIN performance_schema.threads bt ON bt.THREAD_ID=b.THREAD_ID WHERE r.OBJECT_SCHEMA=? ORDER BY r.ENGINE_LOCK_ID,b.ENGINE_LOCK_ID'
};
export async function observeTransactions(connection,{schema,connectionIds}){
 if(!/^retail_p14_test_[a-zA-Z0-9_]+$/.test(schema)||connectionIds.length!==2||new Set(connectionIds).size!==2||
  connectionIds.some(x=>!Number.isSafeInteger(x)||x<1))reject('OBSERVER_SCOPE');
 const [threads]=await connection.execute(observerQueries.connections,connectionIds);
 const [transactions]=await connection.execute(observerQueries.isolation,connectionIds);
 const [waits]=await connection.execute(observerQueries.waits,[schema]);
 if(threads.length!==2)reject('OBSERVER_THREADS_NOT_VISIBLE');
 return {threads,transactions,waits}; // No global instrumentation SET or PROCESS granted automatically.
}
export function assertOracle({before,after}){
 const key=b=>[b.organization_id,b.branch_id,b.product_id].join(':');
 const initial=new Map(before.balances.map(b=>[key(b),BigInt(b.quantity)])),delta=new Map();
 const priorMovements=new Set((before.movements??[]).map(m=>m.organization_id+':'+m.id));
 for(const m of after.movements.filter(m=>!priorMovements.has(m.organization_id+':'+m.id)))delta.set(key(m),(delta.get(key(m))??0n)+BigInt(m.quantity_delta));
 for(const b of after.balances){
  if(BigInt(b.quantity)<0n||BigInt(b.quantity)!==(initial.get(key(b))??0n)+(delta.get(key(b))??0n))throw Error('ORACLE_BALANCE');
 }
 const ids=new Set();
 if(after.balances.length!==initial.size)throw Error('ORACLE_BALANCE_COVERAGE');
 for(const d of after.documents){
  const id=d.organization_id+':'+d.id;if(ids.has(id))throw Error('ORACLE_DUPLICATE');ids.add(id);
  const lines=after.items.filter(i=>i.organization_id===d.organization_id&&String(i.document_id)===String(d.id));
  const cents=x=>{const [a,b='']=String(x).split('.');return BigInt(a)*100n+BigInt(b.padEnd(2,'0'));};
  for(const i of lines){
   if(BigInt(i.quantity)<=0n)throw Error('ORACLE_ITEM_QUANTITY');
   const movements=after.movements.filter(m=>m.organization_id===d.organization_id&&String(m.document_id)===String(d.id)&&m.product_id===i.product_id);
   if(movements.length!==1||BigInt(movements[0].quantity_delta)!==BigInt(i.quantity)*(d.type==='SALE'?-1n:1n)||movements[0].branch_id!==d.branch_id)throw Error('ORACLE_MOVEMENT');
  }
  const total=lines.reduce((n,i)=>n+BigInt(i.quantity)*cents(i.unit_price),0n);
  if(!lines.length||cents(d.total)!==total)throw Error('ORACLE_TOTAL');
  if(d.business_date_origin==='SERVER_TODAY'){
   for(const field of ['receipts','markers','audits']){
    const matches=after[field].filter(r=>r.organization_id===d.organization_id&&String(r.document_id??r.target_ref)===String(d.id));
    if(matches.length!==1)throw Error('ORACLE_'+field);
   }
  }
 }
 for(const m of after.movements)if(after.items.filter(i=>i.organization_id===m.organization_id&&String(i.document_id)===String(m.document_id)&&i.product_id===m.product_id).length!==1)throw Error('ORACLE_EXTRA_MOVEMENT');
 for(const list of [after.items,after.movements,after.receipts,after.markers])
  for(const r of list)if(!ids.has(r.organization_id+':'+r.document_id))throw Error('ORACLE_ORPHAN');
 return {status:'ASSERTIONS_ONLY',digest:digest(after)};
}
