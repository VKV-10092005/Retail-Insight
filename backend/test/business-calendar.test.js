import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
process.env.BUSINESS_TIME_ZONE='Asia/Ho_Chi_Minh';
const {resolveBusinessRange,businessDay,businessMonth,businessBuckets,calendarMetadata}=await import('../src/business/business-calendar.js');
for(const [date,start,end]of [
 ['2026-11-06','2026-11-05T17:00:00.000Z','2026-11-06T17:00:00.000Z'],
 ['2024-02-29','2024-02-28T17:00:00.000Z','2024-02-29T17:00:00.000Z'],
 ['2027-01-01','2026-12-31T17:00:00.000Z','2027-01-01T17:00:00.000Z'],
 ['1970-01-02','1970-01-01T16:00:00.000Z','1970-01-02T16:00:00.000Z'],
 ['1975-06-12','1975-06-11T16:00:00.000Z','1975-06-12T17:00:00.000Z']
])test('IANA range '+date,()=>{const {calendar}=resolveBusinessRange({start:date,end:date});assert.equal(calendar.start_utc,start);assert.equal(calendar.end_utc_exclusive,end);});
for(const [utc,day]of [
 ['2026-11-05 16:59:59.999999','2026-11-05'],
 ['2026-11-05 17:00:00','2026-11-06'],
 ['2026-11-06 16:59:59.999999','2026-11-06'],
 ['2026-11-06 17:00:00','2026-11-07'],
 ['2026-10-31 17:00:00','2026-11-01'],
 ['2026-12-31 17:00:00','2027-01-01']
])test('business day '+utc,()=>{assert.equal(businessDay(utc),day);assert.equal(businessMonth(utc),day.slice(0,7));});
test('Gregorian extreme filters clip without invalid SQL years',()=>{
 const r=resolveBusinessRange({start:'0001-01-01',end:'9999-12-31'});
 assert.equal(r.empty,false);assert.equal(r.startSql,null);assert.equal(r.endSql,null);
 assert.equal(r.calendar.range_clipped,true);assert.equal(r.calendar.start_utc,'1970-01-01T00:00:01.000Z');
 const first=[...businessBuckets('1970-01-01 00:00:01','1970-01-01 00:00:01')][0];assert.equal(first.start,'1970-01-01 00:00:01.000000');
 const last=[...businessBuckets('2038-01-19 03:14:07','2038-01-19 03:14:07')][0];assert.equal(last.end,'2038-01-19 03:14:08.000000');
 for(const q of [{start:'9999-12-31'},{end:'0001-01-01'}])assert.equal(resolveBusinessRange(q).empty,true);
});
test('open ended and all-time are not replaced with a default range',()=>{
 const r=resolveBusinessRange();assert.equal(r.startSql,null);assert.equal(r.endSql,null);
 assert.equal(r.calendar.start_date,null);assert.equal(r.calendar.end_date,null);
 assert.equal(resolveBusinessRange({start:'2026-11-06'}).endSql,null);
 assert.equal(resolveBusinessRange({end:'2026-11-06'}).startSql,null);
});
test('monthly buckets cross the local year and preserve exact range',()=>{
 const r=resolveBusinessRange({start:'2026-12-31',end:'2027-01-01'});
 const b=[...businessBuckets('2026-12-30 17:00:00','2027-01-01 16:59:59','month',r)];
 assert.deepEqual(b.map(x=>x.period),['2026-12','2027-01']);
 assert.equal(b[0].start,'2026-12-30 17:00:00.000000');
 assert.equal(b[0].end,b[1].start);assert.equal(b[1].end,'2027-01-01 17:00:00.000000');
});
test('a historical 25-hour day is not assumed to last 86400 seconds',()=>{
 const b=[...businessBuckets('1975-06-11 16:00:00','1975-06-12 17:00:00')];
 assert.equal(b[0].period,'1975-06-12');
 assert.equal(b[0].start,'1975-06-11 16:00:00.000000');assert.equal(b[0].end,'1975-06-12 17:00:00.000000');
});
test('no bucket truncation for long periods; empty extent stays empty',()=>{
 const b=[...businessBuckets('2020-01-01 00:00:00','2026-12-31 00:00:00')];assert.ok(b.length>2500);
 for(let i=1;i<b.length;i++)assert.equal(b[i-1].end,b[i].start);
 assert.deepEqual([...businessBuckets(null,null)],[]);
});
test('metadata describes policy and audit timestamp source without changing instants',()=>{
 assert.equal(calendarMetadata({},'inventory_balances.updated_at').timestamp_source,'inventory_balances.updated_at');
 assert.equal(calendarMetadata().timezone,'Asia/Ho_Chi_Minh');assert.equal(calendarMetadata().policy_version,'business-calendar-v1');
});
for(const timezone of ['UTC','America/Los_Angeles'])test('server OS timezone independence '+timezone,()=>{
 const result=spawnSync(process.execPath,['--input-type=module','-e',"import {resolveBusinessRange} from './src/business/business-calendar.js';console.log(resolveBusinessRange({start:'2026-11-06'}).calendar.start_utc)"],{env:{...process.env,TZ:timezone},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'2026-11-05T17:00:00.000Z');
});
