import {businessBuckets} from './business-calendar.js';
import {Temporal} from '@js-temporal/polyfill';
// Bounded SQL batches; retain all-time semantics and database decimal arithmetic.
export async function calendarAggregate(connection,{from,where,values,timestamp,columns,granularity='day',range,zeroValues={},batchSize=128}){
 const [[extent]]=await connection.execute(`SELECT MIN(${timestamp}) min_utc,MAX(${timestamp}) max_utc ${from} WHERE ${where}`,values);
 const bounded=Boolean(range?.calendar?.start_date&&range?.calendar?.end_date);
 if(extent.min_utc==null&&!bounded)return [];
 if(range?.empty)return [];
 const rows=[];let batch=[];
 async function flush(){
  const derived=batch.map(()=> 'SELECT ? AS period,CAST(? AS DATETIME(6)) AS start_utc,CAST(? AS DATETIME(6)) AS end_utc').join(' UNION ALL ');
  const args=batch.flatMap(b=>[b.period,b.start,b.end]);
  const [result]=await connection.execute(`SELECT calendar_bucket.period,${columns} ${from} JOIN (${derived}) calendar_bucket ON ${timestamp}>=calendar_bucket.start_utc AND ${timestamp}<calendar_bucket.end_utc WHERE ${where} GROUP BY calendar_bucket.period ORDER BY calendar_bucket.period`,[...args,...values]);
  rows.push(...result);batch=[];
 }
 const bucketMinimum=bounded?range.calendar.start_utc:extent.min_utc;
 const bucketMaximum=bounded?Temporal.Instant.from(range.calendar.end_utc_exclusive).subtract({nanoseconds:1}).toString():extent.max_utc;
 const buckets=[...businessBuckets(bucketMinimum,bucketMaximum,granularity,range)];
 for(const bucket of buckets){
  batch.push(bucket);if(batch.length===batchSize)await flush();
 }
 if(batch.length)await flush();
 if(!bounded)return rows;
 const byPeriod=new Map(rows.map(row=>[row.period,row]));
 return buckets.map(bucket=>byPeriod.get(bucket.period)||{period:bucket.period,...Object.fromEntries(Object.keys(zeroValues).map(key=>[key,zeroValues[key]]))});
}
