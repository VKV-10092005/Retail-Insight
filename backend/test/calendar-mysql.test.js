import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
test('native MySQL calendar aggregation on SELECT constants only',{skip:process.env.RUN_CALENDAR_MYSQL_TESTS!=='1'},async t=>{
 const {pool,verifyDatabase}=await import('../src/db/pool.js');
 const {calendarAggregate}=await import('../src/business/calendar-aggregate.js');
 const {resolveBusinessRange}=await import('../src/business/business-calendar.js');
 const connection={execute:async(sql,args)=>{assert.match(sql,/^SELECT\b/);return pool.execute(sql,args);}};
 try{
  await verifyDatabase();
  for(const [label,values,query,expected]of [
   ['local midnight',[['2026-11-05 16:59:59.999999',100],['2026-11-05 17:00:00',200],['2026-11-06 16:59:59.999999',300],['2026-11-06 17:00:00',400]],{start:'2026-11-06',end:'2026-11-06'},[{period:'2026-11-06',revenue:500,orders:2}]],
   ['historical IANA offset',[['1970-01-01 15:59:59',100],['1970-01-01 16:00:00',200]],{start:'1970-01-02',end:'1970-01-02'},[{period:'1970-01-02',revenue:200,orders:1}]],
   ['Gregorian outer bounds',[['2026-11-05 17:00:00',200]],{start:'0001-01-01',end:'9999-12-31'},[{period:'2026-11-06',revenue:200,orders:1}]],
   ['month boundary',[['2026-10-31 16:59:59',100],['2026-10-31 17:00:00',200],['2026-11-30 17:00:00',400]],{granularity:'month'},[{period:'2026-10',revenue:100,orders:1},{period:'2026-11',revenue:200,orders:1},{period:'2026-12',revenue:400,orders:1}]]
  ])await t.test(label,async()=>{
   const params=values.flat();const from='FROM ('+values.map(()=> 'SELECT CAST(? AS DATETIME(6)) AS created_at,? AS amount').join(' UNION ALL ')+') d';
   const range=resolveBusinessRange(query);let where='1=1';const bindings=[...params];
   if(range.startSql){where+=' AND d.created_at>=?';bindings.push(range.startSql);}if(range.endSql){where+=' AND d.created_at<?';bindings.push(range.endSql);}
   // Source placeholders precede bucket placeholders; bind immutable fixture literals in an adapter.
   const source={execute:async(sql,args)=>{
    const bucketCount=sql.includes('calendar_bucket')?(sql.match(/AS start_utc/g)||[]).length*3:0;
    const reordered=bucketCount?[...params,...args.slice(0,bucketCount),...args.slice(bucketCount+params.length)]:args;
    return connection.execute(sql,reordered);
   }};
   const rows=await calendarAggregate(source,{from,where,values:bindings,timestamp:'d.created_at',columns:'SUM(d.amount) revenue,COUNT(*) orders',granularity:query.granularity||'day',range,batchSize:1});
   assert.deepEqual(rows.map(r=>({period:r.period,revenue:Number(r.revenue),orders:Number(r.orders)})),expected);
  });
 }finally{await pool.end();}
});
