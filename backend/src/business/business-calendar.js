import {Temporal} from '@js-temporal/polyfill';
import {calendarPolicy,businessTimezone} from '../config/business-calendar.js';
export const timestampMin=Temporal.Instant.from('1970-01-01T00:00:01Z');
export const timestampEnd=Temporal.Instant.from('2038-01-19T03:14:08Z');
const compare=Temporal.Instant.compare;
const clamp=instant=>compare(instant,timestampMin)<0?timestampMin:compare(instant,timestampEnd)>0?timestampEnd:instant;
export const instant=value=>value instanceof Date?Temporal.Instant.from(value.toISOString()):Temporal.Instant.from(String(value).includes('T')?String(value):String(value).replace(' ','T')+'Z');
export const utcSql=value=>value.toString({fractionalSecondDigits:6}).replace('T',' ').replace('Z','');
const iso=value=>value.toString({fractionalSecondDigits:3});
const midnight=date=>date.toZonedDateTime(businessTimezone).toInstant();
export function businessDay(value){return instant(value).toZonedDateTimeISO(businessTimezone).toPlainDate().toString();}
export function businessMonth(value){return businessDay(value).slice(0,7);}
export function resolveBusinessRange(query={}){
 const requestedStart=query.start?midnight(Temporal.PlainDate.from(query.start)):null;
 const requestedEnd=query.end?midnight(Temporal.PlainDate.from(query.end).add({days:1})):null;
 const lower=clamp(requestedStart||timestampMin),upper=clamp(requestedEnd||timestampEnd);
 const empty=compare(lower,upper)>=0;
 return {lower,upper,empty,
  startSql:compare(lower,timestampMin)>0?utcSql(lower):null,
  endSql:compare(upper,timestampEnd)<0?utcSql(upper):null,
  calendar:{...calendarPolicy,timestamp_source:'stock_documents.created_at',
   start_date:query.start||null,end_date:query.end||null,
   start_utc:requestedStart?iso(lower):null,end_utc_exclusive:requestedEnd?iso(upper):null,
   range_clipped:!!((requestedStart&&compare(lower,requestedStart)!==0)||(requestedEnd&&compare(upper,requestedEnd)!==0)),empty}
 };
}
export function calendarMetadata(query={},source='stock_documents.created_at'){
 return {...resolveBusinessRange(query).calendar,timestamp_source:source};
}
export function* businessBuckets(minimum,maximum,granularity='day',range=resolveBusinessRange()){
 if(minimum==null||maximum==null||range.empty)return;
 let date=instant(minimum).toZonedDateTimeISO(businessTimezone).toPlainDate();
 const last=instant(maximum).toZonedDateTimeISO(businessTimezone).toPlainDate();
 if(granularity==='month')date=date.with({day:1});
 while(Temporal.PlainDate.compare(date,last)<=0){
  const next=date.add(granularity==='month'?{months:1}:{days:1});
  const start=midnight(date),end=midnight(next);
  const lower=compare(start,range.lower)<0?range.lower:start;
  const upper=compare(end,range.upper)>0?range.upper:end;
  if(compare(lower,upper)<0)yield {period:granularity==='month'?date.toString().slice(0,7):date.toString(),start:utcSql(lower),end:utcSql(upper)};
  date=next;
 }
}
